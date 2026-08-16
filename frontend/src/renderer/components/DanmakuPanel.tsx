import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { MessageSquare, Radio, Users, Heart, Gift, TrendingUp } from 'lucide-react'
import type { StreamMessage } from '../types'

interface DanmakuPanelProps {
  messages: StreamMessage[]
  onClear: () => void
}

const TYPE_STYLES: Record<string, { color: string; icon: typeof MessageSquare; label: string }> = {
  comment:              { color: '#8b5cf6', icon: MessageSquare, label: '' },
  gift:                 { color: '#fbbf24', icon: Gift, label: 'gift' },
  member_join:          { color: '#34d399', icon: Users, label: 'join' },
  social:               { color: '#f472b6', icon: Heart, label: 'social' },
  room_stats:           { color: '#a78bfa', icon: TrendingUp, label: 'stats' },
  platform_connected:   { color: '#34d399', icon: Radio, label: 'system' },
  platform_disconnected:{ color: '#fb7185', icon: Radio, label: 'system' },
  collector_started:    { color: '#60a5fa', icon: Radio, label: 'system' },
  collector_stopped:    { color: '#fb7185', icon: Radio, label: 'system' },
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
    <div ref={listRef} className="h-full overflow-y-auto space-y-1.5 pb-2">
      {messages.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center gap-3 text-white/30 py-12">
          <div className="w-12 h-12 rounded-full bg-white/[0.05] border border-white/[0.08] flex items-center justify-center">
            <Radio className="w-6 h-6 text-white/20" />
          </div>
          <div className="text-sm font-medium text-white/50">{t('danmaku.waiting')}</div>
          <div className="text-xs text-white/30">{t('danmaku.hint')}</div>
        </div>
      ) : (
        messages.map((msg, i) => {
          const style = TYPE_STYLES[msg.type] || TYPE_STYLES.comment
          const Icon = style.icon
          const dmsg = msg as DanmakuMessage
          const hasTranslation = dmsg.translated_text?.trim()
          const label = style.label ? t(`danmaku.${style.label}`) : ''

          return (
            <div
              key={i}
              className="group rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.07] hover:border-white/[0.14] hover:shadow-[0_4px_16px_rgba(0,0,0,0.3)] transition-all duration-150"
              style={{ borderLeftWidth: 3, borderLeftColor: style.color, borderLeftStyle: 'solid' }}
            >
              <div className="px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-[10px] text-white/40 mb-1.5">
                  <span className="font-medium" style={{ color: style.color }}>
                    <Icon className="w-3 h-3 inline mr-0.5" />
                    {msg.user}
                  </span>
                  {label && (
                    <span className="px-1.5 py-0.5 rounded-full text-[9px] font-medium border" style={{ color: style.color, borderColor: `${style.color}40`, background: `${style.color}18` }}>
                      {label}
                    </span>
                  )}
                  {msg.language && msg.language !== 'unknown' && (
                    <span className="ml-auto text-[9px] text-white/30 font-mono uppercase">{msg.language}</span>
                  )}
                </div>
                <div className="text-[13px] text-white/85 leading-snug">{msg.text}</div>
                {hasTranslation && (
                  <div className="text-[12px] text-blue-300 mt-1 leading-snug">↳ {dmsg.translated_text}</div>
                )}
                {msg.gift_name && (
                  <div className="text-[11px] text-amber-300 mt-1 flex items-center gap-1">
                    <Gift className="w-3 h-3" />
                    {msg.gift_name} ×{msg.gift_count}
                  </div>
                )}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
