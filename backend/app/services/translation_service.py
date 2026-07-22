"""
乐曼同传 Leman Translate — 翻译服务
基于 ConfigManager + LanguageManager 动态读取 API Key 与语言对，支持多服务商切换
"""
import asyncio
import logging
from typing import Optional
from app.models.schemas import TranslationResult, TranslationRequest
from config_manager import get_config_manager
from app.services.language_manager import language_manager

logger = logging.getLogger(__name__)


class TranslationService:
    """翻译服务 — 根据 ConfigManager 配置 + LanguageManager 语言对动态选择服务商"""

    def __init__(self):
        self._config = get_config_manager()
        self._lang_manager = language_manager
        self._gemini_model = None  # 延迟初始化
        logger.info("TranslationService initialized (config-driven)")

    def _ensure_gemini_model(self):
        """延迟初始化 Gemini 模型（只在选中 gemini 时）"""
        if self._gemini_model is not None:
            return True

        api_key = self._config.get_api_key("gemini")
        if not api_key:
            logger.warning("Gemini API Key not configured")
            return False

        try:
            import google.generativeai as genai
            genai.configure(api_key=api_key)
            model_name = self._config.get_model("gemini") or "gemini-1.5-flash"
            self._gemini_model = genai.GenerativeModel(model_name)
            logger.info(f"Gemini model initialized: {model_name}")
            return True
        except Exception as e:
            logger.error(f"Failed to init Gemini model: {e}")
            return False

    def _reset_gemini(self):
        """重置 Gemini 模型（API Key 变更后调用）"""
        self._gemini_model = None

    async def translate_to_vietnamese(self, text: str, source_language: str = "zh") -> Optional[TranslationResult]:
        """
        将文本翻译为越南语（自动使用当前配置的服务商）
        注意：此方法用于旧版兼容，优先使用带语言对的 translate()
        """
        if not text or not text.strip():
            return None

        provider = self._config.get_current_provider()
        api_key = self._config.get_api_key(provider)

        if not api_key:
            logger.error(f"No API Key configured for provider: {provider}")
            return None

        try:
            lang_pair = self._lang_manager.get_current_pair()
            target_lang = lang_pair.tgt_lang
            # Map language code to target language name
            lang_map = {"vi": "越南语", "en": "英语", "ja": "日语", "ko": "韩语", "th": "泰语"}
            target_name = lang_map.get(target_lang, target_lang)
            return await self._translate_by_provider(provider, api_key, text, source_language, target_name)
        except Exception as e:
            logger.error(f"Translation error: {e}")
            return None

    async def translate(self, request: TranslationRequest) -> Optional[TranslationResult]:
        """通用翻译方法"""
        if not request.text or not request.text.strip():
            return None

        provider = self._config.get_current_provider()
        api_key = self._config.get_api_key(provider)

        if not api_key:
            logger.error(f"No API Key configured for provider: {provider}")
            return None

        try:
            return await self._translate_by_provider(
                provider, api_key,
                request.text,
                request.source_language,
                request.target_language,
            )
        except Exception as e:
            logger.error(f"Translation error: {e}")
            return None

    async def _translate_by_provider(
        self, provider: str, api_key: str,
        text: str, source_lang: str, target_lang: str
    ) -> Optional[TranslationResult]:
        """根据提供商执行翻译"""
        if provider == "gemini":
            return await self._translate_gemini(text, source_lang, target_lang)
        elif provider in ("groq", "deepseek", "openai"):
            endpoint = self._config.get_endpoint(provider)
            model = self._config.get_model(provider)
            return await self._translate_openai_compatible(
                provider, api_key, endpoint, model, text, source_lang, target_lang
            )
        else:
            logger.error(f"Unknown provider: {provider}")
            return None

    # ── Gemini ──────────────────────────────────────────

    async def _translate_gemini(
        self, text: str, source_lang: str, target_lang: str
    ) -> Optional[TranslationResult]:
        if not self._ensure_gemini_model():
            return None

        prompt = self._build_prompt(text, source_lang, target_lang)
        loop = asyncio.get_event_loop()

        def do_translate():
            response = self._gemini_model.generate_content(prompt)
            return response.text.strip()

        translated = await loop.run_in_executor(None, do_translate)

        if translated:
            return TranslationResult(
                text=translated,
                source_language=source_lang,
                target_language=target_lang,
                direction=f"{source_lang}_to_{target_lang}"
            )
        return None

    # ── OpenAI 兼容（Groq / DeepSeek / OpenAI）────────

    async def _translate_openai_compatible(
        self, provider: str, api_key: str, endpoint: str, model: str,
        text: str, source_lang: str, target_lang: str
    ) -> Optional[TranslationResult]:
        try:
            import aiohttp
        except ImportError:
            logger.error("aiohttp not installed")
            return None

        if not endpoint or not model:
            logger.error(f"Missing endpoint or model for {provider}")
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
            "stream": False
        }

        async with aiohttp.ClientSession() as session:
            async with session.post(
                url, headers=headers, json=payload,
                timeout=aiohttp.ClientTimeout(total=30)
            ) as resp:
                if resp.status != 200:
                    body = await resp.text()
                    logger.error(f"{provider} translation failed ({resp.status}): {body[:200]}")
                    return None

                data = await resp.json()
                translated = data["choices"][0]["message"]["content"].strip()

                if translated:
                    return TranslationResult(
                        text=translated,
                        source_language=source_lang,
                        target_language=target_lang,
                        direction=f"{source_lang}_to_{target_lang}"
                    )
        return None

    # ── 辅助 ────────────────────────────────────────────

    @staticmethod
    def _build_prompt(text: str, source_lang: str, target_lang: str) -> str:
        """构建翻译 prompt — 优先从 LanguageManager 获取直播间专用 prompt"""
        # LanguageManager 中有按 src→tgt 预置的直播间专用 prompt
        src_short, tgt_short = source_lang.lower(), target_lang.lower()
        # Map full codes to short codes
        lang_short_map = {
            "zh-CN": "zh", "zh": "zh",
            "vi-VN": "vi", "vi": "vi",
            "en-US": "en", "en": "en",
            "ja-JP": "ja", "ja": "ja",
            "ko-KR": "ko", "ko": "ko",
            "th-TH": "th", "th": "th",
        }
        src_s = lang_short_map.get(src_short, src_short[:2])
        tgt_s = lang_short_map.get(tgt_short, tgt_short[:2])

        key = f"{src_s}_to_{tgt_s}"
        from app.services.language_manager import TRANSLATION_PROMPTS

        if key in TRANSLATION_PROMPTS:
            return TRANSLATION_PROMPTS[key].format(text=text)

        # Fallback: 通用翻译指令
        lang_map = {"zh": "中文", "vi": "越南语", "en": "英语", "ja": "日语", "ko": "韩语", "th": "泰语"}
        source_name = lang_map.get(src_s, src_s)
        target_name = lang_map.get(tgt_s, tgt_s)

        return f"请将以下{source_name}翻译成{target_name}，只返回翻译结果，不要添加任何解释：\n\n{text}"

    def get_service_info(self):
        """获取翻译服务信息"""
        provider = self._config.get_current_provider()
        api_key = self._config.get_api_key(provider)
        return {
            "provider": provider,
            "model": self._config.get_model(provider),
            "endpoint": self._config.get_endpoint(provider),
            "api_key_configured": bool(api_key),
            "supported_languages": ["zh", "vi", "en", "ja", "ko", "th"],
        }

    def reload_config(self):
        """配置变更后重新加载（重置 Gemini 缓存）"""
        self._config._load()
        self._reset_gemini()
        logger.info("TranslationService config reloaded")
