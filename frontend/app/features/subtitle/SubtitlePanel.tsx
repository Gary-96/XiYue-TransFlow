/**
 * 同传字幕面板
 * 展示实时翻译结果
 */
import { useEffect, useRef } from 'react'
import { MessageSquareQuote } from 'lucide-react'
import type { CallSubtitle } from '@/types'

interface SubtitlePanelProps {
  subtitles: CallSubtitle[]
}

export default function SubtitlePanel({ subtitles }: SubtitlePanelProps) {
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [subtitles])

  return (
    <div ref={listRef} className="h-full overflow-y-auto space-y-2 pb-2">
      {subtitles.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground py-12">
          <div className="w-12 h-12 rounded-full bg-muted/40 border border-border flex items-center justify-center">
            <MessageSquareQuote className="w-6 h-6 text-muted-foreground" />
          </div>
          <div className="text-sm font-medium text-foreground">等待音频识别...</div>
          <div className="text-xs text-muted-foreground">点击「开始识别」启动同传</div>
        </div>
      ) : (
        subtitles.map((sub, i) => (
          <div
            key={i}
            className="rounded-xl bg-card border border-border p-3"
          >
            <div className="text-[11px] text-muted-foreground mb-1 flex items-center gap-2">
              <span className="font-medium text-indigo-500">{sub.speaker}</span>
              <span className="text-[10px] font-mono">
                {new Date(sub.timestamp * 1000).toLocaleTimeString()}
              </span>
            </div>
            <div className="text-[13px] text-foreground leading-snug">{sub.source_text}</div>
            <div className="text-[12px] text-indigo-500 mt-1 leading-snug">{sub.translated_text}</div>
          </div>
        ))
      )}
    </div>
  )
}
