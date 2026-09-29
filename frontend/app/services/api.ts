/**
 * 喜阅 TransFlow · 跨语言智能直播同传工作台 — 后端 HTTP API 封装
 * 基于 fetch，自动注入 Bearer token，统一错误处理
 */
import type {
  AuthState,
  AudioDeviceKey,
  AudioDevicesResponse,
  CallDevicesResponse,
  LanguagePair,
  TranslationRequest,
  TranslationResult,
} from '@/types'

const BASE_URL = 'http://127.0.0.1:15387'

// ── Token 管理 ────────────────────────────────────────────────────

function getToken(): string | null {
  try {
    return localStorage.getItem('xiyue_user_token')
  } catch {
    return null
  }
}

// ── 通用请求函数 ──────────────────────────────────────────────────

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> || {}),
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  })

  if (!response.ok) {
    if (response.status === 401) {
      // Token 失效，清除并跳转登录
      localStorage.removeItem('xiyue_user_token')
      localStorage.removeItem('xiyue_user_info')
      localStorage.removeItem('xiyue_session')
      localStorage.removeItem('xiyue_license')
      throw new Error('AUTH_EXPIRED')
    }
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  return response.json() as Promise<T>
}

// ── API 方法 ──────────────────────────────────────────────────────

export const api = {
  // ── 授权激活 ──
  activate: (cardKey: string) =>
    request<{ status: string; data: AuthState }>('/api/client/activate', {
      method: 'POST',
      body: JSON.stringify({ card_key: cardKey }),
    }),

  getAuthState: () =>
    request<AuthState>('/api/client/auth/state'),

  startHeartbeat: () =>
    request<{ status: string }>('/api/client/heartbeat/start', {
      method: 'POST',
    }),

  // ── 语言配置 ──
  getLanguage: () =>
    request<LanguagePair>('/api/language/current'),

  setLanguage: (src: string, tgt: string) =>
    request<{ status: string; src_lang: string; tgt_lang: string }>(
      '/api/language/set',
      {
        method: 'PUT',
        body: JSON.stringify({ src_lang: src, tgt_lang: tgt }),
      }
    ),

  // ── TTS 控制 ──
  getTTSStatus: () =>
    request<{ status: string; enabled: boolean; current_voice: string }>(
      '/api/tts/status'
    ),

  toggleTTS: (enabled: boolean) =>
    request<{ status: string; enabled: boolean }>('/api/tts/enable', {
      method: 'PUT',
      body: JSON.stringify({ enabled }),
    }),

  clearTTSQueue: () =>
    request<{ status: string }>('/api/tts/clear-queue', {
      method: 'POST',
    }),

  // ── 音频设备 ──
  getAudioDevices: () => request<AudioDevicesResponse>('/api/audio/devices'),

  setAudioDevice: (device_key: AudioDeviceKey, device_id: number) =>
    request<{ status: string }>('/api/audio/device', {
      method: 'PUT',
      body: JSON.stringify({ device_key, device_id }),
    }),

  // ── 通话同传 ──
  getCallDevices: () =>
    request<CallDevicesResponse>('/api/call/list-devices'),

  getCallStatus: () =>
    request<{ status: string; is_running: boolean; mode: string; stats: Record<string, unknown> }>
      ('/api/call/status'),

  startCall: (mode: string, loopbackDeviceIndex?: number, ttsDeviceIndex?: number) =>
    request<{ status: string }>('/api/call/start', {
      method: 'POST',
      body: JSON.stringify({ mode, loopback_device_index: loopbackDeviceIndex, tts_device_index: ttsDeviceIndex }),
    }),

  stopCall: () =>
    request<{ status: string }>('/api/call/stop', {
      method: 'POST',
    }),

  resetCallStats: () =>
    request<{ status: string }>('/api/call/reset-stats', {
      method: 'POST',
    }),

  // ── 翻译 ──
  translate: (req: TranslationRequest) =>
    request<TranslationResult>('/api/translate', {
      method: 'POST',
      body: JSON.stringify(req),
    }),

  // ── 平台状态 ──
  getPlatformStatus: () =>
    request<{ status: string; connected: boolean; platforms: Record<string, { connected: boolean }> }>(
      '/api/platform/status'
    ),

  // ── 弹幕采集器控制 ──
  connectCollector: (platform: string, identifier: string) =>
    request<{ status: string; platform?: string; identifier?: string; message?: string }>(
      '/api/collector/connect',
      {
        method: 'POST',
        body: JSON.stringify({ platform, identifier }),
      }
    ),

  disconnectCollector: () =>
    request<{ status: string; message?: string }>('/api/collector/disconnect', {
      method: 'POST',
    }),

  getCollectorStatus: () =>
    request<{ status: string; active_platform?: string; available_platforms?: string[]; total_messages?: number; websocket_clients?: number }>(
      '/api/collector/status'
    ),

  // ── 配置 ──
  getConfig: () =>
    request<{ status: string; data: Record<string, unknown> }>('/api/config/'),

  updateConfig: (data: Record<string, unknown>) =>
    request<{ status: string }>('/api/config/', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // ── 本地 LLM ──
  getLocalLLMStatus: () =>
    request<{ status: string; ollama_available?: boolean; cuda_available?: boolean }>
      ('/api/local-llm/status'),

  listLocalModels: () =>
    request<{ status: string; models: Array<{ name: string; size: number }> }>
      ('/api/local-llm/models'),

  pullLocalModel: (modelName: string) =>
    request<{ status: string }>('/api/local-llm/pull', {
      method: 'POST',
      body: JSON.stringify({ model_name: modelName }),
    }),

  deleteLocalModel: (modelName: string) =>
    request<{ status: string }>(`/api/local-llm/models/${modelName}`, {
      method: 'POST',
    }),

  saveLocalLLMConfig: (config: Record<string, unknown>) =>
    request<{ status: string }>('/api/local-llm/config', {
      method: 'PUT',
      body: JSON.stringify(config),
    }),
}

// ── 便捷方法别名（与后端路由保持一致） ──

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path)
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined })
}

export function apiPut<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined })
}

export function apiDelete<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'DELETE' })
}
