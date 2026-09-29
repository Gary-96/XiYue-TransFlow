/**
 * 弹幕同传面板
 * 展示直播间弹幕流，支持翻译结果显示
 */
import { useEffect, useRef } from 'react'
import { MessageSquare, Radio, Users, Heart, Gift, TrendingUp } from 'lucide-react'
import type { StreamMessage } from '@/types'

interface DanmakuPanelProps {
  messages: StreamMessage[]
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

export default function DanmakuPanel({ messages }: DanmakuPanelProps) {
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages])

  return (
    <div
      ref={listRef}
      className="h-full overflow-y-auto space-y-1.5 pb-2"
    >
      {messages.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground py-12">
          <div className="w-12 h-12 rounded-full bg-muted/40 border border-border flex items-center justify-center">
            <Radio className="w-6 h-6 text-muted-foreground" />
          </div>
          <div className="text-sm font-medium text-foreground">等待直播间弹幕接入...</div>
          <div className="text-xs text-muted-foreground">粘贴直播间链接并点击连接</div>
        </div>
      ) : (
        messages.map((msg, i) => {
          const style = TYPE_STYLES[msg.type] || TYPE_STYLES.comment
          const Icon = style.icon
          const hasTranslation = msg.translated_text?.trim()

          return (
            <div
              key={i}
              className="group rounded-xl bg-card border border-border hover:bg-accent hover:border-border-bright transition-all duration-150"
              style={{ borderLeftWidth: 3, borderLeftColor: style.color, borderLeftStyle: 'solid' }}
            >
              <div className="px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-1.5">
                  <span className="font-medium" style={{ color: style.color }}>
                    <Icon className="w-3 h-3 inline mr-0.5" />
                    {msg.user}
                  </span>
                  {msg.language && msg.language !== 'unknown' && (
                    <span className="ml-auto text-[9px] font-mono uppercase text-muted-foreground">
                      {msg.language}
                    </span>
                  )}
                </div>
                <div className="text-[13px] text-foreground leading-snug">{msg.text}</div>
                {hasTranslation && (
                  <div className="text-[12px] text-indigo-500 mt-1 leading-snug">
                    ↳ {msg.translated_text}
                  </div>
                )}
                {msg.gift_name && (
                  <div className="text-[11px] text-amber-500 mt-1 flex items-center gap-1">
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
