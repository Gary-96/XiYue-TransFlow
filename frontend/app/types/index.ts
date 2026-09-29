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

// ── 双通道统一弹幕契约 ────────────────────────────────────────────
// Channel A（Python 协议采集）与 Channel B（Electron 静默视口）
// 的产出都归一化到该结构，供 ConnectionManager 去重与分发。

export interface StandardDanmaku {
  /** 去重键：Channel B 取 WebCast msgId；Channel A 取 类型|用户|文本 合成键 */
  id: string
  user: string
  text: string
  platform: string
  /** 产生时刻（ms） */
  timestamp: number
  /** 归一化消息类型（缺省视为 comment） */
  type?: DanmakuType
  /** 产出通道 */
  channel?: 'A' | 'B'
}

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
  /** 设备索引号（sounddevice 编号） */
  id: number
  name: string
  is_default?: boolean
  channels?: number
  driver?: string
  hostapi?: string
  is_pro_device?: boolean
  direction?: 'input' | 'output'
}

/** GET /api/audio/devices 响应：按方向分组，字段与后端 list_all_devices() 对齐 */
export interface AudioDevicesResponse {
  inputs: AudioDevice[]
  outputs: AudioDevice[]
}

/** 后端 set_audio_device 接受的 device_key 合法集合 */
export type AudioDeviceKey =
  | 'mic_input'
  | 'translation_output'
  | 'remote_input'
  | 'remote_output'

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
