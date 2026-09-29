"""
喜阅 TransFlow — 音频设备配置
负责 4 路独立音频设备的路由管理
"""
import logging
from typing import Dict, Optional

logger = logging.getLogger(__name__)

VALID_AUDIO_KEYS = {"mic_input", "translation_output", "remote_input", "remote_output"}


class AudioConfig:
    """音频设备配置管理器"""

    def __init__(self, devices: Dict[str, Optional[int]]):
        self._devices: Dict[str, Optional[int]] = dict(devices)
        # 兼容旧版字段
        self._mic_input = devices.get("mic_input")

    def get_device(self, device_key: str) -> Optional[int]:
        """获取指定设备的 ID"""
        if device_key not in VALID_AUDIO_KEYS:
            logger.error(f"Invalid audio device key: {device_key}")
            return None
        return self._devices.get(device_key)

    def get_mic_input(self) -> Optional[int]:
        """获取麦克风输入设备"""
        return self._devices.get("mic_input")

    def get_translation_output(self) -> Optional[int]:
        """获取翻译输出设备"""
        return self._devices.get("translation_output")

    def get_remote_input(self) -> Optional[int]:
        """获取远端输入设备"""
        return self._devices.get("remote_input")

    def get_remote_output(self) -> Optional[int]:
        """获取远端输出设备"""
        return self._devices.get("remote_output")

    def set_device(self, device_key: str, device_id: Optional[int]) -> bool:
        """设置指定设备的 ID"""
        if device_key not in VALID_AUDIO_KEYS:
            logger.error(f"Invalid audio device key: {device_key}")
            return False
        if device_id is not None and not isinstance(device_id, int):
            logger.error(f"Invalid device ID type: {type(device_id)}")
            return False
        self._devices[device_key] = device_id
        # 同步旧版字段
        if device_key == "mic_input":
            self._mic_input = device_id
        return True

    def get_all_devices(self) -> Dict[str, Optional[int]]:
        """获取所有设备配置"""
        return dict(self._devices)

    def to_dict(self) -> Dict[str, Optional[int]]:
        """序列化为字典"""
        return {**self._devices, "audio_device_id": self._mic_input}

