"""
喜阅 TransFlow · Douyin 数据模型
职责：定义 Douyin Collector 内部使用的数据结构。
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Optional


@dataclass
class AuthConfig:
    """认证配置"""
    cookie: Dict[str, str] = field(default_factory=dict)
    cookie_str: str = ""
    msToken: str = ""
    uid: Optional[str] = None


@dataclass
class ConnectionConfig:
    """连接配置"""
    live_id: str = ""
    room_id: str = ""
    user_id: str = ""
    cursor: str = ""
    internal_ext: str = ""


@dataclass
class RoomInfo:
    """房间信息"""
    room_id: str = ""
    user_id: str = ""
    user_unique_id: str = ""
    anchor_id: str = ""
    sec_uid: str = ""
    room_status: int = 0
    room_title: str = ""


@dataclass
class DouyinMessage:
    """Douyin 平台消息（内部模型）"""
    type: str = ""  # comment, gift, like, member_join, follow, room_stats
    user: str = ""
    text: str = ""
    user_id: str = ""
    metadata: Dict = field(default_factory=dict)

