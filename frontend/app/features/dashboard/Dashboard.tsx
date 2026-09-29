/**
 * Dashboard — 主面板入口
 * 布局：Sidebar(w-52) | 右列(TopHeader + MainView + Dock)
 * 导航：实时导播台 / 同传配置（抽屉）
 * 底部固定：设置 / 关于弹窗
 */
import { useState, useEffect } from 'react'
import { Monitor, SlidersHorizontal, Boxes, History as HistoryIcon, Terminal, Sparkles } from 'lucide-react'
import { useStreamWebSocket, useAudioWebSocket } from '../../hooks/useWebSocket'
import { useDanmakuConnection } from '../danmaku/ConnectionManager'
import type { Platform, StandardDanmaku, StreamMessage } from '../../types'
import MainView from './MainView'
import AudioConfigView from '../settings/AudioConfigView'
import ModelsView from '../models/ModelsView'
import HistoryView from '../history/HistoryView'

import AboutDialog from '../about/AboutDialog'
import LogView from '../log/LogView'

type ActiveSection = 'workbench' | 'config' | 'models' | 'history' | 'log'

const NAV: { id: ActiveSection; label: string; desc: string; icon: React.ReactNode }[] = [
  {
    id: 'workbench',
    label: '实时导播',
    desc: '弹幕流 + 同传字幕',
    icon: <Monitor className="h-4 w-4" />,
  },
  {
    id: 'config',
    label: '同传配置',
    desc: '声卡通道 · 电平 · 引擎',
    icon: <SlidersHorizontal className="h-4 w-4" />,
  },
  {
    id: 'models',
    label: '模型管理',
    desc: '离线 AI 模型资源',
    icon: <Boxes className="h-4 w-4" />,
  },
  {
    id: 'history',
    label: '历史记录',
    desc: '会话回放 · 导出',
    icon: <HistoryIcon className="h-4 w-4" />,
  },
  {
    id: 'log',
    label: '系统日志',
    desc: '运行时日志 · 链路监控',
    icon: <Terminal className="h-4 w-4" />,
  },
]

export default function Dashboard() {
  const [section, setSection] = useState<ActiveSection>('workbench')
  const [platform, setPlatform] = useState<Platform>('douyin')
  const [roomId, setRoomId] = useState('')
  const [isConnecting, setIsConnecting] = useState(false)
  const [platformActive, setPlatformActive] = useState(false)
  const [srcLang, setSrcLang] = useState('zh')
  const [tgtLang, setTgtLang] = useState('vi')
  const [engineStatus, setEngineStatus] = useState('checking')

  const [showAbout, setShowAbout] = useState(false)

  // ── 状态解耦：流式 WS + 音频 WS 常驻本层，切换 section 不中断后台监听 ──
  const { messages, status: wsStatus, clearMessages } = useStreamWebSocket({
    platform,
    roomId: platformActive ? roomId : undefined,
  })
  // 双模弹幕采集：Channel A（Python 协议）失败自动降级 Channel B（静默视口）
  const { state: connState, items: channelItems, connect: dmConnect, disconnect: dmDisconnect, feedA } =
    useDanmakuConnection()

  // Channel A 数据摄入管理器（/ws/stream 推送 → 去重合并）
  useEffect(() => {
    feedA(messages)
  }, [messages, feedA])

  // 合并展示：WS 原始流 + Channel B 静默视口数据（按 类型|用户|文本 去重）
  const displayMessages = (() => {
    const seen = new Set<string>()
    const merged: StreamMessage[] = []
    for (const m of messages) {
      const key = `${m.type}|${m.user}|${m.text}`
      if (!seen.has(key)) {
        seen.add(key)
        merged.push(m)
      }
    }
    for (const it of channelItems as StandardDanmaku[]) {
      const key = `${it.type ?? 'comment'}|${it.user}|${it.text}`
      if (seen.has(key)) continue
      seen.add(key)
      merged.push({ type: it.type ?? 'comment', user: it.user, text: it.text, timestamp: it.timestamp })
    }
    return merged.slice(-200)
  })()

  const channelLabel =
    connState.phase === 'active'
      ? connState.channel === 'B'
        ? '连接成功（安全通道）'
        : '连接成功（协议通道）'
      : connState.phase === 'connecting'
        ? '连接中（协议通道）'
        : connState.phase === 'error'
          ? connState.message
          : null

  const {
    callHistory,
    isTTSSpeaking,
    ttsEnabled,
    startRecording,
    toggleTTSEnabled,
    setSpectrumCallback,
    getTTSStatus,
  } = useAudioWebSocket()

  const roomLabel = `${platform === 'douyin' ? '抖音' : 'TikTok'} · ${roomId || '未连接'}`

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
    try {
      await dmConnect(platform, roomId.trim())
      setPlatformActive(true)
    } catch (e) {
      console.error('连接失败:', e)
    } finally {
      setIsConnecting(false)
    }
  }

  const handleToggleConnection = async () => {
    if (platformActive) {
      try {
        dmDisconnect()
      } catch (e) {
        console.error('断开异常:', e)
      }
      setPlatformActive(false)
    } else {
      await handleConnect()
    }
  }

  const handleLanguageChange = (src: string, tgt: string) => {
    setSrcLang(src)
    setTgtLang(tgt)
  }

  const handleStartRecognition = () => { startRecording() }
  const handleToggleTTS = async (enabled: boolean) => { await toggleTTSEnabled(enabled) }
  const handleClearMessages = () => { clearMessages() }

  return (
    <div className="flex h-full w-full overflow-hidden bg-background text-foreground">
      {/* ── 侧边栏 ── */}
      <aside className="flex h-full w-56 shrink-0 flex-col border-r border-border bg-background">
        {/* 顶部品牌区 */}
        <div className="flex items-center gap-2.5 border-b border-border/60 px-4 pb-3 pt-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand ring-[3px] ring-brand/20">
            <Sparkles className="h-4 w-4 text-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-foreground">喜阅 TransFlow</div>
            <div className="text-[10px] text-muted-foreground">实时同传工作台</div>
          </div>
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
            v2.0.0
          </span>
        </div>

        {/* 核心业务导航 */}
        <nav className="flex-1 space-y-1 overflow-y-auto p-2">
          {NAV.map((item) => (
            <NavItem
              key={item.id}
              active={section === item.id}
              onClick={() => setSection(item.id)}
              icon={item.icon}
              label={item.label}
              desc={item.desc}
            />
          ))}
        </nav>

        {/* 吸底常驻：关于 TransFlow */}
        <div className="space-y-1 border-t border-border/60 p-2">
          <SideButton active={showAbout} onClick={() => setShowAbout(true)}>
            <Sparkles className="h-4 w-4" />
            关于 TransFlow
            <span className="ml-auto text-[10px] text-muted-foreground">v2.0.0</span>
          </SideButton>
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

        {/* 主视口：四分区切换，流式 / 音频监听常驻本层不中断 */}
        {section === 'workbench' && (
          <MainView
            wsStatus={wsStatus} engineStatus={engineStatus}
            ttsEnabled={ttsEnabled} isTTSSpeaking={isTTSSpeaking}
            messageCount={displayMessages.length} messages={displayMessages}
            callHistory={callHistory} spectrumData={[]}
            channelLabel={channelLabel}
            onStartRecognition={handleStartRecognition}
            onToggleTTS={handleToggleTTS} onClearMessages={handleClearMessages}
            onOpenConfig={() => setSection('config')}
          />
        )}
        {section === 'config' && (
          <div className="flex min-h-0 flex-1 flex-col overflow-auto bg-background">
            <AudioConfigView />
          </div>
        )}
        {section === 'models' && (
          <div className="flex min-h-0 flex-1 flex-col overflow-auto bg-background">
            <ModelsView />
          </div>
        )}
        {section === 'history' && (
          <div className="min-h-0 flex-1 bg-background">
            <HistoryView liveItems={callHistory} roomLabel={roomLabel} />
          </div>
        )}
        {section === 'log' && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
            <LogView />
          </div>
        )}
      </div>

      {/* 弹窗：关于 */}
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

/* ─── SideButton（吸底 设置 / 关于）─── */
function SideButton({
  active,
  onClick,
  children,
}: {
  active: boolean; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs font-medium transition-all duration-150 active:scale-[0.99] ${
        active ? 'bg-indigo-600/15 text-indigo-400' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      }`}>
      {children}
    </button>
  )
}
