"""
乐曼同传 Leman Translate — 配置管理器
负责 API Key 持久化、服务商切换、连通性校验、抖音/TikTok 采集配置与代理设置
"""
import asyncio
import json
import logging
import os
from pathlib import Path
import sys
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


# ── 路径解析 ──────────────────────────────────────────────
def _get_config_dir() -> Path:
    """获取配置文件目录"""
    # 1. 打包模式：使用系统 appData
    if sys.platform == "win32":
        appdata = os.environ.get("APPDATA")
        if appdata:
            p = Path(appdata) / "leman-translate"
            p.mkdir(parents=True, exist_ok=True)
            return p
    elif sys.platform == "darwin":
        home = Path.home()
        p = home / "Library" / "Application Support" / "leman-translate"
        p.mkdir(parents=True, exist_ok=True)
        return p
    else:
        home = Path.home()
        p = home / ".config" / "leman-translate"
        p.mkdir(parents=True, exist_ok=True)
        return p

    # 2. 回退到项目根目录
    return Path(__file__).resolve().parent.parent


CONFIG_PATH = _get_config_dir() / "config.json"

# ── 默认配置 ──────────────────────────────────────────────
DEFAULT_CONFIG: Dict[str, Any] = {
    "current_provider": "gemini",
    "keys": {
        "gemini": "",
        "groq": "",
        "deepseek": "",
        "openai": "",
    },
    "custom_endpoints": {
        "gemini": "",
        "groq": "https://api.groq.com/openai/v1",
        "deepseek": "https://api.deepseek.com/v1",
        "openai": "https://api.openai.com/v1",
    },
    "models": {
        "gemini": "gemini-1.5-flash",
        "groq": "llama-3.3-70b-versatile",
        "deepseek": "deepseek-chat",
        "openai": "gpt-4o-mini",
    },
    "mode": "auto",  # auto | manual
    # ── 4 路独立音频设备路由 ───────────────────────────
    "audio_devices": {
        "mic_input": None,           # 1. 麦克风输入 (主播说话，用于 ASR)
        "translation_output": None,  # 2. 主播翻译输出 (TTS 播放给观众/虚拟声卡)
        "remote_input": None,        # 3. 对方/系统声音输入 (连麦/系统 Loopback，用于 ASR)
        "remote_output": None,       # 4. 对方翻译输出 (TTS 播放给主播耳机)
    },
    # 兼容旧版字段（迁移期间保留，新代码应使用 audio_devices）
    "audio_device_id": None,  # None = system default; int = device index
    "voice_id": "zh-CN-female-1",  # TTS 音色 ID
    "language_pair": {"src_lang": "zh", "tgt_lang": "vi"},  # 源语言 → 目标语言
    # ── 新增：弹幕抓取与风控配置 ─────────────────────────
    "douyin_cookie": "",  # 抖音网页版 Cookie (防止风控)
    "tiktok_unique_id": "",  # TikTok 主播账号 ID
    "proxy_url": "http://127.0.0.1:10808",  # HTTP/SOCKS5 代理地址
    # ── Whisper 语音识别配置 ────────────────────────────
    "whisper_model_size": "base",  # tiny / base / small / medium / large-v2 / large-v3
    "whisper_device": "cuda",      # cuda / cpu / auto
    "whisper_model_dir": "",       # 模型下载目录（空=默认缓存路径）
    # ── 本地大模型配置 ─────────────────────────────────
    "local_backend": "ollama",  # ollama | cuda
    "local_model_dir": "",       # 模型存储目录（空=默认）
    "local_model_name": "",      # 当前选中的模型名（Ollama 用）
    "local_ollama_url": "http://127.0.0.1:11434",  # Ollama 服务地址
    "local_cuda_model_path": "",  # CUDA 本地模型文件路径（.gguf）
    "local_cuda_download_url": "",  # CUDA 模型下载链接
    # ── 服务端口配置 ─────────────────────────────────────
    "server_port": 15387,        # API 服务端口（固定，不自动偏移）
}

# ── 服务商元数据 ──────────────────────────────────────────
PROVIDER_META: Dict[str, Dict[str, str]] = {
    "gemini": {
        "label": "Google Gemini",
        "env_key": "GEMINI_API_KEY",
        "label_zh": "Google Gemini（默认）",
    },
    "groq": {
        "label": "Groq",
        "env_key": "GROQ_API_KEY",
        "label_zh": "Groq（超低延迟）",
    },
    "deepseek": {
        "label": "DeepSeek",
        "env_key": "DEEPSEEK_API_KEY",
        "label_zh": "DeepSeek（高性价比）",
    },
    "openai": {
        "label": "OpenAI",
        "env_key": "OPENAI_API_KEY",
        "label_zh": "OpenAI（全能）",
    },
}


class ConfigManager:
    """配置管理器单例"""

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
        self._config: Dict[str, Any] = {}
        self._runtime_keys: Dict[str, str] = {}  # 内存中存储敏感 Key，避免泄露到环境变量
        self._load()

    # ── 持久化 ───────────────────────────────────────────

    def _load(self) -> None:
        """从磁盘加载配置，合并环境变量"""
        env_config = self._read_env()

        if CONFIG_PATH.exists():
            try:
                with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                    saved = json.load(f)
                # 合并：磁盘文件优先，补全默认值
                self._config = self._deep_merge(DEFAULT_CONFIG, saved)
                # 环境变量作为 fallback（磁盘空时用环境变量）
                for provider, key in env_config.items():
                    if not self._config["keys"].get(provider):
                        self._config["keys"][provider] = key
            except Exception as e:
                logger.warning(
                    f"Failed to load config.json: {e}, using defaults"
                )
                self._config = json.loads(json.dumps(DEFAULT_CONFIG))
                self._config["keys"].update(env_config)
        else:
            # 首次启动：用默认值 + 环境变量
            self._config = json.loads(json.dumps(DEFAULT_CONFIG))
            self._config["keys"].update(env_config)
            self._save()

        # 同步环境变量供其他模块使用
        self._sync_env()
        logger.info(
            f"Config loaded | provider={self._config['current_provider']} | path={CONFIG_PATH}"
        )

    def _read_env(self) -> Dict[str, str]:
        """从环境变量读取 API Keys"""
        keys: Dict[str, str] = {}
        for provider, meta in PROVIDER_META.items():
            val = os.environ.get(meta["env_key"], "").strip()
            if val:
                keys[provider] = val
        return keys

    def _sync_env(self) -> None:
        """把当前配置同步到环境变量，供 translation_service 与 collector 读取"""
        # 不再使用 os.environ 存储敏感 Key，改用内存属性
        # 仅同步非敏感配置到环境变量
        proxy = self._config.get("proxy_url", "")
        if proxy:
            os.environ["HTTP_PROXY"] = proxy
            os.environ["HTTPS_PROXY"] = proxy

    def _save(self) -> bool:
        """保存配置到磁盘"""
        try:
            with open(CONFIG_PATH, "w", encoding="utf-8") as f:
                json.dump(self._config, f, indent=2, ensure_ascii=False)
            logger.info(f"Config saved to {CONFIG_PATH}")
            return True
        except Exception as e:
            logger.error(f"Failed to save config: {e}")
            return False

    @staticmethod
    def _deep_merge(base: dict, override: dict) -> dict:
        """深度合并字典"""
        result = json.loads(json.dumps(base))
        for k, v in override.items():
            if (
                k in result
                and isinstance(result[k], dict)
                and isinstance(v, dict)
            ):
                result[k] = ConfigManager._deep_merge(result[k], v)
            else:
                result[k] = v
        return result

    # ── 读取 ─────────────────────────────────────────────

    def get_config(self) -> Dict[str, Any]:
        """获取完整配置（API Key 脱敏）"""
        safe = json.loads(json.dumps(self._config))
        for provider in safe.get("keys", {}):
            key = safe["keys"][provider]
            if key and len(key) > 8:
                safe["keys"][provider] = key[:4] + "****" + key[-4:]
            elif key:
                safe["keys"][provider] = "****"
        return safe

    def get_raw_config(self) -> Dict[str, Any]:
        """获取完整配置（不脱敏，内部使用）"""
        return self._config

    def get_current_provider(self) -> str:
        return self._config.get("current_provider", "gemini")

    def get_api_key(self, provider: Optional[str] = None) -> str:
        """获取指定服务商的 API Key（默认当前服务商）"""
        provider = provider or self.get_current_provider()
        return self._config.get("keys", {}).get(provider, "")

    def get_endpoint(self, provider: Optional[str] = None) -> str:
        provider = provider or self.get_current_provider()
        return self._config.get("custom_endpoints", {}).get(provider, "")

    def get_model(self, provider: Optional[str] = None) -> str:
        provider = provider or self.get_current_provider()
        return self._config.get("models", {}).get(provider, "")

    def get_mode(self) -> str:
        return self._config.get("mode", "auto")

    def get_audio_device_id(self) -> Optional[int]:
        """获取音频输入设备 ID（None = 系统默认）—— 兼容旧版"""
        # 优先从 audio_devices.mic_input 读取
        audio_devices = self._config.get("audio_devices", {})
        if audio_devices.get("mic_input") is not None:
            return audio_devices["mic_input"]
        # 回退到旧版字段
        return self._config.get("audio_device_id")

    def get_audio_devices(self) -> Dict[str, Optional[int]]:
        """获取 4 路音频设备配置"""
        return self._config.get("audio_devices", {
            "mic_input": None,
            "translation_output": None,
            "remote_input": None,
            "remote_output": None,
        })

    def get_audio_device(self, device_key: str) -> Optional[int]:
        """获取指定路由的音频设备 ID"""
        return self._config.get("audio_devices", {}).get(device_key)

    def set_audio_device(self, device_key: str, device_id: Optional[int]) -> bool:
        """设置指定路由的音频设备 ID"""
        valid_keys = {"mic_input", "translation_output", "remote_input", "remote_output"}
        if device_key not in valid_keys:
            logger.error(f"Invalid audio device key: {device_key}")
            return False
        self._config.setdefault("audio_devices", {})[device_key] = device_id
        # 同步旧版字段
        if device_key == "mic_input":
            self._config["audio_device_id"] = device_id
        return self._save()

    def get_voice_id(self) -> str:
        """获取当前 TTS 音色 ID"""
        return self._config.get("voice_id", "zh-CN-female-1")

    def get_language_pair(self) -> Dict[str, str]:
        """获取当前语言对"""
        return self._config.get(
            "language_pair", {"src_lang": "zh", "tgt_lang": "vi"}
        )

    # 新增：获取弹幕与代理配置 getter
    def get_douyin_cookie(self) -> str:
        return self._config.get("douyin_cookie", "")

    def get_proxy_url(self) -> str:
        return self._config.get("proxy_url", "")

    # ── 写入 ─────────────────────────────────────────────

    def set_provider(self, provider: str) -> bool:
        """切换当前服务商"""
        if provider not in PROVIDER_META:
            logger.error(f"Unknown provider: {provider}")
            return False
        self._config["current_provider"] = provider
        self._sync_env()
        return self._save()

    def set_api_key(self, provider: str, api_key: str) -> bool:
        """设置指定服务商的 API Key（仅存储于内存，不再同步到环境变量）"""
        if provider not in PROVIDER_META:
            return False
        self._config.setdefault("keys", {})[provider] = api_key.strip()
        self._runtime_keys[provider] = api_key.strip()  # 内存存储
        return self._save()

    def set_endpoint(self, provider: str, endpoint: str) -> bool:
        """设置自定义端点"""
        self._config.setdefault("custom_endpoints", {})[provider] = (
            endpoint.strip()
        )
        return self._save()

    def set_mode(self, mode: str) -> bool:
        if mode in ("auto", "manual"):
            self._config["mode"] = mode
            return self._save()
        return False

    def update_config(self, updates: Dict[str, Any]) -> bool:
        """批量更新配置"""
        if "current_provider" in updates:
            if updates["current_provider"] not in PROVIDER_META:
                return False
            self._config["current_provider"] = updates["current_provider"]

        if "keys" in updates and isinstance(updates["keys"], dict):
            for provider, key in updates["keys"].items():
                if provider in PROVIDER_META and key and key != "****":
                    if "****" not in str(key):
                        self._config["keys"][provider] = str(key).strip()

        if "custom_endpoints" in updates and isinstance(
            updates["custom_endpoints"], dict
        ):
            for provider, ep in updates["custom_endpoints"].items():
                if provider in PROVIDER_META:
                    self._config["custom_endpoints"][provider] = str(
                        ep
                    ).strip()

        if "models" in updates and isinstance(updates["models"], dict):
            for provider, model in updates["models"].items():
                if provider in PROVIDER_META:
                    self._config["models"][provider] = str(model).strip()

        if "mode" in updates:
            self.set_mode(updates["mode"])

        if "audio_device_id" in updates:
            dev_id = updates["audio_device_id"]
            if dev_id is None or (isinstance(dev_id, int) and dev_id >= 0):
                self._config["audio_device_id"] = dev_id
                # 同步到 audio_devices.mic_input
                self._config.setdefault("audio_devices", {})["mic_input"] = dev_id

        # ── 新增：4 路音频设备路由更新 ───────────────────
        if "audio_devices" in updates and isinstance(updates["audio_devices"], dict):
            valid_keys = {"mic_input", "translation_output", "remote_input", "remote_output"}
            for key, dev_id in updates["audio_devices"].items():
                if key in valid_keys:
                    if dev_id is None or (isinstance(dev_id, int) and dev_id >= 0):
                        self._config.setdefault("audio_devices", {})[key] = dev_id
            # 同步旧版字段
            mic = self._config.get("audio_devices", {}).get("mic_input")
            if mic is not None:
                self._config["audio_device_id"] = mic

        if "voice_id" in updates and isinstance(updates["voice_id"], str):
            self._config["voice_id"] = updates["voice_id"]

        if "language_pair" in updates and isinstance(
            updates["language_pair"], dict
        ):
            src = updates["language_pair"].get("src_lang", "")
            tgt = updates["language_pair"].get("tgt_lang", "")
            if src and tgt:
                self._config["language_pair"] = {
                    "src_lang": src,
                    "tgt_lang": tgt,
                }

        # ── 新增：允许更新弹幕 Cookie、TikTok ID 和代理 ────
        if "douyin_cookie" in updates and isinstance(
            updates["douyin_cookie"], str
        ):
            self._config["douyin_cookie"] = updates["douyin_cookie"].strip()

        if "tiktok_unique_id" in updates and isinstance(
            updates["tiktok_unique_id"], str
        ):
            self._config["tiktok_unique_id"] = updates[
                "tiktok_unique_id"
            ].strip()

        if "proxy_url" in updates and isinstance(updates["proxy_url"], str):
            self._config["proxy_url"] = updates["proxy_url"].strip()

        # ── Whisper 配置更新 ────────────────────────────
        if "whisper_model_size" in updates and isinstance(updates["whisper_model_size"], str):
            valid_sizes = ("tiny", "base", "small", "medium", "large-v2", "large-v3")
            if updates["whisper_model_size"] in valid_sizes:
                self._config["whisper_model_size"] = updates["whisper_model_size"]

        if "whisper_device" in updates and isinstance(updates["whisper_device"], str):
            if updates["whisper_device"] in ("cuda", "cpu", "auto"):
                self._config["whisper_device"] = updates["whisper_device"]

        if "whisper_model_dir" in updates and isinstance(updates["whisper_model_dir"], str):
            self._config["whisper_model_dir"] = updates["whisper_model_dir"].strip()

        self._sync_env()
        return self._save()

    # ── 本地大模型配置 getter ────────────────────────────
    # ── Whisper 配置 getter ────────────────────────────
    def get_whisper_model_size(self) -> str:
        """获取 Whisper 模型大小"""
        return self._config.get("whisper_model_size", "base")

    def get_whisper_device(self) -> str:
        """获取 Whisper 运行设备 (cuda / cpu / auto)"""
        return self._config.get("whisper_device", "cuda")

    def get_whisper_model_dir(self) -> str:
        """获取 Whisper 模型下载目录（空=默认缓存路径）"""
        return self._config.get("whisper_model_dir", "")

    # ── 本地大模型配置 getter ────────────────────────────
    def get_local_backend(self) -> str:
        return self._config.get("local_backend", "ollama")

    def get_local_model_dir(self) -> str:
        path = self._config.get("local_model_dir", "")
        if path:
            return path
        # 默认：APPDATA/leman-translate/models
        if sys.platform == "win32":
            appdata = os.environ.get("APPDATA", "")
            if appdata:
                return str(Path(appdata) / "leman-translate" / "models")
        return str(Path.home() / ".leman-translate" / "models")

    def get_local_model_name(self) -> str:
        return self._config.get("local_model_name", "")

    def get_local_ollama_url(self) -> str:
        return self._config.get("local_ollama_url", "http://127.0.0.1:11434")

    def get_local_cuda_model_path(self) -> str:
        return self._config.get("local_cuda_model_path", "")

    def get_local_cuda_download_url(self) -> str:
        return self._config.get("local_cuda_download_url", "")

    def get_local_llamacpp_path(self) -> str:
        """获取 llama.cpp 可执行文件路径"""
        return self._config.get("local_llamacpp_path", "")

    def get_server_port(self) -> int:
        """获取服务器端口（从配置读取，默认 15387）"""
        return self._config.get("server_port", 15387)

    def set_server_port(self, port: int) -> bool:
        """更新服务器端口"""
        if 1 <= port <= 65535:
            self._config["server_port"] = port
            return self._save()
        return False

    # ── 本地大模型配置 setter ────────────────────────────
    def set_local_config(self, updates: Dict[str, Any]) -> bool:
        """批量更新本地大模型配置"""
        if "local_backend" in updates:
            if updates["local_backend"] not in ("ollama", "cuda"):
                return False
            self._config["local_backend"] = updates["local_backend"]

        if "local_model_dir" in updates:
            path = str(updates["local_model_dir"]).strip()
            if path:
                Path(path).mkdir(parents=True, exist_ok=True)
            self._config["local_model_dir"] = path

        if "local_model_name" in updates:
            self._config["local_model_name"] = str(updates["local_model_name"]).strip()

        if "local_ollama_url" in updates:
            url = str(updates["local_ollama_url"]).strip()
            if url:
                self._config["local_ollama_url"] = url

        if "local_cuda_model_path" in updates:
            path = str(updates["local_cuda_model_path"]).strip()
            self._config["local_cuda_model_path"] = path

        if "local_cuda_download_url" in updates:
            url = str(updates["local_cuda_download_url"]).strip()
            self._config["local_cuda_download_url"] = url

        return self._save()

    async def validate_api_key(
        self, provider: str, api_key: str
    ) -> Dict[str, Any]:
        """
        校验 API Key 连通性：向服务商发送一个极简 test prompt
        """
        if provider not in PROVIDER_META:
            return {
                "valid": False,
                "message": f"不支持的服务商: {provider}",
                "latency_ms": 0,
            }

        if not api_key or not api_key.strip():
            return {
                "valid": False,
                "message": "API Key 不能为空",
                "latency_ms": 0,
            }

        if "****" in api_key:
            return {
                "valid": False,
                "message": "请输入完整的 API Key",
                "latency_ms": 0,
            }

        import time

        start = time.time()

        try:
            if provider == "gemini":
                result = await self._validate_gemini(api_key.strip())
            elif provider in ("groq", "deepseek", "openai"):
                endpoint = self._config.get("custom_endpoints", {}).get(
                    provider, ""
                )
                model = self._config.get("models", {}).get(provider, "")
                result = await self._validate_openai_compatible(
                    provider, api_key.strip(), endpoint, model
                )
            else:
                result = {
                    "valid": False,
                    "message": f"未实现的校验: {provider}",
                }

            latency = int((time.time() - start) * 1000)
            result["latency_ms"] = latency
            return result

        except asyncio.TimeoutError:
            return {
                "valid": False,
                "message": "连接超时（15秒）",
                "latency_ms": 15000,
            }
        except Exception as e:
            latency = int((time.time() - start) * 1000)
            return {
                "valid": False,
                "message": f"校验异常: {str(e)}",
                "latency_ms": latency,
            }

    async def _validate_gemini(self, api_key: str) -> Dict[str, Any]:
        """校验 Gemini API Key"""
        try:
            import google.generativeai as genai

            genai.configure(api_key=api_key)
            model = genai.GenerativeModel("gemini-1.5-flash")

            loop = asyncio.get_running_loop()

            def test():
                return model.generate_content("Hi")

            await asyncio.wait_for(
                loop.run_in_executor(None, test), timeout=15
            )
            return {"valid": True, "message": "Gemini API Key 验证成功"}
        except Exception as e:
            err = str(e)
            if "API_KEY_INVALID" in err or "API key not valid" in err:
                return {"valid": False, "message": "Gemini API Key 无效"}
            return {"valid": False, "message": f"Gemini 校验失败: {err}"}

    async def _validate_openai_compatible(
        self, provider: str, api_key: str, endpoint: str, model: str
    ) -> Dict[str, Any]:
        """校验 OpenAI 兼容接口（Groq / DeepSeek / OpenAI）"""
        try:
            import aiohttp
        except ImportError:
            return {"valid": False, "message": "缺少 aiohttp 依赖"}

        if not endpoint:
            return {
                "valid": False,
                "message": f"未配置 {provider} 的 API 端点",
            }

        if not model:
            return {
                "valid": False,
                "message": f"未配置 {provider} 的模型名",
            }

        url = f"{endpoint.rstrip('/')}/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": "Hi"}],
            "max_tokens": 5,
            "stream": False,
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    url,
                    headers=headers,
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=15),
                ) as resp:
                    if resp.status == 200:
                        return {
                            "valid": True,
                            "message": f"{PROVIDER_META[provider]['label']} API Key 验证成功",
                        }
                    elif resp.status == 401:
                        body = await resp.text()
                        return {
                            "valid": False,
                            "message": f"API Key 无效（401）: {body[:100]}",
                        }
                    elif resp.status == 404:
                        return {
                            "valid": False,
                            "message": f"模型不存在（404）: 检查 {model}",
                        }
                    else:
                        body = await resp.text()
                        return {
                            "valid": False,
                            "message": f"HTTP {resp.status}: {body[:150]}",
                        }
        except aiohttp.ClientConnectorError:
            return {"valid": False, "message": f"无法连接到 {endpoint}"}
        except aiohttp.ClientError as e:
            return {"valid": False, "message": f"网络错误: {str(e)}"}


# ── 模块级单例 ────────────────────────────────────────────
_config_manager: Optional[ConfigManager] = None


def get_config_manager() -> ConfigManager:
    """获取配置管理器单例"""
    global _config_manager
    if _config_manager is None:
        _config_manager = ConfigManager()
    return _config_manager


def get_config_path() -> Path:
    """获取配置文件路径"""
    return CONFIG_PATH