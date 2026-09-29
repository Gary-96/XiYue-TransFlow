"""
TranslationStage - 实时翻译阶段
职责：接收弹幕事件，执行翻译，发布 TranslationCompletedEvent
"""
from __future__ import annotations

import asyncio
import logging
import time
import uuid
from typing import Any, Dict, Optional

from app.core.event_bus import EventBus
from app.domain.danmaku.events import DanmakuEventType, TranslationCompletedEvent, UnifiedDanmakuEvent
from app.services import get_translation_service

logger = logging.getLogger(__name__)


class TranslationStage:
    """
    实时翻译阶段。

    性能要求：低延迟，不阻塞广播链路。
    失败时只记录日志，不影响其他 Stage。
    """

    def __init__(self, bus: EventBus, max_concurrent: int = 5):
        self._bus = bus
        self._max_concurrent = max_concurrent
        self._semaphore = asyncio.Semaphore(max_concurrent)
        self._started = False
        self._stats = {"translated": 0, "errors": 0}

    async def start(self) -> None:
        """启动 Stage，订阅弹幕事件"""
        if self._started:
            return
        self._bus.subscribe(DanmakuEventType.COMMENT.value, self._on_comment)
        self._started = True
        logger.info("TranslationStage started")

    async def stop(self) -> None:
        """停止 Stage"""
        if not self._started:
            return
        self._bus.unsubscribe(DanmakuEventType.COMMENT.value, self._on_comment)
        self._started = False
        logger.info("TranslationStage stopped")

    async def _on_comment(self, event: UnifiedDanmakuEvent) -> None:
        """处理弹幕评论事件"""
        # 过滤空消息、纯表情、纯数字
        if not event.text or not event.text.strip():
            return
        if self._is_pure_emoji_or_number(event.text):
            return

        await self._translate_event(event)

    async def _translate_event(self, event: UnifiedDanmakuEvent) -> None:
        """执行翻译（异步，不阻塞）"""
        async with self._semaphore:
            try:
                start_time = time.time()

                service = get_translation_service()
                translated = await service.translate(
                    text=event.text,
                    source_lang=event.language or "zh",
                    target_lang="vi",  # 固定目标语言
                )

                latency_ms = (time.time() - start_time) * 1000

                if translated:
                    # 发布翻译完成事件
                    translation_event = TranslationCompletedEvent(
                        event_id=str(uuid.uuid4()),
                        danmaku_event_id=event.event_id,
                        source_text=event.text,
                        translated_text=translated,
                        source_lang=event.language or "zh",
                        target_lang="vi",
                        provider=service.current_provider,
                        latency_ms=latency_ms,
                    )
                    await self._bus.publish(translation_event)
                    self._stats["translated"] += 1

                    logger.debug(
                        f"[{event.platform}] {event.username}: {event.text} -> {translated} ({latency_ms:.0f}ms)"
                    )
                else:
                    self._stats["errors"] += 1
                    logger.warning(f"[{event.platform}] Translation failed for: {event.text[:30]}")

            except Exception as e:
                self._stats["errors"] += 1
                logger.error(f"TranslationStage error: {e}", exc_info=True)

    @staticmethod
    def _is_pure_emoji_or_number(text: str) -> bool:
        """判断是否为纯表情或纯数字（无需翻译）"""
        import re
        # 纯表情
        if re.match(r'^[\U0001F300-\U0001F9FF]+$', text):
            return True
        # 纯数字
        if re.match(r'^[\d\s]+$', text):
            return True
        return False

    def get_stats(self) -> Dict[str, Any]:
        return {**self._stats, "started": self._started}
