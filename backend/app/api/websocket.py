"""
喜阅 TransFlow — WebSocket 路由（重构后）
处理弹幕流 (/ws/stream)，通过 BroadcastStage 接收事件
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Set

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.infrastructure.websocket.manager import WebSocketManager, get_websocket_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ws", tags=["WebSocket"])


@router.websocket("/stream")
async def websocket_stream(websocket: WebSocket):
    """
    弹幕流 WebSocket — 前端连接后订阅，接收弹幕事件
    """
    await websocket.accept()
    ws_manager = get_websocket_manager()
    await ws_manager.add_client(websocket)
    
    logger.info("WebSocket stream connection established")
    
    try:
        # 发送初始状态
        await websocket.send_json({
            "type": "connection_established",
            "clients": ws_manager.client_count,
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
                platform = message.get("platform", "douyin")
                room_id = message.get("room_id", "")
                await ws_manager.subscribe(websocket, room_id or platform)
                await websocket.send_json({
                    "type": "subscribed",
                    "platform": platform,
                    "room_id": room_id,
                })
                logger.info(f"Client subscribed to {platform} room: {room_id}")
            else:
                msg_type = message.get("type")
                await websocket.send_json({
                    "type": "ack",
                    "received": True,
                    "message": f"Message type \'{msg_type}\' handled",
                })
    
    except WebSocketDisconnect:
        logger.info("WebSocket stream client disconnected")
    except Exception as e:
        logger.error(f"WebSocket stream error: {e}", exc_info=True)
    finally:
        await ws_manager.remove_client(websocket)
        logger.info(f"Remaining stream clients: {ws_manager.client_count}")


@router.get("/clients")
async def get_websocket_clients():
    """获取当前 WebSocket 客户端数量"""
    ws_manager = get_websocket_manager()
    return ws_manager.get_stats()

