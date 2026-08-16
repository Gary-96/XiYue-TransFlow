import { useState, useEffect } from 'react'
import { getToasts } from '../../hooks/use-toast'
import type { ToastItem } from '../../hooks/use-toast'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

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
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-2 pointer-events-none max-w-md w-full px-4">
      {toasts.map((t: ToastItem) => (
        <div
          key={t.id}
          className={cn(
            'rounded-xl border px-4 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.4)] pointer-events-auto animate-in slide-in-from-top duration-200 backdrop-blur-xl bg-[#12122a]/90',
            t.variant === 'destructive' && 'border-rose-400/40 text-rose-300',
            t.variant === 'success' && 'border-emerald-400/40 text-emerald-300',
            !t.variant || t.variant === 'default' && 'border-white/[0.12] text-white/80'
          )}
        >
          {t.title && <div className="text-sm font-semibold">{t.title}</div>}
          {t.description && <div className="text-sm opacity-90">{t.description}</div>}
        </div>
      ))}
    </div>
  )
}
