"""
StatisticsStage - 实时统计阶段
职责：统计弹幕数据（每分钟消息数、活跃用户、平台分布）
"""
from __future__ import annotations

import logging
from collections import defaultdict
from datetime import datetime
from typing import Any, Dict

from app.core.event_bus import EventBus
from app.domain.danmaku.events import DanmakuEventType, UnifiedDanmakuEvent

logger = logging.getLogger(__name__)


class StatisticsStage:
    """
    实时统计阶段。

    订阅弹幕事件，统计：
    - total_messages: 总消息数
    - messages_per_minute: 每分钟消息数
    - active_users: 活跃用户数
    - platform_stats: 平台分布
    - room_id: 当前房间
    """

    def __init__(self, bus: EventBus):
        self._bus = bus
        self._total_messages: int = 0
        self._messages_by_minute: Dict[str, int] = defaultdict(int)
        self._active_users: set = set()
        self._platform_counts: Dict[str, int] = defaultdict(int)
        self._room_id: str = ""
        self._started: bool = False
        self._subscribed_types = [
            DanmakuEventType.COMMENT.value,
            DanmakuEventType.GIFT.value,
            DanmakuEventType.MEMBER_JOIN.value,
            DanmakuEventType.LIKE.value,
            DanmakuEventType.FOLLOW.value,
            DanmakuEventType.SOCIAL.value,
        ]

    async def start(self) -> None:
        if self._started:
            return
        for event_type in self._subscribed_types:
            self._bus.subscribe(event_type, self._on_event)
        self._started = True
        logger.info("StatisticsStage started")

    async def stop(self) -> None:
        if not self._started:
            return
        for event_type in self._subscribed_types:
            self._bus.unsubscribe(event_type, self._on_event)
        self._started = False
        logger.info("StatisticsStage stopped")

    async def _on_event(self, event: UnifiedDanmakuEvent) -> None:
        try:
            self._total_messages += 1
            self._active_users.add(event.username)

            # 按分钟统计
            minute_key = event.occurred_at.strftime("%Y-%m-%d %H:%M")
            self._messages_by_minute[minute_key] += 1

            # 平台统计
            self._platform_counts[event.platform] += 1

            # 房间 ID
            if event.room_id:
                self._room_id = event.room_id

            logger.debug(f"StatisticsStage: +1 message, total={self._total_messages}, users={len(self._active_users)}")
        except Exception as e:
            logger.error(f"StatisticsStage: error handling event: {e}", exc_info=True)

    def get_stats(self) -> Dict[str, Any]:
        """获取当前统计数据"""
        now = datetime.now()
        current_minute = now.strftime("%Y-%m-%d %H:%M")
        previous_minute = (now.__class__.fromtimestamp(now.timestamp() - 60)).strftime("%Y-%m-%d %H:%M")

        return {
            "total_messages": self._total_messages,
            "messages_per_minute": self._messages_by_minute.get(current_minute, 0),
            "active_users": len(self._active_users),
            "platform_stats": dict(self._platform_counts),
            "room_id": self._room_id,
            "uptime_minutes": len(self._messages_by_minute),
        }
