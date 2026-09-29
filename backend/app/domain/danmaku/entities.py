"""
喜阅 TransFlow · Domain 层 - 弹幕实体
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class UserInfo:
    """用户信息实体"""
    user_id: str
    username: str
    avatar_url: Optional[str] = None
    level: Optional[int] = None
    metadata: dict = field(default_factory=dict)


@dataclass
class GiftInfo:
    """礼物信息实体"""
    gift_id: str
    gift_name: str
    count: int
    value: Optional[float] = None


@dataclass
class RoomStats:
    """房间统计实体"""
    viewer_count: int
    like_count: int
    follow_count: int
    metadata: dict = field(default_factory=dict)

