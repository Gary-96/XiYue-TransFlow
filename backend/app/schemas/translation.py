"""翻译 API Schema"""
from pydantic import BaseModel, Field
from typing import Optional


class TranslationRequest(BaseModel):
    """翻译请求"""
    text: str = Field(..., description="待翻译文本")
    source_language: str = Field("zh", description="源语言")
    target_language: str = Field("vi", description="目标语言")


class TranslationResponse(BaseModel):
    """翻译响应"""
    status: str
    text: str
    source_language: str
    target_language: str
    provider: Optional[str] = None
    latency_ms: Optional[float] = None


class TranslationBatchRequest(BaseModel):
    """批量翻译请求"""
    items: List[TranslationRequest]


class TranslationBatchResponse(BaseModel):
    """批量翻译响应"""
    status: str
    results: List[TranslationResponse]
