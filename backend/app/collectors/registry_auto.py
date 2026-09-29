"""
喜阅 TransFlow · CollectorRegistry 自动注册
所有平台 collector 在此统一注册，新增平台只需添加一行
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from .registry import CollectorRegistry, get_global_registry

if TYPE_CHECKING:
    from .base import BaseCollector

logger = logging.getLogger(__name__)


def register_all_collectors(registry: CollectorRegistry) -> None:
    """
    注册所有已知平台的采集器。

    新增平台时，在此函数中添加一行即可。
    """
    # ── 抖音 ──
    try:
        from .douyin.collector import create_douyin_collector
        registry.register("douyin", create_douyin_collector)
        logger.info("Registered Douyin collector")
    except ImportError as e:
        logger.warning(f"Failed to register Douyin collector: {e}")

    # ── TikTok ──
    try:
        from .tiktok.collector import create_tiktok_collector
        registry.register("tiktok", create_tiktok_collector)
        logger.info("Registered TikTok collector")
    except ImportError as e:
        logger.warning(f"Failed to register TikTok collector: {e}")

    # ── Mock (仅测试) ──
    try:
        from .mock_collector import MockCollector
        # Mock 使用工厂函数包装
        def _create_mock(*args, **kwargs):
            return MockCollector(*args, **kwargs)
        registry.register("mock", _create_mock)
        logger.info("Registered Mock collector (test-only)")
    except ImportError as e:
        logger.error(f"Failed to register Mock collector: {e}")

    logger.info(f"Collector registry initialized with {len(registry.get_platforms())} platforms: {registry.get_platforms()}")

