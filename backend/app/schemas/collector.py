"""采集器 API Schema"""
from pydantic import BaseModel, Field
from typing import Optional, List


class ConnectCollectorRequest(BaseModel):
    """连接采集器请求"""
    platform: str = Field(..., description="平台名称: douyin, tiktok, mock")
    identifier: str = Field(..., description="房间 ID 或用户标识")


class ConnectCollectorResponse(BaseModel):
    """连接响应"""
    status: str
    platform: Optional[str] = None
    identifier: Optional[str] = None
    message: Optional[str] = None


class CollectorStatusResponse(BaseModel):
    """采集器状态"""
    status: str
    active_platform: Optional[str] = None
    available_platforms: List[str] = []
    total_messages: int = 0
    total_errors: int = 0
    switch_count: int = 0


class DisconnectCollectorResponse(BaseModel):
    """断开响应"""
    status: str
    message: str
