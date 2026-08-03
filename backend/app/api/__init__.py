"""
乐曼同传 Leman Translate - API 模块
"""
from app.api.routes import register_routes
from app.api.websocket import router as websocket_router

__all__ = [
    "register_routes",
    "websocket_router",
]
