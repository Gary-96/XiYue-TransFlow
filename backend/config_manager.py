"""
喜阅 TransFlow — 配置管理器（代理层）
代理到 config/ 包，保持向后兼容
"""
import asyncio
import json
import logging
from typing import Any, Dict, Optional

from config import (
    CONFIG_PATH,
    KeyManager,
    AudioConfig,
    LocalLLMConfig,
    load_config,
)

logger = logging.getLogger(__name__)


class ConfigManager:
    """配置管理器单例（代理层）"""

    _instance: Optional["ConfigManager"] = None

    def __new__(cls) -> "ConfigManager":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self._config = load_config()
        self._key_manager = KeyManager(self._config.get("keys", {}))
        self._audio_config = AudioConfig(self._config.get("audio_devices", {}))
        self._local_llm_config = LocalLLMConfig(self._config)
        logger.info(f"Config loaded | path={CONFIG_PATH}")

    # ── 路径 ──────────────────────────────────────────────

    def get_config_path(self) -> str:
        return str(CONFIG_PATH)

    # ── 基础配置 ──────────────────────────────────────────

    def get_config(self) -> Dict[str, Any]:
        return dict(self._config)

    def get_current_provider(self) -> str:
        return self._config.get("current_provider", "gemini")

    def set_provider(self, provider: str) -> bool:
        if provider not in ("gemini", "groq", "deepseek", "openai"):
            return False
        self._config["current_provider"] = provider
        return self._save()

    # ── API Key ───────────────────────────────────────────

    def get_api_key(self, provider: Optional[str] = None) -> str:
        return self._key_manager.get_api_key(provider)

    def get_safe_key(self, provider: Optional[str] = None) -> str:
        return self._key_manager.get_safe_key(provider)

    def has_api_key(self, provider: Optional[str] = None) -> bool:
        return self._key_manager.has_key(provider)

    def set_api_key(self, provider: str, key: str) -> bool:
        return self._key_manager.set_key(provider, key)

    def clear_api_key(self, provider: str) -> bool:
        return self._key_manager.clear_key(provider)

    # ── 端点与模型 ────────────────────────────────────────

    def get_endpoint(self, provider: Optional[str] = None) -> str:
        provider = provider or self.get_current_provider()
        return self._config.get("custom_endpoints", {}).get(provider, "")

    def set_endpoint(self, provider: str, endpoint: str) -> bool:
        self._config.setdefault("custom_endpoints", {})[provider] = endpoint.strip()
        return self._save()

    def get_model(self, provider: Optional[str] = None) -> str:
        provider = provider or self.get_current_provider()
        return self._config.get("models", {}).get(provider, "")

    def set_model(self, provider: str, model: str) -> bool:
        self._config.setdefault("models", {})[provider] = model.strip()
        return self._save()

    # ── 工作模式 ──────────────────────────────────────────

    def get_mode(self) -> str:
        return self._config.get("mode", "auto")

    def set_mode(self, mode: str) -> bool:
        if mode not in ("auto", "manual"):
            return False
        self._config["mode"] = mode
        return self._save()

    # ── 音频设备 ──────────────────────────────────────────

    def get_audio_device_id(self) -> Optional[int]:
        return self._audio_config.get_mic_input()

    def get_audio_devices(self) -> Dict[str, Optional[int]]:
        return self._audio_config.get_all_devices()

    def get_audio_device(self, key: str) -> Optional[int]:
        return self._audio_config.get_device(key)

    def set_audio_device(self, key: str, device_id: Optional[int]) -> bool:
        result = self._audio_config.set_device(key, device_id)
        if result:
            return self._save()
        return result

    # ── TTS 音色 ──────────────────────────────────────────

    def get_voice_id(self) -> str:
        return self._config.get("voice_id", "zh-CN-female-1")

    def set_voice_id(self, voice_id: str) -> bool:
        self._config["voice_id"] = voice_id.strip()
        return self._save()

    # ── 语言对 ────────────────────────────────────────────

    def get_language_pair(self) -> Dict[str, str]:
        return self._config.get("language_pair", {"src_lang": "zh", "tgt_lang": "vi"})

    def set_language_pair(self, src_lang: str, tgt_lang: str) -> bool:
        if not src_lang or not tgt_lang:
            return False
        self._config["language_pair"] = {"src_lang": src_lang, "tgt_lang": tgt_lang}
        return self._save()

    # ── 弹幕配置 ──────────────────────────────────────────

    def get_douyin_cookie(self) -> str:
        return self._config.get("douyin_cookie", "")

    def set_douyin_cookie(self, cookie: str) -> bool:
        self._config["douyin_cookie"] = cookie.strip()
        return self._save()

    def get_tiktok_unique_id(self) -> str:
        return self._config.get("tiktok_unique_id", "")

    def set_tiktok_unique_id(self, unique_id: str) -> bool:
        self._config["tiktok_unique_id"] = unique_id.strip()
        return self._save()

    # ── 代理 ──────────────────────────────────────────────

    def get_proxy_url(self) -> str:
        return self._config.get("proxy_url", "")

    def set_proxy_url(self, url: str) -> bool:
        self._config["proxy_url"] = url.strip()
        return self._save()

    # ── Whisper 配置 ─────────────────────────────────────

    def get_whisper_model_size(self) -> str:
        return self._config.get("whisper_model_size", "base")

    def get_whisper_device(self) -> str:
        return self._config.get("whisper_device", "auto")

    def get_whisper_model_dir(self) -> str:
        return self._config.get("whisper_model_dir", "")

    def set_whisper_config(self, size: str, device: str, model_dir: str) -> bool:
        valid_sizes = ("tiny", "base", "small", "medium", "large-v2", "large-v3")
        valid_devices = ("cuda", "cpu", "auto")
        if size not in valid_sizes or device not in valid_devices:
            return False
        self._config["whisper_model_size"] = size
        self._config["whisper_device"] = device
        self._config["whisper_model_dir"] = model_dir.strip()
        return self._save()

    # ── 本地大模型配置 ────────────────────────────────────

    def get_local_backend(self) -> str:
        return self._local_llm_config.get_backend()

    def is_ollama_backend(self) -> bool:
        return self._local_llm_config.is_ollama()

    def is_cuda_backend(self) -> bool:
        return self._local_llm_config.is_cuda()

    def get_local_model_dir(self) -> str:
        return self._local_llm_config.get_model_dir()

    def get_local_model_name(self) -> str:
        return self._local_llm_config.get_model_name()

    def get_local_ollama_url(self) -> str:
        return self._local_llm_config.get_ollama_url()

    def get_local_cuda_model_path(self) -> str:
        return self._local_llm_config.get_cuda_model_path()

    def get_local_cuda_download_url(self) -> str:
        return self._local_llm_config.get_cuda_download_url()

    def set_local_config(self, updates: Dict[str, Any]) -> bool:
        changed = False
        if "local_backend" in updates:
            changed |= self._local_llm_config.set_backend(updates["local_backend"])
        if "local_model_dir" in updates:
            changed |= self._local_llm_config.set_model_dir(updates["local_model_dir"])
        if "local_model_name" in updates:
            changed |= self._local_llm_config.set_model_name(updates["local_model_name"])
        if "local_ollama_url" in updates:
            changed |= self._local_llm_config.set_ollama_url(updates["local_ollama_url"])
        if "local_cuda_model_path" in updates:
            changed |= self._local_llm_config.set_cuda_model_path(updates["local_cuda_model_path"])
        if "local_cuda_download_url" in updates:
            changed |= self._local_llm_config.set_cuda_download_url(updates["local_cuda_download_url"])
        if changed:
            return self._save()
        return True

    # ── 服务器端口 ────────────────────────────────────────

    def get_server_port(self) -> int:
        return self._config.get("server_port", 15387)

    def set_server_port(self, port: int) -> bool:
        if 1 <= port <= 65535:
            self._config["server_port"] = port
            return self._save()
        return False

    # ── API Key 校验 ─────────────────────────────────────

    async def validate_api_key(self, provider: str, api_key: str) -> Dict[str, Any]:
        if provider not in ("gemini", "groq", "deepseek", "openai"):
            return {"valid": False, "message": f"不支持的服务商: {provider}"}
        if not api_key or "****" in api_key:
            return {"valid": False, "message": "请输入完整的 API Key"}

        import time
        start = time.time()
        try:
            if provider == "gemini":
                return await self._validate_gemini(api_key)
            else:
                return await self._validate_openai_compat(provider, api_key)
        except Exception as e:
            return {"valid": False, "message": f"校验异常: {str(e)}"}

    async def _validate_gemini(self, api_key: str) -> Dict[str, Any]:
        try:
            import google.generativeai as genai
            genai.configure(api_key=api_key)
            model = genai.GenerativeModel("gemini-1.5-flash")
            loop = asyncio.get_running_loop()

            def test():
                return model.generate_content("Hi")

            await asyncio.wait_for(loop.run_in_executor(None, test), timeout=15)
            return {"valid": True, "message": "Gemini API Key 验证成功"}
        except Exception as e:
            err = str(e)
            if "API_KEY_INVALID" in err or "API key not valid" in err:
                return {"valid": False, "message": "Gemini API Key 无效"}
            return {"valid": False, "message": f"Gemini 校验失败: {err}"}

    async def _validate_openai_compat(
        self, provider: str, api_key: str
    ) -> Dict[str, Any]:
        import aiohttp
        endpoint = self.get_endpoint(provider)
        model = self.get_model(provider)
        if not endpoint:
            return {"valid": False, "message": f"未配置 {provider} 的 API 端点"}
        if not model:
            return {"valid": False, "message": f"未配置 {provider} 的模型名"}

        url = f"{endpoint.rstrip('/')}/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": "Hi"}],
            "max_tokens": 5,
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    url, headers=headers, json=payload,
                    timeout=aiohttp.ClientTimeout(total=15)
                ) as resp:
                    if resp.status == 200:
                        return {"valid": True, "message": f"{provider} API Key 验证成功"}
                    elif resp.status == 401:
                        body = await resp.text()
                        return {"valid": False, "message": f"API Key 无效: {body[:100]}"}
                    else:
                        body = await resp.text()
                        return {"valid": False, "message": f"HTTP {resp.status}: {body[:150]}"}
        except aiohttp.ClientConnectorError:
            return {"valid": False, "message": f"无法连接到 {endpoint}"}
        except asyncio.TimeoutError:
            return {"valid": False, "message": "连接超时"}

    # ── 持久化 ────────────────────────────────────────────

    def _save(self) -> bool:
        try:
            with open(CONFIG_PATH, "w", encoding="utf-8") as f:
                json.dump(self._config, f, indent=2, ensure_ascii=False)
            return True
        except Exception as e:
            logger.error(f"Failed to save config: {e}")
            return False


def get_config_manager() -> ConfigManager:
    """获取配置管理器单例"""
    return ConfigManager()

