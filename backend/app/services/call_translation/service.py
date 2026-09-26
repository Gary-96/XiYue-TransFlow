"""
乐曼同传 — 通话同传服务
整合音频捕获、处理、翻译、TTS 的完整流程
"""
import asyncio
import io
import json
import logging
import time as _time
import wave
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Set, TYPE_CHECKING

import numpy as np
import sounddevice as sd

if TYPE_CHECKING:
    from app.services.whisper_service import WhisperService
    from app.services.translation_service import TranslationService
    from app.services.tts_service import TTSService
    from app.services.language_manager import LanguageManager

from .models import CallMode, CallTranslationState
from .capture import AudioCapture
from .processor import AudioProcessor

logger = logging.getLogger(__name__)


class CallTranslationService:
    """
    通话实时同传服务

    兼容所有 PC 端社交软件（微信/QQ/钉钉/飞书/Discord/Zoom 等），
    通过 Windows 系统音频路由实现，无需任何软件 API。
    """

    def __init__(self):
        self.state = CallTranslationState()
        self._audio_capture = AudioCapture()
        self._audio_processor = AudioProcessor()
        # 外部依赖（由 main_manager 在启动时注入）
        self.whisper_service: Optional["WhisperService"] = None
        self.translation_service: Optional["TranslationService"] = None
        self.tts_service: Optional["TTSService"] = None
        self.language_manager: Optional["LanguageManager"] = None
        self.websocket_clients: Set[Any] = set()
        self._process_task: Optional[asyncio.Task] = None
        logger.info("CallTranslationService initialized")

    # ── 设备枚举 ──────────────────────────────────────────────────

    async def list_devices(self) -> Dict[str, Any]:
        """枚举系统音频设备"""
        from audio_device_manager import list_all_devices
        all_devices = list_all_devices()
        loopback_candidates: List[dict] = []
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
    ) -> Dict[str, Any]:
        """启动通话同传"""
        if self.state.is_running:
            return {"status": "already_running", "mode": self.state.mode.value}

        if mode not in ("subtitle_only", "tts_auto"):
            return {"status": "error", "message": f"Invalid mode: {mode}"}

        self.state.mode = CallMode(mode)

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

        try:
            await self._audio_capture.start(self._on_audio_chunk)
            self.state.is_running = True
            self._process_task = asyncio.create_task(self._process_loop())
            logger.info(f"[Call] Started: mode={mode}, loopback={loopback_device_index}")
            return {
                "status": "started",
                "mode": mode,
                "loopback_device_index": loopback_device_index,
                "tts_device_index": tts_device_index,
            }
        except Exception as e:
            self.state.is_running = False
            logger.error(f"[Call] Failed to start: {e}")
            return {"status": "error", "message": str(e)}

    async def stop(self) -> Dict[str, Any]:
        """停止通话同传"""
        if not self.state.is_running:
            return {"status": "not_running"}

        self.state.is_running = False
        await self._audio_capture.stop()

        if self._process_task and not self._process_task.done():
            self._process_task.cancel()
            try:
                await self._process_task
            except asyncio.CancelledError:
                pass

        await self._audio_processor.clear()
        logger.info("[Call] Stopped")
        return {
            "status": "stopped",
            "stats": self.state.get_stats(),
        }

    def get_status(self) -> Dict[str, Any]:
        """获取当前状态"""
        return {
            "is_running": self.state.is_running,
            "mode": self.state.mode.value,
            "loopback_device_index": self.state.system_capture_device,
            "tts_device_index": self.state.tts_playback_device,
            "stats": self.state.get_stats(),
        }

    def reset_stats(self):
        """重置统计计数"""
        self.state.translate_count = 0
        self.state.error_count = 0
        self.state.last_translated_text = ""

    # ── 内部方法 ──────────────────────────────────────────────────

    async def _on_audio_chunk(self, chunk: np.ndarray):
        """音频回调处理器"""
        await self._audio_processor.append(chunk)

    async def _process_loop(self):
        """处理循环：ASR → 翻译 → TTS/广播"""
        while self.state.is_running:
            await asyncio.sleep(0.05)
            chunk = await self._audio_processor.poll()
            if chunk is None:
                continue

            # ASR
            if not self.whisper_service:
                continue
            try:
                transcription = await self.whisper_service.transcribe_audio(chunk, language=None)
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
                pair = self.language_manager.get_current_pair()
                src_lang = pair.src_lang
                tgt_lang = pair.tgt_lang
                translation = await self.translation_service.translate(
                    text, src_lang=src_lang, tgt_lang=tgt_lang
                )
                if not translation:
                    continue

                tgt_text = translation.get("translated_text", "") or translation.get("text", "")
                if not tgt_text.strip():
                    continue

                self.state.translate_count += 1
                self.state.last_translated_text = tgt_text
                logger.info(f"[Call] [{src_lang}] {text} → [{tgt_lang}] {tgt_text}")

                await self._broadcast_subtitle(text, tgt_text, src_lang, tgt_lang)

                if self.state.mode == CallMode.TTS_AUTO and self.tts_service:
                    await self._speak_translation(tgt_text, tgt_lang)

            except Exception as e:
                logger.error(f"[Call] Translation error: {e}")
                self.state.error_count += 1

    async def _broadcast_subtitle(self, src_text: str, tgt_text: str, src_lang: str, tgt_lang: str):
        """向 WebSocket 客户端广播字幕"""
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
        """合成并播放 TTS"""
        if not self.tts_service:
            return
        try:
            loop = asyncio.get_running_loop()
            audio_bytes = await loop.run_in_executor(
                None, lambda: self.tts_service.speak(text, lang)  # type: ignore
            )
            if audio_bytes:
                self._play_audio(audio_bytes)
        except Exception as e:
            logger.error(f"[Call] TTS error: {e}")
            self.state.error_count += 1

    def _play_audio(self, audio_bytes: bytes):
        """播放 TTS 音频"""
        if not self.state.tts_playback_device:
            return
        try:
            wf = io.BytesIO(audio_bytes)
            with wave.open(wf, "rb") as wav:
                sr = wav.getframerate()
                chunk = int(sr * 0.05)
                data = wav.readframes(chunk)
                while data and self.state.is_running:
                    np_data = np.frombuffer(data, dtype=np.int16).astype(np.float32) / 32768.0
                    sd.play(np_data, sr, device=self.state.tts_playback_device)
                    sd.wait()
                    data = wav.readframes(chunk)
        except Exception as e:
            logger.error(f"[Call] Playback error: {e}")


# 模块级单例
_instance: Optional[CallTranslationService] = None


def get_call_translation_service() -> CallTranslationService:
    global _instance
    if _instance is None:
        _instance = CallTranslationService()
    return _instance


__all__ = ["CallTranslationService", "get_call_translation_service"]
