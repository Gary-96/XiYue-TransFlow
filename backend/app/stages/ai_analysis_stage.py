"""
AIAnalysisStage - 异步 AI 分析阶段（占位）
职责：接收弹幕事件，执行 AI 分析，发布 AIAnalysisCompletedEvent
注意：当前为占位实现，实际 AI 能力需后续接入
"""
from __future__ import annotations

import logging
import time
import uuid
from typing import Any, Dict, Optional

from app.core.event_bus import EventBus
from app.domain.danmaku.events import DanmakuEventType, UnifiedDanmakuEvent

logger = logging.getLogger(__name__)


class AIAnalysisStage:
    """
    AI 分析阶段（慢速旁路）。

    设计原则：
    - 不阻塞实时弹幕和翻译
    - AI 失败不影响其他链路
    - 可配置分析类型（摘要、建议、情感分析等）
    """

    def __init__(self, bus: EventBus):
        self._bus = bus
        self._started = False
        self._stats = {"analyzed": 0, "errors": 0}

    async def start(self) -> None:
        """启动 Stage"""
        if self._started:
            return
        # 订阅评论和礼物事件
        self._bus.subscribe(DanmakuEventType.COMMENT.value, self._on_comment)
        self._bus.subscribe(DanmakuEventType.GIFT.value, self._on_gift)
        self._started = True
        logger.info("AIAnalysisStage started (placeholder)")

    async def stop(self) -> None:
        """停止 Stage"""
        if not self._started:
            return
        self._bus.unsubscribe(DanmakuEventType.COMMENT.value, self._on_comment)
        self._bus.unsubscribe(DanmakuEventType.GIFT.value, self._on_gift)
        self._started = False
        logger.info("AIAnalysisStage stopped")

    async def _on_comment(self, event: UnifiedDanmakuEvent) -> None:
        """处理评论事件 - 占位实现"""
        # TODO: 接入 AI 服务后实现
        # 当前仅记录日志，不产生实际输出
        pass

    async def _on_gift(self, event: UnifiedDanmakuEvent) -> None:
        """处理礼物事件 - 占位实现"""
        # TODO: 接入 AI 服务后实现
        pass

    def get_stats(self) -> Dict[str, Any]:
        return {**self._stats, "started": self._started}
