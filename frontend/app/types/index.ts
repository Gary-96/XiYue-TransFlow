/**
 * 喜阅 TransFlow · 跨语言智能直播同传工作台 — 前后端统一类型定义
 * 对齐后端 app/models/schemas.py 中的数据结构
 */

// ── WebSocket 消息类型 ────────────────────────────────────────────

/** 弹幕消息类型 */
export type DanmakuType =
  | 'comment'        // 普通评论
  | 'gift'           // 礼物
  | 'member_join'    // 新成员
  | 'social'         // 社交关注
  | 'room_stats'     // 房间统计
  | 'platform_connected'      // 平台连接
  | 'platform_disconnected'   // 平台断开
  | 'collector_started'       // 采集器启动
  | 'collector_stopped'       // 采集器停止

/** 弹幕消息 */
export interface StreamMessage {
  type: DanmakuType
  user: string
  text: string
  translated_text?: string
  gift_name?: string
  gift_count?: number
  language?: string
  timestamp?: number
}

/** 音频转写结果 */
export interface AudioTranscription {
  type: 'audio_transcription'
  text: string
  language: string
  confidence: number
  timestamp: number
}

/** 音频频谱数据 */
export interface AudioSpectrumData {
  type: 'audio_spectrum'
  data: number[]
  timestamp: number
}

/** TTS 状态 */
export interface TTSStatusMessage {
  type: 'tts_status'
  speaking: boolean
  text?: string
  timestamp: number
}

/** 通话字幕 */
export interface CallSubtitle {
  type: 'call_subtitle'
  source_text: string
  translated_text: string
  source_lang: string
  target_lang: string
  speaker: string
  timestamp: number
}

/** WebSocket 消息联合体 */
export type WebSocketMessage =
  | StreamMessage
  | AudioTranscription
  | AudioSpectrumData
  | TTSStatusMessage
  | CallSubtitle
  | ConnectionMessage
  | PingMessage
  | PongMessage
  | LanguageChangedMessage
  | VoiceChangedMessage

// ── 连接/心跳消息 ──────────────────────────────────────────────────

export interface ConnectionMessage {
  type: 'connection_established'
  clients: number
  timestamp: number
}

export interface PingMessage {
  type: 'ping'
}

export interface PongMessage {
  type: 'pong'
  timestamp: number
}

export interface LanguageChangedMessage {
  type: 'language_changed' | 'language_switched'
  src_lang: string
  tgt_lang: string
}

export interface VoiceChangedMessage {
  type: 'voice_changed'
  voice_id: string
}

// ── 连接状态 ──────────────────────────────────────────────────────

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected'

// ── 平台类型 ──────────────────────────────────────────────────────

export type Platform = 'douyin' | 'tiktok'

// ── 授权状态 ──────────────────────────────────────────────────────

export interface AuthState {
  isActivated: boolean
  expireAt?: string
  machineCode?: string
}

// ── 音频设备 ──────────────────────────────────────────────────────

export interface AudioDevice {
  index: number
  name: string
  hostApi: string
}

export interface CallDevicesResponse {
  mic_devices: AudioDevice[]
  loopback_devices: AudioDevice[]
  playback_devices: AudioDevice[]
}

// ── 语言配置 ──────────────────────────────────────────────────────

export interface LanguagePair {
  src_lang: string
  tgt_lang: string
  src_label: string
  tgt_label: string
}

// ── 后端服务状态 ──────────────────────────────────────────────────

export interface BackendHealth {
  status: 'healthy' | 'unhealthy'
  version: string
  architecture: string
}

// ── 翻译请求/响应 ────────────────────────────────────────────────

export interface TranslationRequest {
  text: string
  source_language: string
  target_language: string
}

export interface TranslationResult {
  text: string
  source_language: string
  target_language: string
  direction: string
}
