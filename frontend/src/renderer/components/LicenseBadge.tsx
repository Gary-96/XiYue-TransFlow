/**
 * LicenseBadge — 授权状态徽章 (Glassmorphism Aurora 深色)
 * 在 Header 展示授权天数，点击触发激活弹窗
 */
import { useState, useEffect } from 'react'
import { getAuthState, type AuthState } from '../services/auth'

interface LicenseBadgeProps {
  compact?: boolean  // 紧凑模式（仅图标+天数）
  onClick?: () => void  // 点击跳转到激活页面
}

export default function LicenseBadge({ compact = false, onClick }: LicenseBadgeProps) {
  const [state, setState] = useState<AuthState | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getAuthState().then(s => {
      setState(s)
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <button
        onClick={onClick}
        className="flex items-center gap-2 px-3 py-1.5 bg-white/[0.06] border border-white/[0.1] rounded-lg hover:bg-white/[0.1] transition-colors cursor-pointer"
      >
        <span className="w-2 h-2 bg-white/30 rounded-full animate-pulse" />
        <span className="text-xs text-white/50">检查中...</span>
      </button>
    )
  }

  if (!state?.isActive) {
    return (
      <button
        onClick={onClick}
        className="flex items-center gap-2 px-3 py-1.5 bg-rose-500/15 border border-rose-400/30 rounded-lg hover:bg-rose-500/25 transition-colors cursor-pointer"
      >
        <span className="text-base">🔴</span>
        <span className="text-xs font-medium text-rose-300">未激活</span>
      </button>
    )
  }

  const days = state.remainingDays
  const isUrgent = days <= 3
  const isWarning = days <= 7

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${
        isUrgent 
          ? 'bg-rose-500/15 border-rose-400/30 hover:bg-rose-500/25' 
          : isWarning 
            ? 'bg-amber-500/15 border-amber-400/30 hover:bg-amber-500/25'
            : 'bg-emerald-500/15 border-emerald-400/30 hover:bg-emerald-500/25'
      }`}
    >
      <span className="text-base">{isUrgent ? '⚠️' : isWarning ? '⏰' : '✅'}</span>
      {compact ? (
        <span className={`text-xs font-bold ${isUrgent ? 'text-rose-300' : isWarning ? 'text-amber-300' : 'text-emerald-300'}`}>
          {days} 天
        </span>
      ) : (
        <>
          <span className={`text-xs font-medium ${isUrgent ? 'text-rose-300' : isWarning ? 'text-amber-300' : 'text-emerald-300'}`}>
            授权剩余 {days} 天
          </span>
          {days <= 7 && (
            <span className="text-[10px] px-1.5 py-0.5 bg-white/[0.08] rounded-full border border-current opacity-70">
              即将到期
            </span>
          )}
        </>
      )}
    </button>
  )
}
