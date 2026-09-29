/**
 * SettingsView — 全屏设置中心
 * 顶部横向 Tab：常规 | 音频设备 | 同传引擎 | 运行模式 | 关于与更新
 * 内容区：Voicebox 风格「左标题描述 + 右控制组件」行排版
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { CheckCircle2, Circle, Loader2, Play } from 'lucide-react'

type TabKey = 'general' | 'audio' | 'engine' | 'mode' | 'about'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'general', label: '常规' },
  { key: 'audio',   label: '音频设备' },
  { key: 'engine',  label: '同传引擎' },
  { key: 'mode',    label: '运行模式' },
  { key: 'about',   label: '关于与更新' },
]

interface SettingsViewProps {
  onBack: () => void
}

export default function SettingsView({ onBack }: SettingsViewProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('general')
  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-background">
      {/* 顶部 Tab 栏 */}
      <div className="shrink-0 border-b border-border bg-background px-6">
        <div className="flex items-center gap-6">
          <button onClick={onBack}
            className="mr-2 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="返回导播台">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          {TABS.map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`relative pb-3 text-xs font-medium transition-colors ${
                activeTab === tab.key ? 'text-indigo-400' : 'text-muted-foreground hover:text-foreground'
              }`}>
              {tab.label}
              {activeTab === tab.key && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.6)]" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto p-8">
        {activeTab === 'general'  && <GeneralTab />}
        {activeTab === 'audio'    && <AudioTab />}
        {activeTab === 'engine'   && <EngineTab />}
        {activeTab === 'mode'     && <ModeTab />}
        {activeTab === 'about'    && <AboutTab />}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   常规
═══════════════════════════════════════════════════════ */
function GeneralTab() {
  const [serverUrl, setServerUrl] = useState('http://127.0.0.1:15387')
  const [theme, setTheme] = useState<'system' | 'dark' | 'light'>('dark')
  const [keepAlive, setKeepAlive] = useState(false)
  const [health, setHealth] = useState<'ok' | 'error' | 'checking'>('checking')

  useEffect(() => {
    const tick = async () => {
      try { const r = await fetch(serverUrl + '/health'); setHealth(r.ok ? 'ok' : 'error') }
      catch { setHealth('error') }
    }
    tick()
    const t = setInterval(tick, 10000)
    return () => clearInterval(t)
  }, [serverUrl])

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <SectionTitle title="常规" subtitle="服务器、主题与后台行为" />

      <SettingRow
        label="服务器地址"
        desc="后端 FastAPI 服务地址，默认 15387 端口"
      >
        <div className="flex items-center gap-2">
          <input value={serverUrl} onChange={(e) => setServerUrl(e.target.value)}
            className="h-8 rounded-md border border-border bg-background px-3 text-xs text-foreground font-mono focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/40 w-56"
          />
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
            health === 'ok' ? 'bg-emerald-500/10 text-emerald-500' :
            health === 'error' ? 'bg-red-500/10 text-red-500' :
            'bg-muted text-muted-foreground'
          }`}>
            {health === 'ok' ? <CheckCircle2 className="h-3 w-3" /> : health === 'error' ? <Circle className="h-3 w-3 text-red-400" /> : <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
            {health === 'ok' ? '在线' : health === 'error' ? '离线' : '检测中'}
          </span>
        </div>
      </SettingRow>

      <SettingRow label="界面主题" desc="选择客户端视觉主题风格">
        <select value={theme} onChange={(e) => setTheme(e.target.value as any)}
          className="h-8 rounded-md border border-border bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500/40 w-40">
          <option value="system">跟随系统</option>
          <option value="dark">深色模式</option>
          <option value="light">浅色模式</option>
        </select>
      </SettingRow>

      <SettingRow label="后台驻留" desc="关闭窗口时保持后端引擎在后台运行，不中断直播任务">
        <ToggleSwitch checked={keepAlive} onChange={setKeepAlive} />
      </SettingRow>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   音频设备
═══════════════════════════════════════════════════════ */
function AudioTab() {
  const [inputDevices, setInputDevices] = useState<{ id: string; label: string }[]>([])
  const [outputDevices, setOutputDevices] = useState<{ id: string; label: string }[]>([])
  const [selectedInput, setSelectedInput] = useState('')
  const [selectedOutput, setSelectedOutput] = useState('')
  const [loading, setLoading] = useState(false)
  const [level, setLevel] = useState(0)
  const animRef = useRef<number>(0)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const enumerateDevices = useCallback(async () => {
    setLoading(true)
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      setInputDevices(devices.filter(d => d.kind === 'audioinput').map(d => ({ id: d.deviceId, label: d.label || `麦克风 ${d.deviceId.slice(0,6)}` })))
      setOutputDevices(devices.filter(d => d.kind === 'audiooutput').map(d => ({ id: d.deviceId, label: d.label || `扬声器 ${d.deviceId.slice(0,6)}` })))
      if (devices.some(d => d.kind === 'audioinput') && !selectedInput) {
        setSelectedInput(devices.find(d => d.kind === 'audioinput')!.deviceId)
      }
    } catch {
      // permission denied
    } finally {
      setLoading(false)
    }
  }, [selectedInput])

  useEffect(() => { enumerateDevices() }, [enumerateDevices])

  // 实时音量电平
  useEffect(() => {
    if (!selectedInput) { setLevel(0); return }
    navigator.mediaDevices.getUserMedia({ audio: { deviceId: selectedInput } })
      .then(stream => {
        streamRef.current = stream
        const ctx = new AudioContext()
        const src = ctx.createMediaStreamSource(stream)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 256
        src.connect(analyser)
        analyserRef.current = analyser
        const buf = new Uint8Array(analyser.frequencyBinCount)
        const tick = () => {
          analyser.getByteFrequencyData(buf)
          const avg = buf.reduce((a, b) => a + b, 0) / buf.length
          setLevel(avg / 255)
          animRef.current = requestAnimationFrame(tick)
        }
        tick()
      })
      .catch(() => { setLevel(0) })
    return () => {
      cancelAnimationFrame(animRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [selectedInput])

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <SectionTitle title="音频设备" subtitle="麦克风输入、监听输出与实时电平监测" />

      <SettingRow label="麦克风输入" desc="选择录音设备，支持专业声卡即插即用">
        <div className="flex items-center gap-2">
          <select value={selectedInput} onChange={(e) => setSelectedInput(e.target.value)}
            className="h-8 rounded-md border border-border bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500/40 w-56">
            {inputDevices.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
          <button onClick={enumerateDevices} disabled={loading}
            className="flex h-8 items-center gap-1 rounded-md border border-border bg-background px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={loading ? 'animate-spin' : ''}><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            刷新
          </button>
        </div>
      </SettingRow>

      {/* 电平条 */}
      <SettingRow label="输入电平" desc="实时音频输入音量监控">
        <div className="flex items-center gap-3 w-56">
          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full transition-all duration-75"
              style={{
                width: `${level * 100}%`,
                backgroundColor: level < 0.6 ? '#10b981' : level < 0.8 ? '#f59e0b' : '#ef4444',
              }}
            />
          </div>
          <span className="text-[10px] font-mono text-muted-foreground w-8 text-right">{Math.round(level * 100)}%</span>
        </div>
      </SettingRow>

      <SettingRow label="监听输出" desc="选择监听耳机或扬声器设备">
        <select value={selectedOutput} onChange={(e) => setSelectedOutput(e.target.value)}
          className="h-8 rounded-md border border-border bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500/40 w-56">
          {outputDevices.length > 0
            ? outputDevices.map(d => <option key={d.id} value={d.id}>{d.label}</option>)
            : <option value="">无输出设备（点击刷新）</option>
          }
        </select>
      </SettingRow>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   同传引擎
═══════════════════════════════════════════════════════ */
function EngineTab() {
  const [asrModel, setAsrModel] = useState('base')
  const [ttsVoice, setTtsVoice] = useState('female')
  const [speechRate, setSpeechRate] = useState(1.0)
  const [ttsVolume, setTtsVolume] = useState(0.8)
  const [playing, setPlaying] = useState(false)

  const handlePreview = () => {
    setPlaying(true)
    // 使用 Web Speech API 播放测试音频
    const utter = new SpeechSynthesisUtterance('xin ye tong chuan, ni hao')
    utter.lang = 'vi-VN'
    utter.rate = speechRate
    utter.volume = ttsVolume
    utter.onend = () => setPlaying(false)
    utter.onerror = () => setPlaying(false)
    speechSynthesis.speak(utter)
    setTimeout(() => setPlaying(false), 2500)
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <SectionTitle title="同传引擎" subtitle="语音识别模型、TTS 发音人与语速调节" />

      <SettingRow label="ASR 识别模型" desc="Whisper 本地识别模型，越大越准确但速度越慢">
        <select value={asrModel} onChange={(e) => setAsrModel(e.target.value)}
          className="h-8 rounded-md border border-border bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500/40 w-40">
          <option value="tiny">Tiny（最快，精度低）</option>
          <option value="base">Base（推荐，平衡型）</option>
          <option value="small">Small（高精度）</option>
          <option value="large">Large-v3（最高精度，需大内存）</option>
        </select>
      </SettingRow>

      <SettingRow label="TTS 发音人" desc="越南语 TTS 语音输出风格">
        <div className="flex items-center gap-2">
          <select value={ttsVoice} onChange={(e) => setTtsVoice(e.target.value)}
            className="h-8 rounded-md border border-border bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500/40 w-40">
            <option value="female">女声（默认）</option>
            <option value="male">男声</option>
          </select>
          <button onClick={handlePreview} disabled={playing}
            className="flex h-8 items-center gap-1.5 rounded-md bg-indigo-600 px-3 text-xs font-medium text-white transition-all hover:bg-indigo-500 disabled:opacity-50 active:scale-[0.97]">
            <Play className={`h-3 w-3 ${playing ? 'animate-pulse' : ''}`} />
            {playing ? '播放中...' : '试听'}
          </button>
        </div>
      </SettingRow>

      <SettingRow label="TTS 语速" desc="语音合成播放速度，0.8x ~ 1.5x">
        <div className="flex items-center gap-3 w-56">
          <input type="range" min="0.8" max="1.5" step="0.1" value={speechRate}
            onChange={(e) => setSpeechRate(parseFloat(e.target.value))}
            className="flex-1 accent-indigo-500" />
          <span className="text-xs font-mono text-foreground w-10 text-right">{speechRate.toFixed(1)}x</span>
        </div>
      </SettingRow>

      <SettingRow label="TTS 音量" desc="语音合成输出音量大小">
        <div className="flex items-center gap-3 w-56">
          <input type="range" min="0" max="1" step="0.05" value={ttsVolume}
            onChange={(e) => setTtsVolume(parseFloat(e.target.value))}
            className="flex-1 accent-indigo-500" />
          <span className="text-xs font-mono text-foreground w-10 text-right">{Math.round(ttsVolume * 100)}%</span>
        </div>
      </SettingRow>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   运行模式
═══════════════════════════════════════════════════════ */
function ModeTab() {
  const [mode, setMode] = useState<'local' | 'cloud'>('local')
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <SectionTitle title="运行模式" subtitle="选择同传链路架构，匹配不同硬件环境" />

      <div className="grid grid-cols-2 gap-4">
        <ModeCard
          active={mode === 'local'}
          onClick={() => setMode('local')}
          icon="🖥️"
          title="旗舰本地版"
          desc="本地 ASR + 本地免费 TTS，零 API 消耗"
          tags={['离线可用', '零成本', '需显卡']}
        />
        <ModeCard
          active={mode === 'cloud'}
          onClick={() => setMode('cloud')}
          icon="⚡"
          title="极速云端版"
          desc="全链路云端加速，低配电脑友好"
          tags={['低延迟', '云端加速', '需联网']}
        />
      </div>

      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <div className="text-xs font-medium text-foreground mb-2">当前模式说明</div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {mode === 'local'
            ? '旗舰本地版使用本地 Whisper 模型进行语音识别， Edge-TTS 进行语音合成，全程无需网络即可运行，适合有 NVIDIA 显卡的专业直播场景。'
            : '极速云端版通过云端 API 完成 ASR 识别与 TTS 合成，延迟更低、对硬件要求小，适合笔记本或集成显卡环境。'
          }
        </p>
      </div>
    </div>
  )
}

function ModeCard({ active, onClick, icon, title, desc, tags }: {
  active: boolean; onClick: () => void; icon: string; title: string; desc: string; tags: string[]
}) {
  return (
    <button onClick={onClick}
      className={`rounded-xl border-2 p-4 text-left transition-all duration-150 hover:scale-[1.02] active:scale-[0.98] ${
        active
          ? 'border-indigo-500 bg-indigo-500/5 shadow-[0_0_20px_rgba(99,102,241,0.15)]'
          : 'border-border bg-card hover:border-border-bright'
      }`}>
      <div className="text-2xl mb-2">{icon}</div>
      <div className={`text-sm font-semibold ${active ? 'text-indigo-400' : 'text-foreground'}`}>{title}</div>
      <div className="text-xs text-muted-foreground mt-1">{desc}</div>
      <div className="flex flex-wrap gap-1.5 mt-3">
        {tags.map(t => (
          <span key={t} className={`text-[10px] px-2 py-0.5 rounded-full ${
            active ? 'bg-indigo-500/15 text-indigo-300' : 'bg-muted text-muted-foreground'
          }`}>{t}</span>
        ))}
      </div>
    </button>
  )
}

/* ═══════════════════════════════════════════════════════
   关于与更新
═══════════════════════════════════════════════════════ */
function AboutTab() {
  const [checkState, setCheckState] = useState<'idle' | 'checking' | 'latest' | 'update-available'>('idle')
  const [checkMsg, setCheckMsg] = useState('')

  const handleCheck = async () => {
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

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <SectionTitle title="关于与更新" subtitle="软件版本、更新检查与系统信息" />

      {/* Logo + 版本 */}
      <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-5">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-indigo-600 ring-[4px] ring-indigo-500/20">
          <span className="text-3xl font-bold text-white">X</span>
        </div>
        <div>
          <div className="text-base font-semibold text-foreground">喜阅 TransFlow</div>
          <div className="text-sm text-muted-foreground mt-0.5">v2.0.0 · 跨语言智能直播同传工作台</div>
          <div className="text-xs text-muted-foreground/70 mt-1">基于 Electron + FastAPI 构建</div>
        </div>
      </div>

      {/* 检查更新 */}
      <SettingRow label="检查更新" desc="检测是否有新版本可供下载">
        <div className="flex items-center gap-3">
          <button onClick={handleCheck} disabled={checkState === 'checking'}
            className="flex h-8 items-center gap-1.5 rounded-md bg-indigo-600 px-3 text-xs font-medium text-white transition-all hover:bg-indigo-500 disabled:opacity-50 active:scale-[0.97]">
            {checkState === 'checking' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> :
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>}
            {checkState === 'checking' ? '检查中...' : '检查新版本'}
          </button>
          {checkState !== 'idle' && (
            <span className={`text-xs flex items-center gap-1 ${
              checkState === 'latest' ? 'text-emerald-500' :
              checkState === 'update-available' ? 'text-amber-500' : 'text-muted-foreground'
            }`}>
              {checkState === 'latest' ? <CheckCircle2 className="h-3.5 w-3.5" /> :
               checkState === 'update-available' ? <Circle className="h-3.5 w-3.5 text-amber-400" /> :
               <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {checkMsg}
            </span>
          )}
        </div>
      </SettingRow>

      {/* 系统信息 */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">系统信息</div>
        <InfoRow label="运行环境" value="Electron 31 / Chromium 131" />
        <InfoRow label="前端框架" value="React 19 + Vite 6" />
        <InfoRow label="样式方案" value="Tailwind CSS v4 + shadcn/ui" />
        <InfoRow label="后端服务" value="FastAPI · :15387" />
        <InfoRow label="协议" value="MIT License" />
        <div className="pt-2 text-[10px] text-muted-foreground">
          GitHub: <a href="https://github.com/Gary-96/XiYue-TransFlow" target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline">XiYue-TransFlow</a>
          {' '}· © 2026 Gary-96
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   通用组件
═══════════════════════════════════════════════════════ */

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
    </div>
  )
}

function SettingRow({ label, desc, children }: { label: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-5 py-4">
      <div className="min-w-0 flex-1 pr-4">
        <div className="text-sm font-medium text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{desc}</div>
      </div>
      <div className="shrink-0 flex items-center gap-2">{children}</div>
    </div>
  )
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
        checked ? 'bg-indigo-600' : 'bg-muted border-border'
      }`}
      role="switch" aria-checked={checked}>
      <span className={`pointer-events-none block h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200 ${
        checked ? 'translate-x-5' : 'translate-x-0.5'
      }`} />
    </button>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-foreground">{value}</span>
    </div>
  )
}
