"""
喜阅 TransFlow — 通话同传数据模型
"""
import asyncio
import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

import numpy as np

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

    def reset(self):
        """重置状态"""
        self.is_running = False
        self.mode = CallMode.SUBTITLE_ONLY
        self._buffer = np.empty(0, dtype=np.float32)
        self.last_translated_text = ""
        self.translate_count = 0
        self.error_count = 0

    def get_stats(self) -> dict:
        """获取统计信息"""
        return {
            "translate_count": self.translate_count,
            "error_count": self.error_count,
            "last_translated_text": self.last_translated_text,
        }


__all__ = ["CallMode", "CallTranslationState"]

