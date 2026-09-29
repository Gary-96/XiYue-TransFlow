"""
喜阅 TransFlow - 新架构主入口 (v2)
基于 Voicebox 架构模式，依赖注入 + 路由拆分
"""
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import register_routes
from app.api.websocket import router as websocket_router
# 保留向后兼容：如果旧 routes.py 还在，导入它
try:
    from app.api import routes as _legacy_routes
except ImportError:
    _legacy_routes = None
from app.core.base import BaseService
from config_manager import get_config_manager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理 — 仅初始化轻量服务，collector 懒加载"""
    logger.info("启动喜阅 TransFlow v2 (新架构)...")

    # ── 轻量服务（无重型依赖，快速初始化） ──────────────────────
    from app.services.whisper_service import WhisperService
    from app.services.translation_service import TranslationService
    from app.services.tts_service import tts_service

    # Whisper / TTS / Translation 都是轻量实例化（模型延迟加载）
    app.state.whisper_service = WhisperService()
    app.state.translation_service = TranslationService()
    app.state.tts_service = tts_service
    app.state.config_manager = get_config_manager()

    # collector_manager 不在此初始化 —— 推迟到用户首次切换平台时按需创建
    app.state.collector_manager = None

    logger.info("FastAPI 已就绪 (轻量初始化)")
    yield

    logger.info("关闭喜阅 TransFlow...")
    if hasattr(app.state, 'collector_manager') and app.state.collector_manager:
        await app.state.collector_manager.stop_all_platforms()


# 创建 FastAPI 应用
app = FastAPI(
    title="喜阅 TransFlow API v2",
    version="0.2.0",
    lifespan=lifespan,
)

# 配置 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:*", "http://127.0.0.1:*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
# 注册新路由模块
from app.api.routes import register_routes as _register_new_routes
_register_new_routes(app)
app.include_router(websocket_router)

# 根路由
@app.get("/")
async def root():
    return {"message": "喜阅 TransFlow API v2 运行中"}

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "version": "0.2.0",
        "architecture": "voicebox-style",
    }


if __name__ == "__main__":
    import uvicorn
    import sys
    import socket

    # 固定端口 15387，不自动递增
    PORT = 15387
    HOST = "127.0.0.1"

    # 检查端口是否被占用
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        sock.bind((HOST, PORT))
        sock.close()
        print(f"[OK] Port {PORT} is available")
    except OSError as e:
        print(f"[ERROR] Port {PORT} is in use ({e})")
        print(f"  Please run:")
        print(f"  netstat -ano | findstr :{PORT}")
        print(f"  taskkill /F /PID <PID>")
        sys.exit(1)

    print(f"[INFO] Starting TransFlow v0.2.0 on http://{HOST}:{PORT}")
    uvicorn.run(app, host=HOST, port=PORT, reload=False)

