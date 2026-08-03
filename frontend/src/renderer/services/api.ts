/**
 * 动态获取后端 API 地址
 * 优先使用环境变量，其次使用 Electron API，最后使用默认地址
 */

/** 获取后端 REST API 基础地址 */
export function getApiBaseUrl(): string {
  // 1. 优先使用环境变量
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL
  }
  
  // 2. 尝试使用 Electron API（如果是打包后的应用）
  try {
    const electronAPI = window.electronAPI
    if (electronAPI?.getBackendUrl) {
      const url = electronAPI.getBackendUrl()
      if (url) return url as string
    }
  } catch {
    // 忽略错误
  }
  
  // 3. 默认使用 127.0.0.1（避免 localhost 解析问题）
  return 'http://127.0.0.1:15387'
}

/** 获取后端 WebSocket 基础地址 */
export function getWsBaseUrl(): string {
  const apiBase = getApiBaseUrl()
  return apiBase.replace(/^http:/, 'ws:')
}

/** 后端 API 基础地址（REST） */
export const API_BASE = getApiBaseUrl()

/** 后端 WebSocket 基础地址 */
export const WS_BASE = getWsBaseUrl()

/**
 * 通用 GET 请求
 */
export async function apiGet<T = unknown>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`)
  }
  return res.json()
}

/**
 * 通用 POST 请求
 */
export async function apiPost<T = unknown>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body != null ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`)
  }
  return res.json()
}

/**
 * 通用 PUT 请求
 */
export async function apiPut<T = unknown>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: body != null ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`)
  }
  return res.json()
}

/**
 * 通用 DELETE 请求
 */
export async function apiDelete<T = unknown>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`)
  }
  return res.json()
}
