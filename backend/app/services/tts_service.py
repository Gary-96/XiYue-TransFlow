"""
乐曼同传 - TTS 语音合成服务
支持 Edge TTS（免费高品质）、自定义音色、多语言播报
"""
import asyncio
import logging
import os
from enum import Enum
from typing import Optional, Dict, List
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


# ── 预定义音色库 ─────────────────────────────────────────────
DEFAULT_VOICES: Dict[str, Dict] = {
    "zh-CN-female-1": {
        "id": "zh-CN-female-1",
        "name": "中文女声-温婉",
        "lang": "zh-CN",
        "gender": "female",
        "style": "gentle",
        "description": "温暖知性的中文女声，适合新闻播报",
        "edge_voice": "zh-CN-XiaoxiaoNeural",
    },
    "zh-CN-male-1": {
        "id": "zh-CN-male-1",
        "name": "中文男声-活力",
        "lang": "zh-CN",
        "gender": "male",
        "style": "energetic",
        "description": "阳光活力的中文男声，适合带货场景",
        "edge_voice": "zh-CN-YunxiNeural",
    },
    "vi-VN-female-1": {
        "id": "vi-VN-female-1",
        "name": "越南女声-自然",
        "lang": "vi-VN",
        "gender": "female",
        "style": "natural",
        "description": "自然甜美的越南语女声",
        "edge_voice": "vi-VN-HoaiMyNeural",
    },
    "vi-VN-male-1": {
        "id": "vi-VN-male-1",
        "name": "越南男声-标准",
        "lang": "vi-VN",
        "gender": "male",
        "style": "standard",
        "description": "清晰标准的越南语男声",
        "edge_voice": "vi-VN-NamMinhNeural",
    },
    "en-US-female-1": {
        "id": "en-US-female-1",
        "name": "英语女声-专业",
        "lang": "en-US",
        "gender": "female",
        "style": "professional",
        "description": "美式英语女声，语速适中",
        "edge_voice": "en-US-AvaMultilingualNeural",
    },
    "en-US-male-1": {
        "id": "en-US-male-1",
        "name": "英语男声-标准",
        "lang": "en-US",
        "gender": "male",
        "style": "standard",
        "description": "清晰标准的英语男声",
        "edge_voice": "en-US-GuyNeural",
    },
}

# ── Edge TTS voice → UI metadata 映射 ─────────────────────
EDGE_VOICE_META: Dict[str, Dict] = {
    # 中文女声
    "zh-CN-XiaoxiaoNeural": {"lang": "zh-CN", "gender": "female"},
    "zh-CN-XiaoyiNeural": {"lang": "zh-CN", "gender": "female"},
    "zh-CN-liaoning-XiaobeiNeural": {"lang": "zh-CN", "gender": "female"},
    # 中文男声
    "zh-CN-YunxiNeural": {"lang": "zh-CN", "gender": "male"},
    "zh-CN-YunjianNeural": {"lang": "zh-CN", "gender": "male"},
    "zh-CN-shaanxi-XiaoniNeural": {"lang": "zh-CN", "gender": "male"},
    # 越南语
    "vi-VN-HoaiMyNeural": {"lang": "vi-VN", "gender": "female"},
    "vi-VN-NamMinhNeural": {"lang": "vi-VN", "gender": "male"},
    # 英语
    "en-US-AvaMultilingualNeural": {"lang": "en-US", "gender": "female"},
    "en-US-AndrewNeural": {"lang": "en-US", "gender": "male"},
    "en-US-JennyNeural": {"lang": "en-US", "gender": "female"},
    "en-US-GuyNeural": {"lang": "en-US", "gender": "male"},
    # 日语
    "ja-JP-NanamiNeural": {"lang": "ja-JP", "gender": "female"},
    "ja-JP-KeitaNeural": {"lang": "ja-JP", "gender": "male"},
    # 韩语
    "ko-KR-SunHiNeural": {"lang": "ko-KR", "gender": "female"},
    "ko-KR-InJoonNeural": {"lang": "ko-KR", "gender": "male"},
    # 泰语
    "th-TH-AcharaNeural": {"lang": "th-TH", "gender": "female"},
    "th-TH-NiwatNeural": {"lang": "th-TH", "gender": "male"},
}


@dataclass
class VoiceConfig:
    """音色配置"""
    id: str
    name: str
    lang: str
    gender: str
    speed: float = 1.0          # 语速 (0.5 ~ 2.0)
    pitch: float = 0.0         # 音调 (-100 ~ +100 Hz，Edge TTS 使用 format)
    volume: float = 1.0        # 音量 (0.0 ~ 1.0)
    ref_audio_path: Optional[str] = None  # 自定义音色参考音频路径（暂保留接口）
    is_custom: bool = False    # 是否为自定义/克隆音色
    edge_voice: Optional[str] = None  # 对应的 Edge TTS Neural 音色名


@dataclass
class TTSRequest:
    """TTS 请求参数"""
    text: str
    voice_id: str              # 音色 ID
    lang: str                  # 语言代码
    speed: float = 1.0
    pitch: float = 0.0
    volume: float = 1.0
    ref_audio: Optional[str] = None


class TTSService:
    """
    文本转语音服务 — Edge TTS（免费、神经音质）
    - 支持默认预设音色
    - 自动从 Edge TTS 生态获取可用音色列表
    - 支持语速调节
    """

    def __init__(self):
        self.current_voice: Optional[VoiceConfig] = None
        self.custom_voices: Dict[str, VoiceConfig] = {}
        self.voices_loaded = False
        self._models_dir = None
        self._all_edge_voices: List[Dict] = []
        self.enabled = True  # TTS 开关状态
        self.current_voice_id = None  # 当前音色 ID
        self._queue: List[str] = []  # TTS 队列
        self._init_models_dir()
        self._preload_voice()

    def _init_models_dir(self):
        backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self._models_dir = os.path.join(backend_dir, "models")
        if not os.path.exists(self._models_dir):
            os.makedirs(self._models_dir, exist_ok=True)

    def _preload_voice(self):
        """加载初始预设音色"""
        for vid, meta in DEFAULT_VOICES.items():
            self.custom_voices[vid] = VoiceConfig(
                id=meta["id"],
                name=meta["name"],
                lang=meta["lang"],
                gender=meta["gender"],
                edge_voice=meta.get("edge_voice"),
            )
        self.voices_loaded = True

    def _get_all_edge_voices(self) -> List[Dict]:
        """通过 Edge TTS 获取所有可用 Neural 音色"""
        if self._all_edge_voices:
            return self._all_edge_voices
        try:
            import aiohttp
            async def _fetch():
                url = "https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=6A5AA1D4EAFF4E9FB37E23D68491D6F4"
                async with aiohttp.ClientSession() as session:
                    async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                        if resp.status == 200:
                            return await resp.json()
                        return []
            self._all_edge_voices = asyncio.run(_fetch())
        except Exception as e:
            logger.warning(f"Failed to fetch Edge voices list: {e}")
            self._all_edge_voices = []
        return self._all_edge_voices

    def load_custom_voices(self):
        """加载自定义音色（预留接口 — 未来对接 CosyVoice / ChatTTS）"""
        custom_dir = os.path.join(self._models_dir, "custom_voices")
        if not os.path.exists(custom_dir):
            return

        for filename in os.listdir(custom_dir):
            if filename.endswith(('.wav', '.mp3', '.flac')):
                voice_id = f"custom_{os.path.splitext(filename)[0]}"
                self.custom_voices[voice_id] = VoiceConfig(
                    id=voice_id,
                    name=f"自定义:{os.path.splitext(filename)[0]}",
                    lang="auto",
                    gender="unknown",
                    ref_audio_path=os.path.join(custom_dir, filename),
                    is_custom=True,
                )
        logger.info(f"Loaded {len(self.custom_voices)} custom voices")

    def get_all_voices(self) -> Dict[str, Dict]:
        """获取所有可用音色（默认 + 自定义 + Edge Neural）"""
        result = dict(DEFAULT_VOICES)
        for vid, vcfg in self.custom_voices.items():
            result[vid] = {
                "id": vcfg.id,
                "name": vcfg.name,
                "lang": vcfg.lang,
                "gender": vcfg.gender,
                "is_custom": vcfg.is_custom,
                "edge_voice": vcfg.edge_voice,
            }
        # 补充 Edge TTS Neural 音色
        for edge_name in EDGE_VOICE_META:
            friendly = f"Edge: {edge_name}"
            emeta = EDGE_VOICE_META[edge_name]
            if edge_name not in result:
                result[edge_name] = {
                    "id": edge_name,
                    "name": f"Edge TTS - {friendly}",
                    "lang": emeta["lang"],
                    "gender": emeta["gender"],
                    "is_custom": False,
                    "edge_voice": edge_name,
                }
        return result

    def set_voice(self, voice_id: str):
        """设置当前使用的音色"""
        # 检查预设
        if voice_id in DEFAULT_VOICES:
            meta = DEFAULT_VOICES[voice_id]
            self.current_voice = VoiceConfig(
                id=meta["id"],
                name=meta["name"],
                lang=meta["lang"],
                gender=meta["gender"],
                edge_voice=meta.get("edge_voice"),
            )
            logger.info(f"Set default voice: {voice_id}")
            return

        # 检查自定义
        if voice_id in self.custom_voices:
            self.current_voice = self.custom_voices[voice_id]
            logger.info(f"Set custom voice: {voice_id}")
            return

        # 检查 Edge Neural 音色
        if voice_id in EDGE_VOICE_META:
            emeta = EDGE_VOICE_META[voice_id]
            self.current_voice = VoiceConfig(
                id=voice_id,
                name=f"Edge: {emeta['lang']}-{emeta['gender']}",
                lang=emeta["lang"],
                gender=emeta["gender"],
                edge_voice=voice_id,
            )
            logger.info(f"Set Edge voice: {voice_id}")
            return

        logger.warning(f"Unknown voice ID: {voice_id}, using fallback")
        self.set_voice("zh-CN-female-1")

    def get_edge_tts_voice(self) -> str:
        """获取当前音色的 Edge TTS Neural 音色名"""
        if self.current_voice and self.current_voice.edge_voice:
            return self.current_voice.edge_voice
        # 默认 fallback
        meta = DEFAULT_VOICES.get("zh-CN-female-1", {})
        return meta.get("edge_voice", "zh-CN-XiaoxiaoNeural")

    def get_edge_tts_rate(self) -> str:
        """将内部语速 → Edge TTS rate 字符串"""
        if not self.current_voice:
            return "+0%"
        rate = self.current_voice.speed
        offset = int((rate - 1.0) * 100)
        return f"+{offset}%" if offset >= 0 else f"{offset}%"

    async def synthesize(self, request: TTSRequest) -> bytes:
        """
        执行 TTS 合成，返回音频字节流
        使用 Edge TTS（微软免费神经语音）
        """
        try:
            import edge_tts

            # 确定语音名称
            # 先从预设/自定义查 edge_voice，否则用语言 code
            voice_id = request.voice_id
            edge_voice = None

            if voice_id in DEFAULT_VOICES:
                edge_voice = DEFAULT_VOICES[voice_id].get("edge_voice")
            elif voice_id in self.custom_voices and self.custom_voices[voice_id].edge_voice:
                edge_voice = self.custom_voices[voice_id].edge_voice
            elif voice_id in EDGE_VOICE_META:
                edge_voice = voice_id
            else:
                # Fallback: 根据语言选默认
                lang_map = {
                    "zh-CN": "zh-CN-XiaoxiaoNeural",
                    "zh": "zh-CN-XiaoxiaoNeural",
                    "vi-VN": "vi-VN-HoaiMyNeural",
                    "vi": "vi-VN-HoaiMyNeural",
                    "en-US": "en-US-AvaMultilingualNeural",
                    "en": "en-US-AvaMultilingualNeural",
                    "ja-JP": "ja-JP-NanamiNeural",
                    "ko-KR": "ko-KR-SunHiNeural",
                    "th-TH": "th-TH-AcharaNeural",
                }
                edge_voice = lang_map.get(request.lang, "zh-CN-XiaoxiaoNeural")

            communicate = edge_tts.Communicate(
                request.text,
                edge_voice,
                rate=self.get_edge_tts_rate(),
            )

            audio_data = bytearray()
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_data.extend(chunk["data"])

            return bytes(audio_data)

        except ImportError:
            logger.error("edge_tts not installed. Run: pip install edge-tts")
            raise RuntimeError("edge_tts dependency not available")
        except Exception as e:
            logger.error(f"TTS synthesis failed: {e}")
            raise

    def update_params(self, speed: Optional[float] = None,
                      pitch: Optional[float] = None,
                      volume: Optional[float] = None):
        """更新当前音色参数"""
        if self.current_voice:
            if speed is not None:
                self.current_voice.speed = max(0.5, min(2.0, speed))
            if pitch is not None:
                self.current_voice.pitch = max(-100, min(100, pitch))
            if volume is not None:
                self.current_voice.volume = max(0.0, min(1.0, volume))

    def clear_queue(self):
        """清除 TTS 队列"""
        self._queue.clear()
        logger.info("TTS queue cleared")

    @property
    def queue_size(self) -> int:
        """获取队列大小"""
        return len(self._queue)


# ── 单例实例 ──────────────────────────────────────────────────
tts_service = TTSService()
