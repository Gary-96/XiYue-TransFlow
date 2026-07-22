"""
Collectors Package
Base classes and platform-specific collectors for live stream monitoring
"""

from .base import BaseCollector, CollectorError
from .tiktok_collector import TikTokCollector, create_tiktok_collector
from .douyin_collector import DouyinCollector, create_douyin_collector
from .manager import CollectorManager, create_collector_manager
__all__ = [
    'BaseCollector',
    'CollectorError',
    'TikTokCollector',
    'DouyinCollector',
    'CollectorManager',
    'create_tiktok_collector',
    'create_douyin_collector',
    'create_collector_manager'
]
