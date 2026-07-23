"""
乐曼同传 Leman Translate - FastAPI 主入口文件
包含：配置管理、音频设备控制、弹幕采集与翻译路由、WebSocket 数据流 (FFT + ASR)
"""

import asyncio
from contextlib import asynccontextmanager
import json
import logging
import numpy as np
from typing import Dict, Any, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.services.whisper_service import WhisperService
from app.services.translation_service import TranslationService
from app.services.language_manager import language_manager, SUPPORTED_LANGUAGES
from app.services.tts_service import tts_service, DEFAULT_VOICES
from collectors.manager import create_collector_manager
from config_manager import get_config_manager, get_config_path, PROVIDER_META
from audio_device_manager import list_input_devices, get_device_info, validate_device

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize config manager (singleton)
config_manager = get_config_manager()

# Initialize services
whisper_service = WhisperService()
translation_service = TranslationService()

# Global collector manager & WebSocket clients
collector_manager = None
websocket_clients = set()


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
                    lang_map = {
                        "zh": "zh",
                        "vi": "vi",
                        "en": "en",
                        "ja": "ja",
                        "ko": "ko",
                        "th": "th",
                    }
                    src_full = lang_map.get(src_lang, src_lang)
                    tgt_full = lang_map.get(tgt_lang, tgt_lang)

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


# ── 应用生命周期管理 ──────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup & Shutdown Lifecycle"""
    logger.info("Starting up 乐曼同传 Leman Translate...")
    manager_available = initialize_collector_manager()
    logger.info("Startup completed")
    logger.info(f"Whisper device: {whisper_service.device}")
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
    """设置当前音频输入设备"""
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
                }
            else:
                return {
                    "status": "success",
                    "device_id": device_id,
                    "device": None,
                    "message": "设备可能已断开",
                }
        else:
            return {
                "status": "success",
                "device_id": None,
                "device": None,
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
    return {
        "status": "healthy",
        "device": str(whisper_service.device),
        "collector_manager_available": collector_manager is not None,
        "platform_state": (
            collector_manager.get_platform_status() if collector_manager else None
        ),
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
                        "timestamp": asyncio.get_event_loop().time(),
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
                            "timestamp": asyncio.get_event_loop().time(),
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
                                "timestamp": asyncio.get_event_loop().time(),
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
                                "timestamp": asyncio.get_event_loop().time(),
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
                            "timestamp": asyncio.get_event_loop().time(),
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
                        "timestamp": asyncio.get_event_loop().time(),
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
                lang_map = {
                    "zh": "zh",
                    "vi": "vi",
                    "en": "en",
                    "ja": "ja",
                    "ko": "ko",
                    "th": "th",
                }
                src_full = lang_map.get(pair.src_lang, pair.src_lang)
                tgt_full = lang_map.get(pair.tgt_lang, pair.tgt_lang)

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
        except Exception as e:
            logger.error(f"Error processing audio: {str(e)}")
            error_response = {"type": "error", "error": str(e)}
            await websocket.send_text(
                json.dumps(error_response, ensure_ascii=False)
            )

        audio_buffer.clear()

    import time as _time

    buffer_first_data_time = None

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
                buffer_timer = asyncio.get_event_loop().create_task(
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
            "timestamp": asyncio.get_event_loop().time(),
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
            "timestamp": asyncio.get_event_loop().time(),
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
            "timestamp": asyncio.get_event_loop().time(),
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


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)