"""
喜阅 TransFlow · Douyin WebSocket 连接层
职责：建立和维护与抖音 WebSocket 服务器的连接。
"""
from __future__ import annotations

import gzip
import json
import logging
import threading
import time
from typing import Optional

from urllib.parse import urlencode

import static.Live_pb2 as Live_pb2
from websocket import WebSocketApp

from builder.header import HeaderBuilder
from builder.params import Params
from dy_apis.douyin_api import DouyinAPI
from utils.dy_util import generate_signature

from .models import AuthConfig
from .exceptions import DouyinConnectionError, DouyinConnectionRejectedError, DouyinParseError

logger = logging.getLogger(__name__)


def _get_screen_resolution():
    """动态获取屏幕分辨率"""
    try:
        import ctypes
        user32 = ctypes.windll.user32
        screen_width = user32.GetSystemMetrics(0)
        screen_height = user32.GetSystemMetrics(1)
        return screen_width, screen_height
    except Exception:
        return 1920, 1080


class DouyinClient:
    """Douyin WebSocket 连接管理器"""

    def __init__(self, collector, live_id: str, auth: AuthConfig, parser):
        self.collector = collector
        self.live_id = live_id
        self.auth = auth
        self.parser = parser
        self.ws_app: Optional[WebSocketApp] = None
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
        logger.info("Douyin WebSocket opened successfully")
        self._running = True
        self.collector._reconnect_count = 0
        self.collector._set_connected(True)
        threading.Thread(target=self.ping, args=(ws,), daemon=True).start()

    def on_message(self, ws, message):
        try:
            # 使用 Parser 解析
            messages = self.parser.parse_push_frame(message)

            # 分发到 Collector
            for msg in messages:
                self.collector._dispatch_platform_message(msg)

        except DouyinParseError as e:
            logger.error(f"Parse error: {e}")
        except Exception as e:
            logger.error(f"Error processing message: {e}")

    def on_error(self, ws, error):
        logger.error(f"Website error: {error}")
        self.collector._set_error(str(error))

    def on_close(self, ws, close_status_code, close_msg):
        logger.info(f"Website closed: {close_status_code} {close_msg}")
        self._running = False
        self.collector._set_connected(False)

        # 带退避机制的安全自动重连
        if self.collector._should_reconnect:
            self.collector._reconnect_count += 1
            if self.collector._reconnect_count <= 5:
                backoff_time = min(3 * self.collector._reconnect_count, 15)
                logger.info(
                    f"Will attempt reconnect #{self.collector._reconnect_count} in {backoff_time}s..."
                )
                threading.Timer(
                    backoff_time,
                    self.collector._start_connection_thread,
                ).start()
            else:
                logger.error("Max reconnect attempts (5) reached. Stopping.")
                self.collector._should_reconnect = False

    def start(self) -> bool:
        """Start the WebSocket connection"""
        try:
            # 获取房间信息
            room_info = DouyinAPI.get_live_info(self.auth, self.live_id)
            if not room_info:
                logger.error("Failed to get live room info")
                return False

            room_id = room_info.get("room_id")
            user_id = room_info.get("user_id")
            if not room_id or not user_id:
                logger.error(f"Missing room_id or user_id: {room_info}")
                return False

            # 获取 webcast detail
            res = DouyinAPI.get_webcast_detail(
                self.auth,
                str(user_id),
                room_id,
                f"https://live.douyin.com/{self.live_id}",
            )
            frame = Live_pb2.LiveResponse()
            frame.ParseFromString(res)

            # 动态获取屏幕分辨率
            sw, sh = _get_screen_resolution()
            ua = HeaderBuilder.ua
            browser_ver = ua.split("Mozilla/")[-1] if "Mozilla/" in ua else "5.0"

            params = (
                Params()
                .add_param("app_name", "douyin_web")
                .add_param("version_code", "180800")
                .add_param("webcast_sdk_version", "1.0.15")
                .add_param("update_version_code", "1.0.15")
                .add_param("compress", "gzip")
                .add_param("device_platform", "web")
                .add_param("cookie_enabled", "true")
                .add_param("screen_width", str(sw))
                .add_param("screen_height", str(sh))
                .add_param("browser_language", "zh-CN")
                .add_param("browser_platform", "Win32")
                .add_param("browser_name", "Mozilla")
                .add_param("browser_version", browser_ver)
                .add_param("browser_online", "true")
                .add_param("tz_name", "Etc/GMT-8")
                .add_param("cursor", str(frame.cursor))
                .add_param("internal_ext", frame.internalExt)
                .add_param("host", "https://live.douyin.com")
                .add_param("aid", "6383")
                .add_param("live_id", "1")
                .add_param("did_rule", "3")
                .add_param("endpoint", "live_pc")
                .add_param("support_wrds", "1")
                .add_param("user_unique_id", str(user_id))
                .add_param("im_path", "/webcast/im/fetch/")
                .add_param("identity", "audience")
                .add_param("need_persist_msg_count", "15")
                .add_param("insert_task_id", "")
                .add_param("live_reason", "")
                .add_param("room_id", room_id)
                .add_param("heartbeatDuration", "0")
                .with_a_bogus()
                .add_param("signature", generate_signature(room_id, user_id))
            )

            wss_url = f"wss://webcast100-ws-web-hl.douyin.com/webcast/im/push/v2/?{urlencode(params.get())}"

            # 抓取代理设置
            proxy_host, proxy_port = self.collector._get_proxy_settings()

            ws_kwargs = {
                "url": wss_url,
                "header": {
                    "Pragma": "no-cache",
                    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
                    "User-Agent": HeaderBuilder.ua,
                    "Upgrade": "websocket",
                    "Cache-Control": "no-cache",
                    "Connection": "Upgrade",
                },
                "cookie": self.auth.cookie_str,
                "on_message": self.on_message,
                "on_error": self.on_error,
                "on_close": self.on_close,
                "on_open": self.on_open,
            }

            if proxy_host and proxy_port:
                ws_kwargs["http_proxy_host"] = proxy_host
                ws_kwargs["http_proxy_port"] = proxy_port

            self.ws_app = WebSocketApp(**ws_kwargs)

            self._thread = threading.Thread(
                target=self.ws_app.run_forever,
                kwargs={"origin": "https://live.douyin.com"},
                daemon=True,
            )
            self._thread.start()
            return True

        except DouyinConnectionRejectedError:
            raise
        except Exception as e:
            logger.error(f"Failed to start WebSocket: {e}")
            self.collector._set_error(str(e))
            return False

    def stop(self):
        """Gracefully stop the connection"""
        logger.info("Stopping Douyin WebSocket connection")
        self._running = False
        if self.ws_app:
            try:
                self.ws_app.close()
            except Exception as e:
                logger.warning(f"Error closing WebSocket: {e}")
            finally:
                self.ws_app = None
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=5)
        logger.info("Douyin WebSocket connection stopped")


