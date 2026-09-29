"""乐曼同传 Collectors 包 - 平台适配层"""
from .base import BaseCollector, CollectorError
from .manager import CollectorManager, create_collector_manager
from .registry import CollectorRegistry

__all__ = [
    "BaseCollector",
    "CollectorError",
    "CollectorManager",
    "create_collector_manager",
    "CollectorRegistry",
]
