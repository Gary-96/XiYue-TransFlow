import { useState, useCallback, useEffect } from 'react'

export interface ToastOptions {
  id?: string
  title?: string
  description?: string
  variant?: 'default' | 'destructive' | 'success'
  duration?: number
}

export interface ToastItem extends ToastOptions {
  id: string
}

// Module-level toast store
let toasts: ToastItem[] = []
const listeners = new Set<() => void>()

export function toast(options: ToastOptions): string {
  const newId = options.id ?? Date.now().toString()
  toasts = [...toasts, { ...options, id: newId }]

  listeners.forEach((fn) => fn())

  const duration = options.duration ?? 3000
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== newId)
    listeners.forEach((fn) => fn())
  }, duration)

  return newId
}

export function useToast() {
  const [, setTick] = useState(0)

  const subscribe = useCallback(() => {
    const fn = () => setTick((t) => t + 1)
    listeners.add(fn)
    return () => { listeners.delete(fn) }
  }, [])

  // subscribe() returns the cleanup function; useEffect handles it
  useEffect(() => {
    const cleanup = subscribe()
    return cleanup
  }, [subscribe])

  return {
    toast: useCallback((options: ToastOptions) => toast(options), []),
  }
}

export function getToasts(): ToastItem[] {
  return toasts
}
