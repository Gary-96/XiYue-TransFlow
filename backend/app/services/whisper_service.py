"""
乐曼同传 — Whisper ASR 服务（超低延时优化版）
基于 faster-whisper (CTranslate2)，支持 VAD 实时切片和流式 Partial 转录
"""
import asyncio
import logging
import os
import re
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional, List, AsyncGenerator

# ── VAD 超低延时参数配置 ─────────────────────────────────────
MIN_SILENCE_MS = 250          # 最小静音截断时间（ms），快速切片短句
VAD_THRESHOLD = 0.3           # VAD 能量阈值（0~1，越高越不敏感）
SAMPLE_RATE = 16000           # Whisper 采样率


@dataclass
class TranscriptionSegment:
    """转录片段（用于流式输出和时序追踪）"""
    start_time: float
    end_time: float
    text: str
    is_partial: bool = False


@dataclass
class TranscriptionResult:
    """转录结果"""
    text: str
    language: str
    confidence: float
    segments: List[TranscriptionSegment] = field(default_factory=list)
    timestamp: float = field(default_factory=time.time)
    is_final: bool = True       # True=Final，False=Partial


logger = logging.getLogger(__name__)

# 全局 Whisper 模型实例（延迟加载）
_model = None
_model_loaded = False
_load_error: Optional[str] = None


def _check_dependencies() -> tuple[bool, str]:
    """探测关键依赖是否已安装"""
    missing = []
    try:
        import numpy  # noqa: F401
    except ImportError:
        missing.append("numpy")
    try:
        import torch  # noqa: F401
    except ImportError:
        missing.append("torch")
    try:
        from faster_whisper import WhisperModel  # noqa: F401
    except ImportError:
        missing.append("faster-whisper")
    # 补充检查音频处理相关依赖
    try:
        import sounddevice  # noqa: F401
    except ImportError:
        missing.append("sounddevice")
    try:
        import scipy  # noqa: F401
    except ImportError:
        missing.append("scipy")
    # edge_tts 为可选 TTS 依赖
    try:
        import edge_tts  # noqa: F401
    except ImportError:
        logger.warning("edge_tts 未安装，TTS 功能将降级使用")

    if missing:
        return False, f"缺少依赖: {', '.join(missing)}。请运行: pip install {' '.join(missing)}"
    return True, ""


def _load_model():
    """加载 Whisper 模型（延迟初始化，超低延时优化）"""
    global _model, _model_loaded, _load_error
    if _model_loaded:
        return True
    if _load_error:
        logger.error(f"Whisper 加载失败（已缓存）: {_load_error}")
        return False

    # 依赖探测
    deps_ok, deps_msg = _check_dependencies()
    if not deps_ok:
        _load_error = deps_msg
        logger.error(deps_msg)
        return False

    try:
        from config_manager import get_config_manager
        import numpy as np
        from faster_whisper import WhisperModel
        import torch

        cfg = get_config_manager()
        # 默认使用 tiny 模型实现极速转录，可通过配置覆盖
        model_size = cfg.get_whisper_model_size() or "tiny"
        device_raw = cfg.get_whisper_device() or "auto"
        if device_raw == "auto":
            device = "cuda" if torch.cuda.is_available() else "cpu"
        else:
            device = device_raw
        # int8 极致加速，CPU/GPU 通用
        compute_type = "int8"

        # 适配打包环境：PyInstaller 运行时 sys._MEIPASS 指向解压目录
        model_dir = cfg.get_whisper_model_dir() or None
        if model_dir and not os.path.isabs(model_dir):
            # 相对路径，在打包环境下可能不存在，改用绝对路径
            model_dir = os.path.join(os.path.expanduser("~"), ".cache", "faster-whisper")
        elif getattr(sys, 'frozen', False):
            # 打包环境：尝试从 _MEIPASS 加载模型
            meipass_models = Path(sys._MEIPASS) / "models" / "faster-whisper"
            if meipass_models.exists():
                model_dir = str(meipass_models)
            else:
                model_dir = None  # 回退到默认缓存路径
        elif model_dir:
            model_dir = str(Path(model_dir).resolve())

        logger.info(f"Loading Whisper model (low-latency): {model_size} on {device} (int8)")
        _model = WhisperModel(
            model_size,
            device=device,
            compute_type=compute_type,
            download_root=model_dir,
            cpu_threads=4,  # 限制 CPU 线程数避免过载
        )
        _model_loaded = True
        _load_error = None
        logger.info("Whisper model loaded successfully (low-latency mode)")
        return True
    except Exception as e:
        _load_error = str(e)
        logger.error(f"Failed to load Whisper model: {e}")
        return False


def _ensure_model_loaded() -> bool:
    """确保模型已加载（线程安全）"""
    if not _model_loaded:
        return _load_model()
    return True


class WhisperService:
    """语音识别服务 — 基于 faster-whisper"""

    def __init__(self):
        self._model = None  # 延迟初始化
        logger.info("WhisperService initialized (lazy model load)")

    def transcribe_audio(
        self,
        audio_data: bytes,
        language: str = "",
        is_final: bool = True,
    ) -> Optional[TranscriptionResult]:
        """
        转录音频数据（超低延时版本）

        Args:
            audio_data: PCM 音频数据（int16）
            language: 语言代码，为空时自动检测
            is_final: 是否为最终结果（True=Final，False=中间 Partial）
        Returns:
            TranscriptionResult 或 None
        """
        try:
            if not _ensure_model_loaded():
                logger.error("Whisper model not loaded")
                return None

            import numpy as np
            # int16 PCM → float32 @ 16kHz
            audio_np = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32) / 32768.0

            global _model
            if _model is None:
                logger.error("Whisper model is None after ensure_model_loaded")
                return None

            # 超低延时 VAD 参数配置
            vad_parameters = {
                'min_silence_duration_ms': MIN_SILENCE_MS,
                'threshold': VAD_THRESHOLD,
            }

            # 超低延时转录配置：
            # - beam_size=1: 最快解码（牺牲一点准确率换取速度）
            # - no_speech_threshold=0.8: 更严格地过滤静音
            # - condition_on_previous_text=False: 不依赖前文，减少延迟
            segments, info = _model.transcribe(
                audio_np,
                language=language or None,
                beam_size=1,
                word_timestamps=False,
                vad_filter=True,
                vad_parameters=vad_parameters,
                no_speech_threshold=0.8,
                condition_on_previous_text=False,
            )

            texts = [segment.text for segment in segments]
            text = " ".join(texts).strip()
            if not text:
                return None

            # 构建 segments 列表
            seg_list = [
                TranscriptionSegment(
                    start_time=seg.start if hasattr(seg, 'start') else 0.0,
                    end_time=seg.end if hasattr(seg, 'end') else 0.0,
                    text=seg.text,
                    is_partial=not is_final,
                )
                for seg in segments
            ]

            result = TranscriptionResult(
                text=text,
                language=info.language,
                confidence=info.language_probability,
                segments=seg_list,
                is_final=is_final,
            )

            logger.info(f"[ASR] {'Partial' if not is_final else 'Final'}: {text[:50]}... (lang={info.language}, conf={info.language_probability:.2f})")
            return result

        except Exception as e:
            logger.error(f"Transcription error: {e}")
            return None

    async def transcribe_streaming(
        self,
        audio_chunks: AsyncGenerator[bytes, None],
        language: str = "",
    ) -> AsyncGenerator[TranscriptionResult, None]:
        """
        流式转录（超低延时）

        将音频流分块，实时输出 Partial 结果，最终以 Final 结果结束
        """
        import numpy as np
        from collections import deque

        chunk_buffer = deque()
        chunk_duration = 0.0
        target_chunk_duration = 1.5  # 每个处理块的目标时长（秒）

        try:
            async for chunk in audio_chunks:
                if not isinstance(chunk, np.ndarray):
                    chunk = np.frombuffer(chunk, dtype=np.int16).astype(np.float32) / 32768.0

                chunk_buffer.append(chunk)
                chunk_duration += len(chunk) / SAMPLE_RATE

                # 累积到目标时长后处理（Partial 模式）
                if chunk_duration >= target_chunk_duration:
                    audio_np = np.concatenate(list(chunk_buffer))
                    chunk_buffer.clear()
                    chunk_duration = 0.0

                    result = await asyncio.to_thread(
                        self.transcribe_audio,
                        audio_np.tobytes(),
                        language,
                        False,  # Partial
                    )
                    if result:
                        yield result

            # 处理剩余数据（Final 模式）
            if chunk_buffer:
                audio_np = np.concatenate(list(chunk_buffer))
                result = await asyncio.to_thread(
                    self.transcribe_audio,
                    audio_np.tobytes(),
                    language,
                    True,  # Final
                )
                if result:
                    yield result

        except Exception as e:
            logger.error(f"Streaming transcription error: {e}")

    def get_service_info(self) -> dict:
        """获取服务信息，包含依赖状态"""
        return {
            "model": "faster-whisper",
            "mode": "low-latency",
            "available": _model_loaded,
            "lazy": True,
            "error": _load_error,
            "vad_params": {
                "min_silence_ms": MIN_SILENCE_MS,
                "threshold": VAD_THRESHOLD,
            },
        }

    @classmethod
    def get_dependency_status(cls) -> dict:
        """返回依赖探测结果（用于 API 诊断）"""
        deps_ok, deps_msg = _check_dependencies()
        return {
            "dependencies_ok": deps_ok,
            "message": deps_msg if not deps_ok else "所有依赖已安装",
            "model_loaded": _model_loaded,
            "model_error": _load_error,
        }


# ── 模块级单例 ──────────────────────────────────────────────────
_whisper_service = None


def get_whisper_service() -> WhisperService:
    """获取 Whisper 服务单例"""
    global _whisper_service
    if _whisper_service is None:
        _whisper_service = WhisperService()
    return _whisper_service


__all__ = ["WhisperService", "get_whisper_service", "TranscriptionResult", "TranscriptionSegment"]
