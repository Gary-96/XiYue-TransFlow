"""
乐曼同传 — 通话实时同传服务
用于微信/QQ/钉钉等 PC 端社交软件通话场景
通过系统立体声混音（Stereo Mix / Loopback）捕获对方语音，
经 ASR → 翻译 → TTS 输出，实现双向实时同传。

架构：
  系统音频 → WASAPI Loopback 捕获 → Whisper ASR → Gemini 翻译 → Edge TTS → 系统输出
"""
import asyncio
import io
import json
import logging
import time as _time
import wave
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

import numpy as np
import sounddevice as sd

logger = logging.getLogger(__name__)


class CallMode(str, Enum):
    """通话同传模式"""
    SUBTITLE_ONLY = "subtitle_only"   # 仅字幕（不播放 TTS，避免回声）
    TTS_AUTO = "tts_auto"             # TTS 自动播放（适合戴耳机场景）


@dataclass
class CallTranslationState:
    """通话同传运行状态"""
    is_running: bool = False
    mode: CallMode = CallMode.SUBTITLE_ONLY
    system_capture_device: Optional[int] = None
    tts_playback_device: Optional[int] = None
    _buffer: np.ndarray = field(default_factory=lambda: np.empty(0, dtype=np.float32))
    _buffer_lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    last_translated_text: str = ""
    translate_count: int = 0
    error_count: int = 0
    _capture_task: Optional[asyncio.Task] = None
    _process_task: Optional[asyncio.Task] = None


class CallTranslationService:
    """
    通话实时同传服务

    兼容所有 PC 端社交软件（微信/QQ/钉钉/飞书/Discord/Zoom 等），
    通过 Windows 系统音频路由实现，无需任何软件 API。
    """

    def __init__(self):
        self.state = CallTranslationState()
        self._running = False
        # 外部依赖（由 main_manager 在启动时注入）
        self.whisper_service = None
        self.translation_service = None
        self.tts_service = None
        self.language_manager = None
        self.websocket_clients = set()
        logger.info("CallTranslationService initialized")

    # ── 设备枚举 ──────────────────────────────────────────────────

    async def list_devices(self) -> dict:
        """
        枚举系统音频设备，返回可用作 Loopback 捕获的设备列表。
        优先推荐 Stereo Mix / VB-CABLE / Voicemeeter 等虚拟音频设备。
        """
        from audio_device_manager import list_all_devices
        all_devices = list_all_devices()
        loopback_candidates: list[dict] = []

        LOOPBACK_KEYWORDS = [
            "stereo mix", "wave out mix", "what u hear",
            "loopback", "立体声混音", "系统声音",
            "cable output", "vb-cable", "vb cable", "vbaudio",
            "voicemeeter", "obs virtual", "stream",
            "output", " playback",
        ]

        for dev in all_devices.get("input_devices", []):
            name = dev.get("name", "")
            if any(kw in name.lower() for kw in LOOPBACK_KEYWORDS):
                loopback_candidates.append({
                    "index": dev.get("index"),
                    "name": name,
                    "sample_rate": dev.get("default_samplerate"),
                    "channels": dev.get("max_input_channels"),
                    "is_loopback": True,
                })

        playback_devices = []
        for dev in all_devices.get("output_devices", []):
            playback_devices.append({
                "index": dev.get("index"),
                "name": dev.get("name"),
                "sample_rate": dev.get("default_samplerate"),
                "channels": dev.get("max_output_channels"),
            })

        return {
            "loopback_candidates": loopback_candidates,
            "playback_devices": playback_devices,
            "recommended_loopback": loopback_candidates[0] if loopback_candidates else None,
            "recommended_playback": playback_devices[0] if playback_devices else None,
        }

    # ── 启动 / 停止 ───────────────────────────────────────────────

    async def start(
        self,
        mode: str = "subtitle_only",
        loopback_device_index: Optional[int] = None,
        tts_device_index: Optional[int] = None,
    ) -> dict:
        """
        启动通话同传

        Args:
            mode: "subtitle_only"（仅字幕）或 "tts_auto"（播放 TTS）
            loopback_device_index: 系统音频捕获设备（None=自动选 Stereo Mix）
            tts_device_index: TTS 播放设备（None=自动选默认扬声器）
        """
        if self._running:
            return {"status": "already_running", "mode": self.state.mode.value}

        if mode not in ("subtitle_only", "tts_auto"):
            return {"status": "error", "message": f"Invalid mode: {mode}"}

        self.state.mode = CallMode(mode)

        # 自动选择设备
        if loopback_device_index is None:
            devices = await self.list_devices()
            rec = devices.get("recommended_loopback")
            loopback_device_index = rec["index"] if rec else sd.default.device[0]

        if tts_device_index is None:
            devices = await self.list_devices()
            rec = devices.get("recommended_playback")
            tts_device_index = rec["index"] if rec else sd.default.device[1]

        self.state.system_capture_device = loopback_device_index
        self.state.tts_playback_device = tts_device_index
        self.state.is_running = True
        self._running = True

        try:
            loop = asyncio.get_running_loop()
            self.state._capture_task = loop.create_task(self._capture_loop())
            self.state._process_task = loop.create_task(self._process_loop())
            logger.info(
                f"[Call] Translation started: mode={mode}, "
                f"loopback={loopback_device_index}, tts={tts_device_index}"
            )
            return {
                "status": "started",
                "mode": mode,
                "loopback_device_index": loopback_device_index,
                "tts_device_index": tts_device_index,
            }
        except Exception as e:
            self._running = False
            self.state.is_running = False
            logger.error(f"[Call] Failed to start: {e}")
            return {"status": "error", "message": str(e)}

    async def stop(self) -> dict:
        """停止通话同传"""
        if not self._running:
            return {"status": "not_running"}

        self._running = False
        self.state.is_running = False

        for task in (self.state._capture_task, self.state._process_task):
            if task and not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

        self.state._buffer = np.empty(0, dtype=np.float32)
        logger.info("[Call] Translation stopped")
        return {
            "status": "stopped",
            "stats": {
                "translate_count": self.state.translate_count,
                "error_count": self.state.error_count,
            },
        }

    def get_status(self) -> dict:
        """获取当前状态"""
        return {
            "is_running": self.state.is_running,
            "mode": self.state.mode.value,
            "loopback_device_index": self.state.system_capture_device,
            "tts_device_index": self.state.tts_playback_device,
            "stats": {
                "translate_count": self.state.translate_count,
                "error_count": self.state.error_count,
                "last_translated_text": self.state.last_translated_text,
            },
        }

    # ── 音频捕获 ──────────────────────────────────────────────────

    async def _capture_loop(self):
        """持续从系统音频设备（Loopback）捕获音频"""
        device_idx = self.state.system_capture_device
        if device_idx is None:
            logger.error("[Call] No loopback device configured")
            return

        try:
            device_info = sd.query_devices(device_idx, "input")
            sample_rate = int(device_info.get("default_samplerate", 48000))
            channels = max(int(device_info.get("max_input_channels", 2)), 1)
        except Exception:
            sample_rate, channels = 48000, 2

        logger.info(f"[Call] Capture: device={device_idx}, sr={sample_rate}, ch={channels}")

        chunk_size = int(sample_rate * 2.0)  # 2秒/块
        stream = None
        try:
            stream = sd.InputStream(
                device=device_idx,
                samplerate=sample_rate,
                channels=channels,
                dtype="float32",
                blocksize=chunk_size,
                callback=self._audio_callback,
            )
            stream.start()
            logger.info(f"[Call] Capture active on device {device_idx}")

            while self._running:
                await asyncio.sleep(0.1)

        except Exception as e:
            logger.error(f"[Call] Capture error: {e}")
            self.state.error_count += 1
        finally:
            if stream:
                try:
                    stream.stop()
                    stream.close()
                except Exception:
                    pass

    def _audio_callback(self, indata: np.ndarray, frames: int,
                        time_info: dict, status: sd.CallbackFlags):
        """sounddevice 回调：将音频数据追加到缓冲区（线程安全）"""
        if status.overflow:
            logger.warning("[Call] Audio overflow")
            return
        if not self._running:
            return

        # 立体声 → 单声道（取左声道）
        mono = indata[:, 0] if indata.ndim > 1 and indata.shape[1] > 1 else indata.flatten()

        loop = asyncio.get_running_loop()
        loop.call_soon_threadsafe(asyncio.ensure_future, self._append_buffer(mono))

    async def _append_buffer(self, chunk: np.ndarray):
        """线程安全追加音频"""
        async with self.state._buffer_lock:
            self.state._buffer = np.concatenate(
                [self.state._buffer, chunk.astype(np.float32)]
            )

    # ── 处理循环 ──────────────────────────────────────────────────

    async def _process_loop(self):
        """从缓冲区切分 3 秒块，执行 ASR → 翻译 → TTS/广播"""
        chunk_samples = int(16000 * 3.0)  # 3 秒 @ 16kHz

        while self._running:
            await asyncio.sleep(0.05)

            async with self.state._buffer_lock:
                buf = self.state._buffer.copy()

            if len(buf) < 1600:
                continue

            # 能量检测（静音过滤）
            energy = np.mean(np.abs(buf))
            if energy < 0.015:
                self.state._buffer = np.empty(0, dtype=np.float32)
                continue

            if len(buf) < chunk_samples:
                continue

            chunk = buf[:chunk_samples]
            self.state._buffer = buf[chunk_samples:]

            # ASR
            if not self.whisper_service:
                continue
            try:
                transcription = await self.whisper_service.transcribe_audio(
                    chunk, language=None
                )
                if not transcription or not transcription.text.strip():
                    continue
                text = transcription.text.strip()
            except Exception as e:
                logger.error(f"[Call] ASR error: {e}")
                self.state.error_count += 1
                continue

            # 翻译
            if not self.translation_service or not self.language_manager:
                continue
            try:
                # 修复：使用 get_current_pair() 获取语言对
                pair = self.language_manager.get_current_pair()
                src_lang = pair.src_lang
                tgt_lang = pair.tgt_lang

                translation = await self.translation_service.translate(
                    text, src_lang=src_lang, tgt_lang=tgt_lang
                )
                if not translation:
                    continue

                tgt_text = (
                    translation.get("translated_text", "")
                    or translation.get("text", "")
                )
                if not tgt_text.strip():
                    continue

                self.state.translate_count += 1
                self.state.last_translated_text = tgt_text
                logger.info(f"[Call] [{src_lang}] {text} → [{tgt_lang}] {tgt_text}")

                # 广播字幕
                await self._broadcast_subtitle(text, tgt_text, src_lang, tgt_lang)

                # TTS 播报
                if self.state.mode == CallMode.TTS_AUTO and self.tts_service:
                    await self._speak_translation(tgt_text, tgt_lang)

            except Exception as e:
                logger.error(f"[Call] Translation error: {e}")
                self.state.error_count += 1

    # ── 广播 & TTS ────────────────────────────────────────────────

    async def _broadcast_subtitle(self, src_text: str, tgt_text: str,
                                   src_lang: str, tgt_lang: str):
        """向所有 WebSocket 客户端广播字幕事件"""
        event = {
            "type": "call_subtitle",
            "src_text": src_text,
            "tgt_text": tgt_text,
            "src_lang": src_lang,
            "tgt_lang": tgt_lang,
            "timestamp": _time.time(),
        }
        payload = json.dumps(event, ensure_ascii=False)
        for client in list(self.websocket_clients):
            try:
                await client.send_text(payload)
            except Exception:
                self.websocket_clients.discard(client)

    async def _speak_translation(self, text: str, lang: str):
        """异步合成并播放 TTS"""
        if not self.tts_service:
            return
        try:
            loop = asyncio.get_running_loop()
            audio_bytes = await loop.run_in_executor(
                None, lambda: self.tts_service.speak(text, lang)
            )
            if audio_bytes:
                self._play_audio(audio_bytes)
        except Exception as e:
            logger.error(f"[Call] TTS error: {e}")
            self.state.error_count += 1

    def _play_audio(self, audio_bytes: bytes):
        """播放 TTS 音频字节（WAV/MP3）"""
        if not self.state.tts_playback_device:
            return
        try:
            wf = io.BytesIO(audio_bytes)
            with wave.open(wf, "rb") as wav:
                sr = wav.getframerate()
                chunk = int(sr * 0.05)  # 50ms/块
                data = wav.readframes(chunk)
                while data and self._running:
                    np_data = np.frombuffer(data, dtype=np.int16).astype(np.float32) / 32768.0
                    sd.play(np_data, sr, device=self.state.tts_playback_device)
                    sd.wait()
                    data = wav.readframes(chunk)
        except Exception as e:
            logger.error(f"[Call] Playback error: {e}")

    def reset_stats(self):
        """重置统计计数"""
        self.state.translate_count = 0
        self.state.error_count = 0
        self.state.last_translated_text = ""


# 模块级单例
call_translation_service = CallTranslationService()
