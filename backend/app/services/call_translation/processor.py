"""
乐曼同传 — 音频处理模块
负责音频缓冲、分块、静音检测
"""
import asyncio
import logging
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)


class AudioProcessor:
    """音频处理器：缓冲区管理、静音过滤、分块"""

    CHUNK_SAMPLES = int(16000 * 3.0)  # 3 秒 @ 16kHz
    SILENCE_THRESHOLD = 0.015
    MIN_BUFFER = 1600

    def __init__(self):
        self._buffer = np.empty(0, dtype=np.float32)
        self._lock = asyncio.Lock()

    async def append(self, chunk: np.ndarray):
        """追加音频数据到缓冲区"""
        async with self._lock:
            self._buffer = np.concatenate([self._buffer, chunk.astype(np.float32)])

    async def poll(self) -> Optional[np.ndarray]:
        """
        检查缓冲区，返回完整的 3 秒块（如果能量足够）。
        返回 None 表示无有效数据。
        """
        async with self._lock:
            if len(self._buffer) < self.MIN_BUFFER:
                return None

            # 静音检测
            energy = np.mean(np.abs(self._buffer))
            if energy < self.SILENCE_THRESHOLD:
                # 清空缓冲区
                self._buffer = np.empty(0, dtype=np.float32)
                return None

            if len(self._buffer) < self.CHUNK_SAMPLES:
                return None

            chunk = self._buffer[:self.CHUNK_SAMPLES]
            self._buffer = self._buffer[self.CHUNK_SAMPLES:]
            return chunk

    async def clear(self):
        """清空缓冲区"""
        async with self._lock:
            self._buffer = np.empty(0, dtype=np.float32)

    @property
    def buffer_size(self) -> int:
        return len(self._buffer)


__all__ = ["AudioProcessor"]
