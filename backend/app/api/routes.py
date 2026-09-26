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


# 前端旧接口兼容（get 别名）
@language_router.get("/get")
async def get_language():
    """获取当前语言设置（前端兼容接口）"""
    from app.services.language_manager import language_manager as lm
    pair = lm.get_current_pair()
    return {
        "status": "ok",
        "language": "zh" if pair.src_lang == "zh" else pair.src_lang,
        "src_lang": pair.src_lang,
        "tgt_lang": pair.tgt_lang,
        "src_label": pair.src_label,
        "tgt_label": pair.tgt_label,
    }


# 前端旧接口兼容（switch 别名）
@language_router.post("/switch")
async def switch_language():
    """切换语言方向（前端兼容接口）"""
    from app.services.language_manager import language_manager as lm
    current = lm.get_current_pair()
    # 交换语言方向
    new_src = current.tgt_lang
    new_tgt = current.src_lang
    lm.set_language_pair(new_src, new_tgt)
    return {
        "status": "success",
        "src_lang": new_src,
        "tgt_lang": new_tgt,
    }


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
    return {
        "status": "success",
        "voices": voices,
        "current_voice_id": tts.current_voice_id,
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


@tts_router.get("/status")
async def get_tts_status(
    tts = Depends(get_tts_service),
):
    """获取 TTS 状态"""
    return {
        "status": "ok",
        "enabled": tts.enabled,
        "current_voice": tts.current_voice_id,
    }


@tts_router.put("/enable")
async def enable_tts(
    request: Dict[str, bool],
    tts = Depends(get_tts_service),
):
    """启用/禁用 TTS"""
    enabled = request.get("enabled", False)
    tts.enabled = enabled
    return {"status": "success", "enabled": enabled}


@tts_router.post("/clear-queue")
async def clear_tts_queue(
    tts = Depends(get_tts_service),
):
    """清除 TTS 队列"""
    tts.clear_queue()
    return {"status": "success"}


# ── 通话同传路由 ─────────────────────────────────────────────
call_router = APIRouter(prefix="/api/call", tags=["通话同传"])


@call_router.get("/list-devices")
async def list_call_devices():
    """获取通话同传设备列表"""
    try:
        from app.services.call_translation import get_call_translation_service
        service = get_call_translation_service()
        return {
            "status": "success",
            "loopback_devices": await service.list_devices(),
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@call_router.get("/status")
async def get_call_status():
    """获取通话同传状态"""
    try:
        from app.services.call_translation import get_call_translation_service
        service = get_call_translation_service()
        status = service.get_status()
        return {
            "status": "success",
            "is_running": status["is_running"],
            "mode": status["mode"],
            "stats": status["stats"],
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@call_router.post("/start")
async def start_call_translation(
    request: Dict[str, Any],
):
    """启动通话同传"""
    try:
        from app.services.call_translation import get_call_translation_service
        service = get_call_translation_service()
        mode = request.get("mode", "subtitle_only")
        loopback_idx = request.get("loopback_device_index")
        tts_idx = request.get("tts_device_index")
        result = await service.start(
            mode=mode,
            loopback_device_index=loopback_idx,
            tts_device_index=tts_idx,
        )
        return result
    except Exception as e:
        return {"status": "error", "message": str(e)}


@call_router.post("/stop")
async def stop_call_translation():
    """停止通话同传"""
    try:
        from app.services.call_translation import get_call_translation_service
        service = get_call_translation_service()
        result = await service.stop()
        return result
    except Exception as e:
        return {"status": "error", "message": str(e)}


@call_router.post("/reset-stats")
async def reset_call_stats():
    """重置通话同传统计"""
    try:
        from app.services.call_translation import get_call_translation_service
        service = get_call_translation_service()
        service.reset_stats()
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# ── 平台状态路由 ─────────────────────────────────────────────
platform_router = APIRouter(prefix="/api/platform", tags=["平台"])


@platform_router.get("/status")
async def get_platform_status(
    config = Depends(get_config_manager),
):
    """获取平台连接状态"""
    try:
        # 直接创建管理器实例（不再依赖 app.state）
        from collectors.manager import CollectorManager
        cm = CollectorManager()
        status = {}
        for platform, collector in cm.collectors.items():
            status[platform] = {
                "connected": collector.is_connected if hasattr(collector, 'is_connected') else False,
            }
        return {
            "status": "ok",
            "connected": any(s.get("connected", False) for s in status.values()),
            "platforms": status,
        }
    except Exception as e:
        return {
            "status": "error",
            "message": str(e),
            "connected": False,
        }


# ── 本地 LLM 路由 ─────────────────────────────────────────────
local_llm_router = APIRouter(prefix="/api/local-llm", tags=["本地LLM"])


@local_llm_router.get("/status")
async def get_local_llm_status():
    """获取本地 LLM 状态（Ollama/CUDA）"""
    try:
        from app.services.llm_service import get_local_llm_manager
        manager = get_local_llm_manager()
        status = await manager.get_status()
        return {"status": "success", **status}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@local_llm_router.get("/models")
async def list_local_models():
    """获取已安装模型列表"""
    try:
        from app.services.llm_service import get_local_llm_manager
        manager = get_local_llm_manager()
        models = await manager.list_models()
        return {"status": "success", "models": [m.to_dict() for m in models]}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@local_llm_router.post("/models/{model_name}")
async def delete_local_model(model_name: str):
    """删除指定模型"""
    try:
        from app.services.llm_service import get_local_llm_manager
        manager = get_local_llm_manager()
        result = await manager.delete_model(model_name)
        return result
    except Exception as e:
        return {"status": "error", "message": str(e)}


@local_llm_router.post("/pull")
async def pull_local_model(request: Dict[str, str]):
    """拉取/下载模型"""
    model_name = request.get("model_name", "")
    if not model_name:
        return {"status": "error", "message": "model_name required"}
    try:
        from app.services.llm_service import get_local_llm_manager
        manager = get_local_llm_manager()
        return await manager.pull_model(model_name)
    except Exception as e:
        return {"status": "error", "message": str(e)}


@local_llm_router.put("/config")
async def save_local_llm_config(request: Dict[str, Any]):
    """保存本地 LLM 配置"""
    try:
        from config_manager import get_config_manager
        config = get_config_manager()
        success = config.update_config(request)
        return {"status": "success" if success else "error"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# ── 聚合所有路由 ─────────────────────────────────────────────
def register_routes(app):
    """注册所有路由到 FastAPI 应用"""
    app.include_router(translation_router)
    app.include_router(audio_router)
    app.include_router(language_router)
    app.include_router(config_router)
    app.include_router(tts_router)
    app.include_router(call_router)
    app.include_router(platform_router)
    app.include_router(local_llm_router)
    print("[OK] API routes registered")
