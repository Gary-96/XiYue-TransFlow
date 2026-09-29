"""
喜阅 TransFlow · Douyin Collector 包
职责：提供抖音直播间弹幕采集功能。
"""
from .collector import DouyinCollector, create_douyin_collector
from .exceptions import (
    DouyinCollectorError,
    DouyinConnectionError,
    DouyinConnectionRejectedError,
    DouyinAuthenticationError,
    DouyinProtocolError,
    DouyinParseError,
    DouyinSignatureError,
    DouyinUnsupportedMessageError,
)
from .parser import DouyinParser
from .client import DouyinClient
from .signer import generate_a_bogus
from .models import AuthConfig, ConnectionConfig, RoomInfo, DouyinMessage

__all__ = [
    "DouyinCollector",
    "create_douyin_collector",
    "DouyinCollectorError",
    "DouyinConnectionError",
    "DouyinConnectionRejectedError",
    "DouyinAuthenticationError",
    "DouyinProtocolError",
    "DouyinParseError",
    "DouyinSignatureError",
    "DouyinParser",
    "DouyinClient",
    "generate_a_bogus",
    "AuthConfig",
    "ConnectionConfig",
    "RoomInfo",
    "DouyinMessage",
]

