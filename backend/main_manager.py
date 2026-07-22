from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import json
import numpy as np
import logging
from app.services.whisper_service import WhisperService
from app.services.translation_service import TranslationService
from app.services.language_manager import language_manager, SUPPORTED_LANGUAGES
from collectors.manager import create_collector_manager
from config_manager import get_config_manager, get_config_path, PROVIDER_META
from audio_device_manager import list_input_devices, get_device_info, validate_device

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="乐曼同传 Leman Translate API", version="3.0.0")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize config manager (singleton)
config_manager = get_config_manager()

# Initialize services
whisper_service = WhisperService()
translation_service = TranslationService()

# Global collector manager
collector_manager = None
websocket_clients = set()

async def message_callback(message: dict):
    """
    Callback for collector messages - translates comments then forwards to WebSocket clients
    """
    try:
        # 对弹幕评论进行翻译
        if message.get("type") == "comment" and message.get("text"):
            try:
                pair = language_manager.get_current_pair()
                src_lang = pair.src_lang
                tgt_lang = pair.tgt_lang
                
                # 如果源语言 != 目标语言，进行翻译
                if src_lang != tgt_lang and src_lang != "auto":
                    # 语言代码映射到完整名称
                    lang_map = {"zh": "zh", "vi": "vi", "en": "en", "ja": "ja", "ko": "ko", "th": "th"}
                    src_full = lang_map.get(src_lang, src_lang)
                    tgt_full = lang_map.get(tgt_lang, tgt_lang)
                    
                    translation = await translation_service._translate_by_provider(
                        config_manager.get_current_provider(),
                        config_manager.get_api_key(),
                        message["text"],
                        src_full,
                        tgt_full,
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
        
        # Broadcast to all WebSocket clients
        if websocket_clients:
            message_str = json.dumps(message, ensure_ascii=False)
            disconnected_clients = set()
            
            for websocket in websocket_clients:
                try:
                    await websocket.send_text(message_str)
                except Exception as e:
                    logger.error(f"Failed to send to WebSocket client: {str(e)}")
                    disconnected_clients.add(websocket)
            
            # Remove disconnected clients
            for client in disconnected_clients:
                websocket_clients.discard(client)
                
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

@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    logger.info("Starting up 乐曼同传 Leman Translate...")
    
    # Initialize collector manager
    manager_available = initialize_collector_manager()
    
    logger.info("Startup completed")
    logger.info(f"Whisper device: {whisper_service.device}")
    logger.info(f"Collector manager available: {manager_available}")

# ── 配置管理路由 ────────────────────────────────────────────

# ── 音频设备路由 ────────────────────────────────────────────

@app.get("/api/audio/devices")
async def get_audio_devices():
    """
    枚举系统中所有音频输入设备
    返回声卡/麦克风列表，支持专业设备识别
    """
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
    """
    设置当前音频输入设备
    
    Request body:
    {
        "device_id": 0 | null  // null = 恢复系统默认
    }
    """
    try:
        device_id = request.get("device_id")
        
        # 校验设备存在性
        if device_id is not None:
            info = get_device_info(int(device_id))
            if not info:
                return {"status": "error", "message": f"设备 {device_id} 不存在"}
            if info["channels"] <= 0:
                return {"status": "error", "message": f"设备 {info['name']} 不是输入设备"}
            
            # 保存到配置
            success = config_manager.update_config({"audio_device_id": int(device_id)})
        else:
            # None = 恢复系统默认
            success = config_manager.update_config({"audio_device_id": None})
        
        if success:
            return {
                "status": "success",
                "message": "音频设备已切换" if device_id is not None else "已恢复系统默认设备",
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
                return {"status": "success", "device_id": device_id, "device": info}
            else:
                return {"status": "success", "device_id": device_id, "device": None, "message": "设备可能已断开"}
        else:
            return {"status": "success", "device_id": None, "device": None, "message": "使用系统默认设备"}
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
        "config_path": str(get_config_path())
    }

@app.put("/api/config")
async def update_config(request: dict):
    """更新配置"""
    try:
        success = config_manager.update_config(request)
        if success:
            # 通知翻译服务重新加载
            translation_service.reload_config()
            return {"status": "success", "message": "配置已保存", "config": config_manager.get_config()}
        else:
            return {"status": "error", "message": "配置保存失败"}
    except Exception as e:
        logger.error(f"Config update error: {e}")
        return {"status": "error", "message": str(e)}

@app.post("/api/config/validate")
async def validate_api_key(request: dict):
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
    return {
        "status": "success",
        "providers": PROVIDER_META
    }

# ── 基础路由 ────────────────────────────────────────────────

@app.get("/")
async def root():
    return {"message": "乐曼同传 Leman Translate API"}

@app.get("/health")
async def health_check():
    return {
        "status": "healthy", 
        "device": str(whisper_service.device),
        "collector_manager_available": collector_manager is not None,
        "platform_state": collector_manager.get_platform_status() if collector_manager else None
    }

@app.post("/api/platform/switch")
async def switch_platform(request: dict):
    """
    Switch to a different platform based on platform parameter
    
    Request body:
    {
        "platform": "tiktok" | "douyin",
        "identifier": "@username" | "room_id",
        "auto_translate": true
    }
    """
    try:
        platform = request.get("platform", "").lower()
        identifier = request.get("identifier", "")
        auto_translate = request.get("auto_translate", True)
        
        if not platform or not identifier:
            return {"error": "platform and identifier are required"}
        
        if not collector_manager:
            return {"error": "Collector manager not available"}
        
        # Switch platform
        result = await collector_manager.switch_platform(platform, identifier, auto_translate=auto_translate)
        
        if result["success"]:
            return {
                "message": result["message"],
                "platform": result["platform"],
                "identifier": result["identifier"],
                "active_platform": collector_manager.get_active_platform(),
                "previous_platform": result.get("previous_platform")
            }
        else:
            return {"error": result["error"]}
            
    except Exception as e:
        logger.error(f"Error switching platform: {str(e)}")
        return {"error": f"Platform switch failed: {str(e)}"}

@app.post("/api/platform/stop")
async def stop_platform():
    """
    Stop the currently active platform
    """
    try:
        if not collector_manager:
            return {"error": "Collector manager not available"}
        
        success = await collector_manager.stop_current_platform()
        
        if success:
            return {
                "message": "Platform stopped successfully",
                "active_platform": collector_manager.get_active_platform()
            }
        else:
            return {"error": "Failed to stop platform"}
            
    except Exception as e:
        logger.error(f"Error stopping platform: {str(e)}")
        return {"error": f"Platform stop failed: {str(e)}"}

@app.get("/api/platform/status")
async def get_platform_status():
    """Get all platform connection status"""
    try:
        if not collector_manager:
            return {"error": "Collector manager not available"}
        
        status = collector_manager.get_platform_status()
        
        return {
            "status": "success",
            **status
        }
        
    except Exception as e:
        logger.error(f"Error getting platform status: {str(e)}")
        return {"error": f"Failed to get status: {str(e)}"}

@app.get("/api/platform/available")
async def get_available_platforms():
    """Get list of available platforms"""
    try:
        if not collector_manager:
            return {"error": "Collector manager not available"}
        
        platforms = collector_manager.get_available_platforms()
        
        return {
            "status": "success",
            "platforms": platforms,
            "count": len(platforms)
        }
        
    except Exception as e:
        logger.error(f"Error getting available platforms: {str(e)}")
        return {"error": f"Failed to get platforms: {str(e)}"}

@app.websocket("/ws/stream")
async def websocket_stream(websocket: WebSocket):
    """
    Unified WebSocket endpoint for all platform streams
    Handles messages in unified format {user, text, platform}
    """
    await websocket.accept()
    logger.info("Unified WebSocket connection established")
    
    # Add client to global set
    websocket_clients.add(websocket)
    logger.info(f"WebSocket client added. Total clients: {len(websocket_clients)}")
    
    try:
        # Send initial status
        if collector_manager:
            status = collector_manager.get_platform_status()
            await websocket.send_text(json.dumps({
                "type": "connection_established",
                "platform_status": status,
                "timestamp": asyncio.get_event_loop().time()
            }, ensure_ascii=False))
        
        # Add client to manager
        if collector_manager:
            collector_manager.add_websocket_client(websocket)
        
        # Keep connection alive
        while True:
            try:
                # Wait for client messages (keep-alive pings, commands)
                data = await websocket.receive_text()
                message = json.loads(data)
                
                if message.get("type") == "ping":
                    await websocket.send_text(json.dumps({
                        "type": "pong",
                        "timestamp": asyncio.get_event_loop().time()
                    }, ensure_ascii=False))
                
                elif message.get("type") == "get_status":
                    # Send current status
                    if collector_manager:
                        status = collector_manager.get_platform_status()
                        await websocket.send_text(json.dumps({
                            "type": "status_update",
                            "status": status,
                            "timestamp": asyncio.get_event_loop().time()
                        }, ensure_ascii=False))
                
                elif message.get("type") == "switch_platform":
                    # Switch platform via WebSocket
                    platform = message.get("platform")
                    identifier = message.get("identifier")
                    
                    if platform and identifier:
                        result = await collector_manager.switch_platform(
                            platform, 
                            identifier, 
                            auto_translate=message.get("auto_translate", True)
                        )
                        
                        await websocket.send_text(json.dumps({
                            "type": "platform_switch_result",
                            "result": result,
                            "timestamp": asyncio.get_event_loop().time()
                        }, ensure_ascii=False))
                
                elif message.get("type") == "stop_platform":
                    # Stop current platform via WebSocket
                    success = await collector_manager.stop_current_platform()
                    
                    await websocket.send_text(json.dumps({
                        "type": "platform_stop_result",
                        "success": success,
                        "timestamp": asyncio.get_event_loop().time()
                    }, ensure_ascii=False))
                
            except WebSocketDisconnect:
                break
            except Exception as e:
                logger.error(f"Unified WebSocket error: {str(e)}")
                break
                
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"Unified WebSocket setup error: {str(e)}")
    finally:
        # Remove client from all places
        websocket_clients.discard(websocket)
        
        if collector_manager:
            collector_manager.remove_websocket_client(websocket)
        
        logger.info(f"WebSocket client removed. Total clients: {len(websocket_clients)}")

@app.websocket("/ws/audio")
async def websocket_audio_stream(websocket: WebSocket):
    """Audio streaming WebSocket for real-time speech recognition + FFT spectrum"""
    await websocket.accept()
    logger.info("Audio WebSocket connection established")
    
    audio_buffer = bytearray()
    buffer_timer = None
    # 固定缓冲区大小：3200 字节 = 1600 samples = 100ms @ 16kHz PCM16
    BUFFER_SIZE_THRESHOLD = 3200
    # 最大延迟 500ms，防止数据持续快速到达时缓冲区永不处理
    MAX_BUFFER_DELAY = 0.5
    # FFT 频谱参数
    SPECTRUM_BANDS = 20  # 频段数量
    SPECTRUM_MIN_DB = -60.0  # 最小分贝（归一化为0）
    SPECTRUM_MAX_DB = 0.0    # 最大分贝（归一化为100）
    
    def compute_spectrum(audio_array: np.ndarray) -> list:
        """计算 FFT 频段数据，返回 0~100 归一化值数组"""
        if len(audio_array) < 32:
            return [0.0] * SPECTRUM_BANDS
        # 应用汉宁窗减少频谱泄漏
        windowed = audio_array * np.hanning(len(audio_array))
        # FFT 计算
        fft_result = np.fft.rfft(windowed)
        magnitudes = np.abs(fft_result)
        # 转分贝
        magnitudes = np.maximum(magnitudes, 1e-10)
        db = 20.0 * np.log10(magnitudes)
        # 按对数频率分布分到 SPECTRUM_BANDS 个频段
        total_bins = len(db)
        bands = []
        for i in range(SPECTRUM_BANDS):
            # 对数频率分布：低频更密集
            start = int(total_bins * (i / SPECTRUM_BANDS) ** 1.5)
            end = int(total_bins * ((i + 1) / SPECTRUM_BANDS) ** 1.5)
            if end <= start:
                end = start + 1
            if end > total_bins:
                end = total_bins
            band_db = np.mean(db[start:end]) if end > start else SPECTRUM_MIN_DB
            # 归一化到 0~100
            normalized = (band_db - SPECTRUM_MIN_DB) / (SPECTRUM_MAX_DB - SPECTRUM_MIN_DB) * 100.0
            bands.append(max(0.0, min(100.0, normalized)))
        return [round(b, 1) for b in bands]
    
    async def process_buffer():
        """Process accumulated audio buffer"""
        nonlocal buffer_timer
        buffer_timer = None
        if len(audio_buffer) == 0:
            return
        
        try:
            audio_array = np.frombuffer(bytes(audio_buffer), dtype=np.int16).astype(np.float32) / 32768.0
            
            # ── FFT 频谱计算并推送 ──
            spectrum_data = compute_spectrum(audio_array)
            await websocket.send_text(json.dumps({
                "type": "audio_spectrum",
                "data": spectrum_data,
                "timestamp": asyncio.get_event_loop().time()
            }, ensure_ascii=False))
            
            # 从 LanguageManager 动态获取 ASR 语言参数
            asr_lang = language_manager.get_asr_language_param()
            
            transcription = await whisper_service.transcribe_audio(audio_array, language=asr_lang or None)
            
            if transcription and transcription.text.strip():
                logger.info(f"Transcription ({transcription.language}): {transcription.text}")
                
                # 使用当前语言对进行翻译
                pair = language_manager.get_current_pair()
                lang_map = {"zh": "zh", "vi": "vi", "en": "en", "ja": "ja", "ko": "ko", "th": "th"}
                src_full = lang_map.get(pair.src_lang, pair.src_lang)
                tgt_full = lang_map.get(pair.tgt_lang, pair.tgt_lang)
                
                translation = await translation_service._translate_by_provider(
                    config_manager.get_current_provider(),
                    config_manager.get_api_key(),
                    transcription.text,
                    src_full,
                    tgt_full,
                )
                
                response = {
                    "type": "audio_transcription",
                    "transcription": {
                        "text": transcription.text,
                        "language": transcription.language,
                        "confidence": transcription.confidence
                    },
                    "translation": {
                        "text": translation.text if translation else "",
                        "source_language": src_full,
                        "target_language": tgt_full
                    } if translation else None
                }
                
                await websocket.send_text(json.dumps(response, ensure_ascii=False))
        except Exception as e:
            logger.error(f"Error processing audio: {str(e)}")
            error_response = {"type": "error", "error": str(e)}
            await websocket.send_text(json.dumps(error_response, ensure_ascii=False))
        
        audio_buffer.clear()
    
    import time as _time
    buffer_first_data_time = None
    
    try:
        while True:
            # Receive audio data (raw PCM frames)
            data = await websocket.receive_bytes()
            audio_buffer.extend(data)
            
            if buffer_first_data_time is None:
                buffer_first_data_time = _time.monotonic()
            
            # 触发条件 1：缓冲区达到固定大小阈值
            should_process = len(audio_buffer) >= BUFFER_SIZE_THRESHOLD
            
            # 触发条件 2：超过最大延迟时间（即使未达阈值也强制处理）
            if not should_process and buffer_first_data_time:
                elapsed = _time.monotonic() - buffer_first_data_time
                if elapsed >= MAX_BUFFER_DELAY:
                    should_process = True
            
            if should_process:
                if buffer_timer:
                    buffer_timer.cancel()
                    buffer_timer = None
                buffer_first_data_time = None
                buffer_timer = asyncio.get_event_loop().create_task(process_buffer())
            
    except WebSocketDisconnect:
        logger.info("Audio WebSocket connection closed")
    except Exception as e:
        logger.error(f"Audio WebSocket error: {str(e)}")
    finally:
        if buffer_timer:
            buffer_timer.cancel()

# ── 音色管理路由 ────────────────────────────────────────────────
from app.services.tts_service import tts_service, DEFAULT_VOICES


@app.get("/api/voice/list")
async def get_voice_list():
    """获取所有可用音色（默认 + 自定义 + Edge Neural）"""
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
        success = config_manager.update_config({"voice_id": voice_id})
        # 通知前端
        await _broadcast_to_all_clients({
            "type": "voice_changed",
            "voice_id": voice_id,
            "timestamp": asyncio.get_event_loop().time()
        })
        return {
            "status": "success",
            "message": "音色已切换",
            "voice_id": voice_id,
        }
    except Exception as e:
        logger.error(f"Error setting voice: {e}")
        return {"status": "error", "message": str(e)}


# ── 语言管理路由 ────────────────────────────────────────────────


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
        # 持久化到 config
        config_manager.update_config({
            "language_pair": {"src_lang": src_lang, "tgt_lang": tgt_lang}
        })
        # 广播给所有客户端
        await _broadcast_to_all_clients({
            "type": "language_changed",
            "src_lang": src_lang,
            "tgt_lang": tgt_lang,
            "timestamp": asyncio.get_event_loop().time()
        })
        # 同步翻译服务 prompt
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
    """一键交换源语言和目标语言（zh↔vi）"""
    try:
        language_manager.switch_language()
        pair = language_manager.get_current_pair()
        config_manager.update_config({
            "language_pair": {"src_lang": pair.src_lang, "tgt_lang": pair.tgt_lang}
        })
        await _broadcast_to_all_clients({
            "type": "language_switched",
            "src_lang": pair.src_lang,
            "tgt_lang": pair.tgt_lang,
            "timestamp": asyncio.get_event_loop().time()
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


# ── 音频采样率路由（供前端确认设备能力） ──────────────────────

@app.get("/api/audio/sample-rates")
async def get_sample_rates():
    """获取可用的音频采样率列表"""
    return {
        "status": "success",
        "sample_rates": [8000, 16000, 22050, 44100, 48000],
        "asr_recommended": 16000,
    }


# ── 内部辅助函数 ──────────────────────────────────────────────

async def _broadcast_to_all_clients(message: dict):
    """向所有 WebSocket 客户端广播消息"""
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
