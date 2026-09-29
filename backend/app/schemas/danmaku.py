"""弹幕 API Schema"""
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List


class DanmakuEvent(BaseModel):
    """弹幕事件（从 WebSocket 推送）"""
    event_id: str
    event_type: str  # danmaku.comment, danmaku.gift, etc.
    platform: str
    room_id: str
    user_id: Optional[str] = None
    username: str
    text: str
    language: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    timestamp: float


class DanmakuListResponse(BaseModel):
    """弹幕列表响应"""
    status: str
    events: List[DanmakuEvent]
    total: int = 0


class StatisticsResponse(BaseModel):
    """统计响应"""
    status: str
    total_messages: int = 0
    messages_per_minute: float = 0.0
    active_users: int = 0
    platform_stats: Dict[str, int] = Field(default_factory=dict)
