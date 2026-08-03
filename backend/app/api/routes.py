"""
乐曼同传 Leman Translate - API 路由模块
按功能拆分路由，替代 main_manager.py 中的混合路由
"""
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from typing import Dict, Any, Optional

# 导入依赖项
from app.api.dependencies import (
    get_translation_service,
    get_whisper_service,
    get_tts_service,
    get_config_manager,
    get_collector_manager,
)
from app.models.schemas import TranslationRequest, TranslationResult


# ── 翻译路由 ─────────────────────────────────────────────────
translation_router = APIRouter(prefix="/api/translate", tags=["翻译"])


@translation_router.post("/", response_model=TranslationResult)
async def translate_text(
    request: TranslationRequest,
    translator = Depends(get_translation_service),
):
    """执行文本翻译"""
    result = await translator.translate(
        text=request.text,
        source_lang=request.source_language,
        target_lang=request.target_language,
    )
    if result is None:
        return TranslationResult(
            text="",
            source_language=request.source_language,
            target_language=request.target_language,
            direction=f"{request.source_language}_to_{request.target_language}",
        )
    return result


@translation_router.get("/providers")
async def list_providers(
    config = Depends(get_config_manager),
):
    """获取可用的翻译提供商列表"""
    from config_manager import PROVIDER_META
    return {
        "current": config.get_current_provider(),
        "providers": {k: v["label_zh"] for k, v in PROVIDER_META.items()},
    }


# ── 音频设备路由 ─────────────────────────────────────────────
audio_router = APIRouter(prefix="/api/audio", tags=["音频"])


@audio_router.get("/devices")
async def list_devices(
    config = Depends(get_config_manager),
):
    """获取音频设备列表"""
    from audio_device_manager import list_all_devices
    return list_all_devices()


@audio_router.put("/device")
async def set_device(
    request: Dict[str, Any],
    config = Depends(get_config_manager),
):
    """设置音频设备"""
    device_key = request.get("device_key")
    device_id = request.get("device_id")
    if device_key and device_id is not None:
        success = config.set_audio_device(device_key, device_id)
        return {"status": "success" if success else "error"}
    return {"status": "error", "message": "device_key and device_id required"}


# ── 语言配置路由 ─────────────────────────────────────────────
language_router = APIRouter(prefix="/api/language", tags=["语言"])


@language_router.get("/current")
async def get_current_language(
    language_manager = Depends(get_config_manager),
):
    """获取当前语言对"""
    from app.services.language_manager import language_manager as lm
    pair = lm.get_current_pair()
    return {
        "src_lang": pair.src_lang,
        "tgt_lang": pair.tgt_lang,
        "src_label": pair.src_label,
        "tgt_label": pair.tgt_label,
    }


@language_router.put("/set")
async def set_language(
    request: Dict[str, str],
    language_manager = Depends(get_config_manager),
):
    """设置语言对"""
    from app.services.language_manager import language_manager as lm
    src_lang = request.get("src_lang", "zh")
    tgt_lang = request.get("tgt_lang", "vi")
    lm.set_language_pair(src_lang, tgt_lang)
    return {"status": "success", "src_lang": src_lang, "tgt_lang": tgt_lang}


# ── 配置路由 ─────────────────────────────────────────────────
config_router = APIRouter(prefix="/api/config", tags=["配置"])


@config_router.get("/")
async def get_config(
    config = Depends(get_config_manager),
):
    """获取当前配置"""
    return {"status": "success", "data": config.get_config()}


@config_router.put("/")
async def update_config(
    request: Dict[str, Any],
    config = Depends(get_config_manager),
):
    """更新配置"""
    success = config.update_config(request)
    if success:
        return {"status": "success", "message": "配置已保存"}
    return {"status": "error", "message": "配置保存失败"}


# ── TTS 路由 ─────────────────────────────────────────────────
tts_router = APIRouter(prefix="/api/tts", tags=["TTS"])


@tts_router.get("/voices")
async def get_voices(
    tts = Depends(get_tts_service),
):
    """获取可用音色列表"""
    voices = tts.get_all_voices()
    current_id = None  # 可以从 config 获取
    return {
        "status": "success",
        "voices": voices,
        "current_voice_id": current_id,
    }


@tts_router.put("/voice")
async def set_voice(
    request: Dict[str, str],
    tts = Depends(get_tts_service),
    config = Depends(get_config_manager),
):
    """设置当前 TTS 音色"""
    voice_id = request.get("voice_id", "")
    if voice_id:
        tts.set_voice(voice_id)
        config.update_config({"voice_id": voice_id})
        return {"status": "success", "voice_id": voice_id}
    return {"status": "error", "message": "voice_id required"}


# ── 聚合所有路由 ─────────────────────────────────────────────
def register_routes(app):
    """注册所有路由到 FastAPI 应用"""
    app.include_router(translation_router)
    app.include_router(audio_router)
    app.include_router(language_router)
    app.include_router(config_router)
    app.include_router(tts_router)
    print("✅ API 路由注册完成")
