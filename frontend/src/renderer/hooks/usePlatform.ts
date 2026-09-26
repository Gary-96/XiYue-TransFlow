/**
 * 平台控制 Hook — 调用后端 REST API
 */
import { useState, useCallback } from 'react'
import { apiGet, apiPost } from '../services/api'
import type { PlatformStatus } from '../types'

export function usePlatform() {
  const [status, setStatus] = useState<PlatformStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const switchPlatform = useCallback(async (
    platform: 'tiktok' | 'douyin',
    identifier: string,
    autoTranslate = true
  ) => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiPost<{ error?: string }>('/api/platform/switch', {
        platform,
        identifier,
        auto_translate: autoTranslate,
      })
      if (data?.error) {
        setError(data.error)
        return false
      }
      await fetchStatus()
      return true
    } catch (e) {
      setError((e as Error).message)
      return false
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stopPlatform = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiPost<{ error?: string }>('/api/platform/stop')
      if (data?.error) {
        setError(data.error)
        return false
      }
      await fetchStatus()
      return true
    } catch (e) {
      setError((e as Error).message)
      return false
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchStatus = useCallback(async () => {
    try {
      const data = await apiGet<PlatformStatus>('/api/platform/status')
      setStatus(data ?? null)
    } catch {
      // 后端未启动时静默
    }
  }, [])

  const checkHealth = useCallback(async () => {
    try {
      const data = await apiGet<{ status: string }>('/health')
      return data ?? null
    } catch {
      return null
    }
  }, [])

  return {
    status,
    loading,
    error,
    switchPlatform,
    stopPlatform,
    fetchStatus,
    checkHealth,
  }
}
