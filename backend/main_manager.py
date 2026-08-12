"""
乐曼同传 Leman Translate - 新架构主入口 (v2)
基于 Voicebox 架构模式，依赖注入 + 路由拆分
"""
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import register_routes
from app.api.websocket import router as websocket_router
from app.core.base import BaseService
from config_manager import get_config_manager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    logger.info("启动乐曼同传 v2 (新架构)...")
    
    # 初始化服务
    from app.services.whisper_service import WhisperService
    from app.services.translation_service import TranslationService
    from app.services.tts_service import tts_service
    from collectors.manager import create_collector_manager
    
    app.state.whisper_service = WhisperService()
    app.state.translation_service = TranslationService()
    app.state.collector_manager = create_collector_manager()
    app.state.config_manager = get_config_manager()
    
    logger.info("服务初始化完成")
    yield
    
    logger.info("关闭乐曼同传...")
    if hasattr(app.state, 'collector_manager') and app.state.collector_manager:
        await app.state.collector_manager.stop_all_platforms()


# 创建 FastAPI 应用
app = FastAPI(
    title="乐曼同传 Leman Translate API v2",
    version="0.2.0",
    lifespan=lifespan,
)

# 配置 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
register_routes(app)
app.include_router(websocket_router)

# 根路由
@app.get("/")
async def root():
    return {"message": "乐曼同传 API v2 运行中"}

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "version": "0.2.0",
        "architecture": "voicebox-style",
    }


if __name__ == "__main__":
    import uvicorn
    
    # 固定端口 15387，不自动递增
    PORT = 15387
    HOST = "127.0.0.1"
    
    # 检查端口是否被占用
    import socket
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        sock.bind((HOST, PORT))
        sock.close()
        print(f"✅ 端口 {PORT} 可用")
    except OSError as e:
        print(f"❌ 错误: 端口 {PORT} 被占用 ({e})")
        print(f"   请执行以下命令清理进程:")
        print(f"   netstat -ano | findstr :{PORT}")
        print(f"   taskkill /F /PID <PID>")
        exit(1)
    
    print(f"🚀 启动乐曼同传后端 v0.2.0 于 http://{HOST}:{PORT}")
    uvicorn.run(app, host=HOST, port=PORT, reload=False)
