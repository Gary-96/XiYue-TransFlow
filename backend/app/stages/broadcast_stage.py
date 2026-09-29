"""
BroadcastStage - 实时广播阶段
职责：接收弹幕事件，转发给 WebSocket 前端
"""
from __future__ import annotations

import logging
from typing import Any, Callable, Dict, List, Optional

from app.core.event_bus import EventBus
from app.domain.danmaku.events import DanmakuEventType, UnifiedDanmakuEvent

logger = logging.getLogger(__name__)


class BroadcastStage:
    """
    实时广播阶段。

    订阅 DanmakuEventType.COMMENT / GIFT / MEMBER_JOIN 等事件，
    通过 callback 发送给前端（WebSocket）。
    """

    def __init__(self, bus: EventBus, send_callback: Optional[Callable[[Dict[str, Any]], None]] = None):
        self._bus = bus
        self._send_callback = send_callback  # 新架构：不直接持有 WS 连接
        self._subscribed_types: List[str] = [
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
        if not self._send_callback:
            return

        message = event.to_dict()
        message["type"] = message["event_type"]  # 前端兼容字段

        try:
            if callable(self._send_callback):
                self._send_callback(message)
            logger.debug(f"BroadcastStage: sent {message["event_type"]} to frontend")
        except Exception as e:
            logger.error(f"BroadcastStage: failed to send event: {e}")
