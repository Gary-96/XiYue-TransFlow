"""
TikTok Collector Implementation (v6 API)
Extends BaseCollector to implement TikTok Live stream collection using TikTokLive v6.6.6
"""
import asyncio
import logging
import re
import time
from typing import Optional, Dict, Any, Callable, TYPE_CHECKING
from enum import Enum

from .base import BaseCollector, CollectorError

# Try to import TikTokLive v6
try:
    from TikTokLive import TikTokLiveClient
    from TikTokLive.events import (
        ConnectEvent, DisconnectEvent, CommentEvent, GiftEvent,
        LikeEvent, JoinEvent, FollowEvent, ShareEvent, RoomUserSeqEvent,
        LiveEndEvent
    )
    TIKTOK_AVAILABLE = True
except ImportError:
    TIKTOK_AVAILABLE = False
    logging.warning("TikTokLive not installed. Install with: pip install TikTokLive")
    TikTokLiveClient = Any  # type: ignore[assignment]
    ConnectEvent = Any  # type: ignore[misc]
    DisconnectEvent = Any  # type: ignore[misc]
    CommentEvent = Any  # type: ignore[misc]
    GiftEvent = Any  # type: ignore[misc]
    LikeEvent = Any  # type: ignore[misc]
    JoinEvent = Any  # type: ignore[misc]
    FollowEvent = Any  # type: ignore[misc]
    ShareEvent = Any  # type: ignore[misc]
    RoomUserSeqEvent = Any  # type: ignore[misc]
    LiveEndEvent = Any  # type: ignore[misc]

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
        self.chinese_pattern = re.compile(
            r'[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]'
        )
        self.vietnamese_pattern = re.compile(
            r'[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễ'
            r'ìíịỉĩòóọỏõôồốộổỗơờớợởỡ'
            r'ùúụủũưừứựửữỳýỵỷỹđĐÀÁẠẢÃÂẦẤẬẨẪ'
            r'ĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕ'
            r'ÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸ]'
        )
        self.english_pattern = re.compile(r'^[a-zA-Z\s\d\W]+$')

    def detect_language(self, text: str) -> LanguageType:
        if not text or not text.strip():
            return LanguageType.UNKNOWN
        text = text.strip()
        if self.vietnamese_pattern.search(text):
            return LanguageType.VIETNAMESE
        if self.chinese_pattern.search(text):
            chinese_chars = len(self.chinese_pattern.findall(text))
            total_chars = len(text.replace(' ', ''))
            if chinese_chars / max(total_chars, 1) > 0.3:
                return LanguageType.CHINESE
        if self.english_pattern.match(text):
            return LanguageType.ENGLISH
        return LanguageType.UNKNOWN


class TikTokCollector(BaseCollector):
    """TikTok live stream collector implementation (TikTokLive v6)"""

    def __init__(self, message_callback: Optional[Callable] = None):
        super().__init__("tiktok", message_callback)

        self.client: Optional[TikTokLiveClient] = None
        self.current_host_id: Optional[str] = None
        self.language_detector = LanguageDetector()
        self._client_task: Optional[asyncio.Task] = None

        # TikTok-specific stats
        self.stats.update({
            "total_comments": 0,
            "chinese_comments": 0,
            "vietnamese_comments": 0,
            "english_comments": 0,
            "gifts_received": 0,
            "total_likes": 0,
            "total_follows": 0,
            "total_shares": 0,
            "total_joins": 0,
            "viewer_count": 0,
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
            **kwargs: Additional parameters

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

            # Create TikTokLive v6 client
            self.client = TikTokLiveClient(unique_id=host_id)

            # Set up event handlers
            self._setup_event_handlers()

            # Start client (v6: start() returns asyncio.Task)
            self._client_task = self.client.start(
                process_connect_events=True,
                fetch_room_info=True,
                fetch_gift_info=True,
                fetch_live_check=True,
            )

            # Wait for connection (30s timeout)
            for _ in range(30):
                if self.is_connected:
                    self.is_running = True
                    logger.info(f"TikTok collector started for @{host_id}")

                    await self.send_message({
                        "type": "collector_started",
                        "host_id": host_id,
                        "message": f"TikTok collector started for @{host_id}"
                    })
                    return True
                await asyncio.sleep(1)

            logger.error("TikTok connection timeout")
            if self._client_task and not self._client_task.done():
                self._client_task.cancel()
            return False

        except Exception as e:
            logger.error(f"Failed to start TikTok collector: {e}")
            raise CollectorError(f"Failed to start: {e}", "tiktok", "START_FAILED")

    async def stop(self) -> bool:
        """Stop collecting from TikTok stream"""
        try:
            if not self.is_running:
                logger.warning("TikTok collector is not running")
                return False

            self.is_running = False
            self.is_connected = False

            # Disconnect client
            if self.client:
                try:
                    await self.client.disconnect()
                except Exception as e:
                    logger.warning(f"Error disconnecting TikTok client: {e}")

            # Cancel task
            if self._client_task and not self._client_task.done():
                self._client_task.cancel()
                try:
                    await self._client_task
                except asyncio.CancelledError:
                    pass

            self.current_host_id = None
            self.client = None
            self._client_task = None

            await self.send_message({
                "type": "collector_stopped",
                "message": "TikTok collector stopped"
            })

            logger.info("TikTok collector stopped")
            return True

        except Exception as e:
            logger.error(f"Failed to stop TikTok collector: {e}")
            raise CollectorError(f"Failed to stop: {e}", "tiktok", "STOP_FAILED")

    def _setup_event_handlers(self):
        """Set up TikTokLive v6 event handlers"""

        @self.client.on(ConnectEvent)
        async def on_connect(event: ConnectEvent):
            self.is_connected = True
            logger.info(f"Connected to TikTok stream: @{event.unique_id} (room_id: {event.room_id})")

            asyncio.ensure_future(self.send_message({
                "type": "platform_connected",
                "host_id": event.unique_id,
                "room_id": event.room_id,
                "message": f"Connected to TikTok stream: @{event.unique_id}"
            }))

        @self.client.on(DisconnectEvent)
        async def on_disconnect(event: DisconnectEvent):
            self.is_connected = False
            self.is_running = False
            logger.info(f"Disconnected from TikTok stream: @{self.current_host_id}")

            asyncio.ensure_future(self.send_message({
                "type": "platform_disconnected",
                "host_id": self.current_host_id,
                "message": f"Disconnected from TikTok stream: @{self.current_host_id}"
            }))

        @self.client.on(CommentEvent)
        async def on_comment(event: CommentEvent):
            await self._process_comment(event)

        @self.client.on(GiftEvent)
        async def on_gift(event: GiftEvent):
            await self._process_gift(event)

        @self.client.on(LikeEvent)
        async def on_like(event: LikeEvent):
            await self._process_like(event)

        @self.client.on(JoinEvent)
        async def on_join(event: JoinEvent):
            await self._process_join(event)

        @self.client.on(FollowEvent)
        async def on_follow(event: FollowEvent):
            await self._process_follow(event)

        @self.client.on(ShareEvent)
        async def on_share(event: ShareEvent):
            await self._process_share(event)

        @self.client.on(RoomUserSeqEvent)
        async def on_room_stats(event: RoomUserSeqEvent):
            await self._process_room_stats(event)

        @self.client.on(LiveEndEvent)
        async def on_live_end(event: LiveEndEvent):
            logger.info(f"TikTok live ended for @{self.current_host_id}")
            self.is_connected = False
            self.is_running = False

            asyncio.ensure_future(self.send_message({
                "type": "live_ended",
                "host_id": self.current_host_id,
                "message": f"Live stream ended for @{self.current_host_id}"
            }))

    async def _get_user_info(self, event) -> Dict[str, Any]:
        """Extract user info from event"""
        user = getattr(event, 'user', None)
        if user is None:
            return {"user_id": "", "nickname": "Anonymous", "display_id": ""}

        user_id = getattr(user, 'id', '') or getattr(user, 'user_id', '')
        nickname = getattr(user, 'nickname', '') or 'Anonymous'
        display_id = getattr(user, 'display_id', '')

        return {
            "user_id": str(user_id) if user_id else "",
            "nickname": nickname,
            "display_id": display_id
        }

    async def _process_comment(self, event: CommentEvent):
        """Process incoming comment"""
        try:
            content = event.comment or ''
            if not content.strip():
                return

            user_info = await self._get_user_info(event)

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

            await self.send_message({
                "type": "comment",
                "user": user_info["nickname"],
                "text": content,
                "language": language.value,
                "user_id": user_info["user_id"],
                "display_id": user_info["display_id"],
                "message": f"{user_info['nickname']}: {content}"
            })

        except Exception as e:
            logger.error(f"Error processing TikTok comment: {e}")
            self.stats["errors"] += 1

    async def _process_gift(self, event: GiftEvent):
        """Process incoming gift"""
        try:
            user_info = await self._get_user_info(event)

            # Extract gift info
            gift = getattr(event, 'gift', None)
            gift_name = getattr(gift, 'name', 'Unknown Gift') if gift else 'Unknown Gift'
            diamond_count = getattr(gift, 'diamond_count', 0) if gift else 0
            combo_count = getattr(event, 'combo_count', 1) or 1
            repeat_count = getattr(event, 'repeat_count', 1) or 1
            gift_count = max(combo_count, repeat_count)

            self.stats["gifts_received"] += 1

            await self.send_message({
                "type": "gift",
                "user": user_info["nickname"],
                "text": f"🎁 {gift_name} x{gift_count}",
                "gift_name": gift_name,
                "gift_count": gift_count,
                "diamond_count": diamond_count,
                "user_id": user_info["user_id"],
                "message": f"{user_info['nickname']} sent {gift_count}x {gift_name}"
            })

        except Exception as e:
            logger.error(f"Error processing TikTok gift: {e}")
            self.stats["errors"] += 1

    async def _process_like(self, event: LikeEvent):
        """Process incoming like"""
        try:
            user_info = await self._get_user_info(event)
            count = getattr(event, 'count', 1) or 1

            self.stats["total_likes"] += 1

            await self.send_message({
                "type": "social",
                "user": user_info["nickname"],
                "text": f"👍 liked {count} times",
                "social_type": "like",
                "like_count": count,
                "user_id": user_info["user_id"],
                "message": f"{user_info['nickname']} liked {count}x"
            })

        except Exception as e:
            logger.error(f"Error processing TikTok like: {e}")
            self.stats["errors"] += 1

    async def _process_join(self, event: JoinEvent):
        """Process member join"""
        try:
            user_info = await self._get_user_info(event)

            self.stats["total_joins"] += 1

            await self.send_message({
                "type": "member_join",
                "user": user_info["nickname"],
                "text": f"{user_info['nickname']} joined the stream",
                "user_id": user_info["user_id"],
                "message": f"{user_info['nickname']} joined the stream"
            })

        except Exception as e:
            logger.error(f"Error processing TikTok join: {e}")
            self.stats["errors"] += 1

    async def _process_follow(self, event: FollowEvent):
        """Process follow"""
        try:
            user_info = await self._get_user_info(event)

            self.stats["total_follows"] += 1

            await self.send_message({
                "type": "social",
                "user": user_info["nickname"],
                "text": f"❤️ followed the streamer",
                "social_type": "follow",
                "user_id": user_info["user_id"],
                "message": f"{user_info['nickname']} followed"
            })

        except Exception as e:
            logger.error(f"Error processing TikTok follow: {e}")
            self.stats["errors"] += 1

    async def _process_share(self, event: ShareEvent):
        """Process share"""
        try:
            user_info = await self._get_user_info(event)

            self.stats["total_shares"] += 1

            await self.send_message({
                "type": "social",
                "user": user_info["nickname"],
                "text": f"📤 shared the stream",
                "social_type": "share",
                "user_id": user_info["user_id"],
                "message": f"{user_info['nickname']} shared"
            })

        except Exception as e:
            logger.error(f"Error processing TikTok share: {e}")
            self.stats["errors"] += 1

    async def _process_room_stats(self, event: RoomUserSeqEvent):
        """Process room stats update"""
        try:
            total = getattr(event, 'total', 0) or 0
            popularity = getattr(event, 'popularity', 0) or 0

            self.stats["viewer_count"] = total

            await self.send_message({
                "type": "room_stats",
                "user": "System",
                "text": f"Viewers: {total}",
                "viewer_count": total,
                "popularity": popularity,
                "message": f"Current viewers: {total}"
            })

        except Exception as e:
            logger.error(f"Error processing TikTok room stats: {e}")
            self.stats["errors"] += 1


# Factory function
def create_tiktok_collector(message_callback: Optional[Callable] = None) -> Optional[TikTokCollector]:
    """Create TikTok collector instance"""
    try:
        return TikTokCollector(message_callback)
    except CollectorError as e:
        logger.error(f"Cannot create TikTok collector: {e}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error creating TikTok collector: {e}")
        return None
