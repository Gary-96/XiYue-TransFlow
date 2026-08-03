"""
乐曼同传 Leman Translate — 本地大模型服务
支持 Ollama 后端 + CUDA (llama.cpp) 后端
实现模型下载、推理、健康管理
"""
import asyncio
import json
import logging
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional

import aiohttp
from config_manager import get_config_manager

logger = logging.getLogger(__name__)

# 默认存储目录
def _get_default_model_dir() -> Path:
    appdata = os.environ.get("APPDATA", "")
    return Path(appdata) / "leman-translate" / "models"


# ── 模型信息 ──────────────────────────────────────────────
class LocalModel:
    name: str
    size: int  # bytes
    digest: str

    def __init__(self, name: str, size: int, digest: str):
        self.name = name
        self.size = size
        self.digest = digest

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "size": self.size,
            "digest": self.digest,
            "size_human": self._human_size(self.size),
        }

    @staticmethod
    def _human_size(b: int) -> str:
        for unit in ("B", "KB", "MB", "GB"):
            if b < 1024:
                return f"{b:.1f} {unit}"
            b /= 1024
        return f"{b:.1f} TB"


# ── Ollama 后端 ───────────────────────────────────────────
class OllamaBackend:
    """Ollama 后端：管理本地 Ollama 实例，支持 pull / list / chat / delete"""

    def __init__(self, base_url: str = "http://127.0.0.1:11434"):
        self.base_url = base_url.rstrip("/")

    @property
    def is_available(self) -> bool:
        return asyncio.get_running_loop().run_until_complete(self._check_health())

    async def _check_health(self) -> bool:
        try:
            async with aiohttp.ClientSession() as sess:
                async with sess.get(f"{self.base_url}/api/version",
                                     timeout=aiohttp.ClientTimeout(total=3)) as resp:
                    return resp.status == 200
        except Exception:
            return False

    async def list_models(self) -> List[LocalModel]:
        try:
            async with aiohttp.ClientSession() as sess:
                async with sess.get(f"{self.base_url}/api/tags",
                                     timeout=aiohttp.ClientTimeout(total=10)) as resp:
                    data = await resp.json()
                    models = data.get("models", [])
                    return [
                        LocalModel(
                            name=m["name"],
                            size=m.get("size", 0),
                            digest=m.get("digest", ""),
                        )
                        for m in models
                    ]
        except Exception as e:
            logger.error(f"Ollama list_models failed: {e}")
            return []

    async def pull_model(self, model_name: str, stream: bool = False) -> Dict[str, Any]:
        """拉取模型，返回状态 dict（含 progress）"""
        url = f"{self.base_url}/api/pull"
        payload = {"name": model_name, "stream": stream}
        try:
            async with aiohttp.ClientSession() as sess:
                async with sess.post(url, json=payload,
                                      timeout=aiohttp.ClientTimeout(total=600)) as resp:
                    if resp.status == 200:
                        return {"status": "success", "message": f"开始拉取 {model_name}"}
                    body = await resp.text()
                    return {"status": "error", "message": body[:500]}
        except asyncio.TimeoutError:
            return {"status": "timeout", "message": "拉取超时（请检查网络）"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    async def delete_model(self, model_name: str) -> Dict[str, Any]:
        try:
            async with aiohttp.ClientSession() as sess:
                async with sess.delete(f"{self.base_url}/api/delete",
                                        json={"name": model_name},
                                        timeout=aiohttp.ClientTimeout(total=30)) as resp:
                    return {"status": "success"} if resp.status == 200 else {"status": "error", "message": "删除失败"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    async def chat(self, model_name: str, prompt: str,
                   system: str = "", messages: Optional[List[Dict]] = None) -> Dict[str, Any]:
        """调用模型进行推理（非流式，返回完整响应）"""
        url = f"{self.base_url}/api/chat"
        payload = {"model": model_name, "messages": messages or [{"role": "user", "content": prompt}]}
        if system:
            payload["messages"][0]["system"] = system
        try:
            async with aiohttp.ClientSession() as sess:
                async with sess.post(url, json=payload,
                                      timeout=aiohttp.ClientTimeout(total=120)) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        return {
                            "status": "success",
                            "response": data.get("message", {}).get("content", ""),
                            "total_duration": data.get("total_duration"),
                        }
                    body = await resp.text()
                    return {"status": "error", "message": body[:500]}
        except asyncio.TimeoutError:
            return {"status": "timeout", "message": "推理超时"}
        except Exception as e:
            return {"status": "error", "message": str(e)}


# ── CUDA (llama.cpp) 后端 ───────────────────────────────
class CUDABackend:
    """CUDA 后端：使用 llama.cpp + 自定义模型文件"""

    def __init__(self, model_path: str = "", llamacpp_path: str = ""):
        self.model_path = Path(model_path) if model_path else None
        self.llamacpp_path = Path(llamacpp_path) if llamacpp_path else None

    @property
    def is_available(self) -> bool:
        if not self.model_path or not self.model_path.exists():
            return False
        if self.llamacpp_path and self.llamacpp_path.exists():
            return True
        # 如果没有指定 llamacpp_path，尝试系统路径
        return self._find_llamacpp() is not None

    def _find_llamacpp(self) -> Optional[Path]:
        """在常见路径查找 llama-server 或 llama-bin"""
        candidates = [
            Path.home() / ".cache" / "llama.cpp" / "llama-server.exe",
            Path.home() / "llama.cpp" / "llama-server.exe",
            Path(__file__).parent.parent.parent.parent / "llama-server.exe",
        ]
        for p in candidates:
            if p.exists():
                return p
        return None

    async def download_model(self, url: str, dest_path: str) -> Dict[str, Any]:
        """从 URL 下载模型文件到本地"""
        dest = Path(dest_path)
        dest.parent.mkdir(parents=True, exist_ok=True)
        try:
            async with aiohttp.ClientSession() as sess:
                async with sess.get(url, timeout=aiohttp.ClientTimeout(total=3600),
                                     ssl=False) as resp:
                    if resp.status != 200:
                        return {"status": "error", "message": f"HTTP {resp.status}"}
                    total = resp.content.length or 0
                    downloaded = 0
                    with open(dest, "wb") as f:
                        while True:
                            chunk = await resp.content.read(8 * 1024 * 1024)
                            if not chunk:
                                break
                            f.write(chunk)
                            downloaded += len(chunk)
                            if total:
                                pct = downloaded / total * 100
                                logger.info(f"CUDA download: {pct:.1f}% ({downloaded}/{total})")
                    return {
                        "status": "success",
                        "path": str(dest),
                        "size": downloaded,
                        "size_human": self._human_size(downloaded),
                    }
        except asyncio.TimeoutError:
            return {"status": "error", "message": "下载超时"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    async def chat(self, model_path: str, prompt: str,
                   system: str = "", n_ctx: int = 2048,
                   temperature: float = 0.7) -> Dict[str, Any]:
        """使用 llama.cpp 进行推理（通过子进程调用）"""
        llamacpp = self.llamacpp_path or self._find_llamacpp()
        if not llamacpp or not llamacpp.exists():
            return {"status": "error", "message": "llama.cpp 未找到，请设置 llamacpp_path"}
        if not Path(model_path).exists():
            return {"status": "error", "message": f"模型文件不存在: {model_path}"}

        cmd = [
            str(llamacpp),
            "-m", str(model_path),
            "-p", prompt,
            "--temp", str(temperature),
            "-c", str(n_ctx),
            "--no-mmap",
        ]
        if system:
            cmd += ["--system", system]

        try:
            loop = asyncio.get_running_loop()
            proc = await loop.run_in_executor(
                None,
                lambda: subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            )
            if proc.returncode == 0:
                return {"status": "success", "response": proc.stdout.strip()}
            return {"status": "error", "message": proc.stderr[:500]}
        except subprocess.TimeoutExpired:
            return {"status": "timeout", "message": "推理超时"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    @staticmethod
    def _human_size(b: int) -> str:
        for unit in ("B", "KB", "MB", "GB"):
            if b < 1024:
                return f"{b:.1f} {unit}"
            b /= 1024
        return f"{b:.1f} TB"


# ── 本地模型管理器（统一入口）────────────────────────────
class LocalLLMManager:
    """统一管理 Ollama / CUDA 两个后端"""

    def __init__(self):
        self._config = get_config_manager()
        self._ollama: Optional[OllamaBackend] = None
        self._cuda: Optional[CUDABackend] = None

    def _get_ollama(self) -> OllamaBackend:
        if self._ollama is None:
            url = self._config.get_local_ollama_url() or "http://127.0.0.1:11434"
            self._ollama = OllamaBackend(url)
        return self._ollama

    def _get_cuda(self) -> CUDABackend:
        if self._cuda is None:
            model_path = self._config.get_local_cuda_model_path()
            llamacpp_path = self._config.get_local_llamacpp_path()
            self._cuda = CUDABackend(model_path, llamacpp_path)
        return self._cuda

    # ── 健康检查 ──────────────────────────────────────────
    def get_status(self) -> Dict[str, Any]:
        return {
            "backend": self._config.get_local_backend(),
            "ollama_available": self._get_ollama().is_available,
            "ollama_url": self._config.get_local_ollama_url(),
            "cuda_available": self._get_cuda().is_available,
            "cuda_model_path": self._config.get_local_cuda_model_path(),
            "cuda_llamacpp_path": self._config.get_local_llamacpp_path(),
            "model_dir": str(_get_default_model_dir()),
        }

    # ── 模型列表 ──────────────────────────────────────────
    async def list_models(self) -> List[LocalModel]:
        backend = self._config.get_local_backend()
        if backend == "ollama":
            return await self._get_ollama().list_models()
        elif backend == "cuda":
            path = self._config.get_local_cuda_model_path()
            if path and Path(path).exists():
                return [LocalModel(name=Path(path).name, size=Path(path).stat().st_size, digest="")]
            return []
        return []

    # ── 拉取模型 ──────────────────────────────────────────
    async def pull_model(self, model_name: str) -> Dict[str, Any]:
        backend = self._config.get_local_backend()
        if backend == "ollama":
            return await self._get_ollama().pull_model(model_name)
        elif backend == "cuda":
            url = self._config.get_local_cuda_download_url()
            model_dir = self._config.get_local_model_dir()
            dest = Path(model_dir) / f"{model_name}.gguf"
            if not url:
                return {"status": "error", "message": "请先配置 CUDA 模型下载链接"}
            return await self._get_cuda().download_model(url, str(dest))
        return {"status": "error", "message": "未知后端"}

    # ── 删除模型 ──────────────────────────────────────────
    async def delete_model(self, model_name: str) -> Dict[str, Any]:
        backend = self._config.get_local_backend()
        if backend == "ollama":
            return await self._get_ollama().delete_model(model_name)
        elif backend == "cuda":
            model_dir = Path(self._config.get_local_model_dir())
            target = model_dir / f"{model_name}.gguf"
            if target.exists():
                target.unlink()
                return {"status": "success"}
            return {"status": "error", "message": "模型文件不存在"}
        return {"status": "error", "message": "未知后端"}

    # ── 推理 ──────────────────────────────────────────────
    async def chat(self, prompt: str, system: str = "") -> Dict[str, Any]:
        backend = self._config.get_local_backend()
        if backend == "ollama":
            model = self._config.get_local_model_name()
            if not model:
                return {"status": "error", "message": "请先选择模型"}
            return await self._get_ollama().chat(model, prompt, system)
        elif backend == "cuda":
            model_path = self._config.get_local_cuda_model_path()
            if not model_path or not Path(model_path).exists():
                return {"status": "error", "message": "请先下载或指定 CUDA 模型"}
            return await self._get_cuda().chat(model_path, prompt, system)
        return {"status": "error", "message": "未知后端"}


# ── 模块级单例 ──────────────────────────────────────────────
_local_llm_manager: Optional[LocalLLMManager] = None


def get_local_llm_manager() -> LocalLLMManager:
    global _local_llm_manager
    if _local_llm_manager is None:
        _local_llm_manager = LocalLLMManager()
    return _local_llm_manager
