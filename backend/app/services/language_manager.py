"""
乐曼同传 - 多语言管理与双向切换服务
支持:
- 7 种语言自由切换 (中/越/英/日/韩/泰 + 自动检测)
- 源语言与目标语言一键对调
- ASR 语言参数动态调整
- 翻译引擎 System Prompt 动态生成
"""
import logging
from typing import Any, Callable, Dict, List, Optional, Tuple
from dataclasses import dataclass

logger = logging.getLogger(__name__)


# ── 语言定义 ──────────────────────────────────────────────────
SUPPORTED_LANGUAGES = {
    "auto": {"code": "auto", "label": "自动检测", "icon": "🔍"},
    "zh": {"code": "zh-CN", "label": "中文", "icon": "🇨🇳"},
    "vi": {"code": "vi-VN", "label": "越南语", "icon": "🇻🇳"},
    "en": {"code": "en-US", "label": "英语", "icon": "🇺🇸"},
    "ja": {"code": "ja-JP", "label": "日语", "icon": "🇯🇵"},
    "ko": {"code": "ko-KR", "label": "韩语", "icon": "🇰🇷"},
    "th": {"code": "th-TH", "label": "泰语", "icon": "🇹🇭"},
}


@dataclass
class LanguagePair:
    """语言对配置"""
    src_lang: str                # 源语言代码 ("auto" | "zh" | "vi" | ...)
    tgt_lang: str                # 目标语言代码
    src_label: str = ""          # 源语言显示标签
    tgt_label: str = ""          # 目标语言显示标签
    
    def __post_init__(self):
        if self.src_label == "" and self.src_lang in SUPPORTED_LANGUAGES:
            self.src_label = SUPPORTED_LANGUAGES[self.src_lang]["label"]
        if self.tgt_label == "" and self.tgt_lang in SUPPORTED_LANGUAGES:
            self.tgt_label = SUPPORTED_LANGUAGES[self.tgt_lang]["label"]
    
    def switch(self) -> 'LanguagePair':
        """交换源语言和目标语言，返回新实例"""
        return LanguagePair(
            src_lang=self.tgt_lang,
            tgt_lang=self.src_lang,
            src_label=self.tgt_label,
            tgt_label=self.src_label,
        )
    
    def to_dict(self) -> dict:
        return {
            "src_lang": self.src_lang,
            "tgt_lang": self.tgt_lang,
            "src_label": self.src_label,
            "tgt_label": self.tgt_label,
        }


# ── 翻译 Prompt 模板 ────────────────────────────────────────────
TRANSLATION_PROMPTS = {
    "zh_to_vi": (
        "你是一个专业的中译越翻译助手。将以下中文直播口语转化为自然、地道、带有主播风格的越南语。\n"
        "要求:\n"
        "1. 保留直播间热络氛围，使用越南语网络流行语\n"
        "2. 去除语气助词（啊、呢、哦等）\n"
        "3. 直译为主，意译为辅\n"
        "4. 只输出译文，不要解释\n\n"
        "中文原文: {text}\n"
        "越南译文:"
    ),
    "vi_to_zh": (
        "你是一个专业的越译中翻译助手。将以下越南语直播口语转化为地道、有感染力的中国直播间用语。\n"
        "要求:\n"
        "1. 使用中国主播常用话术和网络黑话（如：家人们、上链接、冲鸭、绝绝子）\n"
        "2. 去除越南语语气词（như, thật, á, nhé, nha, đê...）\n"
        "3. 保留原意，适当夸张增强带货效果\n"
        "4. 只输出中文译文，不要解释\n\n"
        "越南原文: {text}\n"
        "中文译文:"
    ),
    "zh_to_en": "Translate the following Chinese live stream text to natural American English...\nOriginal: {text}\nTranslation:",
    "en_to_zh": "Translate the following English live stream text to vibrant Chinese...\nOriginal: {text}\nTranslation:",
    "en_to_vi": "Translate the following English live stream text to natural Vietnamese...\nOriginal: {text}\nTranslation:",
    "vi_to_en": "Translate the following Vietnamese live stream text to natural English...\nOriginal: {text}\nTranslation:",
    "zh_to_ja": "Translate the following Chinese live stream text to natural Japanese...\nOriginal: {text}\nTranslation:",
    "ja_to_zh": "Translate the following Japanese live stream text to natural Chinese...\nOriginal: {text}\nTranslation:",
    "zh_to_ko": "Translate the following Chinese live stream text to natural Korean...\nOriginal: {text}\nTranslation:",
    "ko_to_zh": "Translate the following Korean live stream text to natural Chinese...\nOriginal: {text}\nTranslation:",
    "zh_to_th": "Translate the following Chinese live stream text to natural Thai...\nOriginal: {text}\nTranslation:",
    "th_to_zh": "Translate the following Thai live stream text to natural Chinese...\nOriginal: {text}\nTranslation:",
}


# ── 语言管理服务类 ───────────────────────────────────────────────
class LanguageManager:
    """
    全局语言管理
    - 维护当前语言对 (src → tgt)
    - 一键对调
    - 获取 ASR 语言参数
    - 获取翻译 System Prompt
    """
    
    def __init__(self):
        self.current_pair = LanguagePair(src_lang="zh", tgt_lang="vi")
        self._subscribers: List[callable] = []  # 语言变更通知
    
    def set_language_pair(self, src_lang: str, tgt_lang: str):
        """设置语言对"""
        valid_codes = set(SUPPORTED_LANGUAGES.keys())
        if src_lang not in valid_codes or tgt_lang not in valid_codes:
            logger.warning(f"Invalid language pair: {src_lang} -> {tgt_lang}")
            return
        
        old_pair = self.current_pair
        self.current_pair = LanguagePair(src_lang=src_lang, tgt_lang=tgt_lang)
        logger.info(f"Language changed: {old_pair.src_label}({old_pair.src_lang}) "
                    f"→ {old_pair.tgt_label}({old_pair.tgt_lang})")
        
        # 通知订阅者
        self._notify_subscribers(self.current_pair)
    
    def switch_language(self):
        """一键交换源语言和目标语言"""
        old_pair = self.current_pair
        self.current_pair = self.current_pair.switch()
        logger.info(f"Language switched: {old_pair.src_label}↔{old_pair.tgt_label}")
        self._notify_subscribers(self.current_pair)
    
    def get_current_pair(self) -> LanguagePair:
        """获取当前语言对"""
        return self.current_pair
    
    def get_asr_language_param(self) -> str:
        """
        获取传给 Whisper ASR 的语言参数
        - 如果选择"自动检测"，返回空字符串让 Whisper 自动判断
        - 否则返回语言代码
        """
        if self.current_pair.src_lang == "auto":
            return ""  # Whisper 会自动检测
        elif self.current_pair.src_lang in SUPPORTED_LANGUAGES:
            lang_map = {
                "zh": "zh",
                "vi": "vi",
                "en": "en",
                "ja": "ja",
                "ko": "ko",
                "th": "th",
            }
            return lang_map.get(self.current_pair.src_lang, "zh")
        return "zh"
    
    def get_translation_prompt(self, text: str) -> str:
        """
        根据语言对获取对应的翻译 Prompt
        例如: zh→vi 用 zh_to_vi prompt
        """
        key = f"{self.current_pair.src_lang}_to_{self.current_pair.tgt_lang}"
        
        if key in TRANSLATION_PROMPTS:
            return TRANSLATION_PROMPTS[key].format(text=text)
        
        # 如果是 auto 语言，需要根据实际识别的语言动态选择 prompt
        if self.current_pair.src_lang == "auto":
            # 默认返回中文到越南语的 prompt，实际使用时会替换
            default_tgt = self.current_pair.tgt_lang
            fallback_key = f"zh_to_{default_tgt}"
            if fallback_key in TRANSLATION_PROMPTS:
                return TRANSLATION_PROMPTS[fallback_key].format(text=text)
        
        # 最后的 fallback: 返回通用翻译指令
        return f"Translate the following text from {self.current_pair.src_label} to {self.current_pair.tgt_label}:\n{text}"
    
    def get_all_languages(self) -> Dict[str, Dict]:
        """获取所有支持的语言列表"""
        return SUPPORTED_LANGUAGES
    
    def subscribe(self, callback: callable):
        """注册语言变更回调"""
        self._subscribers.append(callback)
    
    def _notify_subscribers(self, pair: LanguagePair):
        """通知所有订阅者"""
        for cb in self._subscribers:
            try:
                cb(pair)
            except Exception as e:
                logger.error(f"Subscriber callback error: {e}")
    
    def to_dict(self) -> dict:
        return {
            "current": self.current_pair.to_dict(),
            "available": {k: v for k, v in SUPPORTED_LANGUAGES.items()},
        }


# ── 单例实例 ──────────────────────────────────────────────────
language_manager = LanguageManager()
