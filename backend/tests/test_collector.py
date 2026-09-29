"""
喜阅 TransFlow · Douyin Collector 单元测试
职责：测试 Collector 生命周期和事件转换，无需网络。
"""
import pytest
import sys
import os
import asyncio
from unittest.mock import patch, MagicMock, AsyncMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.collectors.douyin import DouyinCollector
from app.collectors.douyin.exceptions import DouyinConnectionRejectedError


class TestDouyinCollector:
    """Douyin Collector 测试"""

    @pytest.mark.asyncio
    async def test_create_collector(self):
        """测试创建 Collector"""
        collector = DouyinCollector()
        assert collector is not None
        assert collector.platform == "douyin"
        assert collector.parser is not None

    @pytest.mark.asyncio
    async def test_get_capabilities(self):
        """测试能力声明"""
        collector = DouyinCollector()
        caps = collector.get_capabilities()
        
        assert caps["comments"] == True
        assert caps["gifts"] == True
        assert caps["likes"] == True
        assert caps["members"] == True
        assert caps["follows"] == True
        assert caps["room_stats"] == True
        assert caps["translation"] == False
        assert caps["tts"] == False

    @pytest.mark.asyncio
    async def test_language_detection_zh(self):
        """测试中文检测"""
        collector = DouyinCollector()
        lang = collector._detect_language("你好世界")
        assert lang == "zh"

    @pytest.mark.asyncio
    async def test_language_detection_vi(self):
        """测试越南语检测"""
        collector = DouyinCollector()
        lang = collector._detect_language("Xin chào thế giới")
        assert lang == "vi"

    @pytest.mark.asyncio
    async def test_language_detection_unknown(self):
        """测试未知语言检测"""
        collector = DouyinCollector()
        lang = collector._detect_language("hello world")
        assert lang == "unknown"

    @pytest.mark.asyncio
    async def test_map_event_type(self):
        """测试事件类型映射"""
        collector = DouyinCollector()
        
        assert collector._map_event_type("comment") == "danmaku.comment"
        assert collector._map_event_type("gift") == "danmaku.gift"
        assert collector._map_event_type("member_join") == "danmaku.member_join"
        assert collector._map_event_type("like") == "danmaku.like"
        assert collector._map_event_type("follow") == "danmaku.follow"
        assert collector._map_event_type("room_stats") == "danmaku.room_stats"
        assert collector._map_event_type("unknown") == "danmaku.comment"

    @pytest.mark.asyncio
    async def test_extract_text_comment(self):
        """测试文本提取 - 评论"""
        collector = DouyinCollector()
        text = collector._extract_text({"type": "comment", "text": "你好"})
        assert text == "你好"

    @pytest.mark.asyncio
    async def test_extract_text_gift(self):
        """测试文本提取 - 礼物"""
        collector = DouyinCollector()
        text = collector._extract_text({
            "type": "gift",
            "gift_name": "小心心",
            "gift_count": 5,
        })
        assert "小心心" in text
        assert "5" in text

    @pytest.mark.asyncio
    async def test_extract_text_like(self):
        """测试文本提取 - 点赞"""
        collector = DouyinCollector()
        text = collector._extract_text({
            "type": "like",
            "count": 10,
        })
        assert "10" in text

    @pytest.mark.asyncio
    async def test_dispatch_platform_message_creates_event(self):
        """测试平台消息转换为统一事件"""
        collector = DouyinCollector()
        collected_events = []
        
        # Mock send_message
        async def mock_send(msg):
            collected_events.append(msg)
        
        collector.send_message = mock_send
        collector.live_id = "test_room"
        collector.loop = asyncio.get_event_loop()
        
        # 发送平台消息
        platform_msg = {
            "type": "comment",
            "user": "测试用户",
            "text": "你好",
            "user_id": "123456",
        }
        
        collector._dispatch_platform_message(platform_msg)
        
        # 等待异步消息处理
        await asyncio.sleep(0.1)
        
        assert len(collected_events) == 1
        event = collected_events[0]
        assert event["platform"] == "douyin"
        assert event["event_type"] == "danmaku.comment"
        assert event["username"] == "测试用户"
        assert event["text"] == "你好"

    @pytest.mark.asyncio
    async def test_stats_update_on_message(self):
        """测试消息统计更新"""
        collector = DouyinCollector()
        
        # 初始状态
        assert collector.stats["messages_received"] == 0
        
        # 发送消息
        platform_msg = {"type": "comment", "text": "test"}
        collector._dispatch_platform_message(platform_msg)
        
        await asyncio.sleep(0.1)
        
        # 验证统计
        assert collector.stats["messages_received"] >= 1
        assert collector.stats["events_parsed"] >= 1

    def test_connection_rejected_error(self):
        """测试连接被拒绝异常"""
        exc = DouyinConnectionRejectedError(
            status_code=415,
            handshake_message="DEVICE_BLOCKED",
            identifier="644882972280",
        )
        
        assert exc.status_code == 415
        assert exc.handshake_message == "DEVICE_BLOCKED"
        assert exc.platform == "douyin"
        assert exc.identifier == "644882972280"

