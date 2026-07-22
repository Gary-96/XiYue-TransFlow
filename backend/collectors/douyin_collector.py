"""
Douyin Live Collector - Real implementation using DouYin_Spider
Supports: comments, gifts, members, likes, follows, room stats
Uses WebSocket + Protobuf protocol (same as DouYin_Spider)
"""
import asyncio
import gzip
import json
import logging
import os
import sys
import time
import threading
from typing import Optional, Dict, Any, Callable

# Add backend path for imports
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

from collectors.base import BaseCollector, CollectorError
from builder.auth import DouyinAuth
from builder.header import HeaderBuilder
from builder.params import Params
from dy_apis.douyin_api import DouyinAPI
from utils.dy_util import generate_signature, generate_msToken, trans_cookies
from utils.common_util import load_env
import static.Live_pb2 as Live_pb2

logger = logging.getLogger(__name__)


class DouyinLiveConnection:
    """Real Douyin WebSocket live stream connection (from DouYin_Spider)"""

    def __init__(self, collector: "DouyinCollector", live_id: str, auth: DouyinAuth):
        self.collector = collector
        self.live_id = live_id
        self.auth = auth
        self.ws_app = None
        self._running = False
        self._thread: Optional[threading.Thread] = None

    def ping(self, ws):
        """Keep-alive heartbeat"""
        while self._running:
            frame = Live_pb2.PushFrame()
            frame.payloadType = "hb"
            try:
                ws.send(frame.SerializeToString(), opcode=0x02)
                time.sleep(5)
            except Exception as e:
                logger.debug(f"Heartbeat error: {e}")
                break

    def on_open(self, ws, *args, **kwargs):
        logger.info("Douyin WebSocket opened")
        self._running = True
        self.collector._set_connected(True)
        threading.Thread(target=self.ping, args=(ws,), daemon=True).start()

    def on_message(self, ws, message):
        try:
            frame = Live_pb2.PushFrame()
            frame.ParseFromString(message)
            origin_bytes = gzip.decompress(frame.payload)
            response = Live_pb2.LiveResponse()
            response.ParseFromString(origin_bytes)

            # Send ACK if needed
            if response.needAck:
                ack = Live_pb2.PushFrame()
                ack.payloadType = "ack"
                ack.payload = response.internalExt.encode("utf-8")
                ack.logId = frame.logId
                ws.send(ack.SerializeToString(), opcode=0x02)

            # Process each message
            for item in response.messagesList:
                method = item.method
                payload = item.payload

                if method == "WebcastChatMessage":
                    msg = Live_pb2.ChatMessage()
                    msg.ParseFromString(payload)
                    self.collector._on_comment(msg.user.nickname, msg.content)

                elif method == "WebcastGiftMessage":
                    msg = Live_pb2.GiftMessage()
                    msg.ParseFromString(payload)
                    gift_name = ""
                    if hasattr(msg, "gift") and msg.gift:
                        gift_name = msg.gift.name if hasattr(msg.gift, "name") else str(msg.giftId)
                    self.collector._on_gift(msg.user.nickname, gift_name, msg.comboCount)

                elif method == "WebcastMemberMessage":
                    msg = Live_pb2.MemberMessage()
                    msg.ParseFromString(payload)
                    self.collector._on_member(msg.user.nickname)

                elif method == "WebcastLikeMessage":
                    msg = Live_pb2.LikeMessage()
                    msg.ParseFromString(payload)
                    self.collector._on_like(msg.user.nickname, msg.count)

                elif method == "WebcastSocialMessage":
                    msg = Live_pb2.SocialMessage()
                    msg.ParseFromString(payload)
                    if msg.action == 1:
                        self.collector._on_follow(msg.user.nickname)

                elif method == "WebcastRoomStatsMessage":
                    msg = Live_pb2.RoomStatsMessage()
                    msg.ParseFromString(payload)
                    self.collector._on_room_stats(msg.displayLong)

        except Exception as e:
            logger.error(f"Error processing message: {e}")

    def on_error(self, ws, error):
        logger.error(f"WebSocket error: {error}")
        self.collector._set_error(str(error))

    def on_close(self, ws, close_status_code, close_msg):
        logger.info(f"WebSocket closed: {close_status_code} {close_msg}")
        self._running = False
        self.collector._set_connected(False)
        # Auto reconnect
        if self.collector._should_reconnect:
            time.sleep(3)
            self.collector._start_connection()

    def start(self):
        """Start the WebSocket connection"""
        try:
            room_info = DouyinAPI.get_live_info(self.auth, self.live_id)
            if not room_info:
                logger.error("Failed to get live room info")
                return False

            room_id = room_info.get("room_id")
            user_id = room_info.get("user_id")
            if not room_id or not user_id:
                logger.error(f"Missing room_id or user_id: {room_info}")
                return False

            # Get webcast detail for cursor and internal_ext
            res = DouyinAPI.get_webcast_detail(
                self.auth, str(user_id), room_id,
                f"https://live.douyin.com/{self.live_id}"
            )
            frame = Live_pb2.LiveResponse()
            frame.ParseFromString(res)

            # Build WebSocket URL with all required params
            params = (Params()
                .add_param('app_name', 'douyin_web')
                .add_param('version_code', '180800')
                .add_param('webcast_sdk_version', '1.0.15')
                .add_param('update_version_code', '1.0.15')
                .add_param('compress', 'gzip')
                .add_param('device_platform', 'web')
                .add_param('cookie_enabled', 'true')
                .add_param('screen_width', '1707')
                .add_param('screen_height', '960')
                .add_param('browser_language', 'zh-CN')
                .add_param('browser_platform', 'Win32')
                .add_param('browser_name', 'Mozilla')
                .add_param('browser_version', HeaderBuilder.ua.split('Mozilla/')[-1])
                .add_param('browser_online', 'true')
                .add_param('tz_name', 'Etc/GMT-8')
                .add_param('cursor', str(frame.cursor))
                .add_param('internal_ext', frame.internalExt)
                .add_param('host', 'https://live.douyin.com')
                .add_param('aid', '6383')
                .add_param('live_id', '1')
                .add_param('did_rule', '3')
                .add_param('endpoint', 'live_pc')
                .add_param('support_wrds', '1')
                .add_param('user_unique_id', str(user_id))
                .add_param('im_path', '/webcast/im/fetch/')
                .add_param('identity', 'audience')
                .add_param('need_persist_msg_count', '15')
                .add_param('insert_task_id', '')
                .add_param('live_reason', '')
                .add_param('room_id', room_id)
                .add_param('heartbeatDuration', '0')
                .add_param('signature', generate_signature(room_id, user_id))
            )

            from urllib.parse import urlencode
            wss_url = f"wss://webcast100-ws-web-hl.douyin.com/webcast/im/push/v2/?{urlencode(params.get())}"

            # Import websocket library
            from websocket import WebSocketApp

            self.ws_app = WebSocketApp(
                url=wss_url,
                header={
                    'Pragma': 'no-cache',
                    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
                    'User-Agent': HeaderBuilder.ua,
                    'Upgrade': 'websocket',
                    'Cache-Control': 'no-cache',
                    'Connection': 'Upgrade',
                },
                cookie=self.auth.cookie_str,
                on_message=self.on_message,
                on_error=self.on_error,
                on_close=self.on_close,
                on_open=self.on_open,
            )

            self._thread = threading.Thread(
                target=self.ws_app.run_forever,
                kwargs={'origin': 'https://live.douyin.com'},
                daemon=True
            )
            self._thread.start()
            return True

        except Exception as e:
            logger.error(f"Failed to start WebSocket: {e}")
            self.collector._set_error(str(e))
            return False


class DouyinCollector(BaseCollector):
    """Douyin live stream collector using real DouYin_Spider implementation"""

    def __init__(self, message_callback: Optional[Callable] = None):
        super().__init__("douyin", message_callback)
        self.live_id: Optional[str] = None
        self.connection: Optional[DouyinLiveConnection] = None
        self.auth: Optional[DouyinAuth] = None
        self._should_reconnect = True
        self._connection_task: Optional[asyncio.Task] = None

        # Stats
        self.stats.update({
            "total_comments": 0,
            "total_gifts": 0,
            "total_members": 0,
            "total_likes": 0,
            "total_follows": 0,
            "viewer_count": 0,
        })

    def _set_connected(self, connected: bool):
        self.is_connected = connected
        if connected:
            self.is_running = True

    def _set_error(self, error: str):
        logger.error(f"Douyin collector error: {error}")
        self.stats["errors"] += 1

    async def start(self, identifier: str, **kwargs) -> bool:
        """Start collecting from Douyin room"""
        try:
            if self.is_running:
                logger.warning("Douyin collector already running")
                return False

            self._should_reconnect = True
            self.live_id = identifier

            # Load auth from .env
            self._load_auth()

            if not self.auth:
                logger.error("No Douyin auth configured. Please set DY_LIVE_COOKIES in .env")
                self._set_error("No auth configured")
                return False

            # Start connection in background thread
            self._connection_task = asyncio.create_task(self._start_connection_async())
            return True

        except Exception as e:
            logger.error(f"Failed to start Douyin collector: {e}")
            self._set_error(str(e))
            return False

    async def _start_connection_async(self):
        """Start connection in a thread-safe way"""
        conn = DouyinLiveConnection(self, self.live_id, self.auth)
        self.connection = conn
        success = conn.start()
        if not success:
            self._should_reconnect = False
            self.is_running = False
            self.is_connected = False

    def _load_auth(self):
        """Load Douyin authentication from environment"""
        try:
            # Try loading from .env file
            env_path = os.path.join(_BACKEND_DIR, ".env")
            if os.path.exists(env_path):
                os.environ.setdefault("DY_COOKIES", "")
                os.environ.setdefault("DY_LIVE_COOKIES", "")
                from dotenv import load_dotenv
                load_dotenv(env_path)

            cookie_live = os.getenv("DY_LIVE_COOKIES", "")
            if not cookie_live:
                # Try the old env var name
                cookie_live = os.getenv("DY_COOKIE", "")

            if not cookie_live:
                logger.warning("DY_LIVE_COOKIES not set in .env")
                return

            self.auth = DouyinAuth()
            self.auth.perepare_auth(cookie_live, "", "")

            if not self.auth.cookie:
                logger.error("Failed to parse Douyin cookies")
                return

            # Generate msToken if not present
            if "msToken" not in self.auth.cookie:
                self.auth.cookie["msToken"] = generate_msToken()
                self.auth.msToken = self.auth.cookie["msToken"]

            # Rebuild cookie string
            self.auth.cookie_str = "; ".join(
                [f"{k}={v}" for k, v in self.auth.cookie.items()]
            )
            logger.info(f"Douyin auth loaded for user: {self.auth.cookie.get('uid', 'unknown')}")

        except Exception as e:
            logger.error(f"Failed to load auth: {e}")

    async def stop(self) -> bool:
        """Stop collecting"""
        try:
            if not self.is_running:
                return True

            self._should_reconnect = False
            self.is_running = False
            self.is_connected = False
            self.live_id = None

            if self.connection and self.connection.ws_app:
                self.connection.ws_app.close()

            if self._connection_task:
                self._connection_task.cancel()
                try:
                    await self._connection_task
                except asyncio.CancelledError:
                    pass

            await self.send_message({
                "type": "collector_stopped",
                "message": "Douyin collector stopped"
            })
            logger.info("Douyin collector stopped")
            return True

        except Exception as e:
            logger.error(f"Failed to stop Douyin collector: {e}")
            return False

    # ====== Message Handlers ======

    def _on_comment(self, username: str, content: str):
        """Process incoming comment"""
        if not content or not content.strip():
            return

        self.stats["total_comments"] += 1
        self.stats["total_messages"] += 1

        # Language detection
        lang = self._detect_language(content)

        msg = {
            "type": "comment",
            "user": username,
            "text": content,
            "language": lang,
            "room_id": self.live_id,
            "message": f"{username}: {content}",
        }
        asyncio.ensure_future(self.send_message(msg))

    def _on_gift(self, username: str, gift_name: str, count: int):
        """Process incoming gift"""
        self.stats["total_gifts"] += 1
        self.stats["total_messages"] += 1

        msg = {
            "type": "gift",
            "user": username,
            "text": f"🎁 {gift_name} x{count}",
            "gift_name": gift_name,
            "gift_count": count,
            "room_id": self.live_id,
            "message": f"{username} sent {count}x {gift_name}",
        }
        asyncio.ensure_future(self.send_message(msg))

    def _on_member(self, username: str):
        """Process member join"""
        self.stats["total_members"] += 1
        self.stats["total_messages"] += 1

        msg = {
            "type": "member_join",
            "user": username,
            "text": f"{username} entered the room",
            "room_id": self.live_id,
            "message": f"{username} joined the stream",
        }
        asyncio.ensure_future(self.send_message(msg))

    def _on_like(self, username: str, count: int):
        """Process like"""
        self.stats["total_likes"] += 1
        self.stats["total_messages"] += 1

        msg = {
            "type": "social",
            "user": username,
            "text": f"👍 liked {count} times",
            "social_type": "like",
            "room_id": self.live_id,
            "message": f"{username} liked",
        }
        asyncio.ensure_future(self.send_message(msg))

    def _on_follow(self, username: str):
        """Process follow"""
        self.stats["total_follows"] += 1
        self.stats["total_messages"] += 1

        msg = {
            "type": "social",
            "user": username,
            "text": f"❤️ followed the streamer",
            "social_type": "follow",
            "room_id": self.live_id,
            "message": f"{username} followed",
        }
        asyncio.ensure_future(self.send_message(msg))

    def _on_room_stats(self, display_text: str):
        """Process room stats update"""
        self.stats["total_messages"] += 1
        msg = {
            "type": "room_stats",
            "user": "System",
            "text": display_text,
            "room_id": self.live_id,
            "message": display_text,
        }
        asyncio.ensure_future(self.send_message(msg))

    @staticmethod
    def _detect_language(text: str) -> str:
        """Simple language detection"""
        import re
        # Vietnamese diacritics
        vi_pattern = re.compile(
            r'[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễ'
            r'ìíịỉĩòóọỏõôồốộổỗơờớợởỡ'
            r'ùúụủũưừứựửữỳýỵỷỹđĐ]'
        )
        # Chinese characters
        zh_pattern = re.compile(r'[\u4e00-\u9fff]')

        vi_count = len(vi_pattern.findall(text))
        zh_count = len(zh_pattern.findall(text))

        if vi_count > zh_count and vi_count > 2:
            return "vi"
        elif zh_count > vi_count and zh_count > 2:
            return "zh"
        else:
            return "unknown"


# Factory function
def create_douyin_collector(message_callback: Optional[Callable] = None):
    """Create a Douyin collector instance"""
    try:
        return DouyinCollector(message_callback)
    except Exception as e:
        logger.error(f"Cannot create Douyin collector: {e}")
        return None
