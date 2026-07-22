/**
 * 平台控制 Hook — 调用后端 REST API
 */
import { useState, useCallback } from 'react'

const API_BASE = 'http://localhost:8000'

interface PlatformStatus {
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
      const res = await fetch(`${API_BASE}/api/platform/switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform,
          identifier,
          auto_translate: autoTranslate,
        }),
      })
      const data = await res.json()
      if (data.error) {
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
  }, [])

  const stopPlatform = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/platform/stop`, { method: 'POST' })
      const data = await res.json()
      if (data.error) {
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
  }, [])

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/platform/status`)
      const data = await res.json()
      if (!data.error) {
        setStatus(data)
      }
    } catch {
      // 后端未启动时静默
    }
  }, [])

  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/health`)
      return await res.json()
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
