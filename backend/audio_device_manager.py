"""
乐曼同传 — 音频设备管理器
枚举系统声卡/麦克风输入设备，支持专业设备识别
"""
import logging
import json
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)

# 专业设备关键词（用于高亮标注）
PRO_DEVICE_KEYWORDS = [
    "ASIO", "Focusrite", "Yamaha", "RODE", "Audient",
    "Steinberg", "Universal Audio", "UA Audio", "Apogee",
    "MOTU", "PreSonus", "Behringer", "M-Audio", "Native Instruments",
    "Focusrite", "Scarlett", "Clarett", "Apollo",
    "RME", "Babyface", "MADIface", "Hammerfall",
    "Antelope", "Orion", "Goliath", "Zen",
    "TASCAM", "UMC", "UMC", "Steinberg",
    "Broadcast", "Podcast", "Streamcast",
    "Shure", "SM7B", "MV7", "MV7+",
    "Elgato", "Wave", "Wave Link",
    "GoXLR", "TC-Helicon",
    "DJI", "RØDE", "Rode",
    "Virtual Audio", "VB-Audio", "Voicemeeter",
    "OBS", "Streamlabs",
    "CABLE Output", "VB-Cable",
]


def _is_pro_device(name: str) -> bool:
    """判断是否为专业设备"""
    name_lower = name.lower()
    return any(kw.lower() in name_lower for kw in PRO_DEVICE_KEYWORDS)


def _get_driver_type(hostapi_name: str) -> str:
    """从 HostAPI 名称推断驱动类型"""
    mapping = {
        "MME": "MME",
        "Windows DirectSound": "DirectSound",
        "WASAPI": "WASAPI",
        "ASIO": "ASIO",
        "Core Audio": "CoreAudio",
        "ALSA": "ALSA",
        "JACK Audio Connection Kit": "JACK",
    }
    return mapping.get(hostapi_name, hostapi_name)


def list_input_devices() -> List[Dict[str, Any]]:
    """
    枚举系统中所有音频输入设备
    
    Returns:
        设备列表，每项包含:
        - id: 设备索引号
        - name: 设备名称
        - is_default: 是否为系统默认输入设备
        - channels: 输入通道数
        - max_input_channels: 最大输入通道数
        - default_samplerate: 默认采样率
        - driver: 驱动类型 (MME/WASAPI/ASIO 等)
        - is_pro_device: 是否识别为专业设备
        - hostapi: 宿主 API 名称
    """
    try:
        import sounddevice as sd
    except ImportError:
        logger.error("sounddevice not installed. Please: pip install sounddevice")
        return []
    
    devices = []
    all_devices = sd.query_devices()
    default_input_idx = sd.default.device[0]  # 0 = input
    
    # 获取 HostAPI 映射
    hostapis = sd.query_hostapis()
    hostapi_map = {}
    for i, api in enumerate(hostapis):
        hostapi_map[i] = api["name"]
    
    for idx, dev in enumerate(all_devices):
        max_input = dev.get("max_input_channels", 0)
        if max_input <= 0:
            continue  # 跳过纯输出设备
        
        hostapi_name = hostapi_map.get(dev.get("hostapi", 0), "Unknown")
        dev_name = dev.get("name", f"Device {idx}")
        
        device_info = {
            "id": idx,
            "name": dev_name,
            "is_default": idx == default_input_idx,
            "channels": max_input,
            "max_input_channels": max_input,
            "default_samplerate": int(dev.get("default_samplerate", 48000)),
            "driver": _get_driver_type(hostapi_name),
            "hostapi": hostapi_name,
            "is_pro_device": _is_pro_device(dev_name),
        }
        
        # 专业设备排在前面
        devices.append(device_info)
    
    # 排序：默认设备 → 专业设备 → 其他
    devices.sort(key=lambda d: (
        not d["is_default"],      # 默认设备优先
        not d["is_pro_device"],   # 专业设备其次
        d["name"].lower(),         # 其余按名称排序
    ))
    
    logger.info(f"Found {len(devices)} input devices ({sum(1 for d in devices if d['is_pro_device'])} pro devices)")
    return devices


def get_device_info(device_id: int) -> Optional[Dict[str, Any]]:
    """获取单个设备详细信息"""
    try:
        import sounddevice as sd
        dev = sd.query_devices(device_id)
        hostapis = sd.query_hostapis()
        hostapi_name = hostapis.get(dev.get("hostapi", 0), {}).get("name", "Unknown")
        
        return {
            "id": device_id,
            "name": dev.get("name", f"Device {device_id}"),
            "is_default": device_id == sd.default.device[0],
            "channels": dev.get("max_input_channels", 0),
            "max_input_channels": dev.get("max_input_channels", 0),
            "default_samplerate": int(dev.get("default_samplerate", 48000)),
            "driver": _get_driver_type(hostapi_name),
            "hostapi": hostapi_name,
            "is_pro_device": _is_pro_device(dev.get("name", "")),
        }
    except Exception as e:
        logger.error(f"Failed to query device {device_id}: {e}")
        return None


def validate_device(device_id: int) -> Dict[str, Any]:
    """
    校验设备是否可用（尝试打开输入流）
    
    Returns:
        {"valid": bool, "message": str, "device": Optional[dict]}
    """
    try:
        import sounddevice as sd
        dev_info = get_device_info(device_id)
        if not dev_info:
            return {"valid": False, "message": f"设备 {device_id} 不存在", "device": None}
        
        if dev_info["channels"] <= 0:
            return {"valid": False, "message": f"设备 {dev_info['name']} 不是输入设备", "device": dev_info}
        
        # 尝试短暂打开输入流校验
        try:
            import numpy as np
            test_data = sd.rec(frames=1, samplerate=16000, channels=1, 
                              dtype='float32', device=device_id, blocking=True)
            return {"valid": True, "message": f"设备 {dev_info['name']} 可用", "device": dev_info}
        except Exception as e:
            return {"valid": False, "message": f"设备 {dev_info['name']} 无法打开: {str(e)}", "device": dev_info}
            
    except Exception as e:
        return {"valid": False, "message": f"校验失败: {str(e)}", "device": None}
