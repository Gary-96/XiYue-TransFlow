"""
乐曼同传 — Whisper ASR 服务
基于 faster-whisper，模型延迟加载，避免阻塞启动
"""
import asyncio
import logging
import os
import sys
from typing import Optional
from app.models.schemas import TranscriptionResult

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
    """加载 Whisper 模型（延迟初始化，避免阻塞启动）"""
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
        model_size = cfg.get_whisper_model_size() or "base"
        device_raw = cfg.get_whisper_device() or "auto"
        if device_raw == "auto":
            device = "cuda" if torch.cuda.is_available() else "cpu"
        else:
            device = device_raw
        compute_type = "float16" if device == "cuda" else "int8"

        # 适配打包环境：PyInstaller 运行时 sys._MEIPASS 指向解压目录
        model_dir = cfg.get_whisper_model_dir() or None
        if model_dir and not os.path.isabs(model_dir):
            # 相对路径，在打包环境下可能不存在，改用绝对路径
            model_dir = os.path.join(os.path.expanduser("~"), ".cache", "faster-whisper")
        elif sys._MEIPASS:
            # 打包环境：模型放在资源目录下
            model_dir = os.path.join(sys._MEIPASS, "models", "faster-whisper")
            if not os.path.exists(model_dir):
                model_dir = None  # 回退到默认缓存路径

        logger.info(f"Loading Whisper model: {model_size} on {device}")
        _model = WhisperModel(
            model_size,
            device=device,
            compute_type=compute_type,
            download_root=model_dir,
        )
        _model_loaded = True
        _load_error = None
        logger.info("Whisper model loaded successfully")
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

    def transcribe_audio(self, audio_data: bytes, language: str = "") -> Optional[TranscriptionResult]:
        """
        转录音频数据
        Args:
            audio_data: PCM 音频数据（int16）
            language: 语言代码，为空时自动检测
        Returns:
            TranscriptionResult 或 None
        """
        try:
            if not _ensure_model_loaded():
                logger.error("Whisper model not loaded")
                return None

            import numpy as np
            # int16 PCM → float32
            audio_np = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32) / 32768.0

            # 使用全局模型实例（避免每次重新加载）
            global _model
            if _model is None:
                logger.error("Whisper model is None after ensure_model_loaded")
                return None

            segments, info = _model.transcribe(
                audio_np,
                language=language or None,
                beam_size=5,
                word_timestamps=False,
                vad_filter=True,
            )

            text = " ".join([segment.text for segment in segments]).strip()
            if not text:
                return None

            return TranscriptionResult(
                text=text,
                language=info.language,
                confidence=info.language_probability,
            )
        except Exception as e:
            logger.error(f"Transcription error: {e}")
            return None

    def get_service_info(self) -> dict:
        """获取服务信息，包含依赖状态"""
        return {
            "model": "faster-whisper",
            "available": _model_loaded,
            "lazy": True,
            "error": _load_error,
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
