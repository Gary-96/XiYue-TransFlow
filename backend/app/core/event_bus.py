"""
乐曼同传 · EventBus - 异步事件分发总线
职责：解耦 Collector 与 Stage/Service，支持多订阅者并行处理。

设计原则：
- 纯内存，单进程内使用
- 不支持持久化（未来如需分布式再演进）
- 同步/异步回调都支持
- 异常隔离：单个订阅者失败不影响其他订阅者
"""
from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from typing import Any, Callable, Coroutine, Generic, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar('T')
Subscriber = Callable[[T], None] | Callable[[T], Coroutine[Any, Any, None]]


class EventBus(Generic[T]):
    """
    类型安全的事件总线。

    使用示例：
        bus = EventBus[UnifiedDanmakuEvent]()
        bus.subscribe("danmaku.comment", handler)
        bus.publish(event)
    """

    def __init__(self, name: str = "default"):
        self._name = name
        self._subscribers: dict[str, list[Subscriber]] = defaultdict(list)
        self._stats = {"published": 0, "errors": 0}

    @property
    def name(self) -> str:
        return self._name

    def subscribe(self, event_type: str, callback: Subscriber) -> None:
        """注册事件处理器"""
        self._subscribers[event_type].append(callback)
        logger.debug(f"[{self._name}] subscribed to {event_type}")

    def unsubscribe(self, event_type: str, callback: Subscriber) -> None:
        """注销事件处理器"""
        if event_type in self._subscribers:
            try:
                self._subscribers[event_type].remove(callback)
            except ValueError:
                pass

    async def publish(self, event: T) -> None:
        """
        发布事件，并行通知所有订阅者。
        任意订阅者抛异常不会中断其他订阅者。
        """
        self._stats["published"] += 1
        event_type = getattr(event, 'event_type', None)
        if isinstance(event_type, type) and hasattr(event_type, 'value'):
            event_type = event_type.value

        handlers = self._subscribers.get(event_type, [])
        if not handlers:
            return

        tasks = [self._safe_invoke(h, event) for h in handlers]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for i, r in enumerate(results):
            if isinstance(r, Exception):
                self._stats["errors"] += 1
                logger.error(
                    f"[{self._name}] handler {i} failed for {event_type}: {r}",
                    exc_info=r,
                )

    async def _safe_invoke(self, handler: Subscriber, event: T) -> None:
        """安全调用单个 handler"""
        try:
            if asyncio.iscoroutinefunction(handler):
                await handler(event)
            else:
                result = handler(event)
                if asyncio.iscoroutine(result):
                    await result
        except Exception as e:
            raise

    def get_stats(self) -> dict[str, Any]:
        return {
            **self._stats,
            "subscriber_counts": {k: len(v) for k, v in self._subscribers.items()},
        }

    def reset_stats(self) -> None:
        self._stats = {"published": 0, "errors": 0}


# 全局单例
_default_bus: EventBus | None = None


def get_global_event_bus() -> EventBus:
    global _default_bus
    if _default_bus is None:
        _default_bus = EventBus("global")
    return _default_bus


def set_global_event_bus(bus: EventBus) -> None:
    global _default_bus
    _default_bus = bus
