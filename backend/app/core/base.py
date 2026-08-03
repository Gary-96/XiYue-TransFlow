"""
乐曼同传 Leman Translate - 核心抽象基类
参考 Voicebox 架构，定义服务的标准接口
"""
from abc import ABC, abstractmethod
from typing import Any, Dict, Optional


class BaseService(ABC):
    """所有服务的抽象基类，定义统一的生命周期接口"""
    
    name: str = "base"
    
    def __init__(self):
        self._ready = False
        self._initialized = False
    
    @abstractmethod
    async def initialize(self) -> bool:
        """初始化服务，返回是否成功"""
        pass
    
    @abstractmethod
    async def shutdown(self) -> None:
        """关闭服务，释放资源"""
        pass
    
    def is_ready(self) -> bool:
        """检查服务是否就绪"""
        return self._ready
    
    def get_info(self) -> Dict[str, Any]:
        """获取服务信息"""
        return {
            "name": self.name,
            "ready": self._ready,
            "initialized": self._initialized,
        }


class TranslatorBackend(ABC):
    """翻译后端抽象类 - 支持多服务商切换"""
    
    name: str = "translator"
    
    @abstractmethod
    async def translate(
        self,
        text: str,
        source_lang: str,
        target_lang: str,
    ) -> Optional[str]:
        """执行翻译，返回翻译文本或 None"""
        pass
    
    @abstractmethod
    def is_available(self) -> bool:
        """检查后端是否可用（API Key 等）"""
        pass
    
    @abstractmethod
    def get_name(self) -> str:
        """获取后端显示名称"""
        pass


class ASRBackend(ABC):
    """语音识别后端抽象类"""
    
    name: str = "asr"
    
    @abstractmethod
    async def transcribe(
        self,
        audio_data: bytes,
        language: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """执行语音识别，返回结果字典或 None"""
        pass
    
    @abstractmethod
    def is_available(self) -> bool:
        """检查后端是否可用"""
        pass


class TTSBackend(ABC):
    """语音合成后端抽象类"""
    
    name: str = "tts"
    
    @abstractmethod
    async def synthesize(
        self,
        text: str,
        voice_id: str,
        language: str,
        **kwargs,
    ) -> Optional[bytes]:
        """执行语音合成，返回音频字节流或 None"""
        pass
    
    @abstractmethod
    def get_voices(self) -> Dict[str, Any]:
        """获取可用音色列表"""
        pass
    
    @abstractmethod
    def set_voice(self, voice_id: str) -> bool:
        """设置当前音色"""
        pass
