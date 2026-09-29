/**
 * 设置面板 — 设备与大模型配置入口
 * 支持切换音频设备、TTS 引擎、语言配置等
 */
import { useState, useEffect } from 'react'
import { Server, Mic, Headphones, RefreshCw } from 'lucide-react'
import type { AudioDevice, AudioDeviceKey } from '@/types'
import { api } from '@/services/api'

export default function SettingsPanel() {
  const [srcLang, setSrcLang] = useState('zh')
  const [tgtLang, setTgtLang] = useState('vi')
  const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([])
  const [loopbackDevices, setLoopbackDevices] = useState<AudioDevice[]>([])
  const [selectedMic, setSelectedMic] = useState<number | null>(null)
  const [selectedPlayback, setSelectedPlayback] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadDevices = async () => {
    setLoading(true)
    setError(null)
    try {
      // 后端 list_all_devices() 直接返回 {inputs, outputs}（无 status 包裹），设备字段为 id
      const res = await api.getAudioDevices()
      setAudioDevices(res.inputs || [])
      setLoopbackDevices(res.outputs || [])
      const defInput = res.inputs?.find((d) => d.is_default) ?? res.inputs?.[0]
      const defOutput = res.outputs?.find((d) => d.is_default) ?? res.outputs?.[0]
      setSelectedMic(defInput?.id ?? null)
      setSelectedPlayback(defOutput?.id ?? null)
    } catch (e) {
      setError('加载设备列表失败')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDevices()
  }, [])

  const handleSaveAudioDevice = async (deviceKey: AudioDeviceKey, deviceId: number) => {
    try {
      await api.setAudioDevice(deviceKey, deviceId)
    } catch (e) {
      setError('保存设备失败')
      console.error(e)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <SettingsIcon />
          设置
        </h2>
        <button
          onClick={loadDevices}
          disabled={loading}
          className="p-2 rounded-lg bg-muted/40 hover:bg-accent transition-colors disabled:opacity-50"
          title="刷新设备列表"
        >
          <RefreshCw className={`w-4 h-4 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* 音频设备 */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">音频设备</h3>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <Mic className="w-4 h-4" />
              麦克风
            </label>
            <select
              value={selectedMic ?? ''}
              onChange={(e) => {
                const val = Number(e.target.value)
                setSelectedMic(val)
                handleSaveAudioDevice('mic_input', val)
              }}
              className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40"
            >
              {audioDevices.map(d => (
                <option key={d.id} value={d.id} className="bg-background">
                  {d.name || `设备 ${d.id}`}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <Headphones className="w-4 h-4" />
              播放设备
            </label>
            <select
              value={selectedPlayback ?? ''}
              onChange={(e) => {
                const val = Number(e.target.value)
                setSelectedPlayback(val)
                handleSaveAudioDevice('translation_output', val)
              }}
              className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40"
            >
              {loopbackDevices.map(d => (
                <option key={d.id} value={d.id} className="bg-background">
                  {d.name || `设备 ${d.id}`}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* 语言配置 */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">翻译语言</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm text-foreground">源语言</label>
            <select
              value={srcLang}
              onChange={(e) => setSrcLang(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40"
            >
              <option value="zh" className="bg-background">中文</option>
              <option value="en" className="bg-background">English</option>
              <option value="ja" className="bg-background">日本語</option>
              <option value="ko" className="bg-background">한국어</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm text-foreground">目标语言</label>
            <select
              value={tgtLang}
              onChange={(e) => setTgtLang(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40"
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
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">引擎状态</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 rounded-lg bg-muted/40 border border-border">
            <div className="flex items-center gap-2 text-foreground mb-1">
              <Server className="w-4 h-4" />
              <span className="text-sm font-medium">ASR 引擎</span>
            </div>
            <p className="text-xs text-emerald-500">就绪</p>
          </div>
          <div className="p-4 rounded-lg bg-muted/40 border border-border">
            <div className="flex items-center gap-2 text-foreground mb-1">
              <RefreshCw className="w-4 h-4" />
              <span className="text-sm font-medium">TTS 引擎</span>
            </div>
            <p className="text-xs text-emerald-500">就绪</p>
          </div>
        </div>
      </section>
    </div>
  )
}

function SettingsIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-violet-400"
    >
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}
