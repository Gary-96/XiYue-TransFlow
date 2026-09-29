/**
 * 关于弹窗 — 轻量版本信息卡片
 */
import { X } from 'lucide-react'

interface AboutDialogProps {
  open: boolean
  onClose: () => void
}

export default function AboutDialog({ open, onClose }: AboutDialogProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm mx-4 rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <span className="text-lg">ℹ️</span> 关于应用
          </h2>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-3 text-center">
          <div className="w-12 h-12 mx-auto rounded-xl bg-brand ring-[3px] ring-brand/20 flex items-center justify-center">
            <span className="text-xl">🎙️</span>
          </div>
          <div>
            <div className="text-base font-semibold text-foreground">喜阅 TransFlow</div>
            <div className="text-xs text-muted-foreground mt-0.5">v2.0 Pro · 跨语言智能直播同传工作台</div>
          </div>
          <div className="text-[11px] text-muted-foreground leading-relaxed">
            基于 Electron + FastAPI 构建的实时同传工具，<br />
            支持抖音 / TikTok 弹幕采集、音频 ASR 转录、AI 翻译与 TTS 语音合成。
          </div>
          <div className="pt-2 text-[10px] text-muted-foreground">
            © 2026 Gary-96 · MIT License
          </div>
        </div>
      </div>
    </div>
  )
}
