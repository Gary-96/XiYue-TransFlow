"""
乐曼同传 Leman Translate - 统一数据模型
"""
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional
import time


class TranslationDirection(Enum):
    ZH_TO_VI = "zh_to_vi"
    VI_TO_ZH = "vi_to_zh"


@dataclass
class TranscriptionResult:
    text: str
    language: str
    confidence: float
    timestamp: float = field(default_factory=time.time)


@dataclass
class TranslationResult:
    text: str
    source_language: str
    target_language: str
    direction: str
    timestamp: float = field(default_factory=time.time)


@dataclass
class CommentMessage:
    user: str
    text: str
    platform: str
    language: str
    translated_text: str = ""
    timestamp: float = field(default_factory=time.time)


@dataclass
class SubtitleEvent:
    """同传字幕事件"""
    source_text: str
    translated_text: str
    source_lang: str
    target_lang: str
    speaker: str = "主播"
    timestamp: float = field(default_factory=time.time)
    event_id: str = ""


@dataclass
class TranslationRequest:
    """翻译请求结构"""
    text: str
    source_language: str = "zh"
    target_language: str = "vi"
