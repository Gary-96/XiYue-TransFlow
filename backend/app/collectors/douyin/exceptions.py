"""
喜阅 TransFlow · Douyin Collector 异常体系
职责：定义抖音平台专用异常，与业务层解耦。
"""
from __future__ import annotations


class DouyinCollectorError(Exception):
    """抖音采集器基础异常"""

    def __init__(self, message: str, platform: str = "douyin", identifier: str = ""):
        super().__init__(message)
        self.platform = platform
        self.identifier = identifier


class DouyinConnectionError(DouyinCollectorError):
    """WebSocket 连接错误"""

    def __init__(
        self,
        message: str,
        status_code: int = 0,
        handshake_message: str = "",
        platform: str = "douyin",
        identifier: str = "",
    ):
        super().__init__(message, platform, identifier)
        self.status_code = status_code
        self.handshake_message = handshake_message


class DouyinConnectionRejectedError(DouyinConnectionError):
    """平台拒绝连接（如 DEVICE_BLOCKED）"""

    def __init__(self, status_code: int, handshake_message: str, identifier: str):
        super().__init__(
            message=f"Platform rejected connection: {handshake_message}",
            status_code=status_code,
            handshake_message=handshake_message,
            identifier=identifier,
        )


class DouyinAuthenticationError(DouyinCollectorError):
    """认证失败"""

    def __init__(self, message: str, platform: str = "douyin", identifier: str = ""):
        super().__init__(message, platform, identifier)


class DouyinProtocolError(DouyinCollectorError):
    """协议解析错误"""

    def __init__(self, message: str, platform: str = "douyin", identifier: str = ""):
        super().__init__(message, platform, identifier)


class DouyinParseError(DouyinProtocolError):
    """数据解析错误"""

    def __init__(self, message: str, platform: str = "douyin", identifier: str = ""):
        super().__init__(message, platform, identifier)




class DouyinUnsupportedMessageError(DouyinCollectorError):
    """不支持的消息类型"""

    def __init__(self, method: str, platform: str = "douyin", identifier: str = ""):
        super().__init__(f"Unsupported message type: {method}", platform, identifier)
        self.method = method

class DouyinSignatureError(DouyinCollectorError):
    """签名生成错误"""

    def __init__(self, message: str, platform: str = "douyin", identifier: str = ""):
        super().__init__(message, platform, identifier)

