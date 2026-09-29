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
    """音频处理器：超低延时缓冲区管理、静音过滤、分块"""

    # 超低延时配置：
    # - CHUNK_SAMPLES: 从 3 秒降至 1.5 秒，减少首次转录等待
    # - SILENCE_THRESHOLD: 降低静音阈值，更敏感地捕捉语音
    # - MIN_BUFFER: 减小最小缓冲区，允许更早处理短音频
    CHUNK_SAMPLES = int(16000 * 1.5)  # 1.5 秒 @ 16kHz（原 3 秒）
    SILENCE_THRESHOLD = 0.012         # 更敏感的静音检测（原 0.015）
    MIN_BUFFER = 800                   # 最小缓冲 800 样本（原 1600）

    def __init__(self):
        self._buffer = np.empty(0, dtype=np.float32)
        self._lock = asyncio.Lock()

    async def append(self, chunk: np.ndarray):
        """追加音频数据到缓冲区"""
        async with self._lock:
            self._buffer = np.concatenate([self._buffer, chunk.astype(np.float32)])

    async def poll(self) -> Optional[np.ndarray]:
        """
        检查缓冲区，返回完整的 1.5 秒块（如果能量足够）。
        返回 None 表示无有效数据。
        超低延时版本：降低触发阈值，更早返回有效音频。
        """
        async with self._lock:
            if len(self._buffer) < self.MIN_BUFFER:
                return None

            # 静音检测（使用更低的阈值）
            energy = np.mean(np.abs(self._buffer))
            if energy < self.SILENCE_THRESHOLD:
                # 清空缓冲区
                self._buffer = np.empty(0, dtype=np.float32)
                return None

            # 如果缓冲区足够大，返回一个 1.5 秒的块
            if len(self._buffer) >= self.CHUNK_SAMPLES:
                chunk = self._buffer[:self.CHUNK_SAMPLES]
                self._buffer = self._buffer[self.CHUNK_SAMPLES:]
                return chunk

            # 如果缓冲区接近 CHUNK_SAMPLES（>= 80%），也返回以支持流式处理
            if len(self._buffer) >= int(self.CHUNK_SAMPLES * 0.8):
                chunk = self._buffer[:len(self._buffer)]
                self._buffer = np.empty(0, dtype=np.float32)
                return chunk

            return None

    async def clear(self):
        """清空缓冲区"""
        async with self._lock:
            self._buffer = np.empty(0, dtype=np.float32)

    @property
    def buffer_size(self) -> int:
        return len(self._buffer)


__all__ = ["AudioProcessor"]
