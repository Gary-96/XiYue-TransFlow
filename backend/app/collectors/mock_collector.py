"""
MockCollector - 仅用于开发和测试
职责：模拟弹幕事件，用于验证 EventBus 和 Stage 链路
禁止在生产环境使用
"""
from __future__ import annotations

import asyncio
import logging
import random
import time
from typing import Any, Dict, Optional

from .base import BaseCollector

logger = logging.getLogger(__name__)


class MockCollector(BaseCollector):
    """
    模拟弹幕采集器。

    特点：
    - 生成随机弹幕事件
    - 不连接真实平台
    - 仅用于测试/开发验证链路
    """

    MOCK_USERS = ["Alice", "Bob", "Charlie", "Diana", "Eve"]
    MOCK_TEXTS_ZH = ["你好", "加油", "666", "厉害了", "哈哈哈"]
    MOCK_TEXTS_VI = ["Xin chao", "Chuc mung", "Hay co len", "Tuyet voi", "Cuoi"]

    def __init__(self, message_callback=None):
        super().__init__("mock", message_callback)
        self._task: Optional[asyncio.Task] = None
        self._running = False

    async def start(self, identifier: str, **kwargs) -> bool:
        """开始模拟弹幕生成"""
        if self.is_running:
            logger.warning("MockCollector already running")
            return False

        self.is_running = True
        self.is_connected = True
        self._running = True

        # 启动后台任务生成随机事件
        self._task = asyncio.create_task(self._generate_events())

        logger.info("MockCollector started (simulating)")
        return True

    async def stop(self) -> bool:
        """停止模拟"""
        self._running = False
        self.is_running = False
        self.is_connected = False

        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

        logger.info("MockCollector stopped")
        return True

    async def _generate_events(self) -> None:
        """后台任务：周期性生成模拟弹幕事件"""
        while self._running:
            try:
                # 随机选择类型
                event_type = random.choice(["comment", "gift", "member_join"])

                # 构建消息
                user = random.choice(self.MOCK_USERS)
                is_vietnamese = random.random() > 0.5
                text = random.choice(self.MOCK_TEXTS_VI if is_vietnamese else self.MOCK_TEXTS_ZH)

                message: Dict[str, Any] = {
                    "user": user,
                    "text": text,
                    "platform": "mock",
                    "room_id": "test-room",
                    "timestamp": time.time(),
                    "language": "vi" if is_vietnamese else "zh",
                }

                if event_type == "gift":
                    message["event_type"] = "danmaku.gift"
                    message["text"] = f"🎁 {text}"
                    message["metadata"] = {"gift_count": random.randint(1, 10)}
                elif event_type == "member_join":
                    message["event_type"] = "danmaku.member_join"
                else:
                    message["event_type"] = "danmaku.comment"

                # 发送消息
                await self.send_message(message)

                # 随机延迟
                await asyncio.sleep(random.uniform(0.5, 2.0))

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Mock event generation error: {e}")
                await asyncio.sleep(1)
