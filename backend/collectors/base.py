"""
Base Collector Class
Defines the interface that all platform collectors must implement
"""
from abc import ABC, abstractmethod
from typing import Optional, Dict, Any, List, Callable
import asyncio
import logging
import json
import time

logger = logging.getLogger(__name__)

class BaseCollector(ABC):
    """Abstract base class for all platform collectors"""
    
    def __init__(self, platform_name: str, message_callback: Optional[Callable] = None):
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
            "errors": 0
        }
        
        logger.info(f"{platform_name} collector initialized")
    
    @abstractmethod
    async def start(self, identifier: str, **kwargs) -> bool:
        """
        Start collecting from the platform
        
        Args:
            identifier: Platform-specific identifier (username, room_id, etc.)
            **kwargs: Additional platform-specific parameters
            
        Returns:
            True if successfully started, False otherwise
        """
        pass
    
    @abstractmethod
    async def stop(self) -> bool:
        """
        Stop collecting from the platform
        
        Returns:
            True if successfully stopped, False otherwise
        """
        pass
    
    async def send_message(self, message: Dict[str, Any]):
        """
        Send collected message to callback
        
        Args:
            message: Message in unified format {user, text, platform}
        """
        try:
            # Ensure unified format
            unified_message = {
                "user": message.get("user", "Unknown"),
                "text": message.get("text", ""),
                "platform": self.platform_name,
                "timestamp": message.get("timestamp", time.time()),
                **message  # Include any additional fields
            }
            
            # Update stats
            self.stats["total_messages"] += 1
            self.stats["last_message_time"] = unified_message["timestamp"]
            
            # Send to callback
            if self.message_callback:
                await self.message_callback(unified_message)
            
            # Also broadcast to WebSocket clients
            await self._broadcast_to_websockets(unified_message)
            
            logger.info(f"{self.platform_name} message: {unified_message['user']}: {unified_message['text']}")
            
        except Exception as e:
            logger.error(f"Error sending message: {str(e)}")
            self.stats["errors"] += 1
    
    async def _broadcast_to_websockets(self, message: Dict[str, Any]):
        """Broadcast message to all WebSocket clients"""
        if not self.websocket_clients:
            return
        
        import json
        message_str = json.dumps(message, ensure_ascii=False)
        disconnected_clients = set()
        
        for websocket in self.websocket_clients:
            try:
                # Check if it's a FastAPI WebSocket
                if hasattr(websocket, 'send_text'):
                    await websocket.send_text(message_str)
            except Exception as e:
                logger.error(f"Failed to send to WebSocket client: {str(e)}")
                disconnected_clients.add(websocket)
        
        # Remove disconnected clients
        for client in disconnected_clients:
            self.websocket_clients.discard(client)
    
    def add_websocket_client(self, websocket):
        """Add WebSocket client for broadcasting"""
        self.websocket_clients.add(websocket)
        logger.info(f"{self.platform_name} WebSocket client added. Total: {len(self.websocket_clients)}")
    
    def remove_websocket_client(self, websocket):
        """Remove WebSocket client"""
        self.websocket_clients.discard(websocket)
        logger.info(f"{self.platform_name} WebSocket client removed. Total: {len(self.websocket_clients)}")
    
    def get_stats(self) -> Dict[str, Any]:
        """Get collector statistics"""
        current_time = time.time()
        uptime = current_time - self.stats["connection_time"] if self.stats["connection_time"] > 0 else 0
        
        return {
            **self.stats,
            "platform": self.platform_name,
            "is_running": self.is_running,
            "is_connected": self.is_connected,
            "uptime_seconds": uptime,
            "websocket_clients": len(self.websocket_clients)
        }
    
    def reset_stats(self):
        """Reset statistics"""
        self.stats = {
            "total_messages": 0,
            "connection_time": time.time(),
            "last_message_time": 0,
            "errors": 0
        }
        logger.info(f"{self.platform_name} stats reset")

class CollectorError(Exception):
    """Custom exception for collector errors"""
    def __init__(self, message: str, platform: str, error_code: str = None):
        super().__init__(f"[{platform}] {message}")
        self.platform = platform
        self.error_code = error_code
        self.message = message
