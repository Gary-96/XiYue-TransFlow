"""
乐曼同传 Leman Translate - FastAPI 主入口文件
包含：配置管理、音频设备控制、弹幕采集与翻译路由、WebSocket 数据流 (FFT + ASR)
"""

import asyncio
from contextlib import asynccontextmanager
import json
import logging
import numpy as np
import time as _time
from collections import deque
from datetime import datetime, timezone
from typing import Deque, Dict, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.services.whisper_service import WhisperService
from app.services.translation_service import TranslationService
from app.services.language_manager import language_manager, SUPPORTED_LANGUAGES
from app.services.tts_service import tts_service, DEFAULT_VOICES
from app.services.call_translation_service import call_translation_service, CallMode
from app.services.llm_service import get_local_llm_manager, LocalModel
from collectors.manager import create_collector_manager
from config_manager import get_config_manager, get_config_path, PROVIDER_META
from audio_device_manager import list_input_devices, list_output_devices, list_all_devices, get_device_info, validate_device

# Shared language code mapping used by both message_callback and audio WS handler
LANG_MAP = {
    "zh": "zh",
    "vi": "vi",
    "en": "en",
    "ja": "ja",
    "ko": "ko",
    "th": "th",
}

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize config manager (singleton)
config_manager = get_config_manager()

# Initialize services
whisper_service = WhisperService()
translation_service = TranslationService()

# Global collector manager & WebSocket clients
websocket_clients = set()
collector_manager = None

# 通话同传服务注入依赖
call_translation_service.whisper_service = whisper_service
call_translation_service.translation_service = translation_service
call_translation_service.tts_service = tts_service
call_translation_service.language_manager = language_manager
call_translation_service.websocket_clients = websocket_clients

# ── 日志面板服务 ──────────────────────────────────────────────
LOG_BUFFER_SIZE = 2000
_log_buffer: Deque[dict] = deque(maxlen=LOG_BUFFER_SIZE)
_log_ws_clients: set = set()


class LogBufferHandler(logging.Handler):
    """将 Python logger 输出同时写入环形缓冲区，供 WebSocket 推送"""

    def emit(self, record: logging.LogRecord):
        try:
            entry = {
                "timestamp": datetime.now(timezone.utc).strftime("%H:%M:%S"),
                "level": record.levelname,
                "logger": record.name,
                "message": self.format(record),
            }
            _log_buffer.append(entry)
            loop = asyncio.get_running_loop()
            loop.call_soon_threadsafe(
                asyncio.ensure_future, _broadcast_log_entry(entry)
            )
        except Exception:
            pass


async def _broadcast_log_entry(entry: dict):
    """广播单条日志到日志 WebSocket 客户端"""
    global _log_ws_clients
    if not _log_ws_clients:
        return
    payload = json.dumps(entry, ensure_ascii=False)
    disconnected = set()
    for ws in list(_log_ws_clients):
        try:
            await ws.send_text(payload)
        except Exception:
            disconnected.add(ws)
    _log_ws_clients -= disconnected


_log_buffer_handler = LogBufferHandler()
logging.getLogger().addHandler(_log_buffer_handler)
for _name in ("main_manager", "app.services", "collectors", "config_manager",
              "audio_device_manager", "call_translation_service"):
    logging.getLogger(_name).addHandler(_log_buffer_handler)


def get_log_history() -> list[dict]:
    return list(_log_buffer)


# TTS 旁白播报状态
_tts_enabled = True  # 默认开启自动播报
_tts_speaking = False
_tts_text_queue: list = []
_tts_speak_task: Optional[asyncio.Task] = None


# ── 消息回调函数 (仅负责翻译，不重复广播) ──────────────────────
async def message_callback(message: dict):
    """
    Callback for collector messages - translates comments then modifies message in-place
    """
    try:
        # 对弹幕评论进行实时翻译
        if message.get("type") == "comment" and message.get("text"):
            try:
                pair = language_manager.get_current_pair()
                src_lang = pair.src_lang
                tgt_lang = pair.tgt_lang

                # 如果源语言 != 目标语言，且不是 auto，进行翻译
                if src_lang != tgt_lang and src_lang != "auto":
                    src_full = LANG_MAP.get(src_lang, src_lang)
                    tgt_full = LANG_MAP.get(tgt_lang, tgt_lang)

                    translation = (
                        await translation_service._translate_by_provider(
                            config_manager.get_current_provider(),
                            config_manager.get_api_key(),
                            message["text"],
                            src_full,
                            tgt_full,
                        )
                    )
                    if translation and translation.text:
                        message["translated_text"] = translation.text
                    else:
                        message["translated_text"] = ""
                else:
                    message["translated_text"] = ""
            except Exception as e:
                logger.warning(f"Comment translation failed: {e}")
                message["translated_text"] = ""

        # 注意：此处不再重复手动调用 send_text 广播，避免弹幕在前端重复出现两次！
        # 广播逻辑已在 BaseCollector 中统一且线程安全地处理。

    except Exception as e:
        logger.error(f"Error in message callback: {str(e)}")


def initialize_collector_manager():
    """Initialize collector manager on startup"""
    global collector_manager

    try:
        collector_manager = create_collector_manager(message_callback)
        if collector_manager:
            logger.info("Collector manager initialized successfully")
            return True
        else:
            logger.error("Failed to initialize collector manager")
            return False
    except Exception as e:
        logger.error(f"Failed to initialize collector manager: {str(e)}")
        return False


# ── TTS 旁白播报核心逻辑 ─────────────────────────────────────
async def _queue_tts_speak(text: str, lang: str):
    """将翻译文本加入播报队列，后台异步合成并广播"""
    global _tts_speak_task
    _tts_text_queue.append({"text": text, "lang": lang})
    if not _tts_speak_task or _tts_speak_task.done():
        _tts_speak_task = asyncio.get_running_loop().create_task(_tts_speaker_loop())


async def _tts_speaker_loop():
    """后台 TTS 播报循环：逐条合成音频并广播给所有客户端"""
    global _tts_speaking, _tts_speak_task
    while _tts_text_queue:
        _tts_speaking = True
        await _broadcast_to_all_clients({
            "type": "tts_status",
            "speaking": True,
            "text": _tts_text_queue[0]["text"],
        })
        item = _tts_text_queue.pop(0)
        try:
            from edge_tts import Communicate
            edge_voice = tts_service.get_edge_tts_voice()
            rate = tts_service.get_edge_tts_rate()
            communicate = Communicate(item["text"], edge_voice, rate=rate)
            chunks = bytearray()
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    chunks.extend(chunk["data"])
            audio_bytes = bytes(chunks)
            if audio_bytes:
                disconnected = set()
                for ws in websocket_clients:
                    try:
                        await ws.send_bytes(audio_bytes)
                        await ws.send_text(json.dumps({
                            "type": "tts_audio_start",
                            "text": item["text"],
                            "timestamp": _time.monotonic(),
                        }, ensure_ascii=False))
                    except Exception:
                        disconnected.add(ws)
                for ws in disconnected:
                    websocket_clients.discard(ws)
                logger.info(f"TTS 播报完成: {item['text'][:30]}...")
        except Exception as e:
            logger.error(f"TTS 播报失败: {e}")
        _tts_speaking = False
    _tts_speak_task = None
    if not _tts_text_queue:
        await _broadcast_to_all_clients({"type": "tts_status", "speaking": False})


# ── 应用生命周期管理 ──────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup & Shutdown Lifecycle"""
    logger.info("Starting up 乐曼同传 Leman Translate...")
    manager_available = initialize_collector_manager()
    logger.info("Startup completed")
    logger.info(f"Whisper device: {whisper_service.model if hasattr(whisper_service, 'model') else 'default'}")
    logger.info(f"Collector manager available: {manager_available}")

    yield

    logger.info("Shutting down 乐曼同传...")
    if collector_manager:
        await collector_manager.stop_all_platforms()


app = FastAPI(
    title="乐曼同传 Leman Translate API",
    version="3.0.0",
    lifespan=lifespan,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── 音频设备路由 ────────────────────────────────────────────
@app.get("/api/audio/devices")
async def get_audio_devices():
    """枚举系统中所有音频输入设备"""
    try:
        devices = list_input_devices()
        return {
            "status": "success",
            "devices": devices,
            "count": len(devices),
            "current_device_id": config_manager.get_audio_device_id(),
        }
    except Exception as e:
        logger.error(f"Error listing audio devices: {str(e)}")
        return {"status": "error", "message": str(e), "devices": []}


@app.get("/api/audio/devices/output")
async def get_output_devices():
    """枚举系统中所有音频输出设备"""
    try:
        devices = list_output_devices()
        return {
            "status": "success",
            "devices": devices,
            "count": len(devices),
        }
    except Exception as e:
        logger.error(f"Error listing output devices: {str(e)}")
        return {"status": "error", "message": str(e), "devices": []}


@app.get("/api/audio/devices/all")
async def get_all_devices():
    """枚举所有输入和输出设备"""
    try:
        result = list_all_devices()
        return {
            "status": "success",
            "inputs": result["inputs"],
            "outputs": result["outputs"],
            "input_count": len(result["inputs"]),
            "output_count": len(result["outputs"]),
            "current_devices": config_manager.get_audio_devices(),
        }
    except Exception as e:
        logger.error(f"Error listing all devices: {str(e)}")
        return {"status": "error", "message": str(e)}


@app.get("/api/audio/devices/{device_id}")
async def get_audio_device_detail(device_id: int):
    """获取单个音频设备详情"""
    try:
        info = get_device_info(device_id)
        if info:
            return {"status": "success", "device": info}
        else:
            return {"status": "error", "message": f"设备 {device_id} 不存在"}
    except Exception as e:
        logger.error(f"Error getting device {device_id}: {str(e)}")
        return {"status": "error", "message": str(e)}


@app.post("/api/audio/devices/{device_id}/validate")
async def validate_audio_device(device_id: int):
    """校验指定音频设备是否可用"""
    try:
        result = validate_device(device_id)
        return {"status": "success", "result": result}
    except Exception as e:
        logger.error(f"Error validating device {device_id}: {str(e)}")
        return {"status": "error", "message": str(e)}


@app.put("/api/audio/device")
async def set_audio_device(request: dict):
    """设置当前音频输入设备（兼容旧版接口）"""
    try:
        device_id = request.get("device_id")

        if device_id is not None:
            info = get_device_info(int(device_id))
            if not info:
                return {"status": "error", "message": f"设备 {device_id} 不存在"}
            if info["channels"] <= 0:
                return {
                    "status": "error",
                    "message": f"设备 {info['name']} 不是输入设备",
                }

            success = config_manager.update_config(
                {"audio_device_id": int(device_id)}
            )
        else:
            success = config_manager.update_config({"audio_device_id": None})

        if success:
            return {
                "status": "success",
                "message": (
                    "音频设备已切换"
                    if device_id is not None
                    else "已恢复系统默认设备"
                ),
                "current_device_id": config_manager.get_audio_device_id(),
            }
        else:
            return {"status": "error", "message": "保存配置失败"}
    except Exception as e:
        logger.error(f"Error setting audio device: {str(e)}")
        return {"status": "error", "message": str(e)}


# ── 4 路独立音频设备路由 ───────────────────────────────────
@app.put("/api/audio/devices/route")
async def set_audio_device_route(request: dict):
    """设置指定路由的音频设备 (mic_input / translation_output / remote_input / remote_output)"""
    try:
        device_key = request.get("device_key", "")
        device_id = request.get("device_id")

        valid_keys = {"mic_input", "translation_output", "remote_input", "remote_output"}
        if device_key not in valid_keys:
            return {"status": "error", "message": f"无效的设备路由 key: {device_key}"}

        # 校验设备是否存在
        if device_id is not None:
            info = get_device_info(int(device_id))
            if not info:
                return {"status": "error", "message": f"设备 {device_id} 不存在"}

            # 输入路由校验输入通道，输出路由校验输出通道
            if device_key in ("mic_input", "remote_input"):
                if info.get("max_input_channels", 0) <= 0:
                    return {"status": "error", "message": f"设备 {info['name']} 没有输入通道"}
            else:  # translation_output, remote_output
                if info.get("max_output_channels", 0) <= 0:
                    return {"status": "error", "message": f"设备 {info['name']} 没有输出通道"}

            device_id = int(device_id)

        success = config_manager.set_audio_device(device_key, device_id)
        if success:
            label_map = {
                "mic_input": "麦克风输入",
                "translation_output": "主播翻译输出",
                "remote_input": "对方声音输入",
                "remote_output": "对方翻译输出",
            }
            dev_name = "系统默认设备"
            if device_id is not None:
                info = get_device_info(device_id)
                dev_name = info["name"] if info else f"设备 {device_id}"

            return {
                "status": "success",
                "message": f"{label_map.get(device_key, device_key)} 已切换到: {dev_name}",
                "device_key": device_key,
                "device_id": device_id,
                "audio_devices": config_manager.get_audio_devices(),
            }
        else:
            return {"status": "error", "message": "保存配置失败"}
    except Exception as e:
        logger.error(f"Error setting audio device route: {str(e)}")
        return {"status": "error", "message": str(e)}


@app.get("/api/audio/devices/config")
async def get_audio_devices_config():
    """获取当前 4 路音频设备配置及详细信息"""
    try:
        audio_devices = config_manager.get_audio_devices()
        result = {}
        for key, dev_id in audio_devices.items():
            if dev_id is not None:
                info = get_device_info(dev_id)
                result[key] = {
                    "device_id": dev_id,
                    "device": info,
                }
            else:
                result[key] = {
                    "device_id": None,
                    "device": None,
                }
        return {
            "status": "success",
            "audio_devices": audio_devices,
            "details": result,
        }
    except Exception as e:
        logger.error(f"Error getting audio devices config: {str(e)}")
        return {"status": "error", "message": str(e)}


@app.get("/api/audio/current-device")
async def get_current_audio_device():
    """获取当前配置的音频输入设备"""
    try:
        device_id = config_manager.get_audio_device_id()
        if device_id is not None:
            info = get_device_info(device_id)
            if info:
                return {
                    "status": "success",
                    "device_id": device_id,
                    "device": info,
                    "audio_devices": config_manager.get_audio_devices(),
                }
            else:
                return {
                    "status": "success",
                    "device_id": device_id,
                    "device": None,
                    "audio_devices": config_manager.get_audio_devices(),
                    "message": "设备可能已断开",
                }
        else:
            return {
                "status": "success",
                "device_id": None,
                "device": None,
                "audio_devices": config_manager.get_audio_devices(),
                "message": "使用系统默认设备",
            }
    except Exception as e:
        logger.error(f"Error getting current audio device: {str(e)}")
        return {"status": "error", "message": str(e)}


# ── 配置管理路由 ────────────────────────────────────────────
@app.get("/api/config")
async def get_config():
    """获取当前配置（API Key 脱敏）"""
    return {
        "status": "success",
        "config": config_manager.get_config(),
        "providers": {k: v["label_zh"] for k, v in PROVIDER_META.items()},
        "config_path": str(get_config_path()),
    }


@app.put("/api/config")
async def update_config_route(request: dict):
    """更新配置"""
    try:
        success = config_manager.update_config(request)
        if success:
            translation_service.reload_config()
            return {
                "status": "success",
                "message": "配置已保存",
                "config": config_manager.get_config(),
            }
        else:
            return {"status": "error", "message": "配置保存失败"}
    except Exception as e:
        logger.error(f"Config update error: {e}")
        return {"status": "error", "message": str(e)}


@app.post("/api/config/validate")
async def validate_api_key_route(request: dict):
    """校验指定服务商的 API Key"""
    try:
        provider = request.get("provider", "")
        api_key = request.get("api_key", "")

        if not provider:
            return {"status": "error", "message": "provider is required"}

        result = await config_manager.validate_api_key(provider, api_key)
        return {"status": "success", "result": result}
    except Exception as e:
        logger.error(f"Validation error: {e}")
        return {"status": "error", "message": str(e)}


@app.get("/api/config/providers")
async def get_providers():
    """获取支持的服务商列表"""
    return {"status": "success", "providers": PROVIDER_META}


# ── 平台采集切换路由 ────────────────────────────────────────
@app.get("/")
async def root():
    return {"message": "乐曼同传 Leman Translate API Working"}


@app.get("/health")
async def health_check():
    try:
        device_info = getattr(whisper_service, 'model', 'not_loaded')
        return {
            "status": "healthy",
            "port": _actual_server_port,
            "device": str(device_info),
            "collector_manager_available": collector_manager is not None,
            "platform_state": (
                collector_manager.get_platform_status() if collector_manager else None
            ),
        }
    except Exception as e:
        return {
            "status": "healthy",
            "port": _actual_server_port,
            "device": "error",
            "error": str(e),
            "collector_manager_available": False,
            "platform_state": None,
        }


@app.post("/api/platform/switch")
async def switch_platform_route(request: dict):
    """切换采集平台 (tiktok | douyin)"""
    try:
        platform = request.get("platform", "").lower()
        identifier = request.get("identifier", "")
        auto_translate = request.get("auto_translate", True)

        if not platform or not identifier:
            return {"error": "platform and identifier are required"}

        if not collector_manager:
            return {"error": "Collector manager not available"}

        result = await collector_manager.switch_platform(
            platform, identifier, auto_translate=auto_translate
        )

        if result["success"]:
            return {
                "message": result["message"],
                "platform": result["platform"],
                "identifier": result["identifier"],
                "active_platform": collector_manager.get_active_platform(),
                "previous_platform": result.get("previous_platform"),
            }
        else:
            return {"error": result["error"]}

    except Exception as e:
        logger.error(f"Error switching platform: {str(e)}")
        return {"error": f"Platform switch failed: {str(e)}"}


@app.post("/api/platform/stop")
async def stop_platform_route():
    """停止当前采集"""
    try:
        if not collector_manager:
            return {"error": "Collector manager not available"}

        success = await collector_manager.stop_current_platform()

        if success:
            return {
                "message": "Platform stopped successfully",
                "active_platform": collector_manager.get_active_platform(),
            }
        else:
            return {"error": "Failed to stop platform"}

    except Exception as e:
        logger.error(f"Error stopping platform: {str(e)}")
        return {"error": f"Platform stop failed: {str(e)}"}


@app.get("/api/platform/status")
async def get_platform_status_route():
    """获取采集状态"""
    try:
        if not collector_manager:
            return {"error": "Collector manager not available"}

        status = collector_manager.get_platform_status()
        return {"status": "success", **status}

    except Exception as e:
        logger.error(f"Error getting platform status: {str(e)}")
        return {"error": f"Failed to get status: {str(e)}"}


@app.get("/api/platform/available")
async def get_available_platforms_route():
    """获取可用平台列表"""
    try:
        if not collector_manager:
            return {"error": "Collector manager not available"}

        platforms = collector_manager.get_available_platforms()
        return {
            "status": "success",
            "platforms": platforms,
            "count": len(platforms),
        }

    except Exception as e:
        logger.error(f"Error getting available platforms: {str(e)}")
        return {"error": f"Failed to get platforms: {str(e)}"}


# ── WebSocket 弹幕流路由 ──────────────────────────────────────
@app.websocket("/ws/stream")
async def websocket_stream(websocket: WebSocket):
    """
    Unified WebSocket endpoint for all platform streams
    """
    await websocket.accept()
    logger.info("Unified WebSocket connection established")

    websocket_clients.add(websocket)

    if collector_manager:
        collector_manager.add_websocket_client(websocket)

    try:
        # 发送建立连接的初始状态
        if collector_manager:
            status = collector_manager.get_platform_status()
            await websocket.send_text(
                json.dumps(
                    {
                        "type": "connection_established",
                        "platform_status": status,
                        "timestamp": asyncio.get_running_loop().time(),
                    },
                    ensure_ascii=False,
                )
            )

        while True:
            data = await websocket.receive_text()
            message = json.loads(data)

            if message.get("type") == "ping":
                await websocket.send_text(
                    json.dumps(
                        {
                            "type": "pong",
                            "timestamp": asyncio.get_running_loop().time(),
                        },
                        ensure_ascii=False,
                    )
                )

            elif message.get("type") == "get_status":
                if collector_manager:
                    status = collector_manager.get_platform_status()
                    await websocket.send_text(
                        json.dumps(
                            {
                                "type": "status_update",
                                "status": status,
                                "timestamp": asyncio.get_running_loop().time(),
                            },
                            ensure_ascii=False,
                        )
                    )

            elif message.get("type") == "switch_platform":
                platform = message.get("platform")
                identifier = message.get("identifier")

                if platform and identifier:
                    result = await collector_manager.switch_platform(
                        platform,
                        identifier,
                        auto_translate=message.get("auto_translate", True),
                    )

                    await websocket.send_text(
                        json.dumps(
                            {
                                "type": "platform_switch_result",
                                "result": result,
                                "timestamp": asyncio.get_running_loop().time(),
                            },
                            ensure_ascii=False,
                        )
                    )

            elif message.get("type") == "stop_platform":
                success = await collector_manager.stop_current_platform()
                await websocket.send_text(
                    json.dumps(
                        {
                            "type": "platform_stop_result",
                            "success": success,
                            "timestamp": asyncio.get_running_loop().time(),
                        },
                        ensure_ascii=False,
                    )
                )

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"Unified WebSocket error: {str(e)}")
    finally:
        websocket_clients.discard(websocket)
        if collector_manager:
            collector_manager.remove_websocket_client(websocket)
        logger.info(
            f"WebSocket client removed. Remaining: {len(websocket_clients)}"
        )


# ── WebSocket 音频同传 & FFT 频谱流路由 ─────────────────────────
@app.websocket("/ws/audio")
async def websocket_audio_stream(websocket: WebSocket):
    """Audio streaming WebSocket for real-time speech recognition + FFT spectrum"""
    await websocket.accept()
    logger.info("Audio WebSocket connection established")

    audio_buffer = bytearray()
    buffer_timer = None
    BUFFER_SIZE_THRESHOLD = 3200  # 100ms @ 16kHz PCM16
    MAX_BUFFER_DELAY = 0.5

    SPECTRUM_BANDS = 20
    SPECTRUM_MIN_DB = -60.0
    SPECTRUM_MAX_DB = 0.0

    def compute_spectrum(audio_array: np.ndarray) -> list:
        """计算 FFT 频段数据，返回 0~100 归一化值数组"""
        if len(audio_array) < 32:
            return [0.0] * SPECTRUM_BANDS
        windowed = audio_array * np.hanning(len(audio_array))
        fft_result = np.fft.rfft(windowed)
        magnitudes = np.abs(fft_result)
        magnitudes = np.maximum(magnitudes, 1e-10)
        db = 20.0 * np.log10(magnitudes)

        total_bins = len(db)
        bands = []
        for i in range(SPECTRUM_BANDS):
            start = int(total_bins * (i / SPECTRUM_BANDS) ** 1.5)
            end = int(total_bins * ((i + 1) / SPECTRUM_BANDS) ** 1.5)
            if end <= start:
                end = start + 1
            if end > total_bins:
                end = total_bins
            band_db = (
                np.mean(db[start:end]) if end > start else SPECTRUM_MIN_DB
            )
            normalized = (
                (band_db - SPECTRUM_MIN_DB)
                / (SPECTRUM_MAX_DB - SPECTRUM_MIN_DB)
                * 100.0
            )
            bands.append(max(0.0, min(100.0, normalized)))
        return [round(b, 1) for b in bands]

    async def process_buffer():
        nonlocal buffer_timer
        buffer_timer = None
        if len(audio_buffer) == 0:
            return

        try:
            # 零拷贝优化：直接从 buffer 转换成 np 数组
            audio_array = (
                np.frombuffer(audio_buffer, dtype=np.int16).astype(np.float32)
                / 32768.0
            )

            # 1. FFT 频谱计算并推送
            spectrum_data = compute_spectrum(audio_array)
            await websocket.send_text(
                json.dumps(
                    {
                        "type": "audio_spectrum",
                        "data": spectrum_data,
                        "timestamp": asyncio.get_running_loop().time(),
                    },
                    ensure_ascii=False,
                )
            )

            # 2. ASR 语音识别与翻译
            asr_lang = language_manager.get_asr_language_param()
            transcription = await whisper_service.transcribe_audio(
                audio_array, language=asr_lang or None
            )

            if transcription and transcription.text.strip():
                logger.info(
                    f"Transcription ({transcription.language}): {transcription.text}"
                )

                pair = language_manager.get_current_pair()
                src_full = LANG_MAP.get(pair.src_lang, pair.src_lang)
                tgt_full = LANG_MAP.get(pair.tgt_lang, pair.tgt_lang)

                translation = (
                    await translation_service._translate_by_provider(
                        config_manager.get_current_provider(),
                        config_manager.get_api_key(),
                        transcription.text,
                        src_full,
                        tgt_full,
                    )
                )

                response = {
                    "type": "audio_transcription",
                    "transcription": {
                        "text": transcription.text,
                        "language": transcription.language,
                        "confidence": transcription.confidence,
                    },
                    "translation": (
                        {
                            "text": translation.text if translation else "",
                            "source_language": src_full,
                            "target_language": tgt_full,
                        }
                        if translation
                        else None
                    ),
                }

                await websocket.send_text(
                    json.dumps(response, ensure_ascii=False)
                )

                # 自动触发 TTS 旁白播报
                if _tts_enabled and translation and translation.text:
                    await _queue_tts_speak(translation.text, tgt_full)
        except Exception as e:
            logger.error(f"Error processing audio: {str(e)}")
            error_response = {"type": "error", "error": str(e)}
            await websocket.send_text(
                json.dumps(error_response, ensure_ascii=False)
            )

        audio_buffer.clear()

    try:
        while True:
            data = await websocket.receive_bytes()
            audio_buffer.extend(data)

            if buffer_first_data_time is None:
                buffer_first_data_time = _time.monotonic()

            should_process = len(audio_buffer) >= BUFFER_SIZE_THRESHOLD

            if not should_process and buffer_first_data_time:
                elapsed = _time.monotonic() - buffer_first_data_time
                if elapsed >= MAX_BUFFER_DELAY:
                    should_process = True

            if should_process:
                if buffer_timer:
                    buffer_timer.cancel()
                    buffer_timer = None
                buffer_first_data_time = None
                buffer_timer = asyncio.get_running_loop().create_task(
                    process_buffer()
                )

    except WebSocketDisconnect:
        logger.info("Audio WebSocket connection closed")
    except Exception as e:
        logger.error(f"Audio WebSocket error: {str(e)}")
    finally:
        if buffer_timer:
            buffer_timer.cancel()


# ── 音色管理与语言对路由 ─────────────────────────────────────────
@app.get("/api/voice/list")
async def get_voice_list():
    """获取所有可用音色"""
    try:
        all_voices = tts_service.get_all_voices()
        current_id = config_manager.get_voice_id()
        return {
            "status": "success",
            "voices": all_voices,
            "current_voice_id": current_id,
        }
    except Exception as e:
        logger.error(f"Error getting voice list: {e}")
        return {"status": "error", "message": str(e), "voices": {}}


@app.put("/api/voice/set")
async def set_voice(request: dict):
    """设置当前 TTS 音色"""
    try:
        voice_id = request.get("voice_id", "")
        if not voice_id:
            return {"status": "error", "message": "voice_id is required"}
        tts_service.set_voice(voice_id)
        config_manager.update_config({"voice_id": voice_id})
        await _broadcast_to_all_clients({
            "type": "voice_changed",
            "voice_id": voice_id,
            "timestamp": asyncio.get_running_loop().time(),
        })
        return {
            "status": "success",
            "message": "音色已切换",
            "voice_id": voice_id,
        }
    except Exception as e:
        logger.error(f"Error setting voice: {e}")
        return {"status": "error", "message": str(e)}


@app.get("/api/language/get")
async def get_language():
    """获取当前语言对配置"""
    try:
        pair = language_manager.get_current_pair()
        return {
            "status": "success",
            "src_lang": pair.src_lang,
            "tgt_lang": pair.tgt_lang,
            "src_label": pair.src_label,
            "tgt_label": pair.tgt_label,
            "available_languages": SUPPORTED_LANGUAGES,
        }
    except Exception as e:
        logger.error(f"Error getting language: {e}")
        return {"status": "error", "message": str(e)}


@app.put("/api/language/set")
async def set_language(request: dict):
    """设置语言对 (src_lang → tgt_lang)"""
    try:
        src_lang = request.get("src_lang", "zh")
        tgt_lang = request.get("tgt_lang", "vi")
        language_manager.set_language_pair(src_lang, tgt_lang)
        config_manager.update_config({
            "language_pair": {"src_lang": src_lang, "tgt_lang": tgt_lang}
        })
        await _broadcast_to_all_clients({
            "type": "language_changed",
            "src_lang": src_lang,
            "tgt_lang": tgt_lang,
            "timestamp": asyncio.get_running_loop().time(),
        })
        translation_service._reset_gemini()
        return {
            "status": "success",
            "message": f"语言已切换: {src_lang} → {tgt_lang}",
            "src_lang": src_lang,
            "tgt_lang": tgt_lang,
        }
    except Exception as e:
        logger.error(f"Error setting language: {e}")
        return {"status": "error", "message": str(e)}


@app.post("/api/language/switch")
async def switch_language():
    """一键交换源语言和目标语言"""
    try:
        language_manager.switch_language()
        pair = language_manager.get_current_pair()
        config_manager.update_config({
            "language_pair": {
                "src_lang": pair.src_lang,
                "tgt_lang": pair.tgt_lang,
            }
        })
        await _broadcast_to_all_clients({
            "type": "language_switched",
            "src_lang": pair.src_lang,
            "tgt_lang": pair.tgt_lang,
            "timestamp": asyncio.get_running_loop().time(),
        })
        translation_service._reset_gemini()
        return {
            "status": "success",
            "src_lang": pair.src_lang,
            "tgt_lang": pair.tgt_lang,
            "src_label": pair.src_label,
            "tgt_label": pair.tgt_label,
        }
    except Exception as e:
        logger.error(f"Error switching language: {e}")
        return {"status": "error", "message": str(e)}


@app.get("/api/audio/sample-rates")
async def get_sample_rates():
    """获取可用的音频采样率列表"""
    return {
        "status": "success",
        "sample_rates": [8000, 16000, 22050, 44100, 48000],
        "asr_recommended": 16000,
    }


# ── TTS 旁白播报路由 ──────────────────────────────────────────
@app.get("/api/tts/status")
async def get_tts_status():
    """获取 TTS 播报状态"""
    return {
        "status": "success",
        "enabled": _tts_enabled,
        "speaking": _tts_speaking,
        "queue_size": len(_tts_text_queue),
    }


@app.put("/api/tts/enable")
async def set_tts_enable(request: dict):
    """开关 TTS 自动播报"""
    global _tts_enabled
    enabled = request.get("enabled", True)
    _tts_enabled = enabled
    return {"status": "success", "enabled": _tts_enabled}


@app.post("/api/tts/speak")
async def speak_text(request: dict):
    """手动触发 TTS 播报"""
    text = request.get("text", "").strip()
    if not text:
        return {"status": "error", "message": "text is required"}
    lang = request.get("lang", "vi")
    await _queue_tts_speak(text, lang)
    return {"status": "success", "queued": True}


@app.post("/api/tts/clear-queue")
async def clear_tts_queue():
    """清空 TTS 播报队列"""
    global _tts_text_queue
    _tts_text_queue.clear()
    return {"status": "success"}


# ── 通话实时同传路由 ──────────────────────────────────────────
@app.get("/api/call/list-devices")
async def list_call_devices():
    """枚举可用于通话同传的音频设备（Loopback + 播放设备）"""
    return await call_translation_service.list_devices()


@app.get("/api/call/status")
async def get_call_status():
    """获取通话同传当前状态"""
    return {"status": "success", **call_translation_service.get_status()}


@app.post("/api/call/start")
async def start_call_translation(request: dict):
    """
    启动通话同传
    Body: {mode: "subtitle_only" | "tts_auto", loopback_device_index: int?, tts_device_index: int?}
    """
    mode = request.get("mode", "subtitle_only")
    loopback_idx = request.get("loopback_device_index")
    tts_idx = request.get("tts_device_index")
    return await call_translation_service.start(
        mode=mode,
        loopback_device_index=loopback_idx,
        tts_device_index=tts_idx,
    )


@app.post("/api/call/stop")
async def stop_call_translation():
    """停止通话同传"""
    return await call_translation_service.stop()


@app.post("/api/call/reset-stats")
async def reset_call_stats():
    """重置通话同传统计计数"""
    call_translation_service.reset_stats()
    return {"status": "success"}


# ── 日志面板路由 ──────────────────────────────────────────────
@app.websocket("/ws/logs")
async def websocket_logs(websocket: WebSocket):
    """实时日志推送 WebSocket"""
    await websocket.accept()
    global _log_ws_clients
    _log_ws_clients.add(websocket)
    logger.info(f"Log panel client connected. Total: {len(_log_ws_clients)}")
    try:
        # 推送历史日志（最近 200 条）
        for entry in list(_log_buffer)[-200:]:
            await websocket.send_text(json.dumps(entry, ensure_ascii=False))
        # 保持连接
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        logger.info("Log panel client disconnected")
    except Exception as e:
        logger.error(f"Log WS error: {e}")
    finally:
        _log_ws_clients.discard(websocket)


@app.get("/api/logs")
async def get_logs():
    """获取历史日志（最近 500 条）"""
    return {"status": "success", "logs": list(_log_buffer)[-500:]}


@app.post("/api/logs/clear")
async def clear_logs():
    """清空日志缓冲区"""
    _log_buffer.clear()
    return {"status": "success"}


# ── 本地大模型路由 ──────────────────────────────────────────
@app.get("/api/local-llm/status")
async def get_local_llm_status():
    """获取本地大模型状态"""
    mgr = get_local_llm_manager()
    return {"status": "success", **mgr.get_status()}


@app.get("/api/local-llm/models")
async def list_local_models():
    """列出本地模型"""
    mgr = get_local_llm_manager()
    models = await mgr.list_models()
    return {"status": "success", "models": [m.to_dict() for m in models]}


@app.post("/api/local-llm/pull")
async def pull_local_model(request: dict):
    """拉取/下载本地模型"""
    model_name = request.get("model_name", "").strip()
    if not model_name:
        return {"status": "error", "message": "model_name is required"}
    mgr = get_local_llm_manager()
    result = await mgr.pull_model(model_name)
    return {"status": result.get("status", "error"), **result}


@app.delete("/api/local-llm/models/{model_name}")
async def delete_local_model(model_name: str):
    """删除本地模型"""
    mgr = get_local_llm_manager()
    result = await mgr.delete_model(model_name)
    return {"status": result.get("status", "error"), **result}


@app.post("/api/local-llm/chat")
async def chat_with_local_llm(request: dict):
    """使用本地模型进行推理"""
    prompt = request.get("prompt", "").strip()
    system = request.get("system", "")
    if not prompt:
        return {"status": "error", "message": "prompt is required"}
    mgr = get_local_llm_manager()
    result = await mgr.chat(prompt, system)
    return {"status": result.get("status", "error"), **result}


@app.put("/api/local-llm/config")
async def set_local_llm_config(request: dict):
    """更新本地大模型配置"""
    mgr = get_local_llm_manager()
    success = config_manager.set_local_config(request)
    if success:
        return {"status": "success"}
    return {"status": "error", "message": "配置更新失败"}


# ── 广播辅助函数 ──────────────────────────────────────────────
async def _broadcast_to_all_clients(message: dict):
    """向所有 WebSocket 客户端广播控制消息 (如语言/音色切换)"""
    if not websocket_clients:
        return
    msg_str = json.dumps(message, ensure_ascii=False)
    disconnected = set()
    for ws in websocket_clients:
        try:
            await ws.send_text(msg_str)
        except Exception:
            disconnected.add(ws)
    for c in disconnected:
        websocket_clients.discard(c)


# ── 服务器端口 ────────────────────────────────────────────────
# 运行时检测到的实际端口（可能因冲突自动递增）
_actual_server_port: int = 15387


def _find_free_port(start_port: int, max_attempts: int = 10) -> int:
    """
    检测端口是否可用，不可用时自动递增查找空闲端口。
    返回最终可用的端口号。
    """
    import socket
    port = start_port
    for _ in range(max_attempts):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(('', port))
                s.close()
                return port
        except OSError:
            port += 1
    logger.warning(f"端口检测失败，回退到 {port}")
    return port


@app.get("/api/server/port")
async def get_server_port():
    """获取当前服务器实际使用的端口"""
    return {"status": "success", "port": _actual_server_port}


if __name__ == "__main__":
    import uvicorn
    from config_manager import get_config_manager as _get_cfg

    cfg = _get_cfg()
    start_port = cfg.get_server_port()
    _actual_server_port = _find_free_port(start_port)
    if _actual_server_port != start_port:
        logger.warning(f"端口 {start_port} 被占用，自动切换到 {_actual_server_port}")
        cfg.set_server_port(_actual_server_port)

    uvicorn.run(app, host="0.0.0.0", port=_actual_server_port)