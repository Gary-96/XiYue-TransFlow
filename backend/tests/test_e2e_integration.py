"""
喜阅 TransFlow — E2E 集成测试
测试完整链路：MockCollector → EventBus → Stages → WebSocket
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'app'))

import pytest
from app.core.event_bus import EventBus
from app.collectors.manager import CollectorManager
from app.collectors.mock_collector import MockCollector
from app.stages.broadcast_stage import BroadcastStage
from app.stages.statistics_stage import StatisticsStage
from app.infrastructure.websocket.manager import WebSocketManager, get_websocket_manager
from app.domain.danmaku.events import DanmakuEventType, UnifiedDanmakuEvent


@pytest.mark.asyncio
async def test_mock_chain():
    """测试 A: MockCollector → EventBus → BroadcastStage → WebSocket"""
    bus = EventBus("test")
    ws_manager = get_websocket_manager()
    
    received = []
    async def mock_broadcast(msg):
        received.append(msg)
    
    ws_manager.broadcast = mock_broadcast
    await ws_manager.add_client("mock_ws")
    
    broadcast = BroadcastStage(bus)
    await broadcast.start()
    
    manager = CollectorManager(event_bus=bus)
    result = await manager.connect("mock", "test-room")
    
    assert result["success"], f"Connect failed: {result}"
    await asyncio.sleep(0.3)
    await manager.disconnect()
    await broadcast.stop()
    
    assert len(received) > 0, "No events received"


@pytest.mark.asyncio
async def test_statistics_stage():
    """测试统计阶段"""
    bus = EventBus("test")
    stats = StatisticsStage(bus)
    await stats.start()
    
    event = UnifiedDanmakuEvent(
        event_id="test-1",
        event_type=DanmakuEventType.COMMENT,
        platform="mock",
        room_id="test-room",
        user_id="alice",
        username="Alice",
        text="Hello",
        language="zh",
    )
    await bus.publish(event)
    await asyncio.sleep(0.1)
    
    stats_data = stats.get_stats()
    assert stats_data["total_messages"] == 1
    assert stats_data["active_users"] == 1
    await stats.stop()


@pytest.mark.asyncio
async def test_exception_isolation():
    """测试异常隔离"""
    bus = EventBus("test")
    results = {"broadcast": 0, "fail": 0}
    
    async def bad_handler(event):
        results["fail"] += 1
        raise ValueError("Intentional failure")
    
    async def good_handler(event):
        results["broadcast"] += 1
    
    bus.subscribe(DanmakuEventType.COMMENT.value, bad_handler)
    bus.subscribe(DanmakuEventType.COMMENT.value, good_handler)
    
    event = UnifiedDanmakuEvent(
        event_id="test-1",
        event_type=DanmakuEventType.COMMENT,
        platform="mock",
        room_id="test-room",
        user_id="bob",
        username="Bob",
        text="Test",
        language="zh",
    )
    await bus.publish(event)
    
    assert results["broadcast"] == 1
    assert results["fail"] == 1


@pytest.mark.asyncio
async def test_platform_isolation():
    """测试平台隔离"""
    from app.collectors.base import BaseCollector
    assert issubclass(MockCollector, BaseCollector)
    
    try:
        from app.collectors.douyin.collector import DouyinCollector
        assert issubclass(DouyinCollector, BaseCollector)
    except ImportError:
        pass
    
    try:
        from app.collectors.tiktok.collector import TikTokCollector
        assert issubclass(TikTokCollector, BaseCollector)
    except ImportError:
        pass

