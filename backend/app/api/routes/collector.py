"""
Collector 相关 API 路由
基于新的架构：CollectorManager + CollectorRegistry
"""
from __future__ import annotations

import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException

from app.api.dependencies import get_collector_manager
from app.collectors.manager import CollectorManager
from app.schemas.collector import (
    ConnectCollectorRequest,
    ConnectCollectorResponse,
    CollectorStatusResponse,
    DisconnectCollectorResponse,
)
from app.schemas.common import ApiResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/collector", tags=["Collector"])


@router.post("/connect", response_model=ApiResponse)
async def connect_collector(
    body: ConnectCollectorRequest,
    manager: CollectorManager = Depends(get_collector_manager),
):
    """连接指定平台的采集器"""
    result = await manager.connect(body.platform, body.identifier)
    
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("message", "连接失败"))
    
    return {
        "status": "success",
        "data": {
            "platform": body.platform,
            "identifier": body.identifier,
            "message": result.get("message"),
        },
    }


@router.post("/disconnect", response_model=ApiResponse)
async def disconnect_collector(
    manager: CollectorManager = Depends(get_collector_manager),
):
    """断开当前连接的采集器"""
    result = await manager.disconnect()
    
    return {
        "status": "success",
        "data": {
            "message": result.get("message", "已断开"),
        },
    }


@router.get("/status", response_model=ApiResponse)
async def get_collector_status(
    manager: CollectorManager = Depends(get_collector_manager),
):
    """获取采集器状态"""
    return {
        "status": "success",
        "data": manager.get_status(),
    }


@router.get("/available-platforms", response_model=ApiResponse)
async def get_available_platforms(
    manager: CollectorManager = Depends(get_collector_manager),
):
    """获取可用的平台列表"""
    platforms = manager.get_available_platforms()
    
    return {
        "status": "success",
        "data": {
            "platforms": platforms,
        },
    }
