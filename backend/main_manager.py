from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import json
import numpy as np
import logging
from app.services.whisper_service import WhisperService
from app.services.translation_service import TranslationService
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
    Callback for collector messages - forwards to WebSocket clients
    
    Args:
        message: Unified message format {user, text, platform}
    """
    try:
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
    """Audio streaming WebSocket for real-time speech recognition"""
    await websocket.accept()
    logger.info("Audio WebSocket connection established")
    
    audio_buffer = bytearray()
    buffer_timer = None
    
    async def process_buffer():
        """Process accumulated audio buffer"""
        nonlocal buffer_timer
        if len(audio_buffer) > 0:
            try:
                audio_array = np.frombuffer(audio_buffer, dtype=np.int16).astype(np.float32) / 32768.0
                
                transcription = await whisper_service.transcribe_audio(audio_array)
                
                if transcription and transcription.text.strip():
                    logger.info(f"Transcription: {transcription.text}")
                    
                    translation = await translation_service.translate_to_vietnamese(transcription.text)
                    
                    response = {
                        "type": "audio_transcription",
                        "transcription": {
                            "text": transcription.text,
                            "language": transcription.language,
                            "confidence": transcription.confidence
                        },
                        "translation": {
                            "text": translation.text,
                            "source_language": translation.source_language,
                            "target_language": translation.target_language
                        }
                    }
                    
                    await websocket.send_text(json.dumps(response, ensure_ascii=False))
            except Exception as e:
                logger.error(f"Error processing audio: {str(e)}")
                error_response = {"type": "error", "error": str(e)}
                await websocket.send_text(json.dumps(error_response, ensure_ascii=False))
        
        audio_buffer.clear()
        buffer_timer = None
    
    try:
        while True:
            # Receive audio data (raw PCM frames)
            data = await websocket.receive_bytes()
            audio_buffer.extend(data)
            
            # Process buffer every 1000 bytes (~62ms of audio)
            if len(audio_buffer) >= 1000:
                if buffer_timer:
                    buffer_timer.cancel()
                buffer_timer = asyncio.get_event_loop().call_later(0.1, asyncio.create_task, process_buffer())
            
    except WebSocketDisconnect:
        logger.info("Audio WebSocket connection closed")
    except Exception as e:
        logger.error(f"Audio WebSocket error: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
