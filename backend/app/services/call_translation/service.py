"""
喜阅 TransFlow — 通话同传服务
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
        """处理循环：ASR → 翻译 → TTS/广播（超低延时流式版本）"""
        while self.state.is_running:
            await asyncio.sleep(0.02)  # 50ms 轮询间隔（原 50ms）
            chunk = await self._audio_processor.poll()
            if chunk is None:
                continue

            # ASR 流式转录（支持 Partial 实时输出）
            if not self.whisper_service:
                continue
            try:
                # 使用超低的 chunk 时长（1.5 秒），更早触发转录
                result = await asyncio.to_thread(
                    self.whisper_service.transcribe_audio,
                    chunk.tobytes(),
                    "",  # 空字符串表示自动检测
                    False,  # Partial 模式，极低延时
                )
                if not result or not result.text.strip():
                    continue

                # 立即广播 Partial 字幕（无需等待 Final）
                await self._handle_asr_result(result)

                # 如果是 Final，额外处理翻译和 TTS
                if result.is_final:
                    await self._handle_final_result(result)

            except Exception as e:
                logger.error(f"[Call] ASR error: {e}")
                self.state.error_count += 1

    async def _handle_asr_result(self, result):
        """处理 ASR 结果（Partial 实时广播）"""
        if not result.text.strip():
            return

        # 广播 Partial 字幕给前端（无需翻译）
        event = {
            "type": "subtitle_partial",
            "text": result.text,
            "language": result.language,
            "confidence": result.confidence,
            "is_final": result.is_final,
            "timestamp": _time.time(),
        }
        payload = json.dumps(event, ensure_ascii=False)
        for client in list(self.websocket_clients):
            try:
                await client.send_text(payload)
            except Exception:
                self.websocket_clients.discard(client)

        logger.debug(f"[Call] Partial ASR: {result.text[:30]}...")

    async def _handle_final_result(self, result):
        """处理 Final ASR 结果（翻译 + TTS）"""
        text = result.text.strip()

        # 翻译
        if not self.translation_service or not self.language_manager:
            return
        try:
            pair = self.language_manager.get_current_pair()
            src_lang = pair.src_lang
            tgt_lang = pair.tgt_lang

            # 流式翻译（支持 Partial 快速响应）
            translation = await self.translation_service.translate(
                text,
                source_lang=src_lang,
                target_lang=tgt_lang,
                is_partial=False,  # Final 翻译使用完整超时
            )
            if not translation:
                return

            tgt_text = translation.get("translated_text", "") or translation.get("text", "")
            if not tgt_text.strip():
                return

            self.state.translate_count += 1
            self.state.last_translated_text = tgt_text
            logger.info(f"[Call] [{src_lang}] {text} → [{tgt_lang}] {tgt_text}")

            # 广播最终字幕（含译文）
            await self._broadcast_subtitle(text, tgt_text, src_lang, tgt_lang)

            # TTS 播报
            if self.state.mode == CallMode.TTS_AUTO and self.tts_service:
                await self._speak_translation(tgt_text, tgt_lang)

        except Exception as e:
            logger.error(f"[Call] Translation error: {e}")
            self.state.error_count += 1

    async def _broadcast_subtitle(self, src_text: str, tgt_text: str, src_lang: str, tgt_lang: str):
        """向 WebSocket 客户端广播字幕（含 is_final 标志）"""
        event = {
            "type": "call_subtitle",
            "src_text": src_text,
            "tgt_text": tgt_text,
            "src_lang": src_lang,
            "tgt_lang": tgt_lang,
            "is_final": True,
            "timestamp": _time.time(),
        }
        payload = json.dumps(event, ensure_ascii=False)
        for client in list(self.websocket_clients):
            try:
                await client.send_text(payload)
            except Exception:
                self.websocket_clients.discard(client)

    async def _speak_translation(self, text: str, lang: str):
        """合成并播放 TTS（超低延时流式版本）"""
        if not self.tts_service:
            return
        try:
            # 使用流式 TTS 合成，首包更快
            import asyncio

            loop = asyncio.get_running_loop()

            # 创建 TTSRequest
            from app.services.tts_service import TTSRequest
            tts_req = TTSRequest(
                text=text,
                voice_id=self.tts_service.current_voice.id if self.tts_service.current_voice else "vi-VN-female-1",
                lang=lang,
                speed=self.tts_service.current_voice.speed if self.tts_service.current_voice else 1.0,
            )

            # 流式合成音频
            audio_result = await self.tts_service.synthesize(tts_req, stream=True)

            # 处理返回结果（可能是 bytes 或 AsyncGenerator）
            if isinstance(audio_result, bytes):
                audio_data = audio_result
            else:
                # AsyncGenerator
                audio_chunks = []
                async for chunk in audio_result:
                    audio_chunks.append(chunk)
                    # 当累积足够数据（约 1 秒音频）时开始播放
                    if len(b"".join(audio_chunks)) >= 32000:
                        break
                audio_data = b"".join(audio_chunks)
            if not audio_data:
                return

            # 后台播放音频
            self._play_audio_async(audio_data)

        except Exception as e:
            logger.error(f"[Call] TTS error: {e}")
            self.state.error_count += 1

    def _play_audio_async(self, audio_bytes: bytes):
        """异步播放 TTS 音频（非阻塞）"""
        import threading

        def play():
            try:
                if not self.state.tts_playback_device:
                    return
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

        # 在后台线程中播放，不阻塞主循环
        thread = threading.Thread(target=play, daemon=True)
        thread.start()

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

