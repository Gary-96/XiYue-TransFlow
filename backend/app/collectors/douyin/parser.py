"""
喜阅 TransFlow · Douyin Protobuf 解析器
职责：将 Douyin WebSocket 二进制数据解析为平台事件 dict。
"""
from __future__ import annotations

import gzip
import logging
from typing import Any, Dict, List, Optional

import static.Live_pb2 as Live_pb2

from .exceptions import DouyinParseError

logger = logging.getLogger(__name__)


class DouyinParser:
    """Douyin WebSocket 消息解析器"""

    def parse_push_frame(self, message: bytes) -> List[Dict[str, Any]]:
        """
        解析 PushFrame 并提取所有平台消息。

        Args:
            message: WebSocket 收到的原始二进制数据

        Returns:
            解析后的平台消息列表
        """
        try:
            # 解析 PushFrame
            frame = Live_pb2.PushFrame()
            frame.ParseFromString(message)

            # 解压 payload
            origin_bytes = gzip.decompress(frame.payload)

            # 解析 LiveResponse
            response = Live_pb2.LiveResponse()
            response.ParseFromString(origin_bytes)

            # 发送 ACK（如果需要）
            if response.needAck:
                self._send_ack(frame, response)

            # 解析所有消息
            messages = []
            for item in response.messagesList:
                msg = self._parse_message(item.method, item.payload)
                if msg:
                    messages.append(msg)

            return messages

        except Exception as e:
            logger.error(f"Failed to parse PushFrame: {e}")
            raise DouyinParseError(f"PushFrame parsing failed: {e}")

    def _parse_message(self, method: str, payload: bytes) -> Optional[Dict[str, Any]]:
        """
        解析单条平台消息。

        Args:
            method: 消息类型（如 WebcastChatMessage）
            payload: 消息数据

        Returns:
            平台事件 dict 或 None（如果无法解析）
        """
        try:
            if method == "WebcastChatMessage":
                return self._parse_comment(payload)
            elif method == "WebcastGiftMessage":
                return self._parse_gift(payload)
            elif method == "WebcastMemberMessage":
                return self._parse_member(payload)
            elif method == "WebcastLikeMessage":
                return self._parse_like(payload)
            elif method == "WebcastSocialMessage":
                return self._parse_follow(payload)
            elif method == "WebcastRoomStatsMessage":
                return self._parse_room_stats(payload)
            else:
                logger.warning(f"Unsupported message type: {method}")
                raise DouyinUnsupportedMessageError(method)

        except Exception as e:
            logger.warning(f"Failed to parse message {method}: {e}")
            return None

    def _parse_comment(self, payload: bytes) -> Dict[str, Any]:
        """解析评论消息"""
        msg = Live_pb2.ChatMessage()
        msg.ParseFromString(payload)

        return {
            "type": "comment",
            "user": msg.user.nickname if msg.user else "unknown",
            "text": msg.content,
            "user_id": str(msg.user.userId) if msg.user else "",
        }

    def _parse_gift(self, payload: bytes) -> Dict[str, Any]:
        """解析礼物消息"""
        msg = Live_pb2.GiftMessage()
        msg.ParseFromString(payload)

        gift_name = ""
        if hasattr(msg, "gift") and msg.gift:
            gift_name = msg.gift.name if hasattr(msg.gift, "name") else str(msg.giftId)

        return {
            "type": "gift",
            "user": msg.user.nickname if msg.user else "unknown",
            "gift_name": gift_name,
            "gift_count": msg.comboCount,
            "user_id": str(msg.user.userId) if msg.user else "",
        }

    def _parse_member(self, payload: bytes) -> Dict[str, Any]:
        """解析成员加入消息"""
        msg = Live_pb2.MemberMessage()
        msg.ParseFromString(payload)

        return {
            "type": "member_join",
            "user": msg.user.nickname if msg.user else "unknown",
            "user_id": str(msg.user.userId) if msg.user else "",
        }

    def _parse_like(self, payload: bytes) -> Dict[str, Any]:
        """解析点赞消息"""
        msg = Live_pb2.LikeMessage()
        msg.ParseFromString(payload)

        return {
            "type": "like",
            "user": msg.user.nickname if msg.user else "unknown",
            "count": msg.count,
            "user_id": str(msg.user.userId) if msg.user else "",
        }

    def _parse_follow(self, payload: bytes) -> Dict[str, Any]:
        """解析关注消息"""
        msg = Live_pb2.SocialMessage()
        msg.ParseFromString(payload)

        if msg.action != 1:
            return None

        return {
            "type": "follow",
            "user": msg.user.nickname if msg.user else "unknown",
            "user_id": str(msg.user.userId) if msg.user else "",
        }

    def _parse_room_stats(self, payload: bytes) -> Dict[str, Any]:
        """解析房间状态消息"""
        msg = Live_pb2.RoomStatsMessage()
        msg.ParseFromString(payload)

        return {
            "type": "room_stats",
            "text": msg.displayLong,
        }

    def _send_ack(self, frame: Live_pb2.PushFrame, response: Live_pb2.LiveResponse):
        """发送 ACK 消息"""
        ack = Live_pb2.PushFrame()
        ack.payloadType = "ack"
        ack.payload = response.internalExt.encode("utf-8")
        ack.logId = frame.logId
        # 注意：这里不实际发送，由连接层处理
        logger.debug("ACK prepared")

