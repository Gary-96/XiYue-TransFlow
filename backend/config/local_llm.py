"""
乐曼同传 — 本地大模型配置
负责 Ollama/CUDA 后端配置管理
"""
import logging
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

VALID_LOCAL_BACKENDS = ("ollama", "cuda")


class LocalLLMConfig:
    """本地大模型配置管理器"""

    def __init__(self, config: Dict[str, Any]):
        self._config = dict(config)

    def get_backend(self) -> str:
        """获取当前后端类型"""
        return self._config.get("local_backend", "ollama")

    def is_ollama(self) -> bool:
        """检查是否使用 Ollama 后端"""
        return self.get_backend() == "ollama"

    def is_cuda(self) -> bool:
        """检查是否使用 CUDA 后端"""
        return self.get_backend() == "cuda"

    def get_model_dir(self) -> str:
        """获取模型存储目录"""
        path = self._config.get("local_model_dir", "")
        if path:
            return path
        # 默认：APPDATA/leman-translate/models
        if self._config.get("_platform") == "win32":
            appdata = self._config.get("_appdata", "")
            if appdata:
                return str(Path(appdata) / "leman-translate" / "models")
        return str(Path.home() / ".leman-translate" / "models")

    def get_model_name(self) -> str:
        """获取当前模型名称"""
        return self._config.get("local_model_name", "")

    def get_ollama_url(self) -> str:
        """获取 Ollama 服务地址"""
        return self._config.get("local_ollama_url", "http://127.0.0.1:11434")

    def get_cuda_model_path(self) -> str:
        """获取 CUDA 模型文件路径"""
        return self._config.get("local_cuda_model_path", "")

    def get_cuda_download_url(self) -> str:
        """获取 CUDA 模型下载链接"""
        return self._config.get("local_cuda_download_url", "")

    def set_backend(self, backend: str) -> bool:
        """切换后端类型"""
        if backend not in VALID_LOCAL_BACKENDS:
            logger.error(f"Invalid backend: {backend}")
            return False
        self._config["local_backend"] = backend
        return True

    def set_model_dir(self, path: str) -> bool:
        """设置模型存储目录"""
        if path:
            Path(path).mkdir(parents=True, exist_ok=True)
        self._config["local_model_dir"] = path
        return True

    def set_model_name(self, name: str) -> bool:
        """设置模型名称"""
        self._config["local_model_name"] = name.strip()
        return True

    def set_ollama_url(self, url: str) -> bool:
        """设置 Ollama 服务地址"""
        url = url.strip()
        if url:
            self._config["local_ollama_url"] = url
        return True

    def set_cuda_model_path(self, path: str) -> bool:
        """设置 CUDA 模型路径"""
        self._config["local_cuda_model_path"] = path.strip()
        return True

    def set_cuda_download_url(self, url: str) -> bool:
        """设置 CUDA 模型下载链接"""
        self._config["local_cuda_download_url"] = url.strip()
        return True

    def to_dict(self) -> Dict[str, Any]:
        """序列化为字典"""
        return {
            "local_backend": self.get_backend(),
            "local_model_dir": self._config.get("local_model_dir", ""),
            "local_model_name": self.get_model_name(),
            "local_ollama_url": self.get_ollama_url(),
            "local_cuda_model_path": self.get_cuda_model_path(),
            "local_cuda_download_url": self.get_cuda_download_url(),
        }
