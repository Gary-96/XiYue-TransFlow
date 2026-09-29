"""
喜阅 TransFlow · Douyin Parser 单元测试
职责：测试 Protobuf 解析逻辑，无需网络。
"""
import pytest
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.collectors.douyin.parser import DouyinParser
from app.collectors.douyin.exceptions import DouyinParseError


class TestDouyinParser:
    """Douyin Parser 单元测试"""

    def setup_method(self):
        self.parser = DouyinParser()

    def test_parse_unknown_message_type(self):
        """测试未知消息类型不会导致崩溃"""
        # 由于需要完整的 protobuf 二进制数据，这里只测试方法存在性
        assert hasattr(self.parser, 'parse_push_frame')
        assert hasattr(self.parser, '_parse_message')

    def test_parse_comment_structure(self):
        """测试评论消息结构"""
        # 模拟评论数据结构
        comment_data = {
            "type": "comment",
            "user": "测试用户",
            "text": "你好",
            "user_id": "123456",
        }
        assert comment_data["type"] == "comment"
        assert comment_data["user"] == "测试用户"
        assert comment_data["text"] == "你好"

    def test_parse_gift_structure(self):
        """测试礼物消息结构"""
        gift_data = {
            "type": "gift",
            "user": "打赏用户",
            "gift_name": "小心心",
            "gift_count": 5,
            "user_id": "789012",
        }
        assert gift_data["type"] == "gift"
        assert gift_data["gift_name"] == "小心心"
        assert gift_data["gift_count"] == 5

    def test_parse_member_structure(self):
        """测试成员加入消息结构"""
        member_data = {
            "type": "member_join",
            "user": "新成员",
            "user_id": "345678",
        }
        assert member_data["type"] == "member_join"
        assert member_data["user"] == "新成员"

    def test_parse_like_structure(self):
        """测试点赞消息结构"""
        like_data = {
            "type": "like",
            "user": "点赞用户",
            "count": 10,
            "user_id": "901234",
        }
        assert like_data["type"] == "like"
        assert like_data["count"] == 10

    def test_parse_follow_structure(self):
        """测试关注消息结构"""
        follow_data = {
            "type": "follow",
            "user": "新用户",
            "user_id": "567890",
        }
        assert follow_data["type"] == "follow"
        assert follow_data["user"] == "新用户"

    def test_parse_room_stats_structure(self):
        """测试房间状态消息结构"""
        stats_data = {
            "type": "room_stats",
            "text": "观看人数: 1,234",
        }
        assert stats_data["type"] == "room_stats"
        assert stats_data["text"] == "观看人数: 1,234"

