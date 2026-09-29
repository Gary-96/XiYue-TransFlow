"""乐曼同传 API Routes 包"""
import logging
from fastapi import FastAPI

from .collector import collector_router

logger = logging.getLogger(__name__)


def register_routes(app: FastAPI) -> None:
    """注册所有路由"""
    app.include_router(collector_router)
    logger.info("[OK] API routes registered")
