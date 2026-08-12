import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { StreamMessage } from '../types'

interface DanmakuPanelProps {
  messages: StreamMessage[]
  onClear: () => void
}

const TYPE_STYLES: Record<string, { color: string; icon: string; label: string }> = {
  comment:    { color: '#64748b', icon: '💬', label: '' },
  gift:       { color: '#f59e0b', icon: '🎁', label: 'gift' },
  member_join:{ color: '#10b981', icon: '👉', label: 'join' },
  social:     { color: '#ec4899', icon: '❤️', label: 'social' },
  room_stats: { color: '#a855f7', icon: '📊', label: 'stats' },
  platform_connected:       { color: '#10b981', icon: '✅', label: 'system' },
  platform_disconnected:    { color: '#ef4444', icon: '❌', label: 'system' },
  collector_started:        { color: '#3b82f6', icon: '🚀', label: 'system' },
  collector_stopped:        { color: '#ef4444', icon: '🛑', label: 'system' },
}

interface DanmakuMessage extends StreamMessage {
  translated_text?: string
}

export default function DanmakuPanel({ messages, onClear }: DanmakuPanelProps) {
  const { t } = useTranslation()
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages])

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white">
        <span className="text-sm font-semibold text-slate-800">{t('danmaku.title')}</span>
        <button
          className="px-3 py-1 rounded-md text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 border border-slate-200 transition-all"
          onClick={onClear}
        >
          {t('danmaku.clear')}
        </button>
      </div>

      {/* 消息列表 */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-400">
            <div className="text-3xl opacity-40">📡</div>
            <div className="text-sm">{t('danmaku.waiting')}</div>
            <div className="text-xs text-slate-400">{t('danmaku.hint')}</div>
          </div>
        ) : (
          messages.map((msg, i) => {
            const style = TYPE_STYLES[msg.type] || TYPE_STYLES.comment
            const dmsg = msg as DanmakuMessage
            const hasTranslation = dmsg.translated_text?.trim()
            const label = style.label ? t(`danmaku.${style.label}`) : ''
            const platformLabel = msg.platform === 'douyin' ? '🎵' : msg.platform === 'tiktok' ? '🎬' : '⚙'

            return (
              <div
                key={i}
                className="group rounded-lg bg-white border border-slate-100 hover:border-slate-300 hover:shadow-sm transition-all duration-150"
                style={{ borderLeftWidth: 3, borderLeftColor: style.color, borderLeftStyle: 'solid' }}
              >
                <div className="px-3 py-2">
                  {/* Meta 行 */}
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mb-1">
                    <span className="opacity-70">{platformLabel}</span>
                    <span className="font-medium" style={{ color: style.color }}>{style.icon} {msg.user}</span>
                    {label && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-medium border" style={{ color: style.color, borderColor: `${style.color}30`, background: `${style.color}10` }}>
                        {label}
                      </span>
                    )}
                    {msg.language && msg.language !== 'unknown' && (
                      <span className="ml-auto text-[9px] text-slate-400 font-mono uppercase">{msg.language}</span>
                    )}
                  </div>
                  {/* 原文 */}
                  <div className="text-sm text-slate-700 leading-snug">{msg.text}</div>
                  {/* 翻译 */}
                  {hasTranslation && (
                    <div className="text-sm text-blue-600 mt-0.5 leading-snug">↳ {dmsg.translated_text}</div>
                  )}
                  {/* 礼物 */}
                  {msg.gift_name && (
                    <div className="text-xs text-amber-600 mt-0.5">🎁 {msg.gift_name} ×{msg.gift_count}</div>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
