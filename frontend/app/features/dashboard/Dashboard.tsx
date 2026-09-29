/**
 * Dashboard — 主面板入口（纯布局调度，业务通信链路收敛于 useDashboardLogic）
 * 布局：Sidebar(w-52) | 右列(TopHeader + MetricBadges + MainView)
 */
import { useState, useEffect } from 'react'
import { useStreamWebSocket, useAudioWebSocket } from '../../hooks/useWebSocket'
import type { Platform } from '../../types'
import MainView from './MainView'
import SettingsSheet from '../settings/SettingsSheet'
import AboutDialog from '../about/AboutDialog'

interface DashboardProps {}

export default function Dashboard(_props: DashboardProps) {
  const [platform, setPlatform] = useState<Platform>('douyin')
  const [roomId, setRoomId] = useState('')
  const [isConnecting, setIsConnecting] = useState(false)
  const [platformActive, setPlatformActive] = useState(false)
  const [srcLang, setSrcLang] = useState('zh')
  const [tgtLang, setTgtLang] = useState('vi')
  const [engineStatus, setEngineStatus] = useState('checking')

  const [showSettings, setShowSettings] = useState(false)
  const [showAbout, setShowAbout] = useState(false)

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

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* 左侧窄边栏 */}
      <aside className="flex w-12 shrink-0 flex-col items-center border-r border-border bg-background py-3">
        {/* 顶部品牌图标 */}
        <div className="mb-4 flex h-7 w-7 items-center justify-center rounded-lg bg-brand ring-[3px] ring-brand/20">
          <span className="text-[10px] font-bold text-white">X</span>
        </div>

        <div className="flex-1" />

        {/* 底部固定图标 */}
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={() => setShowSettings(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="设置"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43.25a2 2 0 0 1-1 1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
          <button
            onClick={() => setShowAbout(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="关于"
          >
            <span className="text-sm font-semibold leading-none">i</span>
          </button>
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

        {/* 主视口：双列并排 */}
        <MainView
          wsStatus={wsStatus}
          engineStatus={engineStatus}
          ttsEnabled={ttsEnabled}
          isTTSSpeaking={isTTSSpeaking}
          messageCount={messages.length}
          messages={messages}
          callHistory={callHistory}
          spectrumData={[]}
          onStartRecognition={handleStartRecognition}
          onToggleTTS={handleToggleTTS}
          onClearMessages={handleClearMessages}
        />
      </div>

      {/* 弹窗 */}
      <SettingsSheet open={showSettings} onClose={() => setShowSettings(false)} />
      <AboutDialog open={showAbout} onClose={() => setShowAbout(false)} />
    </div>
  )
}
