"""
喜阅 TransFlow - 依赖注入
替代全局变量，提供服务的统一访问点
"""
from typing import Generator

from fastapi import Depends
from fastapi.security import HTTPBearer

from config_manager import get_config_manager as _get_config_manager

from app.core.event_bus import get_global_event_bus, set_global_event_bus
from app.collectors.manager import CollectorManager, create_collector_manager

# ── 配置管理器 ────────────────────────────────────────────────
def get_config_manager() -> Generator:
    """获取配置管理器单例"""
    yield _get_config_manager()


# ── 服务单例（懒加载）─────────────────────────────────────────
_translation_service = None
_whisper_service = None
_collector_manager = None


def get_translation_service():
    """获取翻译服务单例"""
    global _translation_service
    if _translation_service is None:
        from app.services.translation_service import TranslationService
        _translation_service = TranslationService()
    return _translation_service


def get_whisper_service():
    """获取 ASR 服务单例"""
    global _whisper_service
    if _whisper_service is None:
        from app.services.whisper_service import WhisperService
        _whisper_service = WhisperService()
    return _whisper_service


def get_collector_manager() -> CollectorManager:
    """获取弹幕采集管理器单例"""
    global _collector_manager
    if _collector_manager is None:
        from app.core.event_bus import get_global_event_bus
        _collector_manager = create_collector_manager(event_bus=get_global_event_bus())
    return _collector_manager


def get_tts_service():
    """获取 TTS 服务单例"""
    from app.services.tts_service import tts_service
    return tts_service


# ── 认证（预留）─────────────────────────────────────────────
security = HTTPBearer()


async def get_current_user(credentials = Depends(security)):
    """获取当前用户（预留接口）"""
    return {"token": credentials.credentials}

