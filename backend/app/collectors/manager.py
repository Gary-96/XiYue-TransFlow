"""
喜阅 TransFlow · CollectorManager - 统一采集器管理器
职责：管理采集器生命周期，通过 EventBus 分发事件
不再直接持有 WebSocket，不再直接调用翻译/AI
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, List, Optional

from app.core.event_bus import EventBus, get_global_event_bus
from app.domain.danmaku.events import (
    DanmakuEventType,
    CollectorStatusChangedEvent,
    UnifiedDanmakuEvent,
)
from .base import BaseCollector
from .registry import CollectorRegistry, get_global_registry

logger = logging.getLogger(__name__)



from .registry_auto import register_all_collectors

class CollectorManager:
    """
    统一采集器管理器。

    设计：
    - 只管理一个活跃采集器（单房间场景）
    - 通过 EventBus 发布事件，不直接广播 WebSocket
    - 支持多平台切换
    """

    def __init__(self, registry: Optional[CollectorRegistry] = None, event_bus: Optional[EventBus] = None):
        self._registry = registry or get_global_registry()
        self._event_bus = event_bus or get_global_event_bus()

        # 当前活跃采集器
        self._active_collector: Optional[BaseCollector] = None
        self._active_platform: Optional[str] = None
        
        # 自动注册所有平台
        register_all_collectors(self._registry)


        # 全局统计
        self._global_stats = {
            "total_platforms": len(self._registry.get_platforms()),
            "active_platform": None,
            "total_messages": 0,
            "total_errors": 0,
            "switch_count": 0,
        }

        logger.info(f"CollectorManager initialized with platforms: {self._registry.get_platforms()}")

    async def connect(self, platform: str, identifier: str, **kwargs) -> Dict[str, Any]:
        """
        连接指定平台的采集器。
        先停止当前活跃采集器，再启动新的。
        """
        platform = platform.lower()

        # 检查平台是否可用
        if not self._registry.is_platform_available(platform):
            return {
                "success": False,
                "error": f"Unsupported platform: {platform}",
                "available_platforms": self._registry.get_platforms(),
            }

        # 停止当前采集器
        if self._active_collector:
            await self._stop_active()

        # 创建并启动新采集器
        collector = self._registry.create(platform, self._on_message)
        if not collector:
            return {
                "success": False,
                "error": f"Failed to create collector for {platform}",
            }

        # 设置回调并启动
        success = await collector.start(identifier, **kwargs)

        if success:
            self._active_collector = collector
            self._active_platform = platform
            collector.set_active_room(identifier)

            self._global_stats["active_platform"] = platform
            self._global_stats["switch_count"] += 1

            # 发布状态变更事件
            await self._publish_status_changed(platform, "connecting", "connected")

            logger.info(f"Connected to {platform} room/user: {identifier}")

            return {
                "success": True,
                "platform": platform,
                "identifier": identifier,
                "message": "连接成功",
            }
        else:
            error_msg = f"Failed to start {platform} collector"
            await self._publish_status_changed(platform, "connecting", "error", error_msg)
            return {
                "success": False,
                "error": error_msg,
            }

    async def disconnect(self) -> Dict[str, Any]:
        """断开当前采集器"""
        if not self._active_collector:
            return {"success": True, "message": "没有活跃的采集器"}

        success = await self._stop_active()
        return {
            "success": success,
            "message": "已断开连接" if success else "断开失败",
        }

    async def switch_platform(self, platform: str, identifier: str, **kwargs) -> Dict[str, Any]:
        """切换平台（兼容旧接口）"""
        return await self.connect(platform, identifier, **kwargs)

    async def get_status(self) -> Dict[str, Any]:
        """获取全局状态"""
        return {
            "status": "success",
            "active_platform": self._active_platform,
            "available_platforms": self._registry.get_platforms(),
            "total_messages": self._global_stats["total_messages"],
            "total_errors": self._global_stats["total_errors"],
            "switch_count": self._global_stats["switch_count"],
        }

    def get_available_platforms(self) -> List[str]:
        """获取可用平台列表"""
        return self._registry.get_platforms()

    async def _stop_active(self) -> bool:
        """停止当前活跃采集器"""
        if not self._active_collector:
            return True

        try:
            success = await self._active_collector.stop()
            if self._active_platform:
                await self._publish_status_changed(
                    self._active_platform, "connected", "disconnected"
                )
            self._active_collector = None
            self._active_platform = None
            self._global_stats["active_platform"] = None
            return success
        except Exception as e:
            logger.error(f"Error stopping active collector: {e}")
            return False

    async def _on_message(self, message: Dict[str, Any]) -> None:
        """
        采集器消息回调 - 转换为 UnifiedDanmakuEvent 并发布到 EventBus
        """
        try:
            # 更新统计
            self._global_stats["total_messages"] += 1

            # 转换为统一事件
            event = UnifiedDanmakuEvent.from_dict(message)

            # 发布到 EventBus（Stage 层订阅）
            await self._event_bus.publish(event)

            logger.debug(
                f"[{event.platform}] {event.username}: {event.text[:50]}"
            )

        except Exception as e:
            self._global_stats["total_errors"] += 1
            logger.error(f"Error processing collector message: {e}", exc_info=True)

    async def _publish_status_changed(
        self, 
        platform: str, 
        old_status: str, 
        new_status: str,
        error_message: Optional[str] = None,
    ) -> None:
        """发布状态变更事件"""
        from app.domain.danmaku.events import CollectorStatus
        try:
            old = CollectorStatus(old_status)
            new = CollectorStatus(new_status)
            event = CollectorStatusChangedEvent(
                platform=platform,
                old_status=old,
                new_status=new,
                error_message=error_message,
            )
            await self._event_bus.publish(event)
        except Exception as e:
            logger.error(f"Error publishing status change: {e}")


def create_collector_manager(
    registry: Optional[CollectorRegistry] = None,
    event_bus: Optional[EventBus] = None,
) -> CollectorManager:
    """工厂函数"""
    return CollectorManager(registry=registry, event_bus=event_bus)

