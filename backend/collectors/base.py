"""
Base Collector Class
Defines the interface that all platform collectors must implement
"""

from abc import ABC, abstractmethod
import asyncio
import json
import logging
import time
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)


class BaseCollector(ABC):
    """Abstract base class for all platform collectors"""

    def __init__(
        self, platform_name: str, message_callback: Optional[Callable] = None
    ):
        self.platform_name = platform_name
        self.message_callback = message_callback
        self.is_running = False
        self.is_connected = False
        self.websocket_clients = set()

        # Statistics
        self.stats = {
            "total_messages": 0,
            "connection_time": 0,
            "last_message_time": 0,
            "errors": 0,
        }

        logger.info(f"{platform_name} collector initialized")

    @abstractmethod
    async def start(self, identifier: str, **kwargs) -> bool:
        """Start collecting from the platform"""
        pass

    @abstractmethod
    async def stop(self) -> bool:
        """Stop collecting from the platform"""
        pass

    async def send_message(self, message: Dict[str, Any]):
        """Send collected message to callback and broadcast via WebSocket"""
        try:
            # Ensure unified format
            unified_message = {
                "user": message.get("user", "Unknown"),
                "text": message.get("text", ""),
                "platform": self.platform_name,
                "timestamp": message.get("timestamp", time.time()),
                **message,  # Include any additional fields
            }

            # Update stats
            self.stats["total_messages"] += 1
            self.stats["last_message_time"] = unified_message["timestamp"]

            # 1. 安全调用 message_callback（兼容同步与异步回调函数）
            if self.message_callback:
                try:
                    if asyncio.iscoroutinefunction(self.message_callback):
                        await self.message_callback(unified_message)
                    else:
                        self.message_callback(unified_message)
                except Exception as cb_err:
                    logger.error(
                        f"Error in message_callback: {str(cb_err)}"
                    )

            # 2. 并发广播给所有 WebSocket 客户端
            await self._broadcast_to_websockets(unified_message)

            logger.debug(
                f"[{self.platform_name}] {unified_message.get('user')}: {unified_message.get('text')}"
            )

        except Exception as e:
            logger.error(f"Error sending message: {str(e)}")
            self.stats["errors"] += 1

    async def _broadcast_to_websockets(self, message: Dict[str, Any]):
        """Broadcast message concurrently to all WebSocket clients"""
        if not self.websocket_clients:
            return

        message_str = json.dumps(message, ensure_ascii=False)
        disconnected_clients = set()

        async def _send_safe(ws):
            try:
                if hasattr(ws, "send_text"):
                    # 设置 2 秒超时，防止某一个慢客户端拖慢整体广播速度
                    await asyncio.wait_for(
                        ws.send_text(message_str), timeout=2.0
                    )
            except Exception as e:
                logger.warning(f"Failed to send to WebSocket client: {str(e)}")
                disconnected_clients.add(ws)

        # 使用 asyncio.gather 实现并发分发，避免阻塞主循环
        tasks = [_send_safe(ws) for ws in list(self.websocket_clients)]
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

        # 移除断开连接的客户端
        for client in disconnected_clients:
            self.websocket_clients.discard(client)

    def add_websocket_client(self, websocket):
        """Add WebSocket client for broadcasting"""
        self.websocket_clients.add(websocket)
        logger.info(
            f"{self.platform_name} WebSocket client added. Total: {len(self.websocket_clients)}"
        )

    def remove_websocket_client(self, websocket):
        """Remove WebSocket client"""
        self.websocket_clients.discard(websocket)
        logger.info(
            f"{self.platform_name} WebSocket client removed. Total: {len(self.websocket_clients)}"
        )

    def get_stats(self) -> Dict[str, Any]:
        """Get collector statistics"""
        current_time = time.time()
        uptime = (
            current_time - self.stats["connection_time"]
            if self.stats["connection_time"] > 0
            else 0
        )

        return {
            **self.stats,
            "platform": self.platform_name,
            "is_running": self.is_running,
            "is_connected": self.is_connected,
            "uptime_seconds": uptime,
            "websocket_clients": len(self.websocket_clients),
        }

    def reset_stats(self):
        """Reset statistics"""
        self.stats = {
            "total_messages": 0,
            "connection_time": time.time(),
            "last_message_time": 0,
            "errors": 0,
        }
        logger.info(f"{self.platform_name} stats reset")


class CollectorError(Exception):
    """Custom exception for collector errors"""

    def __init__(
        self, message: str, platform: str, error_code: str = None
    ):
        super().__init__(f"[{platform}] {message}")
        self.platform = platform
        self.error_code = error_code
        self.message = message