/**
 * 同传配置抽屉 — 音频设备 / 翻译引擎 / 同传状态
 */
import { useEffect, useState } from 'react'
import { Mic, RefreshCw, X } from 'lucide-react'
import type { AudioDevice, AudioDeviceKey } from '@/types'

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
  const [selectedVoice, setSelectedVoice] = useState('default')
  const [speechRate, setSpeechRate] = useState(1.0)
  const [engineStatus, setEngineStatus] = useState('checking')

  const loadDevices = async () => {
    setLoading(true); setError(null); setSaveMsg(null)
    try {
      // 后端 list_all_devices() 直接返回 {inputs, outputs}，无 status 包裹
      const res = await fetch('http://127.0.0.1:15387/api/audio/devices').then(r => r.json())
      setAudioDevices(res.inputs || [])
      setLoopbackDevices(res.outputs || [])
      const defInput = res.inputs?.find((d: AudioDevice) => d.is_default) ?? res.inputs?.[0]
      const defOutput = res.outputs?.find((d: AudioDevice) => d.is_default) ?? res.outputs?.[0]
      setSelectedMic(defInput?.id ?? null)
      setSelectedPlayback(defOutput?.id ?? null)
    } catch { setError('加载设备列表失败，请确认后端服务已启动') }
    finally { setLoading(false) }
  }

  useEffect(() => { if (open) loadDevices() }, [open])

  useEffect(() => {
    if (!open) return
    const tick = async () => {
      try { const r = await fetch('http://127.0.0.1:15387/health'); setEngineStatus(r.ok ? 'ok' : 'unreachable') }
      catch { setEngineStatus('offline') }
    }
    tick()
    const t = setInterval(tick, 8000)
    return () => clearInterval(t)
  }, [open])

  const handleSaveDevice = async (key: AudioDeviceKey, id: number) => {
    try {
      await fetch('http://127.0.0.1:15387/api/audio/device', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_key: key, device_id: id }),
      })
      setSaveMsg('设备已保存 ✓')
      setTimeout(() => setSaveMsg(null), 2000)
    } catch { setError('保存设备失败') }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg mx-4 max-h-[85vh] rounded-2xl border border-border bg-card shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-violet-400">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43.25a2 2 0 0 1-1 1.73V4a2 2 0 0 0-2-2z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            同传配置
          </h2>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5 overflow-y-auto flex-1">
          {error && <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>}
          {saveMsg && <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">{saveMsg}</div>}

          {/* 音频通道 */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <Mic className="h-3.5 w-3.5" />音频通道
              </h3>
              <button onClick={loadDevices} disabled={loading}
                className="flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50">
                <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />刷新
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs text-foreground"><span className="text-muted-foreground">🎤</span>麦克风输入</label>
                <select value={selectedMic ?? ''} onChange={(e) => { const v = Number(e.target.value); setSelectedMic(v); handleSaveDevice('mic_input', v) }}
                  className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500/40">
                  {audioDevices.map((d) => (<option key={d.id} value={d.id} className="bg-background">{d.name || `设备 ${d.id}`}</option>))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs text-foreground"><span className="text-muted-foreground">🎧</span>监听输出</label>
                <select value={selectedPlayback ?? ''} onChange={(e) => { const v = Number(e.target.value); setSelectedPlayback(v); handleSaveDevice('translation_output', v) }}
                  className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500/40">
                  {loopbackDevices.map((d) => (<option key={d.id} value={d.id} className="bg-background">{d.name || `设备 ${d.id}`}</option>))}
                </select>
              </div>
            </div>
          </section>

          {/* 翻译引擎 */}
          <section className="space-y-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              翻译引擎
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-foreground">源语言</label>
                <select value={srcLang} onChange={(e) => setSrcLang(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500/40">
                  <option value="zh">中文</option><option value="en">English</option><option value="ja">日本語</option><option value="ko">한국어</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-foreground">目标语言</label>
                <select value={tgtLang} onChange={(e) => setTgtLang(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500/40">
                  <option value="vi">Tiếng Việt</option><option value="zh">中文</option><option value="en">English</option><option value="ja">日本語</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-foreground">TTS 发音人</label>
                <select value={selectedVoice} onChange={(e) => setSelectedVoice(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500/40">
                  <option value="default">默认女声</option><option value="male">男声</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-foreground">语速：{speechRate.toFixed(1)}x</label>
                <input type="range" min="0.5" max="2" step="0.1" value={speechRate}
                  onChange={(e) => setSpeechRate(parseFloat(e.target.value))} className="w-full accent-indigo-500" />
              </div>
            </div>
          </section>

          {/* 同传状态 */}
          <section className="space-y-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              同传状态
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <StatusBadge label="后端引擎" value={engineStatus === 'ok' ? '15387 ✓' : engineStatus === 'offline' ? '离线' : engineStatus} ok={engineStatus === 'ok'} />
              <StatusBadge label="双语方向" value={`${srcLang} ⇄ ${tgtLang}`} ok />
              <StatusBadge label="TTS 发音人" value={selectedVoice === 'default' ? '女声' : '男声'} ok />
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${ok ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-border bg-muted/30'}`}>
      <div className="text-[10px] text-muted-foreground mb-1">{label}</div>
      <div className={`text-xs font-medium ${ok ? 'text-emerald-500' : 'text-foreground'}`}>{value}</div>
    </div>
  )
}
