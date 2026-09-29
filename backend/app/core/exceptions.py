"""
喜阅 TransFlow — 统一异常体系
所有业务异常继承自 AppException
"""
from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger(__name__)


class AppException(Exception):
    """应用基类异常"""

    def __init__(self, message: str, code: Optional[str] = None):
        super().__init__(message)
        self.message = message
        self.code = code or "APP_ERROR"

    def to_dict(self) -> dict:
        return {
            "status": "error",
            "code": self.code,
            "message": self.message,
        }


class CollectorException(AppException):
    """采集器相关异常"""

    def __init__(self, message: str, platform: Optional[str] = None):
        self.platform = platform
        super().__init__(message, code="COLLECTOR_ERROR")


class ConnectionException(CollectorException):
    """连接异常"""

    def __init__(self, message: str, platform: Optional[str] = None):
        super().__init__(message, platform)
        self.code = "CONNECTION_ERROR"


class PlatformException(CollectorException):
    """平台 API 异常"""

    def __init__(self, message: str, platform: str, status_code: int = 400):
        self.platform = platform
        self.status_code = status_code
        super().__init__(message, platform)
        self.code = "PLATFORM_ERROR"


class TranslationException(AppException):
    """翻译服务异常"""

    def __init__(self, message: str):
        super().__init__(message, code="TRANSLATION_ERROR")


class AIServiceException(AppException):
    """AI 服务异常"""

    def __init__(self, message: str):
        super().__init__(message, code="AI_ERROR")


class TTSServiceException(AppException):
    """TTS 服务异常"""

    def __init__(self, message: str):
        super().__init__(message, code="TTS_ERROR")


class AudioException(AppException):
    """音频设备异常"""

    def __init__(self, message: str):
        super().__init__(message, code="AUDIO_ERROR")


class ConfigException(AppException):
    """配置异常"""

    def __init__(self, message: str):
        super().__init__(message, code="CONFIG_ERROR")


def create_exception_handler(exc: AppException):
    """创建 FastAPI 异常处理器"""
    from fastapi.responses import JSONResponse

    async def handler(request, exception: AppException):
        logger.warning(f"App exception: {exception.code} - {exception.message}")
        return JSONResponse(
            status_code=400 if "ERROR" in exception.code else 500,
            content={
                "status": "error",
                "code": exception.code,
                "message": exception.message,
            },
        )

    return handler

