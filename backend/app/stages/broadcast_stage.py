"""
BroadcastStage - 实时广播阶段
职责：接收弹幕事件，转发给 WebSocket 前端
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from app.core.event_bus import EventBus
from app.domain.danmaku.events import DanmakuEventType, UnifiedDanmakuEvent
from app.infrastructure.websocket.manager import get_websocket_manager

logger = logging.getLogger(__name__)


class BroadcastStage:
    """
    实时广播阶段。

    订阅 DanmakuEventType.COMMENT / GIFT / MEMBER_JOIN 等事件，
    通过 WebSocketManager 发送给前端。
    """

    def __init__(self, bus: EventBus):
        self._bus = bus
        self._ws_manager = get_websocket_manager()
        self._subscribed_types: list[str] = [
            DanmakuEventType.COMMENT.value,
            DanmakuEventType.GIFT.value,
            DanmakuEventType.MEMBER_JOIN.value,
            DanmakuEventType.LIKE.value,
            DanmakuEventType.FOLLOW.value,
            DanmakuEventType.ROOM_STATS.value,
        ]
        self._started = False

    async def start(self) -> None:
        """启动 Stage，订阅事件"""
        if self._started:
            return
        for event_type in self._subscribed_types:
            self._bus.subscribe(event_type, self._on_event)
        self._started = True
        logger.info(f"BroadcastStage started, subscribed to {len(self._subscribed_types)} event types")

    async def stop(self) -> None:
        """停止 Stage，取消订阅"""
        if not self._started:
            return
        for event_type in self._subscribed_types:
            self._bus.unsubscribe(event_type, self._on_event)
        self._started = False
        logger.info("BroadcastStage stopped")

    async def _on_event(self, event: UnifiedDanmakuEvent) -> None:
        """处理弹幕事件，转发给前端"""
        message = event.to_dict()
        message["type"] = message["event_type"]  # 前端兼容字段

        try:
            await self._ws_manager.broadcast(message)
            logger.debug(f"BroadcastStage: sent {message['event_type']} to frontend")
        except Exception as e:
            logger.error(f"BroadcastStage: failed to broadcast event: {e}")
