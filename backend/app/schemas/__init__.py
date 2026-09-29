"""喜阅 TransFlow API Schema 层"""
from .common import ApiResponse, ErrorResponse, PaginationParams
from .collector import (
    ConnectCollectorRequest,
    ConnectCollectorResponse,
    CollectorStatusResponse,
    DisconnectCollectorResponse,
)
from .translation import TranslationRequest, TranslationResponse
from .danmaku import DanmakuEvent, DanmakuListResponse, StatisticsResponse

__all__ = [
    "ApiResponse",
    "ErrorResponse",
    "PaginationParams",
    "ConnectCollectorRequest",
    "ConnectCollectorResponse",
    "CollectorStatusResponse",
    "DisconnectCollectorResponse",
    "TranslationRequest",
    "TranslationResponse",
    "DanmakuEvent",
    "DanmakuListResponse",
    "StatisticsResponse",
]

