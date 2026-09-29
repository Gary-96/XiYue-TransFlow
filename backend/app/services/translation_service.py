"""
乐曼同传 Leman Translate - 翻译后端
参考 Voicebox 架构，实现多翻译引擎
"""
import asyncio
import logging
from pathlib import Path
from typing import Optional, Dict, Any

from app.core.base import TranslatorBackend
from config_manager import get_config_manager

logger = logging.getLogger(__name__)

# ── SOUL Prompt 缓存（打包环境适配）────────────────────────────
_SOUL_PROMPT_CACHE: Optional[str] = None
_SOUL_PROMPT_PATHS = [
    Path(__file__).resolve().parents[3] / "prompts" / "vietnam-live.SOUL.md",  # 开发环境
    Path(__file__).resolve().parents[2] / "prompts" / "vietnam-live.SOUL.md",  # 打包后 (PyInstaller)
]


def _load_soul_prompt() -> Optional[str]:
    """加载 SOUL Prompt，读取一次后缓存到内存"""
    global _SOUL_PROMPT_CACHE
    if _SOUL_PROMPT_CACHE is not None:
        return _SOUL_PROMPT_CACHE
    _SOUL_PROMPT_PATHS.append(
        Path(__file__).resolve().parents[1] / "prompts" / "vietnam-live.SOUL.md"  # venv 模式
    )
    for path in _SOUL_PROMPT_PATHS:
        if path.exists():
            try:
                with open(path, "r", encoding="utf-8") as f:
                    _SOUL_PROMPT_CACHE = f.read().strip()
                logger.info(f"SOUL Prompt loaded from {path}")
                return _SOUL_PROMPT_CACHE
            except Exception as e:
                logger.warning(f"Failed to load SOUL Prompt from {path}: {e}")
                continue
    logger.warning("SOUL Prompt file not found, using fallback")
    return None


class BaseTranslator(TranslatorBackend):
    """翻译后端基类"""
    
    name = "base_translator"
    _config = None
    
    def __init__(self):
        super().__init__()
        self._config = get_config_manager()
    
    def get_api_key(self, provider: str) -> str:
        """获取指定提供商的 API Key"""
        return self._config.get_api_key(provider)
    
    def get_endpoint(self, provider: str) -> str:
        """获取指定提供商的端点"""
        return self._config.get_endpoint(provider)
    
    def get_model(self, provider: str) -> str:
        """获取指定提供商的模型"""
        return self._config.get_model(provider)
    
    def is_available(self) -> bool:
        """检查是否可用"""
        api_key = self.get_api_key(self.name)
        return bool(api_key)
    
    def get_name(self) -> str:
        """获取名称"""
        return self.name


class GeminiTranslator(BaseTranslator):
    """Google Gemini 翻译（超低延时优化）"""

    name = "gemini"
    _model = None

    def __init__(self):
        super().__init__()
        self._model = None

    def _ensure_model(self) -> bool:
        """延迟初始化 Gemini 模型"""
        if self._model is not None:
            return True

        api_key = self.get_api_key("gemini")
        if not api_key:
            logger.warning("Gemini API Key not configured")
            return False

        try:
            import google.generativeai as genai
            genai.configure(api_key=api_key)
            # 使用 flash 模型实现极速翻译
            model_name = self.get_model("gemini") or "gemini-1.5-flash"
            self._model = genai.GenerativeModel(model_name)
            logger.info(f"Gemini model initialized (low-latency): {model_name}")
            return True
        except Exception as e:
            logger.error(f"Failed to init Gemini model: {e}")
            return False

    def reset(self):
        """重置模型（API Key 变更后调用）"""
        self._model = None

    async def translate(self, text: str, source_lang: str, target_lang: str) -> Optional[str]:
        """执行翻译（使用 run_in_executor 避免阻塞事件循环）"""
        if not self._ensure_model():
            return None

        prompt = self._build_prompt(text, source_lang, target_lang)
        loop = asyncio.get_running_loop()

        def do_translate():
            response = self._model.generate_content(prompt)
            return response.text.strip()

        try:
            translated = await loop.run_in_executor(None, do_translate)
            return translated if translated else None
        except Exception as e:
            logger.error(f"Gemini translation error: {e}")
            return None
    
    @staticmethod
    def _build_prompt(text: str, source_lang: str, target_lang: str) -> str:
        """构建翻译 prompt"""
        lang_map = {
            "zh": "中文", "vi": "越南语", "en": "英语",
            "ja": "日语", "ko": "韩语", "th": "泰语",
        }
        source_name = lang_map.get(source_lang, source_lang)
        target_name = lang_map.get(target_lang, target_lang)
        return f"请将以下{source_name}翻译成{target_name}，只返回翻译结果，不要添加任何解释：\n\n{text}"
    
    def get_name(self) -> str:
        return "Google Gemini"


class OpenAICompatibleTranslator(BaseTranslator):
    """OpenAI 兼容翻译（Groq/DeepSeek/OpenAI）"""
    
    def __init__(self, provider: str):
        self._provider = provider
        super().__init__()
    
    @property
    def name(self) -> str:
        return self._provider
    
    async def translate(self, text: str, source_lang: str, target_lang: str) -> Optional[str]:
        """执行翻译"""
        api_key = self.get_api_key(self._provider)
        endpoint = self.get_endpoint(self._provider)
        model = self.get_model(self._provider)
        
        if not api_key or not endpoint or not model:
            logger.error(f"Missing config for {self._provider}")
            return None
        
        prompt = self._build_prompt(text, source_lang, target_lang)
        url = f"{endpoint.rstrip('/')}/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 512,
            "temperature": 0.3,
        }
        
        try:
            import aiohttp
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    url, headers=headers, json=payload,
                    timeout=aiohttp.ClientTimeout(total=30)
                ) as resp:
                    if resp.status != 200:
                        body = await resp.text()
                        logger.error(f"{self._provider} translation failed ({resp.status}): {body[:200]}")
                        return None
                    
                    data = await resp.json()
                    translated = data["choices"][0]["message"]["content"].strip()
                    return translated if translated else None
        except Exception as e:
            logger.error(f"{self._provider} translation error: {e}")
            return None
    
    @staticmethod
    def _build_prompt(text: str, source_lang: str, target_lang: str) -> str:
        """构建翻译 prompt - 中越/越中场景优先使用 SOUL Prompt"""
        from app.services.language_manager import TRANSLATION_PROMPTS
        src_s, tgt_s = source_lang.lower(), target_lang.lower()
        key = f"{src_s}_to_{tgt_s}"

        # 越南语 → 中文场景优先使用 SOUL Prompt
        if src_s == "vi" and tgt_s == "zh":
            soul = _load_soul_prompt()
            if soul:
                return f"{soul}\n\n越南语原文: {text}\n\n中文译文:"

        # 中文 → 越南语场景也尝试使用 SOUL（如果有的话）
        if src_s == "zh" and tgt_s == "vi":
            soul = _load_soul_prompt()
            if soul:
                # 提取 SOUL 中的核心规则，拼接中文→越南语指令
                return f"{soul}\n\n请将以下中文翻译成越南语直播口语：{text}"

        # 其他语言对使用原有 Prompt 模板
        if key in TRANSLATION_PROMPTS:
            return TRANSLATION_PROMPTS[key].format(text=text)

        # Fallback: 通用翻译指令
        lang_map = {"zh": "中文", "vi": "越南语", "en": "英语", "ja": "日语", "ko": "韩语", "th": "泰语"}
        source_name = lang_map.get(src_s, src_s)
        target_name = lang_map.get(tgt_s, tgt_s)
        return f"请将以下{source_name}翻译成{target_name}，只返回翻译结果，不要添加任何解释：\n\n{text}"
    
    def get_name(self) -> str:
        from config_manager import PROVIDER_META
        return PROVIDER_META.get(self._provider, {}).get("label_zh", self._provider)


# ── 翻译服务工厂 ──────────────────────────────────────────────
class TranslationService:
    """翻译服务 - 根据配置动态选择后端"""
    
    def __init__(self):
        self._config = get_config_manager()
        self._backends = {
            "gemini": GeminiTranslator(),
            "groq": OpenAICompatibleTranslator("groq"),
            "deepseek": OpenAICompatibleTranslator("deepseek"),
            "openai": OpenAICompatibleTranslator("openai"),
        }
        logger.info("TranslationService initialized")
    
    def _get_backend(self) -> BaseTranslator:
        """根据配置获取当前翻译后端"""
        provider = self._config.get_current_provider()
        return self._backends.get(provider, self._backends["gemini"])
    
    async def translate(
        self,
        text: str,
        source_lang: str,
        target_lang: str,
        is_partial: bool = False,
    ) -> Optional[str]:
        """
        执行翻译（支持 Partial 流式翻译）

        Args:
            text: 待翻译文本
            source_lang: 源语言
            target_lang: 目标语言
            is_partial: 是否为 Partial（中间）结果，True 时使用更短的超时
        Returns:
            翻译结果字符串或 None
        """
        if not text or not text.strip():
            return None

        backend = self._get_backend()
        if not backend.is_available():
            logger.error(f"Translation backend {backend.name} not available")
            return None

        # Partial 结果使用更短的超时（0.5s vs 3s）
        timeout = 0.5 if is_partial else 3.0

        try:
            translated = await asyncio.wait_for(
                backend.translate(text, source_lang, target_lang),
                timeout=timeout,
            )
            return translated if translated else None
        except asyncio.TimeoutError:
            logger.warning(f"Translation timeout ({timeout}s) for text: {text[:30]}...")
            return None
        except Exception as e:
            logger.error(f"Translation error: {e}")
            return None
    
    def reload_config(self):
        """配置变更后重新加载（重置 Gemini 缓存）"""
        if "gemini" in self._backends:
            self._backends["gemini"].reset()
        logger.info("TranslationService config reloaded")
    
    def get_info(self) -> Dict[str, Any]:
        """获取翻译服务信息"""
        provider = self._config.get_current_provider()
        backend = self._get_backend()
        return {
            "provider": provider,
            "backend_name": backend.get_name(),
            "model": self._config.get_model(provider),
            "endpoint": self._config.get_endpoint(provider),
            "api_key_configured": bool(self._config.get_api_key(provider)),
            "available_providers": list(self._backends.keys()),
        }
