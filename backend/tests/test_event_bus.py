"""EventBus 单元测试"""
import asyncio
import pytest
from app.core.event_bus import EventBus


class DummyEvent:
    def __init__(self, type_name: str, data: str):
        self.event_type = type_name
        self.data = data


@pytest.mark.asyncio
async def test_event_bus_subscribe_publish():
    """测试订阅和发布"""
    bus = EventBus("test")
    received = []

    def handler(event):
        received.append(event.data)

    bus.subscribe("test.event", handler)
    await bus.publish(DummyEvent("test.event", "hello"))

    assert received == ["hello"]


@pytest.mark.asyncio
async def test_event_bus_multiple_handlers():
    """测试多订阅者"""
    bus = EventBus("test")
    received = []

    def handler1(event):
        received.append("h1:" + event.data)

    def handler2(event):
        received.append("h2:" + event.data)

    bus.subscribe("test.event", handler1)
    bus.subscribe("test.event", handler2)
    await bus.publish(DummyEvent("test.event", "multi"))

    assert sorted(received) == ["h1:multi", "h2:multi"]


@pytest.mark.asyncio
async def test_event_bus_async_handler():
    """测试异步回调"""
    bus = EventBus("test")
    received = []

    async def async_handler(event):
        await asyncio.sleep(0.01)
        received.append("async:" + event.data)

    bus.subscribe("test.event", async_handler)
    await bus.publish(DummyEvent("test.event", "async"))

    assert received == ["async:async"]


@pytest.mark.asyncio
async def test_event_bus_handler_exception():
    """测试处理者异常不影响其他处理者"""
    bus = EventBus("test")
    results = []

    def bad_handler(event):
        raise ValueError("intentional error")

    def good_handler(event):
        results.append(event.data)

    bus.subscribe("test.event", bad_handler)
    bus.subscribe("test.event", good_handler)

    # 不应抛出异常
    await bus.publish(DummyEvent("test.event", "safe"))

    assert results == ["safe"]


@pytest.mark.asyncio
async def test_event_bus_unsubscribe():
    """测试取消订阅"""
    bus = EventBus("test")
    received = []

    def handler(event):
        received.append(event.data)

    bus.subscribe("test.event", handler)
    bus.unsubscribe("test.event", handler)
    await bus.publish(DummyEvent("test.event", "ignored"))

    assert received == []


@pytest.mark.asyncio
async def test_event_bus_stats():
    """测试统计功能"""
    bus = EventBus("test")

    def handler(event):
        pass

    bus.subscribe("test.event", handler)

    for i in range(5):
        await bus.publish(DummyEvent("test.event", f"msg{i}"))

    stats = bus.get_stats()
    assert stats["published"] == 5
    assert stats["subscriber_counts"]["test.event"] == 1
