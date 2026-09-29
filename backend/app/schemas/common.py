"""通用响应 Schema"""
from pydantic import BaseModel
from typing import Any, Generic, TypeVar, Optional

T = TypeVar("T")


class ApiResponse(BaseModel, Generic[T]):
    """统一 API 响应"""
    status: str = "success"
    data: Optional[T] = None
    message: Optional[str] = None


class ErrorResponse(BaseModel):
    """错误响应"""
    status: str = "error"
    message: str
    code: Optional[str] = None


class PaginationParams(BaseModel):
    """分页参数"""
    page: int = 1
    page_size: int = 20
