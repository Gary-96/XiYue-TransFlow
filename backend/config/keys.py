"""
乐曼同传 — API Key 管理
负责密钥存储、脱敏显示、环境变量同步
"""
import logging
from typing import Dict, Optional

from .base import PROVIDER_META

logger = logging.getLogger(__name__)


class KeyManager:
    """API Key 管理器"""

    def __init__(self, keys: Dict[str, str]):
        self._keys: Dict[str, str] = dict(keys)
        self._runtime_keys: Dict[str, str] = {}

    def get_api_key(self, provider: Optional[str] = None) -> str:
        """获取指定服务商的 API Key"""
        provider = provider or "gemini"
        return self._keys.get(provider, "")

    def get_safe_key(self, provider: Optional[str] = None) -> str:
        """获取脱敏后的密钥（用于显示）"""
        key = self.get_api_key(provider)
        if not key:
            return ""
        if len(key) > 8:
            return key[:4] + "****" + key[-4:]
        return "****"

    def has_key(self, provider: Optional[str] = None) -> bool:
        """检查是否配置了密钥"""
        return bool(self.get_api_key(provider))

    def set_key(self, provider: str, key: str) -> bool:
        """设置 API Key"""
        if provider not in PROVIDER_META:
            logger.error(f"Unknown provider: {provider}")
            return False
        self._keys[provider] = key.strip()
        self._runtime_keys[provider] = key.strip()
        return True

    def clear_key(self, provider: str) -> bool:
        """清除 API Key"""
        if provider in self._keys:
            del self._keys[provider]
        if provider in self._runtime_keys:
            del self._runtime_keys[provider]
        return True

    def get_all_keys(self) -> Dict[str, str]:
        """获取所有密钥（脱敏）"""
        return {p: self.get_safe_key(p) for p in PROVIDER_META}

    def validate_key(self, provider: str, key: str) -> bool:
        """验证密钥格式"""
        if not key or not key.strip():
            return False
        if "****" in key:
            return False
        return True
