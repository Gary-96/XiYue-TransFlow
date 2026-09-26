"""
乐曼同传 — 服务层导出
"""
# 注意：依赖 numpy/sounddevice 等服务仅在运行时按需导入，避免启动时依赖缺失报错

def get_call_translation_service():
    from .call_translation import get_call_translation_service as _inner
    return _inner()

def get_whisper_service():
    from .whisper_service import get_whisper_service as _inner
    return _inner()

def get_translation_service():
    from .translation_service import get_translation_service as _inner
    return _inner()

def get_tts_service():
    from .tts_service import get_tts_service as _inner
    return _inner()

def get_language_manager():
    from .language_manager import get_language_manager as _inner
    return _inner()

def get_llm_service():
    from .llm_service import get_llm_service as _inner
    return _inner()

# 这些类/函数仅在需要时导入，避免循环依赖
__all__ = [
    "get_call_translation_service",
    "get_whisper_service",
    "get_translation_service",
    "get_tts_service",
    "get_language_manager",
    "get_llm_service",
]
