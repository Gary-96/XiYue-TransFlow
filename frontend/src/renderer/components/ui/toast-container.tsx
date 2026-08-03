import { useState, useEffect } from 'react'
import { getToasts } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import type { ToastItem } from '@/hooks/use-toast'

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  useEffect(() => {
    setToasts(getToasts())
    const interval = setInterval(() => {
      setToasts(getToasts())
    }, 100)
    return () => clearInterval(interval)
  }, [])

  if (!toasts.length) return null

  return (
    <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t: ToastItem) => (
        <div
          key={t.id}
          className={cn(
            'rounded-lg border px-4 py-3 shadow-lg min-w-[280px] max-w-[380px] pointer-events-auto',
            'animate-in slide-in-from-right duration-200',
            t.variant === 'destructive' && 'border-red-500/20 bg-red-500/10 text-red-400',
            t.variant === 'success' && 'border-green-500/20 bg-green-500/10 text-green-400',
            !t.variant || t.variant === 'default' && 'border-border bg-background text-foreground'
          )}
        >
          {t.title && <div className="text-sm font-semibold">{t.title}</div>}
          {t.description && <div className="text-sm opacity-90">{t.description}</div>}
        </div>
      ))}
    </div>
  )
}
