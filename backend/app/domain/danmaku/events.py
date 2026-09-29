"""
乐曼同传 · Domain 层 - 弹幕领域事件
职责：定义统一事件契约，与平台无关。
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Optional


class DanmakuEventType(str, Enum):
    """弹幕事件类型枚举"""
    COMMENT = "danmaku.comment"
    GIFT = "danmaku.gift"
    MEMBER_JOIN = "danmaku.member_join"
    LIKE = "danmaku.like"
    FOLLOW = "danmaku.follow"
    ROOM_STATS = "danmaku.room_stats"
    SOCIAL = "danmaku.social"


class CollectorStatus(str, Enum):
    """采集器状态机"""
    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    DISCONNECTING = "disconnecting"
    RECONNECTING = "reconnecting"
    ERROR = "error"


@dataclass(frozen=True)
class UnifiedDanmakuEvent:
    """
    统一弹幕事件 - 所有平台弹幕经 Parser 后产生的统一结构。

    设计原则：
    - 只包含业务语义字段，不暴露平台协议细节
    - 不可变（frozen），防止下游篡改
    - event_id 全局唯一，用于去重
    """
    event_id: str
    event_type: DanmakuEventType
    platform: str                    # "douyin" | "tiktok" | ...
    room_id: str
    user_id: Optional[str]
    username: str
    text: str
    language: Optional[str]          # "zh" | "vi" | "en" | None
    metadata: dict[str, Any] = field(default_factory=dict)
    occurred_at: datetime = field(default_factory=datetime.utcnow)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "UnifiedDanmakuEvent":
        """从 dict 构造（来自 Collector 的发送消息）"""
        return cls(
            event_id=data.get("event_id", str(uuid.uuid4())),
            event_type=DanmakuEventType(data.get("event_type", "danmaku.comment")),
            platform=data.get("platform", "unknown"),
            room_id=data.get("room_id", ""),
            user_id=data.get("user_id"),
            username=data.get("user", data.get("username", "unknown")),
            text=data.get("text", ""),
            language=data.get("language"),
            metadata=data.get("metadata", {}),
            occurred_at=datetime.fromtimestamp(data["timestamp"]) if "timestamp" in data else datetime.utcnow(),
        )

    def to_dict(self) -> dict[str, Any]:
        """序列化为 dict（发送给前端/Stage）"""
        return {
            "event_id": self.event_id,
            "event_type": self.event_type.value,
            "platform": self.platform,
            "room_id": self.room_id,
            "user_id": self.user_id,
            "username": self.username,
            "text": self.text,
            "language": self.language,
            "metadata": self.metadata,
            "timestamp": self.occurred_at.timestamp(),
        }


@dataclass(frozen=True)
class TranslationCompletedEvent:
    """翻译完成事件"""
    event_id: str
    danmaku_event_id: str
    source_text: str
    translated_text: str
    source_lang: str
    target_lang: str
    provider: str                    # "opus-mt" | "google" | "ollama" | ...
    latency_ms: float
    occurred_at: datetime = field(default_factory=datetime.utcnow)

    def to_dict(self) -> dict[str, Any]:
        return {
            "type": "translation.completed",
            "event_id": self.event_id,
            "danmaku_event_id": self.danmaku_event_id,
            "source_text": self.source_text,
            "translated_text": self.translated_text,
            "source_lang": self.source_lang,
            "target_lang": self.target_lang,
            "provider": self.provider,
            "latency_ms": self.latency_ms,
            "timestamp": self.occurred_at.timestamp(),
        }


@dataclass(frozen=True)
class AIAnalysisCompletedEvent:
    """AI 分析完成事件"""
    event_id: str
    danmaku_event_id: str
    analysis_type: str               # "summary" | "suggestion" | "sentiment" | "keywords"
    result: dict[str, Any]
    latency_ms: float
    occurred_at: datetime = field(default_factory=datetime.utcnow)

    def to_dict(self) -> dict[str, Any]:
        return {
            "type": "ai.analysis_completed",
            "event_id": self.event_id,
            "danmaku_event_id": self.danmaku_event_id,
            "analysis_type": self.analysis_type,
            "result": self.result,
            "latency_ms": self.latency_ms,
            "timestamp": self.occurred_at.timestamp(),
        }


@dataclass(frozen=True)
class CollectorStatusChangedEvent:
    """采集器状态变更事件"""
    platform: str
    old_status: CollectorStatus
    new_status: CollectorStatus
    error_message: Optional[str] = None
    occurred_at: datetime = field(default_factory=datetime.utcnow)

    def to_dict(self) -> dict[str, Any]:
        return {
            "type": "collector.status_changed",
            "platform": self.platform,
            "old_status": self.old_status.value,
            "new_status": self.new_status.value,
            "error_message": self.error_message,
            "timestamp": self.occurred_at.timestamp(),
        }
