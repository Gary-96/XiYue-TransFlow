// ── 类型定义 — 集中管理所有 TypeScript 类型 ─────────────────────

// ======================================================================:
// Electron API（preload 桥接暴露的类型）
// ======================================================================:
import type { ElectronAPI } from '../../preload/index'

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export type { ElectronAPI }

// ======================================================================:
// WebSocket 消息类型
// ======================================================================:

/** 弹幕/礼物/系统消息 */
export interface StreamMessage {
  type: string
  user: string
  text: string
  platform: string
  language?: string
  translated_text?: string
  gift_name?: string
  gift_count?: number
  social_type?: string
  room_id?: string
  timestamp?: number
  message?: string
  viewer_count?: number
}

/** 音频同传结果 */
export interface AudioTranscription {
  type: 'audio_transcription'
  transcription: {
    text: string
    language: string
    confidence: number
  }
  translation: {
    text: string
    source_language: string
    target_language: string
  }
}

/** 音频频谱数据 */
export interface AudioSpectrumData {
  type: 'audio_spectrum'
  data: number[]
}

/** TTS 状态通知 */
export interface TTSStatusMessage {
  type: 'tts_status'
  speaking: boolean
  text?: string
}

/** 语言变更通知 */
export interface LanguageChangedMessage {
  type: 'language_changed' | 'language_switched'
  src_lang: string
  tgt_lang: string
}

/** 音色变更通知 */
export interface VoiceChangedMessage {
  type: 'voice_changed'
  voice_id: string
}

/** 通话同传字幕 */
export interface CallSubtitle {
  type: 'call_subtitle'
  src_text: string
  tgt_text: string
  src_lang: string
  tgt_lang: string
  timestamp: number
}

/** WebSocket 连接状态 */
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

/** WebSocket 消息联合类型 */
export type WebSocketMessage = 
  | StreamMessage
  | AudioTranscription
  | AudioSpectrumData
  | TTSStatusMessage
  | LanguageChangedMessage
  | VoiceChangedMessage
  | CallSubtitle

// ======================================================================:
// 平台控制
// ======================================================================:

export interface PlatformStatus {
  active_platform: string | null
  global_stats: {
    total_platforms: number
    active_platform: string | null
    total_messages: number
    total_errors: number
    switch_count: number
  }
  platforms: Record<string, {
    stats: Record<string, number | boolean>
    is_active: boolean
    available: boolean
  }>
  available_platforms: string[]
}

// ======================================================================:
// 配置与设置
// ======================================================================:

export type ProviderKey = 'gemini' | 'groq' | 'deepseek' | 'openai'

export interface SafeConfig {
  current_provider: string
  keys: Record<string, string>
  custom_endpoints: Record<string, string>
  models: Record<string, string>
  mode: string
  audio_device_id?: number | null
  audio_devices?: {
    mic_input: number | null
    translation_output: number | null
    remote_input: number | null
    remote_output: number | null
  }
  voice_id?: string
  whisper_model_size?: string
  whisper_device?: string
  whisper_model_dir?: string
}

// ======================================================================:
// 音频设备
// ======================================================================:

export interface AudioDevice {
  id: number
  name: string
  is_default: boolean
  channels: number
  max_input_channels: number
  max_output_channels: number
  default_samplerate: number
  driver: string
  hostapi: string
  is_pro_device: boolean
  direction?: string
}

export interface AudioDevicesConfig {
  mic_input: number | null
  translation_output: number | null
  remote_input: number | null
  remote_output: number | null
}

export interface ValidationResult {
  valid: boolean
  message: string
  latency_ms: number
}

// ======================================================================:
// TTS 音色
// ======================================================================:

export interface VoiceOption {
  id: string
  name: string
  lang: string
  gender: string
  is_custom?: boolean
  edge_voice?: string
}

// ======================================================================:
// Toast 通知
// ======================================================================:

export type ToastType = 'success' | 'error' | 'info'

export interface Toast {
  type: ToastType
  msg: string
}

// ======================================================================:
// 通话同传设备类型
// ======================================================================:

export interface AudioDeviceInfo {
  index: number
  name: string
  host_api: string
  max_input_channels: number
  max_output_channels: number
  default_samplerate: number
}

export interface CallDevicesResponse {
  status: string
  loopback_candidates: AudioDeviceInfo[]
  playback_devices: AudioDeviceInfo[]
  recommended_loopback: AudioDeviceInfo | null
  recommended_playback: AudioDeviceInfo | null
}

// ======================================================================:
// 本地大模型
// ======================================================================:

export interface LocalModel {
  name: string
  size: number
  digest: string
  size_human: string
}

export interface LocalLLMStatus {
  backend: 'ollama' | 'cuda'
  ollama_available: boolean
  ollama_url: string
  cuda_available: boolean
  cuda_model_path: string
  cuda_llamacpp_path: string
  model_dir: string
}

export interface LocalLLMConfig {
  local_backend: 'ollama' | 'cuda'
  local_ollama_url: string
  local_model_name: string
  local_model_dir: string
  local_cuda_model_path: string
  local_cuda_download_url: string
}
