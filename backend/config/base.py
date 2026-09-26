"""
乐曼同传 — 配置基础层
负责路径解析、默认配置、配置加载与保存
"""
import json
import logging
import os
import sys
from pathlib import Path
from typing import Any, Dict

logger = logging.getLogger(__name__)


# ── 路径解析 ──────────────────────────────────────────────

def _get_config_dir() -> Path:
    """获取配置文件目录"""
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
    "mode": "auto",
    "audio_devices": {
        "mic_input": None,
        "translation_output": None,
        "remote_input": None,
        "remote_output": None,
    },
    "audio_device_id": None,
    "voice_id": "zh-CN-female-1",
    "language_pair": {"src_lang": "zh", "tgt_lang": "vi"},
    "douyin_cookie": "",
    "tiktok_unique_id": "",
    "proxy_url": "http://127.0.0.1:10808",
    "whisper_model_size": "base",
    "whisper_device": "cuda",
    "whisper_model_dir": "",
    "local_backend": "ollama",
    "local_model_dir": "",
    "local_model_name": "",
    "local_ollama_url": "http://127.0.0.1:11434",
    "local_cuda_model_path": "",
    "local_cuda_download_url": "",
    "server_port": 15387,
}


# ── 服务商元数据 ──────────────────────────────────────────

PROVIDER_META: Dict[str, Dict[str, str]] = {
    "gemini": {"label": "Google Gemini", "env_key": "GEMINI_API_KEY", "label_zh": "Google Gemini（默认）"},
    "groq": {"label": "Groq", "env_key": "GROQ_API_KEY", "label_zh": "Groq（超低延迟）"},
    "deepseek": {"label": "DeepSeek", "env_key": "DEEPSEEK_API_KEY", "label_zh": "DeepSeek（高性价比）"},
    "openai": {"label": "OpenAI", "env_key": "OPENAI_API_KEY", "label_zh": "OpenAI（全能）"},
}


# ── 工具函数 ──────────────────────────────────────────────

def _deep_merge(base: dict, override: dict) -> dict:
    """深度合并字典"""
    result = json.loads(json.dumps(base))
    for k, v in override.items():
        if k in result and isinstance(result[k], dict) and isinstance(v, dict):
            result[k] = _deep_merge(result[k], v)
        else:
            result[k] = v
    return result


def get_config_path() -> Path:
    """获取配置文件路径"""
    return CONFIG_PATH


def load_config() -> Dict[str, Any]:
    """加载配置文件"""
    if CONFIG_PATH.exists():
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                saved = json.load(f)
            return _deep_merge(DEFAULT_CONFIG, saved)
        except Exception as e:
            logger.warning(f"Failed to load config.json: {e}, using defaults")
    return json.loads(json.dumps(DEFAULT_CONFIG))
