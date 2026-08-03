"""
乐曼同传 Leman Translate - WebSocket 路由
处理弹幕流和音频流
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from typing import Set
import json
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ws", tags=["WebSocket"])

# 存储 WebSocket 连接
websocket_clients: Set[WebSocket] = set()
audio_websocket_clients: Set[WebSocket] = set()


@router.websocket("/stream")
async def websocket_stream(websocket: WebSocket):
    """弹幕流 WebSocket"""
    await websocket.accept()
    logger.info("WebSocket stream connection established")
    
    websocket_clients.add(websocket)
    
    try:
        # 发送初始状态
        await websocket.send_text(json.dumps({
            "type": "connection_established",
            "clients": len(websocket_clients),
            "timestamp": __import__('time').time(),
        }, ensure_ascii=False))
        
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            if message.get("type") == "ping":
                await websocket.send_text(json.dumps({
                    "type": "pong",
                    "timestamp": __import__('time').time(),
                }))
            
            # TODO: 处理其他消息类型
            await websocket.send_text(json.dumps({
                "type": "ack",
                "received": True,
            }))
    
    except WebSocketDisconnect:
        logger.info("WebSocket stream client disconnected")
    except Exception as e:
        logger.error(f"WebSocket stream error: {e}")
    finally:
        websocket_clients.discard(websocket)
        logger.info(f"Remaining clients: {len(websocket_clients)}")


@router.websocket("/audio")
async def websocket_audio(websocket: WebSocket):
    """音频流 WebSocket"""
    await websocket.accept()
    logger.info("WebSocket audio connection established")
    
    audio_websocket_clients.add(websocket)
    
    try:
        while True:
            # 等待音频数据（二进制）或控制消息（文本）
            message = await websocket.receive()
            
            if isinstance(message, dict) and message.get("type") == "bytes":
                # 处理音频数据
                audio_data = message.get("bytes")
                # TODO: 处理音频流
                logger.debug(f"Received {len(audio_data)} bytes of audio data")
            
            elif isinstance(message, dict) and message.get("type") == "text":
                # 处理控制消息
                text_data = message.get("text", "")
                try:
                    control = json.loads(text_data)
                    if control.get("type") == "ping":
                        await websocket.send_text(json.dumps({
                            "type": "pong",
                            "timestamp": __import__('time').time(),
                        }))
                except json.JSONDecodeError:
                    pass
    
    except WebSocketDisconnect:
        logger.info("WebSocket audio client disconnected")
    except Exception as e:
        logger.error(f"WebSocket audio error: {e}")
    finally:
        audio_websocket_clients.discard(websocket)
        logger.info(f"Remaining audio clients: {len(audio_websocket_clients)}")


@router.get("/clients")
async def get_websocket_clients():
    """获取当前 WebSocket 客户端数量"""
    return {
        "stream_clients": len(websocket_clients),
        "audio_clients": len(audio_websocket_clients),
        "total": len(websocket_clients) + len(audio_websocket_clients),
    }


# 导出用于导入
stream_clients = websocket_clients
audio_clients = audio_websocket_clients
