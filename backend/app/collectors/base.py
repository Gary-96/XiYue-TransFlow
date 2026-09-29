"""
乐曼同传 · Base Collector - 平台采集器抽象基类
职责：只负责采集、解析、标准化为 UnifiedDanmakuEvent
不直接持有 WebSocket，不直接调用翻译/AI
"""
from __future__ import annotations

import asyncio
import logging
from abc import ABC, abstractmethod
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)


class BaseCollector(ABC):
    """所有平台采集器的抽象基类"""

    def __init__(self, platform_name: str, message_callback: Optional[Callable[[Dict[str, Any]], None]] = None):
        self.platform_name = platform_name
        self.message_callback = message_callback  # 向后兼容：旧模式回调
        self.is_running = False
        self.is_connected = False
        self._active_room_id: Optional[str] = None

        # 统计
        self.stats = {
            "total_messages": 0,
            "connection_time": 0.0,
            "last_message_time": 0.0,
            "errors": 0,
        }

        logger.info(f"{platform_name} collector initialized")

    @abstractmethod
    async def start(self, identifier: str, **kwargs) -> bool:
        """启动采集器连接指定房间/用户"""
        pass

    @abstractmethod
    async def stop(self) -> bool:
        """停止采集器"""
        pass

    async def send_message(self, message: Dict[str, Any]) -> None:
        """
        发送标准化消息。
        新架构：通过 message_callback 或 EventBus 分发
        """
        try:
            # 更新统计
            self.stats["total_messages"] += 1
            import time
            self.stats["last_message_time"] = time.time()

            # 转发给上游（新架构中通过 EventBus，此处保留兼容性）
            if self.message_callback:
                try:
                    if asyncio.iscoroutinefunction(self.message_callback):
                        await self.message_callback(message)
                    else:
                        self.message_callback(message)
                except Exception as cb_err:
                    logger.error(f"Error in message_callback: {cb_err}")

            logger.debug(f"[{self.platform_name}] {message.get('user')}: {message.get('text')}")

        except Exception as e:
            logger.error(f"Error sending message: {e}")
            self.stats["errors"] += 1

    def set_active_room(self, room_id: str) -> None:
        """设置当前活跃房间"""
        self._active_room_id = room_id
        import time
        self.stats["connection_time"] = time.time()

    def get_stats(self) -> Dict[str, Any]:
        """获取采集器统计"""
        import time
        uptime = time.time() - self.stats["connection_time"] if self.stats["connection_time"] > 0 else 0
        return {
            **self.stats,
            "platform": self.platform_name,
            "is_running": self.is_running,
            "is_connected": self.is_connected,
            "uptime_seconds": uptime,
            "active_room": self._active_room_id,
        }

    def reset_stats(self) -> None:
        """重置统计"""
        import time
        self.stats = {
            "total_messages": 0,
            "connection_time": time.time(),
            "last_message_time": 0,
            "errors": 0,
        }
        logger.info(f"{self.platform_name} stats reset")


class CollectorError(Exception):
    """采集器自定义异常"""

    def __init__(self, message: str, platform: str, error_code: str = None):
        super().__init__(f"[{platform}] {message}")
        self.platform = platform
        self.error_code = error_code
        self.message = message
