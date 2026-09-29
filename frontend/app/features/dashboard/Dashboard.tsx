/**
 * Dashboard — 主面板入口（纯布局调度，业务通信链路收敛于 useDashboardLogic）
 * 布局：Sidebar(w-52) | 右列(TopHeader + MetricBadges + MainView)
 */
import { useState, useEffect } from 'react'
import { useStreamWebSocket, useAudioWebSocket } from '../../hooks/useWebSocket'
import type { Platform } from '../../types'
import MainView from './MainView'

type ActiveTab = 'danmaku' | 'subtitle' | 'audio' | 'settings' | 'about'

interface DashboardProps {}

export default function Dashboard(_props: DashboardProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('danmaku')
  const [platform, setPlatform] = useState<Platform>('douyin')
  const [roomId, setRoomId] = useState('')
  const [isConnecting, setIsConnecting] = useState(false)
  const [platformActive, setPlatformActive] = useState(false)
  const [srcLang, setSrcLang] = useState('zh')
  const [tgtLang, setTgtLang] = useState('vi')
  const [engineStatus, setEngineStatus] = useState('checking')

  // WebSocket 连接
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

  // 注册频谱回调
  useEffect(() => {
    setSpectrumCallback(() => (_data: number[]) => {
      // 频谱数据由 hook 内部管理
    })
  }, [setSpectrumCallback])

  // 检查后端健康状态
  useEffect(() => {
    const checkBackend = async () => {
      try {
        const resp = await fetch('http://127.0.0.1:15387/health')
        if (resp.ok) {
          setEngineStatus('ok')
        } else {
          setEngineStatus('unreachable')
        }
      } catch {
        setEngineStatus('offline')
      }
    }
    checkBackend()
    const timer = setInterval(checkBackend, 10000)
    return () => clearInterval(timer)
  }, [])

  // 获取 TTS 初始状态
  useEffect(() => {
    getTTSStatus()
  }, [getTTSStatus])

  const handleConnect = async () => {
    if (!roomId.trim()) return
    setIsConnecting(true)
    try {
      // TODO: 实现平台连接逻辑
      setPlatformActive(true)
    } finally {
      setIsConnecting(false)
    }
  }

  const handleToggleConnection = () => {
    if (platformActive) {
      setPlatformActive(false)
    } else {
      handleConnect()
    }
  }

  const handleLanguageChange = (src: string, tgt: string) => {
    setSrcLang(src)
    setTgtLang(tgt)
    // TODO: 调用后端 API 更新语言配置
  }

  const handleStartRecognition = () => {
    startRecording()
  }

  const handleToggleTTS = async (enabled: boolean) => {
    await toggleTTSEnabled(enabled)
  }

  const handleClearMessages = () => {
    clearMessages()
  }

  const handleOpenSettings = () => {
    setActiveTab('settings')
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* Sidebar */}
      <aside className="flex w-48 shrink-0 flex-col border-r border-border bg-background">
        {/* 导航列表 */}
        <nav className="flex-1 space-y-1.5 p-3">
          {[
            { key: 'danmaku', label: '弹幕同传', icon: '💬' },
            { key: 'subtitle', label: '同传字幕', icon: '📝' },
            { key: 'audio', label: '音频设备', icon: '🎤' },
            { key: 'settings', label: '模型设置', icon: '⚙️' },
            { key: 'about', label: '关于应用', icon: 'ℹ️' },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => setActiveTab(item.key as ActiveTab)}
              className={`relative flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs transition-all duration-150 ${
                activeTab === item.key
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              {activeTab === item.key && (
                <div className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.6)]" />
              )}
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        {/* 底部状态 */}
        <div className="space-y-2 p-3">
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2">
            <span className="text-[11px] text-muted-foreground">WebSocket</span>
            <span className={`text-[11px] font-medium ${
              wsStatus === 'connected' ? 'text-emerald-500' :
              wsStatus === 'connecting' ? 'text-amber-500' :
              'text-muted-foreground'
            }`}>
              {wsStatus === 'connected' ? '已连接' : wsStatus === 'connecting' ? '连接中...' : '断开'}
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground text-center">
            v2.0 Pro · {messages.length} 条消息
          </div>
        </div>
      </aside>

      {/* 主工作区 */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* TopHeader */}
        <header className="relative z-20 flex h-11 shrink-0 items-center justify-between border-b border-border bg-background px-4 backdrop-blur-xl">
          {/* 左侧：平台切换 */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPlatform('douyin')}
              className={`h-7 px-3 text-xs font-medium rounded-md transition-all duration-150 ${
                platform === 'douyin'
                  ? 'bg-rose-500/10 text-rose-500 border border-rose-500/30'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              抖音
            </button>
            <button
              onClick={() => setPlatform('tiktok')}
              className={`h-7 px-3 text-xs font-medium rounded-md transition-all duration-150 ${
                platform === 'tiktok'
                  ? 'bg-indigo-500/10 text-indigo-500 border border-indigo-500/30'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              TikTok
            </button>
          </div>

          {/* 中间：直播间链接 */}
          <div className="flex flex-1 max-w-xl items-center gap-3">
            <div className="relative flex flex-1 items-center">
              <input
                type="text"
                placeholder={
                  platform === 'douyin'
                    ? '粘贴直播间分享链接或输入直播房间 ID...'
                    : 'Paste TikTok room link or ID...'
                }
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleToggleConnection()}
                className="h-8 w-full rounded-md border border-input bg-background px-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/40"
              />
            </div>
            <button
              onClick={handleToggleConnection}
              disabled={!roomId.trim() || isConnecting}
              className={`h-8 shrink-0 px-4 text-xs font-medium rounded-md transition-all duration-150 ${
                platformActive
                  ? 'border border-rose-500/30 bg-rose-500/10 text-rose-500 hover:bg-rose-500/20'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40'
              }`}
            >
              {isConnecting ? '连接中...' : platformActive ? '断开' : '连接'}
            </button>
          </div>

          {/* 右侧：语言切换 */}
          <div className="flex items-center gap-2">
            <select
              value={`${srcLang}-${tgtLang}`}
              onChange={(e) => {
                const [s, t] = e.target.value.split('-')
                handleLanguageChange(s, t)
              }}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500/40"
            >
              <option value="zh-vi">中 → 越</option>
              <option value="vi-zh">越 → 中</option>
            </select>
          </div>
        </header>

        {/* 主视口 */}
        <main className="min-h-0 flex-1 overflow-hidden">
          <MainView
            wsStatus={wsStatus}
            engineStatus={engineStatus}
            ttsEnabled={ttsEnabled}
            isTTSSpeaking={isTTSSpeaking}
            messageCount={messages.length}
            messages={messages}
            callHistory={callHistory}
            spectrumData={[]}
            activeTab={activeTab}
            onStartRecognition={handleStartRecognition}
            onToggleTTS={handleToggleTTS}
            onClearMessages={handleClearMessages}
            onOpenSettings={handleOpenSettings}
          />
        </main>
      </div>
    </div>
  )
}
