"""
乐曼同传 · CollectorRegistry - 平台采集器注册表
职责：管理 Collector 工厂函数映射，支持动态注册
"""
from __future__ import annotations

import logging
from typing import Callable, Dict, Optional

logger = logging.getLogger(__name__)


class CollectorRegistry:
    """
    平台采集器注册表。

    使用示例：
        registry = CollectorRegistry()
        registry.register("douyin", create_douyin_collector)
        registry.register("tiktok", create_tiktok_collector)

        collector = registry.create("douyin", callback)
    """

    def __init__(self):
        self._factories: dict[str, Callable] = {}

    def register(self, platform: str, factory: Callable) -> None:
        """注册平台工厂函数"""
        platform = platform.lower()
        self._factories[platform] = factory
        logger.info(f"Registered collector factory for: {platform}")

    def unregister(self, platform: str) -> None:
        """注销平台"""
        platform = platform.lower()
        if platform in self._factories:
            del self._factories[platform]
            logger.info(f"Unregistered collector factory for: {platform}")

    def create(self, platform: str, *args, **kwargs) -> Optional[Any]:
        """
        创建指定平台的采集器实例。
        返回 None 表示注册失败。
        """
        platform = platform.lower()
        factory = self._factories.get(platform)
        if not factory:
            logger.error(f"No factory registered for platform: {platform}")
            return None
        try:
            return factory(*args, **kwargs)
        except Exception as e:
            logger.error(f"Failed to create collector for {platform}: {e}")
            return None

    def get_platforms(self) -> list[str]:
        """获取已注册平台列表"""
        return list(self._factories.keys())

    def is_platform_available(self, platform: str) -> bool:
        """检查平台是否可用"""
        return platform.lower() in self._factories

    def get_factory(self, platform: str) -> Optional[Callable]:
        """获取平台工厂函数"""
        return self._factories.get(platform.lower())


# 全局单例
_default_registry: CollectorRegistry | None = None


def get_global_registry() -> CollectorRegistry:
    global _default_registry
    if _default_registry is None:
        _default_registry = CollectorRegistry()
    return _default_registry


def set_global_registry(registry: CollectorRegistry) -> None:
    global _default_registry
    _default_registry = registry
