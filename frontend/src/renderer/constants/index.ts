/**
 * 乐曼同传 — 全局常量定义
 * 集中管理所有硬编码配置值，避免散落在各处
 */

// ── 网络配置 ───────────────────────────────────────────────
export const BACKEND_PORT = 15387
export const DEFAULT_BACKEND_HOST = '127.0.0.1'
export const DEFAULT_BACKEND_URL = `http://${DEFAULT_BACKEND_HOST}:${BACKEND_PORT}`
export const DEV_API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? DEFAULT_BACKEND_URL

// ── WebSocket ──────────────────────────────────────────────
export const WS_PATH = '/ws/stream'
export const WS_HEARTBEAT_INTERVAL_MS = 30000
export const WS_RECONNECT_DELAY_MS = 2000
export const WS_MAX_RECONNECT_ATTEMPTS = 5

// ── 音频配置 ───────────────────────────────────────────────
export const SAMPLE_RATE = 16000
export const CHUNK_SIZE_SAMPLES = 3200  // 200ms @ 16kHz
export const SPEECH_THRESHOLD = 0.015

// ── UI 配置 ────────────────────────────────────────────────
export const MAX_CHAT_MESSAGES = 200
export const SUBTITLE_DISPLAY_DURATION_MS = 5000
export const SPECTRUM_DATA_LENGTH = 64

// ── 超时配置 ───────────────────────────────────────────────
export const API_TIMEOUT_MS = 8000
export const HEALTH_CHECK_INTERVAL_MS = 10000

// ── 平台标识 ───────────────────────────────────────────────
export const PLATFORM_DOUYIN = 'douyin' as const
export const PLATFORM_TIKTOK = 'tiktok' as const
export const PLATFORMS = [PLATFORM_DOUYIN, PLATFORM_TIKTOK] as const

// ── 语言对 ─────────────────────────────────────────────────
export const DEFAULT_SRC_LANG = 'zh'
export const DEFAULT_TGT_LANG = 'vi'
export const SUPPORTED_LANGUAGES = ['zh', 'en', 'vi', 'ja', 'ko'] as const

// ── 设备密钥 ───────────────────────────────────────────────
export const AUDIO_DEVICE_KEYS = ['mic_input', 'translation_output', 'remote_input', 'remote_output'] as const

// ── 日志 ───────────────────────────────────────────────────
export const MAX_LOG_LINES = 1000
export const LOG_STORAGE_KEY = 'leman-translate-logs'
