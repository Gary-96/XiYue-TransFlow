"""
Platform Collector Manager
Manages multiple platform collectors with dynamic switching
"""

import asyncio
from enum import Enum
import json
import logging
from typing import Any, Dict, List, Optional

from .base import BaseCollector, CollectorError
from .douyin_collector import create_douyin_collector
from .tiktok_collector import create_tiktok_collector

logger = logging.getLogger(__name__)


class PlatformType(Enum):
    """Supported platform types"""

    TIKTOK = "tiktok"
    DOUYIN = "douyin"


class CollectorManager:
    """Manager for multiple platform collectors"""

    def __init__(self, message_callback=None):
        self.message_callback = message_callback
        self.collectors: Dict[str, BaseCollector] = {}
        self.active_platform: Optional[str] = None
        self.websocket_clients = set()

        # Global stats
        self.global_stats = {
            "total_platforms": 0,
            "active_platform": None,
            "total_messages": 0,
            "total_errors": 0,
            "switch_count": 0,
        }

        # Initialize all available collectors
        self._initialize_collectors()

    def _initialize_collectors(self):
        """Initialize all available collectors"""
        try:
            # Initialize TikTok collector
            tiktok_collector = create_tiktok_collector(
                self._on_collector_message
            )
            if tiktok_collector:
                self.collectors[PlatformType.TIKTOK.value] = tiktok_collector
                logger.info("TikTok collector initialized")
            else:
                logger.warning("Failed to initialize TikTok collector")

            # Initialize Douyin collector
            douyin_collector = create_douyin_collector(
                self._on_collector_message
            )
            if douyin_collector:
                self.collectors[PlatformType.DOUYIN.value] = douyin_collector
                logger.info("Douyin collector initialized")
            else:
                logger.warning("Failed to initialize Douyin collector")

            # Update global stats
            self.global_stats["total_platforms"] = len(self.collectors)

            logger.info(
                f"Collector manager initialized with {len(self.collectors)} platforms"
            )

        except Exception as e:
            logger.error(f"Failed to initialize collectors: {str(e)}")

    async def _on_collector_message(self, message: Dict[str, Any]):
        """
        Handle messages from collectors and forward to main callback.
        Note: WebSocket broadcasting is handled natively inside BaseCollector.
        """
        try:
            # Update global stats
            self.global_stats["total_messages"] += 1

            # Safe Forward to main callback (Supports both sync & async callbacks)
            if self.message_callback:
                if asyncio.iscoroutinefunction(self.message_callback):
                    await self.message_callback(message)
                else:
                    self.message_callback(message)

        except Exception as e:
            logger.error(f"Error handling collector message: {str(e)}")
            self.global_stats["total_errors"] += 1

    async def switch_platform(
        self, platform: str, identifier: str, **kwargs
    ) -> Dict[str, Any]:
        """Switch to a different platform or restart connection for same platform"""
        try:
            platform = platform.lower()

            if platform not in self.collectors:
                return {
                    "success": False,
                    "error": f"Unsupported platform: {platform}",
                    "available_platforms": list(self.collectors.keys()),
                }

            # Stop current active platform if running
            if self.active_platform:
                await self.stop_current_platform()

            # Start new platform
            collector = self.collectors[platform]

            # Ensure current WebSocket clients are attached to the collector
            for ws in list(self.websocket_clients):
                collector.add_websocket_client(ws)

            # Start the collector
            success = await collector.start(identifier, **kwargs)

            if success:
                old_platform = self.active_platform
                self.active_platform = platform
                self.global_stats["active_platform"] = platform
                self.global_stats["switch_count"] += 1

                logger.info(
                    f"Switched to platform: {platform} ({identifier})"
                )

                return {
                    "success": True,
                    "platform": platform,
                    "identifier": identifier,
                    "previous_platform": old_platform,
                    "message": f"Successfully switched to {platform}",
                }
            else:
                return {
                    "success": False,
                    "error": f"Failed to start {platform} collector",
                    "platform": platform,
                }

        except Exception as e:
            logger.error(f"Error switching platform: {str(e)}")
            self.global_stats["total_errors"] += 1

            return {
                "success": False,
                "error": f"Platform switch failed: {str(e)}",
                "platform": platform,
            }

    async def stop_current_platform(self) -> bool:
        """Stop the currently active platform"""
        try:
            if not self.active_platform:
                logger.warning("No active platform to stop")
                return True

            collector = self.collectors.get(self.active_platform)
            if collector:
                success = await collector.stop()
                if success:
                    logger.info(f"Stopped platform: {self.active_platform}")
                    self.active_platform = None
                    self.global_stats["active_platform"] = None
                    return True
                else:
                    logger.error(
                        f"Failed to stop platform: {self.active_platform}"
                    )
                    return False
            else:
                logger.warning(
                    f"Collector not found for platform: {self.active_platform}"
                )
                self.active_platform = None
                self.global_stats["active_platform"] = None
                return True

        except Exception as e:
            logger.error(f"Error stopping platform: {str(e)}")
            self.global_stats["total_errors"] += 1
            return False

    async def stop_all_platforms(self) -> bool:
        """Stop all platforms"""
        try:
            success_count = 0
            total_count = len(self.collectors)

            for platform_name, collector in self.collectors.items():
                try:
                    if collector.is_running:
                        success = await collector.stop()
                        if success:
                            success_count += 1
                            logger.info(f"Stopped platform: {platform_name}")
                        else:
                            logger.error(
                                f"Failed to stop platform: {platform_name}"
                            )
                except Exception as e:
                    logger.error(
                        f"Error stopping platform {platform_name}: {str(e)}"
                    )
                    self.global_stats["total_errors"] += 1

            self.active_platform = None
            self.global_stats["active_platform"] = None

            logger.info(f"Stopped {success_count}/{total_count} platforms")
            return success_count == total_count

        except Exception as e:
            logger.error(f"Error stopping all platforms: {str(e)}")
            self.global_stats["total_errors"] += 1
            return False

    def get_active_platform(self) -> Optional[str]:
        """Get currently active platform"""
        return self.active_platform

    def get_platform_status(self, platform: str = None) -> Dict[str, Any]:
        """Get status of specific platform or all platforms"""
        try:
            if platform:
                collector = self.collectors.get(platform.lower())
                if collector:
                    return {
                        "platform": platform,
                        "stats": collector.get_stats(),
                        "is_active": self.active_platform == platform.lower(),
                    }
                else:
                    return {
                        "platform": platform,
                        "error": "Platform not available",
                        "is_active": False,
                    }
            else:
                platforms_status = {}
                for platform_name, collector in self.collectors.items():
                    platforms_status[platform_name] = {
                        "stats": collector.get_stats(),
                        "is_active": self.active_platform == platform_name,
                        "available": True,
                    }

                return {
                    "active_platform": self.active_platform,
                    "global_stats": self.global_stats,
                    "platforms": platforms_status,
                    "available_platforms": list(self.collectors.keys()),
                }

        except Exception as e:
            logger.error(f"Error getting platform status: {str(e)}")
            return {"error": f"Failed to get status: {str(e)}"}

    def get_available_platforms(self) -> List[str]:
        """Get list of available platforms"""
        return list(self.collectors.keys())

    def is_platform_available(self, platform: str) -> bool:
        """Check if platform is available"""
        return platform.lower() in self.collectors

    def add_websocket_client(self, websocket):
        """Add WebSocket client to manager and all underlying collectors"""
        self.websocket_clients.add(websocket)

        for collector in self.collectors.values():
            collector.add_websocket_client(websocket)

        logger.info(
            f"WebSocket client added to manager. Total: {len(self.websocket_clients)}"
        )

    def remove_websocket_client(self, websocket):
        """Remove WebSocket client from manager and all underlying collectors"""
        self.websocket_clients.discard(websocket)

        for collector in self.collectors.values():
            collector.remove_websocket_client(websocket)

        logger.info(
            f"WebSocket client removed from manager. Total: {len(self.websocket_clients)}"
        )

    def get_global_stats(self) -> Dict[str, Any]:
        """Get global manager statistics"""
        return {
            **self.global_stats,
            "websocket_clients": len(self.websocket_clients),
            "active_platform": self.active_platform,
            "available_platforms": list(self.collectors.keys()),
        }

    def reset_stats(self):
        """Reset all statistics"""
        self.global_stats = {
            "total_platforms": len(self.collectors),
            "active_platform": self.active_platform,
            "total_messages": 0,
            "total_errors": 0,
            "switch_count": 0,
        }

        for collector in self.collectors.values():
            collector.reset_stats()

        logger.info("Manager stats reset")


def create_collector_manager(message_callback=None) -> CollectorManager:
    """Create collector manager instance"""
    try:
        return CollectorManager(message_callback)
    except Exception as e:
        logger.error(f"Cannot create collector manager: {str(e)}")
        return None