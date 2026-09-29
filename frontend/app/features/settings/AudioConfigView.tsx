/**
 * 喜阅 TransFlow — 同传配置（全屏视口）
 * Voicebox 级音频工作站：
 *  - 音频输入 / 监听输出 通道分离（WebRTC string GUID，useAudioDevices 热插拔）
 *  - 硬件动态电平测试（useLevelMeter，-60dB→0dB 实时条）
 *  - 引擎参数：Whisper 档位 / TTS 发音人 / 语速 / 语言方向（后端 config）
 */
import { useEffect, useState } from 'react'
import { Mic, Headphones, RefreshCw, Activity, Cpu, Volume2, Languages } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAudioDevices } from '@/hooks/useAudioDevices'
import { useLevelMeter, dbToPercent } from '@/hooks/useLevelMeter'
import { api } from '@/services/api'

export default function AudioConfigView() {
  const { inputs, outputs, hasPermission, isRefreshing, refresh } = useAudioDevices()

  const [micId, setMicId] = useState<string | null>(null)
  const [monitorId, setMonitorId] = useState<string | null>(null)
  const meter = useLevelMeter(micId)

  // 首次：默认选中第一个输入/输出
  useEffect(() => {
    if (inputs.length && !micId) setMicId(inputs[0].deviceId)
    if (outputs.length && !monitorId) setMonitorId(outputs[0].deviceId)
  }, [inputs, outputs, micId, monitorId])

  // 选中输入变化时自动起电平
  useEffect(() => {
    if (micId) void meter.start()
    return () => meter.stop()
  }, [micId, meter])

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">同传配置</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          音频输入输出通道分配 · 电平测试 · 引擎参数调整
        </p>
      </div>

      <AudioSection>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DeviceSelect
            icon={<Mic className="h-4 w-4" />}
            label="麦克风输入"
            devices={inputs}
            value={micId}
            onChange={(id) => setMicId(id)}
            empty={inputs.length === 0}
          />
          <DeviceSelect
            icon={<Headphones className="h-4 w-4" />}
            label="监听输出"
            devices={outputs}
            value={monitorId}
            onChange={(id) => setMonitorId(id)}
            empty={outputs.length === 0}
            highlightLoopback
          />
        </div>
        {!hasPermission && (
          <p className="mt-3 text-[11px] text-muted-foreground">
            未获取麦克风权限，设备标签可能显示为通用名。点击「测试电平」授权后即可读取真实设备名。
          </p>
        )}
      </AudioSection>

      {/* 电平测试 */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            <Activity className="h-3.5 w-3.5" />
            输入电平
          </div>
          <span className="tabular-nums text-[11px] text-muted-foreground">
            {meter.active ? `${Math.round(meter.db)} dB` : '未测试'}
          </span>
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-75',
              meter.active ? 'bg-indigo-500' : 'bg-muted-foreground/30',
            )}
            style={{ width: `${Math.round(dbToPercent(meter.db) * 100)}%` }}
          />
        </div>
        <div className="mt-3 flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground">
            对着麦克风发声可观察实时电平，用于确认输入通道通畅。
          </p>
          <button
            onClick={refresh}
            className="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <RefreshCw className={cn('h-3 w-3', isRefreshing && 'animate-spin')} />
            刷新设备
          </button>
        </div>
      </div>

      <EngineSection />
    </div>
  )
}

/* ─── 音频设备区 ─── */
function AudioSection({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        <Volume2 className="h-3.5 w-3.5" />
        音频通道
      </div>
      {children}
    </div>
  )
}

function DeviceSelect({
  icon,
  label,
  devices,
  value,
  onChange,
  empty,
  highlightLoopback,
}: {
  icon: React.ReactNode
  label: string
  devices: { deviceId: string; label: string; isLoopback?: boolean; isPro?: boolean }[]
  value: string | null
  onChange: (id: string) => void
  empty: boolean
  highlightLoopback?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-xs text-foreground">
        {icon}
        {label}
      </label>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={empty}
        className="w-full rounded-lg border border-input bg-background px-2.5 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500/40 disabled:opacity-50"
      >
        {empty && <option value="" disabled>未检测到设备</option>}
        {devices.map((d) => (
          <option key={d.deviceId} value={d.deviceId} className="bg-background">
            {highlightLoopback && d.isLoopback ? `${d.label} · 回流` : d.label}
            {d.isPro ? ' · 专业' : ''}
          </option>
        ))}
      </select>
    </div>
  )
}

/* ─── 引擎参数区（后端 config）─── */
const WHISPER_SIZES = ['tiny', 'base', 'small', 'large-v3-turbo']
const TTS_VOICES = [
  { id: 'vi-VN-female-1', label: '女声 · HoaiMy' },
  { id: 'vi-VN-male-1', label: '男声 · NamMinh' },
]

function EngineSection() {
  const [whisper, setWhisper] = useState('base')
  const [voice, setVoice] = useState('vi-VN-female-1')
  const [rate, setRate] = useState(1.0)
  const [srcLang, setSrcLang] = useState('zh')
  const [tgtLang, setTgtLang] = useState('vi')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    api
      .getConfig()
      .then((res) => {
        const d = (res.data ?? {}) as Record<string, unknown>
        if (typeof d.whisper_model_size === 'string') setWhisper(d.whisper_model_size)
        if (typeof d.tts_voice === 'string') setVoice(d.tts_voice)
        if (typeof d.speech_rate === 'number') setRate(d.speech_rate)
      })
      .catch(() => {})
  }, [])

  const save = async () => {
    setSaving(true)
    setMsg(null)
    try {
      await api.updateConfig({
        whisper_model_size: whisper,
        tts_voice: voice,
        speech_rate: rate,
      })
      await api.setLanguage(srcLang, tgtLang).catch(() => {})
      setMsg('引擎参数已保存 ✓')
      setTimeout(() => setMsg(null), 2000)
    } catch {
      setMsg('保存失败，请确认后端服务已启动')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        <Cpu className="h-3.5 w-3.5" />
        引擎参数
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Whisper 识别档位">
          <select
            value={whisper}
            onChange={(e) => setWhisper(e.target.value)}
            className={SELECT_CLS}
          >
            {WHISPER_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="TTS 发音人">
          <select value={voice} onChange={(e) => setVoice(e.target.value)} className={SELECT_CLS}>
            {TTS_VOICES.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="源语言">
          <select value={srcLang} onChange={(e) => setSrcLang(e.target.value)} className={SELECT_CLS}>
            <option value="zh">中文</option>
            <option value="en">English</option>
          </select>
        </Field>
        <Field label="目标语言">
          <select value={tgtLang} onChange={(e) => setTgtLang(e.target.value)} className={SELECT_CLS}>
            <option value="vi">Tiếng Việt</option>
            <option value="zh">中文</option>
          </select>
        </Field>
      </div>

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs text-foreground">
          <Languages className="h-3.5 w-3.5 text-muted-foreground" />
          语速：{rate.toFixed(1)}x
        </label>
        <input
          type="range"
          min="0.5"
          max="2"
          step="0.1"
          value={rate}
          onChange={(e) => setRate(parseFloat(e.target.value))}
          className="w-40 accent-indigo-500"
        />
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <span className="text-[11px] text-muted-foreground">{msg ?? '参数改动需保存后生效'}</span>
        <button
          onClick={save}
          disabled={saving}
          className="flex h-8 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-xs font-medium text-white transition-all duration-150 hover:bg-indigo-500 active:scale-[0.98] disabled:opacity-50"
        >
          {saving ? '保存中…' : '保存参数'}
        </button>
      </div>
    </div>
  )
}

const SELECT_CLS =
  'w-full rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500/40'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs text-foreground">{label}</label>
      {children}
    </div>
  )
}
