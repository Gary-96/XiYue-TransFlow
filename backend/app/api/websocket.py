"""
喜阅 TransFlow — WebSocket 路由（真实业务数据流）
处理弹幕流 (/ws/stream) 和音频流 (/ws/audio)
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import asyncio
import json
import logging
from typing import Set

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ws", tags=["WebSocket"])

# 存储 WebSocket 连接
websocket_clients: Set[WebSocket] = set()
audio_websocket_clients: Set[WebSocket] = set()

# 当前激活的 collector（由 API 路由设置）
_active_collector = None


async def set_active_collector(collector):
    """设置当前激活的采集器"""
    global _active_collector
    _active_collector = collector


async def broadcast_from_collector(message: dict):
    """从采集器广播消息到所有 WebSocket 客户端"""
    if not websocket_clients:
        return
    tasks = [client.send_json(message) for client in websocket_clients]
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)


@router.websocket("/stream")
async def websocket_stream(websocket: WebSocket):
    """弹幕流 WebSocket — 接收弹幕采集器推送，广播给前端"""
    await websocket.accept()
    logger.info("WebSocket stream connection established")

    websocket_clients.add(websocket)

    try:
        # 发送初始状态
        await websocket.send_json({
            "type": "connection_established",
            "clients": len(websocket_clients),
            "timestamp": asyncio.get_event_loop().time(),
        })

        while True:
            data = await websocket.receive_text()
            message = json.loads(data)

            if message.get("type") == "ping":
                await websocket.send_json({
                    "type": "pong",
                    "timestamp": asyncio.get_event_loop().time(),
                })
            elif message.get("type") == "subscribe":
                # 前端订阅特定房间号
                platform = message.get("platform", "douyin")
                room_id = message.get("room_id", "")
                logger.info(f"Client subscribed to {platform} room: {room_id}")
                
                # 将当前 WebSocket 注册到激活的 collector
                global _active_collector
                if _active_collector and hasattr(_active_collector, 'add_websocket_client'):
                    _active_collector.add_websocket_client(websocket)
                    logger.info(f"WebSocket registered with collector: {platform}")
                
                await websocket.send_json({
                    "type": "subscribed",
                    "platform": platform,
                    "room_id": room_id,
                })
            else:
                # 未知消息类型，返回提示
                await websocket.send_json({
                    "type": "ack",
                    "received": True,
                    "message": f"Message type '{message.get('type')}' handled",
                })

    except WebSocketDisconnect:
        logger.info("WebSocket stream client disconnected")
    except Exception as e:
        logger.error(f"WebSocket stream error: {e}", exc_info=True)
    finally:
        websocket_clients.discard(websocket)
        logger.info(f"Remaining stream clients: {len(websocket_clients)}")


@router.websocket("/audio")
async def websocket_audio(websocket: WebSocket):
    """音频流 WebSocket — 接收前端 PCM 音频，推送 ASR/翻译结果"""
    await websocket.accept()
    logger.info("WebSocket audio connection established")

    audio_websocket_clients.add(websocket)

    try:
        while True:
            # 等待音频数据（二进制）或控制消息（文本）
            message = await websocket.receive()

            if isinstance(message, dict) and message.get("type") == "bytes":
                audio_data = message.get("bytes")
                if audio_data and len(audio_data) > 0:
                    # 转发音频数据到 CallTranslationService
                    await broadcast_audio_frame(audio_data)
                continue

            elif isinstance(message, dict) and message.get("type") == "text":
                text_data = message.get("text", "")
                try:
                    control = json.loads(text_data)
                    if control.get("type") == "ping":
                        await websocket.send_json({
                            "type": "pong",
                            "timestamp": asyncio.get_event_loop().time(),
                        })
                    elif control.get("type") == "start":
                        # 前端请求开始同传
                        await broadcast_system_message("recording_started")
                    elif control.get("type") == "stop":
                        # 前端请求停止同传
                        await broadcast_system_message("recording_stopped")
                except json.JSONDecodeError:
                    pass

    except WebSocketDisconnect:
        logger.info("WebSocket audio client disconnected")
    except Exception as e:
        logger.error(f"WebSocket audio error: {e}", exc_info=True)
    finally:
        audio_websocket_clients.discard(websocket)
        logger.info(f"Remaining audio clients: {len(audio_websocket_clients)}")


async def broadcast_audio_frame(audio_data: bytes):
    """将音频帧广播给所有音频客户端（用于调试或转发）"""
    if not audio_websocket_clients:
        return
    msg = json.dumps({
        "type": "audio_frame_received",
        "bytes": len(audio_data),
        "timestamp": asyncio.get_event_loop().time(),
    })
    tasks = [client.send_text(msg) for client in audio_websocket_clients]
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)


async def broadcast_system_message(event_type: str, **kwargs):
    """广播系统事件给所有 WebSocket 客户端"""
    message = {
        "type": event_type,
        "timestamp": asyncio.get_event_loop().time(),
        **kwargs,
    }
    tasks = []
    for ws in websocket_clients | audio_websocket_clients:
        tasks.append(ws.send_json(message))
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)


@router.websocket("/broadcast")
async def websocket_broadcast(websocket: WebSocket):
    """广播 WebSocket — 供后端服务主动推送数据给前端"""
    await websocket.accept()
    logger.info("Broadcast WebSocket connected")

    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)

            # 广播给所有 Stream 和 Audio 客户端
            broadcast_msg = {
                "source": "broadcast",
                **message,
            }
            tasks = []
            for client in websocket_clients:
                tasks.append(client.send_json(broadcast_msg))
            for client in audio_websocket_clients:
                tasks.append(client.send_json(broadcast_msg))

            if tasks:
                await asyncio.gather(*tasks, return_exceptions=True)

    except WebSocketDisconnect:
        logger.info("Broadcast WebSocket disconnected")
    except Exception as e:
        logger.error(f"Broadcast WebSocket error: {e}", exc_info=True)


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
