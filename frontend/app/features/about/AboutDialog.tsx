/**
 * 关于与更新弹窗
 */
import { useState } from 'react'
import { X, CheckCircle2, Circle, Loader2 } from 'lucide-react'

interface AboutDialogProps {
  open: boolean
  onClose: () => void
}

export default function AboutDialog({ open, onClose }: AboutDialogProps) {
  const [checkState, setCheckState] = useState<'idle' | 'checking' | 'latest' | 'update-available'>('idle')
  const [checkMsg, setCheckMsg] = useState('')

  const handleCheckUpdate = async () => {
    setCheckState('checking')
    setCheckMsg('正在检查更新...')
    try {
      await new Promise(r => setTimeout(r, 1500))
      setCheckState('latest')
      setCheckMsg('当前已是最新版本 v2.0.0')
    } catch {
      setCheckState('update-available')
      setCheckMsg('发现新版本 v2.1.0，请访问 GitHub 下载')
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm mx-4 rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <span className="text-lg">ℹ️</span> 关于与更新
          </h2>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="w-14 h-14 rounded-xl bg-indigo-600 ring-[4px] ring-indigo-500/20 flex items-center justify-center">
              <span className="text-2xl font-bold text-white">X</span>
            </div>
            <div>
              <div className="text-base font-semibold text-foreground">喜阅 TransFlow</div>
              <div className="text-xs text-muted-foreground mt-0.5">v2.0.0 · 跨语言智能直播同传工作台</div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground">检查更新</span>
              <button onClick={handleCheckUpdate} disabled={checkState === 'checking'}
                className="flex h-7 items-center gap-1.5 rounded-md bg-indigo-600 px-3 text-xs font-medium text-white transition-all hover:bg-indigo-500 disabled:opacity-50 active:scale-[0.97]">
                {checkState === 'checking' ? <Loader2 className="h-3 w-3 animate-spin" /> :
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>}
                {checkState === 'checking' ? '检查中...' : '检查新版本'}
              </button>
            </div>
            {checkState !== 'idle' && (
              <div className={`flex items-center gap-1.5 text-xs ${
                checkState === 'latest' ? 'text-emerald-500' :
                checkState === 'update-available' ? 'text-amber-500' : 'text-muted-foreground'
              }`}>
                {checkState === 'latest' ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> :
                 checkState === 'update-available' ? <Circle className="h-3.5 w-3.5 shrink-0 text-amber-400" /> :
                 <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />}
                {checkMsg}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">系统信息</div>
            <InfoRow label="运行环境" value="Electron 31 / Chromium 131" />
            <InfoRow label="前端框架" value="React 19 + Vite 6" />
            <InfoRow label="样式方案" value="Tailwind CSS v4 + shadcn/ui" />
            <InfoRow label="后端服务" value="FastAPI · :15387" />
            <InfoRow label="协议" value="MIT License" />
          </div>

          <div className="text-[10px] text-muted-foreground text-center">
            © 2026 Gary-96 · GitHub:{' '}
            <a href="https://github.com/Gary-96/XiYue-TransFlow" target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline">
              XiYue-TransFlow
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-foreground">{value}</span>
    </div>
  )
}
