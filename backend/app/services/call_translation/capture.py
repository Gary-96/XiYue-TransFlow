"""
喜阅 TransFlow — 音频捕获模块
负责从系统音频设备捕获音频流
"""
import asyncio
import logging
from typing import Optional

import numpy as np
import sounddevice as sd

logger = logging.getLogger(__name__)


class AudioCapture:
    """系统音频捕获器（Loopback 模式）"""

    def __init__(self, device_index: Optional[int] = None):
        self.device_index = device_index
        self.stream = None
        self.sample_rate = 48000
        self.channels = 2
        self._running = False

    async def start(self, callback_handler) -> bool:
        """启动音频捕获"""
        try:
            if self.device_index is not None:
                device_info = sd.query_devices(self.device_index, "input")
                self.sample_rate = int(device_info.get("default_samplerate", 48000))
                self.channels = max(int(device_info.get("max_input_channels", 2)), 1)
        except Exception as e:
            logger.warning(f"Query device failed: {e}, using defaults")

        logger.info(f"[AudioCapture] Starting: sr={self.sample_rate}, ch={self.channels}")

        self._running = True
        try:
            self.stream = sd.InputStream(
                device=self.device_index,
                samplerate=self.sample_rate,
                channels=self.channels,
                dtype="float32",
                blocksize=int(self.sample_rate * 2.0),
                callback=lambda indata, frames, time, status: (
                    self._on_data(indata, callback_handler)
                    if not status.overflow and self._running
                    else None
                ),
            )
            self.stream.start()
            logger.info(f"[AudioCapture] Capture active on device {self.device_index}")
            return True
        except Exception as e:
            logger.error(f"[AudioCapture] Failed to start: {e}")
            return False

    def _on_data(self, indata: np.ndarray, handler):
        """音频回调：转换为单声道并通知处理器"""
        mono = indata[:, 0] if indata.ndim > 1 and indata.shape[1] > 1 else indata.flatten()
        asyncio.get_event_loop().call_soon_threadsafe(
            lambda: asyncio.ensure_future(handler(mono))
        )

    async def stop(self):
        """停止音频捕获"""
        self._running = False
        if self.stream:
            try:
                self.stream.stop()
                self.stream.close()
            except Exception:
                pass
            self.stream = None
        logger.info("[AudioCapture] Stopped")

    @property
    def is_running(self) -> bool:
        return self._running


__all__ = ["AudioCapture"]

