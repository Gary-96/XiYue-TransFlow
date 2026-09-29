"""
Collector API Routes
职责：HTTP/WebSocket 接口层
不直接调用 CollectorManager，而是通过 dependencies 获取
"""
import logging
from typing import Any, Dict

from fastapi import APIRouter, Depends

from app.api.dependencies import get_collector_manager
from app.collectors.manager import CollectorManager

logger = logging.getLogger(__name__)

collector_router = APIRouter(prefix="/api/collector", tags=["弹幕采集"])


@collector_router.post("/connect")
async def connect_collector(
    request: Dict[str, str],
    collector_manager: CollectorManager = Depends(get_collector_manager),
) -> Dict[str, Any]:
    """
    连接弹幕采集器
    前端契约：POST /api/collector/connect { platform, identifier }
    """
    try:
        platform = request.get("platform", "douyin")
        identifier = request.get("identifier", "")

        if not identifier:
            return {"status": "error", "message": "identifier 不能为空"}

        result = await collector_manager.connect(platform, identifier)

        if result.get("success"):
            return {
                "status": "success",
                "platform": result.get("platform"),
                "identifier": identifier,
                "message": result.get("message", "连接成功"),
            }
        else:
            return {
                "status": "error",
                "message": result.get("error", "连接失败"),
            }
    except Exception as e:
        logger.error(f"Failed to connect collector: {e}", exc_info=True)
        return {"status": "error", "message": str(e)}


@collector_router.post("/disconnect")
async def disconnect_collector(
    collector_manager: CollectorManager = Depends(get_collector_manager),
) -> Dict[str, Any]:
    """断开弹幕采集器"""
    try:
        success = await collector_manager.disconnect()
        return {
            "status": "success" if success else "error",
            "message": "已断开连接" if success else "断开失败",
        }
    except Exception as e:
        logger.error(f"Failed to disconnect collector: {e}", exc_info=True)
        return {"status": "error", "message": str(e)}


@collector_router.get("/status")
async def get_collector_status(
    collector_manager: CollectorManager = Depends(get_collector_manager),
) -> Dict[str, Any]:
    """获取采集器状态"""
    try:
        status = await collector_manager.get_status()
        return status
    except Exception as e:
        logger.error(f"Failed to get collector status: {e}", exc_info=True)
        return {"status": "error", "message": str(e)}


@collector_router.get("/available-platforms")
async def get_available_platforms(
    collector_manager: CollectorManager = Depends(get_collector_manager),
) -> Dict[str, Any]:
    """获取可用平台列表"""
    return {
        "status": "success",
        "platforms": collector_manager.get_available_platforms(),
    }
