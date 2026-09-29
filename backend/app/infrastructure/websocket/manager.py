"""
喜阅 TransFlow · WebSocketManager
职责：管理 WebSocket 客户端连接、订阅、广播
不与 Collector 直接交互，只接收 BroadcastStage 的回调
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, Optional, Set

logger = logging.getLogger(__name__)


class WebSocketManager:
    """
    WebSocket 连接管理器。

    职责：
    - 管理客户端连接生命周期
    - 支持房间订阅
    - 广播事件到所有订阅客户端
    """

    def __init__(self):
        self._clients: Set[any] = set()  # WebSocket 客户端集合
        self._subscribers: Dict[str, Set[any]] = {}  # 房间订阅
        self._lock = asyncio.Lock()

    @property
    def client_count(self) -> int:
        return len(self._clients)

    async def add_client(self, websocket: any) -> None:
        """添加 WebSocket 客户端"""
        async with self._lock:
            self._clients.add(websocket)
            logger.info(f"WebSocket client added. Total: {len(self._clients)}")

    async def remove_client(self, websocket: any) -> None:
        """移除 WebSocket 客户端"""
        async with self._lock:
            self._clients.discard(websocket)
            # 清理订阅
            for room_id, subs in self._subscribers.items():
                subs.discard(websocket)
            logger.info(f"WebSocket client removed. Total: {len(self._clients)}")

    async def subscribe(self, websocket: any, room_id: str) -> None:
        """订阅特定房间"""
        async with self._lock:
            if room_id not in self._subscribers:
                self._subscribers[room_id] = set()
            self._subscribers[room_id].add(websocket)
            logger.info(f"Client subscribed to room: {room_id}")

    async def unsubscribe(self, websocket: any, room_id: str) -> None:
        """取消订阅"""
        async with self._lock:
            if room_id in self._subscribers:
                self._subscribers[room_id].discard(websocket)
                if not self._subscribers[room_id]:
                    del self._subscribers[room_id]

    async def broadcast(self, message: Dict[str, Any]) -> None:
        """
        广播消息到所有订阅客户端。
        过滤掉断开连接的客户端。
        """
        disconnected = []

        async with self._lock:
            tasks = []
            for ws in list(self._clients):
                try:
                    tasks.append(ws.send_json(message))
                except Exception as e:
                    logger.warning(f"Failed to send to client: {e}")
                    disconnected.append(ws)

            if tasks:
                results = await asyncio.gather(*tasks, return_exceptions=True)
                for i, r in enumerate(results):
                    if isinstance(r, Exception):
                        logger.warning(f"Broadcast failed for client: {r}")
                        disconnected.append(list(self._clients)[i] if i < len(self._clients) else None)

            # 清理断开连接
            for ws in disconnected:
                if ws:
                    await self.remove_client(ws)

    def get_stats(self) -> Dict[str, Any]:
        return {
            "total_clients": len(self._clients),
            "subscribed_rooms": len(self._subscribers),
            "room_details": {k: len(v) for k, v in self._subscribers.items()},
        }


# 全局单例
_default_ws_manager: Optional[WebSocketManager] = None


def get_websocket_manager() -> WebSocketManager:
    global _default_ws_manager
    if _default_ws_manager is None:
        _default_ws_manager = WebSocketManager()
    return _default_ws_manager

