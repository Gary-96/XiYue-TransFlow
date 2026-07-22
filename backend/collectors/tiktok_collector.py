"""
TikTok Collector Implementation
Extends BaseCollector to implement TikTok Live stream collection
"""
import asyncio
import logging
import json
import re
import time
from typing import Optional, Dict, Any, List
from dataclasses import dataclass
from enum import Enum
import threading
from queue import Queue, Empty

from .base import BaseCollector, CollectorError

# Try to import TikTokLive
try:
    import TikTokLive
    from TikTokLive.client import TikTokLiveClient
    TIKTOK_AVAILABLE = True
except ImportError:
    TIKTOK_AVAILABLE = False
    logging.warning("TikTokLive not installed. Please install: pip install TikTokLive")

logger = logging.getLogger(__name__)

class LanguageType(Enum):
    """Supported language types"""
    CHINESE = "zh"
    VIETNAMESE = "vi"
    ENGLISH = "en"
    UNKNOWN = "unknown"

class LanguageDetector:
    """Language detection for TikTok comments"""
    
    def __init__(self):
        # Chinese character ranges
        self.chinese_pattern = re.compile(r'[\u4e00-\u9fff\u3400-\u4dbf\U00020000-\U0002a6df\U0002a700-\U0002b73f\U0002b740-\U0002b81f\U0002b820-\U0002ceaf\uf900-\ufaff\u3300-\u33ff\ufe30-\ufe4f\uf900-\ufaff\u2f800-\u2fa1f]')
        
        # Vietnamese characters
        self.vietnamese_pattern = re.compile(r'[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸ]')
        
        # English pattern
        self.english_pattern = re.compile(r'^[a-zA-Z\s\d\W]+$')
    
    def detect_language(self, text: str) -> LanguageType:
        """Detect language of text"""
        if not text or not text.strip():
            return LanguageType.UNKNOWN
        
        text = text.strip()
        
        # Check for Vietnamese
        if self.vietnamese_pattern.search(text):
            vi_chars = len(self.vietnamese_pattern.findall(text))
            if vi_chars > 0:
                return LanguageType.VIETNAMESE
        
        # Check for Chinese
        if self.chinese_pattern.search(text):
            chinese_chars = len(self.chinese_pattern.findall(text))
            total_chars = len(text.replace(' ', ''))
            
            if chinese_chars / max(total_chars, 1) > 0.3:  # 30%+ Chinese characters
                return LanguageType.CHINESE
        
        # Check for English
        if self.english_pattern.match(text):
            return LanguageType.ENGLISH
        
        return LanguageType.UNKNOWN

class TikTokCollector(BaseCollector):
    """TikTok live stream collector implementation"""
    
    def __init__(self, message_callback=None):
        super().__init__("tiktok", message_callback)
        
        self.client = None
        self.current_host_id = None
        self.language_detector = LanguageDetector()
        self.comment_queue = Queue(maxsize=1000)
        
        # TikTok-specific stats
        self.stats.update({
            "total_comments": 0,
            "chinese_comments": 0,
            "vietnamese_comments": 0,
            "english_comments": 0,
            "gifts_received": 0
        })
        
        if not TIKTOK_AVAILABLE:
            raise CollectorError(
                "TikTokLive library not available. Install with: pip install TikTokLive",
                "tiktok",
                "LIBRARY_NOT_AVAILABLE"
            )
    
    async def start(self, identifier: str, **kwargs) -> bool:
        """
        Start collecting from TikTok stream
        
        Args:
            identifier: TikTok host ID (@username)
            **kwargs: Additional parameters (auto_translate, etc.)
            
        Returns:
            True if successfully started, False otherwise
        """
        try:
            if self.is_running:
                logger.warning("TikTok collector is already running")
                return False
            
            # Clean host ID
            host_id = identifier.strip()
            if host_id.startswith('@'):
                host_id = host_id[1:]
            
            self.current_host_id = host_id
            self.stats["connection_time"] = time.time()
            
            # Create TikTokLive client
            self.client = TikTokLiveClient(unique_id=host_id)
            
            # Set up event handlers
            self._setup_event_handlers()
            
            # Start client in background thread
            def run_client():
                try:
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    loop.run_until_complete(self.client.start())
                except Exception as e:
                    logger.error(f"TikTok client error: {str(e)}")
                    self.is_connected = False
                    self.is_running = False
            
            # Run in background thread
            client_thread = threading.Thread(target=run_client, daemon=True)
            client_thread.start()
            
            # Wait for connection
            for _ in range(30):  # 30 seconds timeout
                if self.is_connected:
                    self.is_running = True
                    logger.info(f"TikTok collector started for @{host_id}")
                    
                    # Send startup message
                    await self.send_message({
                        "type": "collector_started",
                        "host_id": host_id,
                        "message": f"TikTok collector started for @{host_id}"
                    })
                    
                    return True
                await asyncio.sleep(1)
            
            logger.error("TikTok connection timeout")
            return False
            
        except Exception as e:
            logger.error(f"Failed to start TikTok collector: {str(e)}")
            raise CollectorError(f"Failed to start: {str(e)}", "tiktok", "START_FAILED")
    
    async def stop(self) -> bool:
        """
        Stop collecting from TikTok stream
        
        Returns:
            True if successfully stopped, False otherwise
        """
        try:
            if not self.is_running:
                logger.warning("TikTok collector is not running")
                return False
            
            self.is_running = False
            self.is_connected = False
            self.current_host_id = None
            
            if self.client:
                # Note: TikTokLive client doesn't have a direct stop method
                # We'll set flags to handle this in event handlers
                pass
            
            # Clear queue
            while not self.comment_queue.empty():
                try:
                    self.comment_queue.get_nowait()
                except Empty:
                    break
            
            # Send stop message
            await self.send_message({
                "type": "collector_stopped",
                "message": "TikTok collector stopped"
            })
            
            logger.info("TikTok collector stopped")
            return True
            
        except Exception as e:
            logger.error(f"Failed to stop TikTok collector: {str(e)}")
            raise CollectorError(f"Failed to stop: {str(e)}", "tiktok", "STOP_FAILED")
    
    def _setup_event_handlers(self):
        """Set up TikTokLive event handlers"""
        
        @self.client.on("connect")
        async def on_connect():
            self.is_connected = True
            logger.info(f"Connected to TikTok stream: @{self.current_host_id}")
            
            # Send connection message
            asyncio.create_task(self.send_message({
                "type": "platform_connected",
                "host_id": self.current_host_id,
                "message": f"Connected to TikTok stream: @{self.current_host_id}"
            }))
        
        @self.client.on("disconnect")
        async def on_disconnect():
            self.is_connected = False
            self.is_running = False
            logger.info(f"Disconnected from TikTok stream: @{self.current_host_id}")
            
            # Send disconnection message
            asyncio.create_task(self.send_message({
                "type": "platform_disconnected",
                "host_id": self.current_host_id,
                "message": f"Disconnected from TikTok stream: @{self.current_host_id}"
            }))
        
        @self.client.on("comment")
        async def on_comment(comment):
            await self._process_comment(comment)
        
        @self.client.on("gift")
        async def on_gift(gift):
            await self._process_gift(gift)
        
        @self.client.on("member")
        async def on_member(member):
            # Handle new member joins
            username = getattr(member, 'username', 'New User')
            asyncio.create_task(self.send_message({
                "type": "member_join",
                "user": username,
                "text": f"{username} joined the stream",
                "message": f"{username} joined the stream"
            }))
        
        @self.client.on("room_update")
        async def on_room_update(room_info):
            # Handle room info updates
            viewer_count = getattr(room_info, 'viewer_count', 0)
            asyncio.create_task(self.send_message({
                "type": "room_stats",
                "text": f"Viewers: {viewer_count}",
                "viewer_count": viewer_count,
                "message": f"Current viewers: {viewer_count}"
            }))
    
    async def _process_comment(self, comment):
        """Process incoming comment"""
        try:
            # Extract comment data
            user_id = getattr(comment, 'user_id', '')
            username = getattr(comment, 'username', 'Anonymous')
            content = getattr(comment, 'text', '')
            
            if not content or not content.strip():
                return
            
            # Detect language
            language = self.language_detector.detect_language(content)
            
            # Update stats
            self.stats["total_comments"] += 1
            
            if language == LanguageType.CHINESE:
                self.stats["chinese_comments"] += 1
            elif language == LanguageType.VIETNAMESE:
                self.stats["vietnamese_comments"] += 1
            elif language == LanguageType.ENGLISH:
                self.stats["english_comments"] += 1
            
            # Send unified message
            await self.send_message({
                "type": "comment",
                "user": username,
                "text": content,
                "language": language.value,
                "user_id": user_id,
                "message": f"{username}: {content}"
            })
            
        except Exception as e:
            logger.error(f"Error processing TikTok comment: {str(e)}")
            self.stats["errors"] += 1
    
    async def _process_gift(self, gift):
        """Process incoming gift"""
        try:
            username = getattr(gift, 'username', 'Anonymous')
            gift_name = getattr(gift, 'gift_name', 'Unknown Gift')
            gift_count = getattr(gift, 'count', 1)
            
            # Update stats
            self.stats["gifts_received"] += 1
            
            # Send unified message
            await self.send_message({
                "type": "gift",
                "user": username,
                "text": f"sent {gift_count} {gift_name}",
                "gift_name": gift_name,
                "gift_count": gift_count,
                "message": f"{username} sent {gift_count}x {gift_name}"
            })
            
        except Exception as e:
            logger.error(f"Error processing TikTok gift: {str(e)}")
            self.stats["errors"] += 1

# Factory function
def create_tiktok_collector(message_callback=None) -> Optional[TikTokCollector]:
    """Create TikTok collector instance"""
    try:
        return TikTokCollector(message_callback)
    except CollectorError as e:
        logger.error(f"Cannot create TikTok collector: {str(e)}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error creating TikTok collector: {str(e)}")
        return None
