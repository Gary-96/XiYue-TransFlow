"""
喜阅 TransFlow Collectors 包 - 平台适配层
新架构：使用 app.collectors.*
保留 collectors_legacy 用于历史参考
"""
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

