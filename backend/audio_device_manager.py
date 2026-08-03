"""
乐曼同传 — 音频设备管理器
枚举系统声卡/麦克风输入设备 & 输出设备，支持专业设备识别
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
    "CABLE Input", "VB-Cable Input",
    "Line", "Loopback",
    "Steam", "Streaming",
    "Speaker", "Headphone", "Headset",
    "HDMI", "DisplayPort",
    "Realtek", "Conexant", "SoundMAX",
    "USB Audio", "USB PnP",
    "Microphone", "Mic",
    "Stereo Mix", "Wave Out Mix",
    "What U Hear",
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


def _query_devices() -> tuple:
    """查询所有设备，返回 (all_devices, default_input_idx, default_output_idx, hostapi_map)"""
    try:
        import sounddevice as sd
    except ImportError:
        logger.error("sounddevice not installed. Please: pip install sounddevice")
        return [], None, None, {}

    all_devices = sd.query_devices()
    default_input_idx = sd.default.device[0]   # 0 = input
    default_output_idx = sd.default.device[1]   # 1 = output

    hostapis = sd.query_hostapis()
    hostapi_map = {}
    for i, api in enumerate(hostapis):
        hostapi_map[i] = api["name"]

    return all_devices, default_input_idx, default_output_idx, hostapi_map


def _build_device_info(idx: int, dev: dict, hostapi_name: str, default_idx: int, is_input: bool) -> Dict[str, Any]:
    """构建设备信息字典"""
    dev_name = dev.get("name", f"Device {idx}")
    max_ch = dev.get("max_input_channels" if is_input else "max_output_channels", 0)
    return {
        "id": idx,
        "name": dev_name,
        "is_default": idx == default_idx,
        "channels": max_ch,
        "max_input_channels": dev.get("max_input_channels", 0),
        "max_output_channels": dev.get("max_output_channels", 0),
        "default_samplerate": int(dev.get("default_samplerate", 48000)),
        "driver": _get_driver_type(hostapi_name),
        "hostapi": hostapi_name,
        "is_pro_device": _is_pro_device(dev_name),
        "direction": "input" if is_input else "output",
    }


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
    all_devices, default_input_idx, _, hostapi_map = _query_devices()
    if not all_devices:
        return []

    devices = []
    for idx, dev in enumerate(all_devices):
        max_input = dev.get("max_input_channels", 0)
        if max_input <= 0:
            continue  # 跳过纯输出设备

        hostapi_name = hostapi_map.get(dev.get("hostapi", 0), "Unknown")
        device_info = _build_device_info(idx, dev, hostapi_name, default_input_idx, is_input=True)
        devices.append(device_info)

    # 排序：默认设备 → 专业设备 → 其他
    devices.sort(key=lambda d: (
        not d["is_default"],
        not d["is_pro_device"],
        d["name"].lower(),
    ))

    logger.info(f"Found {len(devices)} input devices ({sum(1 for d in devices if d['is_pro_device'])} pro devices)")
    return devices


def list_output_devices() -> List[Dict[str, Any]]:
    """
    枚举系统中所有音频输出设备（扬声器、耳机、虚拟声卡等）
    
    Returns:
        设备列表，每项包含:
        - id: 设备索引号
        - name: 设备名称
        - is_default: 是否为系统默认输出设备
        - channels: 输出通道数
        - max_output_channels: 最大输出通道数
        - default_samplerate: 默认采样率
        - driver: 驱动类型
        - is_pro_device: 是否识别为专业设备
        - hostapi: 宿主 API 名称
        - direction: "output"
    """
    all_devices, _, default_output_idx, hostapi_map = _query_devices()
    if not all_devices:
        return []

    devices = []
    for idx, dev in enumerate(all_devices):
        max_output = dev.get("max_output_channels", 0)
        if max_output <= 0:
            continue  # 跳过纯输入设备

        hostapi_name = hostapi_map.get(dev.get("hostapi", 0), "Unknown")
        device_info = _build_device_info(idx, dev, hostapi_name, default_output_idx, is_input=False)
        devices.append(device_info)

    # 排序：默认设备 → 专业设备 → 其他
    devices.sort(key=lambda d: (
        not d["is_default"],
        not d["is_pro_device"],
        d["name"].lower(),
    ))

    logger.info(f"Found {len(devices)} output devices ({sum(1 for d in devices if d['is_pro_device'])} pro devices)")
    return devices


def list_all_devices() -> Dict[str, List[Dict[str, Any]]]:
    """
    枚举所有输入和输出设备，返回分类字典
    
    Returns:
        {"inputs": [...], "outputs": [...]}
    """
    return {
        "inputs": list_input_devices(),
        "outputs": list_output_devices(),
    }


def get_device_info(device_id: int) -> Optional[Dict[str, Any]]:
    """获取单个设备详细信息（输入或输出）"""
    try:
        import sounddevice as sd
        dev = sd.query_devices(device_id)
        hostapis = sd.query_hostapis()
        hostapi_name = hostapis.get(dev.get("hostapi", 0), {}).get("name", "Unknown")
        
        is_input = dev.get("max_input_channels", 0) > 0
        default_idx = sd.default.device[0] if is_input else sd.default.device[1]
        
        return _build_device_info(device_id, dev, hostapi_name, default_idx, is_input)
    except Exception as e:
        logger.error(f"Failed to query device {device_id}: {e}")
        return None


def validate_device(device_id: int) -> Dict[str, Any]:
    """
    校验设备是否可用（尝试打开输入/输出流）
    
    Returns:
        {"valid": bool, "message": str, "device": Optional[dict]}
    """
    try:
        import sounddevice as sd
        dev_info = get_device_info(device_id)
        if not dev_info:
            return {"valid": False, "message": f"设备 {device_id} 不存在", "device": None}
        
        is_input = dev_info.get("max_input_channels", 0) > 0
        
        if is_input:
            # 校验输入设备
            try:
                sd.rec(frames=1, samplerate=16000, channels=1,
                       dtype='float32', device=device_id, blocking=True)
                return {"valid": True, "message": f"输入设备 {dev_info['name']} 可用", "device": dev_info}
            except Exception as e:
                return {"valid": False, "message": f"输入设备 {dev_info['name']} 无法打开: {str(e)}", "device": dev_info}
        else:
            # 校验输出设备（尝试打开输出流播放静音）
            try:
                import numpy as np
                silence = np.zeros(1, dtype='float32')
                sd.play(silence, samplerate=48000, device=device_id, blocking=True)
                return {"valid": True, "message": f"输出设备 {dev_info['name']} 可用", "device": dev_info}
            except Exception as e:
                return {"valid": False, "message": f"输出设备 {dev_info['name']} 无法打开: {str(e)}", "device": dev_info}
            
    except Exception as e:
        return {"valid": False, "message": f"校验失败: {str(e)}", "device": None}
