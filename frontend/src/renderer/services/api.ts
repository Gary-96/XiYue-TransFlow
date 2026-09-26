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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const electronAPI = (window as any).electronAPI as { getBackendUrl?: () => string }
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

// ── 自定义错误类型 ──
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * 通用 GET 请求
 * @param path - 请求路径
 * @param options - 可选 fetch 选项
 * @returns 响应数据
 */
export async function apiGet<T = unknown>(path: string, options?: RequestInit): Promise<T> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      method: 'GET',
      headers: { 'Content-Type': 'application/json', ...options?.headers },
    })

    if (!res.ok) {
      const errorText = await res.text().catch(() => res.statusText)
      throw new ApiError(res.status, errorText)
    }

    return res.json()
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(0, `网络错误: ${String(error)}`)
  }
}

/**
 * 通用 POST 请求
 * @param path - 请求路径
 * @param body - 请求体（可选）
 * @returns 响应数据
 */
export async function apiPost<T = unknown>(path: string, body?: unknown): Promise<T> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body != null ? JSON.stringify(body) : undefined,
    })

    if (!res.ok) {
      const errorText = await res.text().catch(() => res.statusText)
      throw new ApiError(res.status, errorText)
    }

    return res.json()
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(0, `网络错误: ${String(error)}`)
  }
}

/**
 * 通用 PUT 请求
 * @param path - 请求路径
 * @param body - 请求体（可选）
 * @returns 响应数据
 */
export async function apiPut<T = unknown>(path: string, body?: unknown): Promise<T> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: body != null ? JSON.stringify(body) : undefined,
    })

    if (!res.ok) {
      const errorText = await res.text().catch(() => res.statusText)
      throw new ApiError(res.status, errorText)
    }

    return res.json()
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(0, `网络错误: ${String(error)}`)
  }
}

/**
 * 通用 DELETE 请求
 * @param path - 请求路径
 * @returns 响应数据
 */
export async function apiDelete<T = unknown>(path: string): Promise<T> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    })

    if (!res.ok) {
      const errorText = await res.text().catch(() => res.statusText)
      throw new ApiError(res.status, errorText)
    }

    return res.json()
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(0, `网络错误: ${String(error)}`)
  }
}
