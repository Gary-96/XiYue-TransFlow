/**
 * Dashboard — 主面板入口
 * 布局：Sidebar(w-52) | 右列(TopHeader + MainView + Dock)
 * 导航：实时导播台 / 同传配置（抽屉）
 * 底部固定：设置 / 关于弹窗
 */
import { useState, useEffect } from 'react'
import { useStreamWebSocket, useAudioWebSocket } from '../../hooks/useWebSocket'
import type { Platform } from '../../types'
import MainView from './MainView'
import SettingsSheet from '../settings/SettingsSheet'
import AboutDialog from '../about/AboutDialog'

interface DashboardProps {}

type ActiveSection = 'workbench' | 'config'

export default function Dashboard(_props: DashboardProps) {
  const [section, setSection] = useState<ActiveSection>('workbench')
  const [platform, setPlatform] = useState<Platform>('douyin')
  const [roomId, setRoomId] = useState('')
  const [isConnecting, setIsConnecting] = useState(false)
  const [platformActive, setPlatformActive] = useState(false)
  const [srcLang, setSrcLang] = useState('zh')
  const [tgtLang, setTgtLang] = useState('vi')
  const [engineStatus, setEngineStatus] = useState('checking')

  const [showConfig, setShowConfig] = useState(false)
  const [showAbout, setShowAbout] = useState(false)

  const { messages, status: wsStatus, clearMessages } = useStreamWebSocket()
  const {
    transcription: _transcription,
    isRecording: _isRecording,
    isTTSSpeaking,
    ttsEnabled,
    callHistory,
    startRecording,
    toggleTTSEnabled,
    setSpectrumCallback,
    getTTSStatus,
  } = useAudioWebSocket()

  useEffect(() => {
    setSpectrumCallback(() => (_data: number[]) => {})
  }, [setSpectrumCallback])

  useEffect(() => {
    const checkBackend = async () => {
      try {
        const resp = await fetch('http://127.0.0.1:15387/health')
        setEngineStatus(resp.ok ? 'ok' : 'unreachable')
      } catch {
        setEngineStatus('offline')
      }
    }
    checkBackend()
    const timer = setInterval(checkBackend, 10000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    getTTSStatus()
  }, [getTTSStatus])

  const handleConnect = async () => {
    if (!roomId.trim()) return
    setIsConnecting(true)
    try { setPlatformActive(true) }
    finally { setIsConnecting(false) }
  }

  const handleToggleConnection = () => {
    if (platformActive) { setPlatformActive(false) }
    else { handleConnect() }
  }

  const handleLanguageChange = (src: string, tgt: string) => {
    setSrcLang(src)
    setTgtLang(tgt)
  }

  const handleStartRecognition = () => { startRecording() }
  const handleToggleTTS = async (enabled: boolean) => { await toggleTTSEnabled(enabled) }
  const handleClearMessages = () => { clearMessages() }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* ── 侧边栏 ── */}
      <aside className="flex w-52 shrink-0 flex-col border-r border-border bg-background">
        {/* Logo */}
        <div className="flex h-12 items-center gap-2.5 px-4 border-b border-border/60">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-600 ring-[3px] ring-indigo-500/20">
            <span className="text-[10px] font-bold text-white">X</span>
          </div>
          <span className="text-xs font-semibold text-foreground tracking-wide">喜阅 TransFlow</span>
        </div>

        {/* 导航 */}
        <nav className="flex-1 space-y-1 p-2">
          <NavItem
            active={section === 'workbench'}
            onClick={() => { setSection('workbench'); setShowConfig(false) }}
            icon={<IconWorkbench />}
            label="实时导播台"
            desc="弹幕 + 字幕双流"
          />
          <NavItem
            active={section === 'config'}
            onClick={() => { setSection('config'); setShowConfig(true) }}
            icon={<IconConfig />}
            label="同传配置"
            desc="音频 / 引擎 / 状态"
          />
        </nav>

        {/* 底部：设置 + 关于 */}
        <div className="border-t border-border/60 p-2 flex gap-1.5">
          <TooltipButton tooltip="同传配置" onClick={() => setShowConfig(true)}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43.25a2 2 0 0 1-1 1.73V4a2 2 0 0 0-2-2z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </TooltipButton>
          <TooltipButton tooltip="关于与更新" onClick={() => setShowAbout(true)}>
            <span className="text-sm font-semibold leading-none">i</span>
          </TooltipButton>
        </div>
      </aside>

      {/* ── 主工作区 ── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* TopHeader */}
        <header className="relative z-20 flex h-11 shrink-0 items-center justify-between border-b border-border bg-background px-4 backdrop-blur-xl">
          <div className="flex items-center gap-1.5">
            <button onClick={() => setPlatform('douyin')}
              className={`h-7 px-3 text-xs font-medium rounded-md transition-all duration-150 ${platform === 'douyin' ? 'bg-rose-500/10 text-rose-500 border border-rose-500/30' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}`}>
              抖音
            </button>
            <button onClick={() => setPlatform('tiktok')}
              className={`h-7 px-3 text-xs font-medium rounded-md transition-all duration-150 ${platform === 'tiktok' ? 'bg-indigo-500/10 text-indigo-500 border border-indigo-500/30' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}`}>
              TikTok
            </button>
          </div>

          <div className="flex flex-1 max-w-xl items-center gap-3">
            <div className="relative flex flex-1 items-center">
              <input type="text"
                placeholder={platform === 'douyin' ? '粘贴直播间分享链接或输入直播房间 ID...' : 'Paste TikTok room link or ID...'}
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleToggleConnection()}
                className="h-8 w-full rounded-md border border-input bg-background px-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/40"
              />
            </div>
            <button onClick={handleToggleConnection} disabled={!roomId.trim() || isConnecting}
              className={`h-8 shrink-0 px-4 text-xs font-medium rounded-md transition-all duration-150 ${platformActive ? 'border border-rose-500/30 bg-rose-500/10 text-rose-500 hover:bg-rose-500/20' : 'bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40'}`}>
              {isConnecting ? '连接中...' : platformActive ? '断开' : '连接'}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <select value={`${srcLang}-${tgtLang}`}
              onChange={(e) => { const [s, t] = e.target.value.split('-'); handleLanguageChange(s, t) }}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500/40">
              <option value="zh-vi">中 → 越</option>
              <option value="vi-zh">越 → 中</option>
            </select>
          </div>
        </header>

        {/* 主视口 */}
        {section === 'workbench' ? (
          <MainView
            wsStatus={wsStatus} engineStatus={engineStatus}
            ttsEnabled={ttsEnabled} isTTSSpeaking={isTTSSpeaking}
            messageCount={messages.length} messages={messages}
            callHistory={callHistory} spectrumData={[]}
            onStartRecognition={handleStartRecognition}
            onToggleTTS={handleToggleTTS} onClearMessages={handleClearMessages}
            onOpenConfig={() => setShowConfig(true)}
          />
        ) : (
          <div className="flex-1 overflow-auto p-6">
            <InlineConfigPanel onClose={() => setSection('workbench')} />
          </div>
        )}
      </div>

      {/* 弹窗 */}
      <SettingsSheet open={showConfig} onClose={() => setShowConfig(false)} />
      <AboutDialog open={showAbout} onClose={() => setShowAbout(false)} />
    </div>
  )
}

/* ─── NavItem ─── */
function NavItem({ active, onClick, icon, label, desc }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string; desc: string
}) {
  return (
    <button onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all duration-150 ${
        active ? 'bg-indigo-600/15 text-indigo-400' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
      }`}>
      <span className={`shrink-0 ${active ? 'text-indigo-400' : ''}`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className={`text-xs font-medium truncate ${active ? 'text-indigo-300' : ''}`}>{label}</div>
        <div className={`text-[10px] truncate ${active ? 'text-indigo-400/60' : 'text-muted-foreground/70'}`}>{desc}</div>
      </div>
      {active && <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400 shadow-[0_0_6px_rgba(129,140,248,0.8)]" />}
    </button>
  )
}

function TooltipButton({ tooltip, children, onClick }: { tooltip: string; children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} title={tooltip}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
      {children}
    </button>
  )
}

function IconWorkbench() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
    </svg>
  )
}

function IconConfig() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43.25a2 2 0 0 1-1 1.73V4a2 2 0 0 0-2-2z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  )
}

/* ─── 内联配置面板 ─── */
function InlineConfigPanel({ onClose }: { onClose: () => void }) {
  const [srcLang, setSrcLang] = useState('zh')
  const [tgtLang, setTgtLang] = useState('vi')
  const [selectedVoice, setSelectedVoice] = useState('default')
  const [speechRate, setSpeechRate] = useState(1.0)
  const [engineStatus, setEngineStatus] = useState('checking')

  useEffect(() => {
    const tick = async () => {
      try { const r = await fetch('http://127.0.0.1:15387/health'); setEngineStatus(r.ok ? 'ok' : 'error') }
      catch { setEngineStatus('offline') }
    }
    tick()
    const t = setInterval(tick, 8000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">同传配置</h2>
          <p className="text-xs text-muted-foreground mt-0.5">音频设备 · 翻译引擎 · 运行状态</p>
        </div>
        <button onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" title="返回导播台">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
      </div>

      <ConfigSection title="翻译引擎" icon="🌐">
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
        <div className="grid grid-cols-2 gap-3 pt-2">
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
      </ConfigSection>

      <ConfigSection title="同传状态" icon="📊">
        <div className="grid grid-cols-3 gap-3">
          <StatusCard label="后端引擎" value={engineStatus === 'ok' ? '15387 ✓' : engineStatus === 'offline' ? '离线' : engineStatus} ok={engineStatus === 'ok'} />
          <StatusCard label="双语方向" value={`${srcLang} ⇄ ${tgtLang}`} ok />
          <StatusCard label="TTS 发音人" value={selectedVoice === 'default' ? '女声' : '男声'} ok />
        </div>
      </ConfigSection>
    </div>
  )
}

function ConfigSection({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-center gap-2"><span className="text-lg">{icon}</span><h3 className="text-sm font-semibold text-foreground">{title}</h3></div>
      {children}
    </div>
  )
}

function StatusCard({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${ok ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-border bg-muted/30'}`}>
      <div className="text-[10px] text-muted-foreground mb-1">{label}</div>
      <div className={`text-xs font-medium ${ok ? 'text-emerald-500' : 'text-foreground'}`}>{value}</div>
    </div>
  )
}
