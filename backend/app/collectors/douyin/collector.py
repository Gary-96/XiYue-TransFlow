"""
喜阅 TransFlow · Douyin Live Collector
职责：管理抖音直播间采集生命周期，将平台事件转换为统一事件。
"""
from __future__ import annotations

import asyncio
import logging
import re
from typing import Any, Callable, Dict, Optional

from ..base import BaseCollector
from .models import AuthConfig
from .signer import generate_a_bogus
from .client import DouyinClient
from .exceptions import DouyinConnectionRejectedError
from .parser import DouyinParser

logger = logging.getLogger(__name__)


class DouyinCollector(BaseCollector):
    """Douyin live stream collector - 仅负责生命周期管理和事件转换"""

    def __init__(self, message_callback: Optional[Callable] = None):
        super().__init__("douyin", message_callback)
        self.platform = "douyin"
        self.live_id: Optional[str] = None
        self.connection: Optional[DouyinClient] = None
        self.auth: AuthConfig = None
        self._should_reconnect = True
        self._reconnect_count = 0
        self._connection_task: Optional[asyncio.Task] = None
        self.loop: Optional[asyncio.AbstractEventLoop] = None
        self.parser = DouyinParser()

        # Stats
        self.stats.update({
            "total_comments": 0,
            "total_gifts": 0,
            "total_members": 0,
            "total_likes": 0,
            "total_follows": 0,
            "viewer_count": 0,
            "messages_received": 0,
            "events_parsed": 0,
            "parse_errors": 0,
            "connection_count": 0,
            "reconnect_count": 0,
        })

    def _set_connected(self, connected: bool):
        self.is_connected = connected
        if connected:
            self.is_running = True
            self.stats["connection_count"] += 1
            self.stats["last_message_at"] = __import__('time').time()

    def _set_error(self, error: str):
        logger.error(f"Douyin collector error: {error}")
        self.stats["errors"] += 1
        self.stats["last_error"] = error

    def _get_proxy_settings(self):
        """读取系统或 config.json 里的代理设置"""
        proxy = os.getenv("HTTP_PROXY") or os.getenv("ALL_PROXY")
        if proxy and ":" in proxy:
            clean_proxy = proxy.replace("http://", "").replace("socks5://", "")
            parts = clean_proxy.split(":")
            return parts[0], int(parts[1])
        return None, None

    def _dispatch_async_message(self, msg: dict):
        """线程安全地分发消息到主事件循环"""
        if self.loop and self.loop.is_running():
            asyncio.run_coroutine_threadsafe(self.send_message(msg), self.loop)
        else:
            asyncio.ensure_future(self.send_message(msg))

    async def start(self, identifier: str, **kwargs) -> bool:
        """Start collecting from Douyin room"""
        try:
            self.loop = asyncio.get_running_loop()
            
            # 幂等性检查：如果已经在运行，拒绝重复启动
            if self.is_running and self.connection:
                logger.warning("Douyin collector already running, ignoring duplicate start")
                return False
            
            # 如果正在停止中，等待完成
            if hasattr(self, '_stopping') and self._stopping:
                logger.warning("Douyin collector is stopping, waiting...")
                await asyncio.sleep(0.5)

            self._should_reconnect = True
            self._reconnect_count = 0
            self.live_id = identifier
            self.stats["connection_count"] += 1

            # 加载认证
            self.auth = AuthConfig()
            if not self.auth or not self.auth.cookie:
                logger.error("No Douyin auth configured")
                self._set_error("No auth configured")
                return False

            # 启动连接
            self._start_connection_thread()
            return True

        except Exception as e:
            logger.error(f"Failed to start Douyin collector: {e}")
            self._set_error(str(e))
            return False

    def _start_connection_thread(self):
        """Start connection logic"""
        conn = DouyinClient(self, self.live_id, self.auth, self.parser)
        self.connection = conn
        success = conn.start()
        if not success:
            self._should_reconnect = False
            self.is_running = False
            self.is_connected = False

    async def stop(self) -> bool:
        """Stop collecting"""
        try:
            # 幂等性检查：如果已经停止，直接返回
            if not self.is_running:
                logger.debug("Douyin collector already stopped")
                return True
            
            # 标记为正在停止，防止重连
            self._stopping = True
            self._should_reconnect = False

            self._should_reconnect = False
            self.is_running = False
            self.is_connected = False
            self.live_id = None

            if self.connection:
                self.connection.stop()
                self.connection = None
            
            # 重置停止标记
            self._stopping = False

            await self.send_message({
                "type": "collector_stopped",
                "message": "Douyin collector stopped",
            })
            logger.info("Douyin collector stopped")
            return True

        except Exception as e:
            logger.error(f"Failed to stop Douyin collector: {e}")
            return False

    def _dispatch_platform_message(self, msg: dict):
        """将平台消息转换为统一事件并发送"""
        self.stats["messages_received"] += 1
        self.stats["events_parsed"] += 1
        
        # 转换为标准格式
        event = {
            "event_id": __import__('uuid').uuid4().hex[:16],
            "event_type": self._map_event_type(msg.get("type", "")),
            "platform": "douyin",
            "room_id": self.live_id or "",
            "user_id": msg.get("user_id", ""),
            "username": msg.get("user", "unknown"),
            "text": self._extract_text(msg),
            "language": self._detect_language(msg.get("text", "")),
            "metadata": {k: v for k, v in msg.items() if k not in ["type", "user", "text", "user_id"]},
            "timestamp": __import__('time').time(),
        }
        
        self._dispatch_async_message(event)

    def _map_event_type(self, platform_type: str) -> str:
        """将平台事件类型映射到统一事件类型"""
        mapping = {
            "comment": "danmaku.comment",
            "gift": "danmaku.gift",
            "member_join": "danmaku.member_join",
            "like": "danmaku.like",
            "follow": "danmaku.follow",
            "room_stats": "danmaku.room_stats",
        }
        return mapping.get(platform_type, "danmaku.comment")

    def _extract_text(self, msg: dict) -> str:
        """从平台消息中提取文本内容"""
        if "text" in msg:
            return msg["text"]
        if msg.get("type") == "gift":
            return f"🎁 {msg.get('gift_name', '')} x{msg.get('gift_count', 1)}"
        if msg.get("type") == "like":
            return f"👍 liked {msg.get('count', 1)} times"
        return ""

    def _detect_language(self, text: str) -> str:
        """Simple language detection"""
        if not text:
            return "unknown"
        
        vi_pattern = re.compile(
            r"[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễ"
            r"ìíịỉĩòóọỏõôồốộổỗơờớợởỡ"
            r"ùúụủũưừứựửữỳýỵỷỹđĐ]"
        )
        zh_pattern = re.compile(r"[\u4e00-\u9fff]")

        vi_count = len(vi_pattern.findall(text))
        zh_count = len(zh_pattern.findall(text))

        if vi_count > zh_count and vi_count > 2:
            return "vi"
        elif zh_count > vi_count and zh_count > 2:
            return "zh"
        else:
            return "unknown"

    def get_capabilities(self) -> Dict[str, bool]:
        """返回平台能力声明"""
        return {
            "comments": True,
            "gifts": True,
            "likes": True,
            "members": True,
            "follows": True,
            "room_stats": True,
            "translation": False,  # 由 Stage 层处理
            "tts": False,          # 由 Stage 层处理
        }


def create_douyin_collector(message_callback: Optional[Callable] = None):
    """Create a Douyin collector instance"""
    try:
        return DouyinCollector(message_callback)
    except Exception as e:
        logger.error(f"Cannot create Douyin collector: {e}")
        return None

