"""喜阅 TransFlow API Routes 包"""
import logging
from fastapi import FastAPI

from .collector import router

logger = logging.getLogger(__name__)


def register_routes(app: FastAPI) -> None:
    """注册所有路由"""
    app.include_router(router)
    logger.info("[OK] API routes registered")

