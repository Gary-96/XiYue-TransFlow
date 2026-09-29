/**
 * 设置抽屉 — 音频设备 / 语言配置 / 引擎状态
 * 从 Dashboard 底部「⚙️」按钮唤起，覆盖在主视口上方
 */
import { useEffect, useState } from 'react'
import { Mic, Headphones, RefreshCw, Server, X } from 'lucide-react'
import type { AudioDevice } from '@/types'
import { api } from '@/services/api'

interface SettingsSheetProps {
  open: boolean
  onClose: () => void
}

export default function SettingsSheet({ open, onClose }: SettingsSheetProps) {
  const [srcLang, setSrcLang] = useState('zh')
  const [tgtLang, setTgtLang] = useState('vi')
  const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([])
  const [loopbackDevices, setLoopbackDevices] = useState<AudioDevice[]>([])
  const [selectedMic, setSelectedMic] = useState<number | null>(null)
  const [selectedPlayback, setSelectedPlayback] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  const loadDevices = async () => {
    setLoading(true)
    setError(null)
    setSaveMsg(null)
    try {
      const res = await api.getAudioDevices()
      if (res.status === 'success') {
        setAudioDevices(res.devices || [])
        setLoopbackDevices(res.loopback_devices || [])
        setSelectedMic(res.devices?.[0]?.index ?? null)
        setSelectedPlayback(res.loopback_devices?.[0]?.index ?? null)
      }
    } catch {
      setError('加载设备列表失败，请确认后端服务已启动')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) loadDevices()
  }, [open])

  const handleSaveAudioDevice = async (deviceKey: string, deviceId: number) => {
    try {
      await api.setAudioDevice(deviceKey, deviceId)
      setSaveMsg('设备已保存 ✓')
      setTimeout(() => setSaveMsg(null), 2000)
    } catch {
      setError('保存设备失败')
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="relative z-10 w-full max-w-lg mx-4 rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-violet-400">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43.25a2 2 0 0 1-1 1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            设置
          </h2>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-5 max-h-[60vh] overflow-y-auto">
          {error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {error}
            </div>
  )}
          {saveMsg && (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
              {saveMsg}
            </div>
          )}

          {/* 音频设备 */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                音频设备
              </h3>
              <button
                onClick={loadDevices}
                disabled={loading}
                className="flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                title="刷新设备列表"
              >
                <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
                刷新
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs text-foreground">
                  <Mic className="h-3.5 w-3.5 text-muted-foreground" />
                  麦克风
                </label>
                <select
                  value={selectedMic ?? ''}
                  onChange={(e) => {
                    const val = Number(e.target.value)
                    setSelectedMic(val)
                    handleSaveAudioDevice('mic', val)
                  }}
                  className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500/40"
                >
                  {audioDevices.map((d) => (
                    <option key={d.index} value={d.index} className="bg-background">
                      {d.name || `设备 ${d.index}`}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs text-foreground">
                  <Headphones className="h-3.5 w-3.5 text-muted-foreground" />
                  播放设备
                </label>
                <select
                  value={selectedPlayback ?? ''}
                  onChange={(e) => {
                    const val = Number(e.target.value)
                    setSelectedPlayback(val)
                    handleSaveAudioDevice('playback', val)
                  }}
                  className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500/40"
                >
                  {loopbackDevices.map((d) => (
                    <option key={d.index} value={d.index} className="bg-background">
                      {d.name || `设备 ${d.index}`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* 翻译语言 */}
          <section className="space-y-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              翻译语言
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-foreground">源语言</label>
                <select
                  value={srcLang}
                  onChange={(e) => setSrcLang(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500/40"
                >
                  <option value="zh" className="bg-background">中文</option>
                  <option value="en" className="bg-background">English</option>
                  <option value="ja" className="bg-background">日本語</option>
                  <option value="ko" className="bg-background">한국어</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-foreground">目标语言</label>
                <select
                  value={tgtLang}
                  onChange={(e) => setTgtLang(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500/40"
                >
                  <option value="vi" className="bg-background">Tiếng Việt</option>
                  <option value="zh" className="bg-background">中文</option>
                  <option value="en" className="bg-background">English</option>
                  <option value="ja" className="bg-background">日本語</option>
                </select>
              </div>
            </div>
          </section>

          {/* 引擎状态 */}
          <section className="space-y-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              引擎状态
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-foreground mb-0.5">
                  <Server className="h-3.5 w-3.5" />
                  <span className="text-xs font-medium">ASR 引擎</span>
                </div>
                <p className="text-[11px] text-emerald-500">就绪</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-foreground mb-0.5">
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span className="text-xs font-medium">TTS 引擎</span>
                </div>
                <p className="text-[11px] text-emerald-500">就绪</p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
