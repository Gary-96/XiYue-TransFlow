"""
喜阅 TransFlow · Douyin Parser 测试 Fixture
职责：提供脱敏的测试数据，无需真实网络。
"""
import base64
import gzip
import json
from typing import Dict, Any

# 模拟的 PushFrame 二进制数据（用于离线测试）
# 实际结构：PushFrame { payloadType: "msg", payload: gzip_compressed_LiveResponse }


def create_mock_pushframe(method: str, payload_data: Dict[str, Any]) -> bytes:
    """
    创建模拟的 PushFrame 数据。
    
    注意：这是合成数据，用于测试解析逻辑，不依赖真实抖音服务器。
    """
    # 由于需要完整 protobuf 序列化的二进制，这里使用简化方式
    # 实际测试时使用预存的二进制 fixture 文件
    return b""


def get_test_comment_data() -> Dict[str, Any]:
    """获取测试用的评论数据"""
    return {
        "method": "WebcastChatMessage",
        "payload": {
            "user": {"nickname": "测试用户", "userId": "123456"},
            "content": "你好，这是一条测试弹幕",
        },
    }


def get_test_gift_data() -> Dict[str, Any]:
    """获取测试用的礼物数据"""
    return {
        "method": "WebcastGiftMessage",
        "payload": {
            "user": {"nickname": "打赏用户", "userId": "789012"},
            "gift": {"name": "小心心", "id": "1"},
            "comboCount": 5,
        },
    }


def get_test_member_data() -> Dict[str, Any]:
    """获取测试用的成员加入数据"""
    return {
        "method": "WebcastMemberMessage",
        "payload": {
            "user": {"nickname": "新成员", "userId": "345678"},
        },
    }


def get_test_like_data() -> Dict[str, Any]:
    """获取测试用的点赞数据"""
    return {
        "method": "WebcastLikeMessage",
        "payload": {
            "user": {"nickname": "点赞用户", "userId": "901234"},
            "count": 10,
        },
    }


def get_test_follow_data() -> Dict[str, Any]:
    """获取测试用的关注数据"""
    return {
        "method": "WebcastSocialMessage",
        "payload": {
            "user": {"nickname": "新用户", "userId": "567890"},
            "action": 1,  # 1 = follow
        },
    }


def get_test_room_stats_data() -> Dict[str, Any]:
    """获取测试用的房间状态数据"""
    return {
        "method": "WebcastRoomStatsMessage",
        "payload": {
            "displayLong": "观看人数: 1,234",
        },
    }


# 合成 fixture 标记
SYNTHETIC_FIXTURE = True

