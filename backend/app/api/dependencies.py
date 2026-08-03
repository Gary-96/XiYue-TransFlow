"""
乐曼同传 Leman Translate - 依赖注入
替代全局变量，提供服务的统一访问点
"""
from functools import lru_cache
from typing import Generator

from fastapi import Depends
from fastapi.security import HTTPBearer

from config_manager import get_config_manager as _get_config_manager
from app.services.translation_service import TranslationService
from app.services.whisper_service import WhisperService
from app.services.tts_service import tts_service
from collectors.manager import create_collector_manager


# ── 配置管理器 ────────────────────────────────────────────────
def get_config_manager() -> Generator:
    """获取配置管理器单例"""
    yield _get_config_manager()


# ── 服务单例 ─────────────────────────────────────────────────
_translation_service = None
_whisper_service = None
_collector_manager = None


def get_translation_service() -> TranslationService:
    """获取翻译服务单例"""
    global _translation_service
    if _translation_service is None:
        _translation_service = TranslationService()
    return _translation_service


def get_whisper_service() -> WhisperService:
    """获取 ASR 服务单例"""
    global _whisper_service
    if _whisper_service is None:
        _whisper_service = WhisperService()
    return _whisper_service


def get_collector_manager():
    """获取弹幕采集管理器"""
    global _collector_manager
    if _collector_manager is None:
        _collector_manager = create_collector_manager()
    return _collector_manager


def get_tts_service():
    """获取 TTS 服务"""
    return tts_service


# ── 认证（预留）─────────────────────────────────────────────
security = HTTPBearer()


async def get_current_user(credentials = Depends(security)):
    """获取当前用户（预留接口）"""
    # TODO: 实现 JWT 验证
    return {"token": credentials.credentials}
