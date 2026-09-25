import React, { useState, useEffect } from 'react'
import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import {
  MessageSquareQuote,
  Subtitles,
  Mic,
  Settings,
  Info,
  Search,
  Pin,
  Minus,
  Square,
  X,
  Copy,
  Download,
  Volume2,
  ChevronRight,
  ShieldCheck,
  Zap,
  Activity,
  Radio
} from 'lucide-react'
import {
  useStreamWebSocket,
  useAudioWebSocket,
  useLanguageChangeListener,
} from '../hooks/useWebSocket'
import { usePlatform } from '../hooks/usePlatform'
import { API_BASE } from '../services/api'
import DanmakuPanel from './DanmakuPanel'
import SettingsPanel from './SettingsPanel'
import AudioSpectrum from './AudioSpectrum'

type Platform = 'tiktok' | 'douyin'
type ActiveTab = 'danmaku' | 'subtitle' | 'audio' | 'settings' | 'about'

const electron = window.electronAPI

export default function Dashboard() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<ActiveTab>('danmaku')
  const [platform, setPlatform] = useState<Platform>('douyin')
  const [roomId, setRoomId] = useState('')
  const [isPinned, setIsPinned] = useState(false)
  const [appVersion, setAppVersion] = useState<string>('加载中...')
  const [backendReady, setBackendReady] = useState(false)
  const [backendFailed, setBackendFailed] = useState(false)
  const [backendPort] = useState<number>(15387)

  // ── WebSocket 弹幕/字幕流 ───────────────────────────────
  const { messages, status: wsStatus, clearMessages } = useStreamWebSocket()

  // ── 音频同传 ─────────────────────────────────────────────
  const [micInputId, setMicInputId] = useState<number | null>(null)
  const [remoteInputId, setRemoteInputId] = useState<number | null>(null)
  const [spectrumData, setSpectrumData] = useState<number[]>([])
  const {
    transcription,
    history,
    isRecording,
    ttsEnabled,
    startRecording,
    stopRecording,
    toggleTTSEnabled,
    getTTSStatus,
    setSpectrumCallback,
  } = useAudioWebSocket(micInputId, remoteInputId)

  // ── 平台控制 ─────────────────────────────────────────────
  const { status, switchPlatform, stopPlatform, fetchStatus, checkHealth } = usePlatform()

  // ── 语言配置 ─────────────────────────────────────────────
  const [srcLang, setSrcLang] = useState('zh')
  const [tgtLang, setTgtLang] = useState('vi')
  const [langSwitching, setLangSwitching] = useState(false)
  const [SUPPORTED_LANGS, setSUPPORTED_LANGS] = useState<Array<{ code: string; label: string; icon: string }>>([])

  // ── 初始化加载 ───────────────────────────────────────────
  useEffect(() => {
    // 版本号
    electron?.getAppVersion?.().then((v: string) => setAppVersion(v || '0.2.0')).catch(() => setAppVersion('0.2.0'))
    // 频谱回调
    setSpectrumCallback((data: number[]) => setSpectrumData([...data]))
    // 语言配置
    fetch(`${API_BASE}/api/language/get`)
      .then(res => res.json())
      .then(data => {
        if (data.src_lang) setSrcLang(data.src_lang)
        if (data.tgt_lang) setTgtLang(data.tgt_lang)
        if (data.available_languages) {
          const langs = Object.entries(data.available_languages)
            .filter(([k]) => k !== 'auto')
            .map(([code, v]) => ({ code, label: (v as { label: string }).label, icon: (v as { icon: string }).icon }))
          setSUPPORTED_LANGS(langs)
        }
      })
      .catch(() => {})
    // TTS 状态
    getTTSStatus().catch(() => {})
  }, [setSpectrumCallback, getTTSStatus])

  // ── 语言变更监听 ─────────────────────────────────────────
  useLanguageChangeListener((src: string, tgt: string) => {
    setSrcLang(src)
    setTgtLang(tgt)
  })

  // ── 后端生命周期监听 ─────────────────────────────────────
  useEffect(() => {
    const onReady = () => setBackendReady(true)
    const onFailed = () => setBackendFailed(true)
    electron?.on?.('backend:ready', onReady)
    electron?.on?.('backend:failed', onFailed)
    electron?.on?.('backend:crashed', onFailed)
    return () => {
      electron?.removeListener?.('backend:ready', onReady)
      electron?.removeListener?.('backend:failed', onFailed)
      electron?.removeListener?.('backend:crashed', onFailed)
    }
  }, [])

  // ── 健康检查 ─────────────────────────────────────────────
  useEffect(() => {
    const timer = setInterval(async () => {
      const h = await checkHealth()
      if (h) fetchStatus()
    }, 5000)
    return () => clearInterval(timer)
  }, [checkHealth, fetchStatus])

  // ── 设备加载 ─────────────────────────────────────────────
  useEffect(() => {
    fetch(`${API_BASE}/api/audio/devices`)
      .then(res => res.json())
      .then(data => {
        if (data.inputs && data.outputs) {
          fetch(`${API_BASE}/api/config/`)
            .then(r => r.json())
            .then(cfg => {
              if (cfg.status === 'success' && cfg.data?.audio_devices) {
                setMicInputId(cfg.data.audio_devices.mic_input ?? null)
                setRemoteInputId(cfg.data.audio_devices.remote_input ?? null)
              }
            })
            .catch(() => {})
        }
      })
      .catch(() => {})
  }, [])

  // ── 操作函数 ─────────────────────────────────────────────
  const handleSetLanguage = async (src: string, tgt: string) => {
    if (src === tgt) return
    setLangSwitching(true)
    try {
      await fetch(`${API_BASE}/api/language/set`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ src_lang: src, tgt_lang: tgt }),
      })
      setSrcLang(src)
      setTgtLang(tgt)
    } catch (e) {
      console.error('Language switch failed:', e)
    } finally {
      setLangSwitching(false)
    }
  }

  const handleSwapLanguage = async () => {
    setLangSwitching(true)
    try {
      const res = await fetch(`${API_BASE}/api/language/switch`, { method: 'POST' })
      const data = await res.json()
      if (data.status === 'success') {
        setSrcLang(data.src_lang)
        setTgtLang(data.tgt_lang)
      }
    } catch (e) {
      console.error('Language swap failed:', e)
    } finally {
      setLangSwitching(false)
    }
  }

  const handleSwitchPlatform = async () => {
    if (!roomId.trim()) return
    await switchPlatform(platform, roomId.trim())
  }

  const handleTogglePin = async () => {
    const pinned = await electron?.toggleAlwaysOnTop?.()
    setIsPinned(!!pinned)
  }

  const handleMinimize = () => electron?.minimize?.()
  const handleClose = () => electron?.close?.()

  const platformActive = status?.active_platform != null
  const isSubtitleTab = activeTab === 'subtitle'

  // ── 菜单配置 ─────────────────────────────────────────────
  const menuItems = [
    { id: 'danmaku' as ActiveTab, label: '弹幕同传', icon: MessageSquareQuote, badge: messages.length > 0 ? messages.length : null },
    { id: 'subtitle' as ActiveTab, label: '同传字幕', icon: Subtitles, badge: history.length > 0 ? history.length : null },
    { id: 'audio' as ActiveTab, label: '音频设备', icon: Mic },
    { id: 'settings' as ActiveTab, label: '模型设置', icon: Settings },
    { id: 'about' as ActiveTab, label: '关于应用', icon: Info },
  ]

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#f4f7fb] text-slate-800 font-sans select-none antialiased">
      
      {/* ── 1. 左侧边栏 ────────────────────────────────────── */}
      <aside className="w-60 flex flex-col justify-between p-4 bg-white/70 backdrop-blur-md border-r border-slate-200/60">
        
        {/* 顶部 Logo 与版本号 */}
        <div>
          <div className="flex items-center gap-2.5 px-2 py-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white font-bold text-base shadow-md shadow-blue-500/20">
              译
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm text-slate-900 tracking-tight">乐曼同传</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">
                  v{appVersion}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">中越双语直播同传</p>
            </div>
          </div>

          {/* 导航菜单列表 */}
          <nav className="space-y-1">
            {menuItems.map((item) => {
              const Icon = item.icon
              const isActive = activeTab === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/25'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      isActive ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-600'
                    }`}>
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </button>
              )
            })}
          </nav>
        </div>

        {/* 底部状态卡片 */}
        <div className="bg-gradient-to-b from-white to-slate-50 p-3.5 rounded-2xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold text-slate-800">引擎状态</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold ${
              backendReady ? 'bg-emerald-50 text-emerald-600' : 
              backendFailed ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'
            }`}>
              {backendReady ? '在线' : backendFailed ? '离线' : '启动中'}
            </span>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mb-2">
            <div className={`h-full rounded-full transition-all ${
              backendReady ? 'bg-emerald-500 w-full' : 
              backendFailed ? 'bg-rose-500 w-1/4' : 'bg-amber-500 w-2/4 animate-pulse'
            }`} />
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium">
            <span>{backendReady ? `端口 ${backendPort}` : 'FastAPI'}</span>
          </div>
        </div>
      </aside>

      {/* ── 2. 右侧主工作区 ────────────────────────────────────── */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        
        {/* 顶部栏 */}
        <header className="h-14 px-6 flex items-center justify-between bg-transparent" style={{ WebkitAppRegion: 'drag' } as CSSProperties}>
          
          {/* 中间直播间连接条 */}
          <div className="flex items-center gap-2 w-full max-w-xl bg-white rounded-full px-3 py-1.5 border border-slate-200/80 shadow-2xs" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
            {/* 平台微型选择器 */}
            <div className="flex bg-slate-100 p-0.5 rounded-full text-xs font-semibold shrink-0">
              <button
                onClick={() => setPlatform('douyin')}
                className={`px-3 py-1 rounded-full transition-all ${
                  platform === 'douyin' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-500'
                }`}
              >
                抖音
              </button>
              <button
                onClick={() => setPlatform('tiktok')}
                className={`px-3 py-1 rounded-full transition-all ${
                  platform === 'tiktok' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-500'
                }`}
              >
                TikTok
              </button>
            </div>

            <div className="h-4 w-px bg-slate-200 shrink-0" />

            {/* 输入框 */}
            <div className="flex-1 flex items-center gap-2 min-w-0">
              <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <input
                type="text"
                placeholder={platform === 'douyin' ? '粘贴直播间分享链接或输入直播房间 ID...' : 'Paste TikTok room link or ID...'}
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSwitchPlatform()}
                className="w-full bg-transparent text-xs text-slate-800 placeholder-slate-400 outline-none truncate"
              />
            </div>

            {/* 连接按钮 */}
            <button
              onClick={platformActive ? stopPlatform : handleSwitchPlatform}
              disabled={!roomId.trim() && !platformActive}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all shadow-xs shrink-0 cursor-pointer ${
                platformActive
                  ? 'bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200'
                  : 'bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40 shadow-blue-500/20'
              }`}
            >
              {platformActive ? '断开' : '连接'}
            </button>
          </div>

          {/* 右侧：语言对切换与窗口控制 */}
          <div className="flex items-center gap-2 shrink-0" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
            {/* 语言对切换器 */}
            <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-xl border border-slate-200/80 shadow-2xs">
              <select
                className="bg-transparent text-xs font-semibold text-slate-700 outline-none cursor-pointer disabled:opacity-50"
                value={srcLang}
                onChange={(e) => handleSetLanguage(e.target.value, tgtLang)}
                disabled={langSwitching}
              >
                {SUPPORTED_LANGS.map(lang => (
                  <option key={lang.code} value={lang.code}>
                    {lang.icon} {lang.label}
                  </option>
                ))}
              </select>
              <button
                className="w-4 h-4 flex items-center justify-center rounded text-[11px] text-blue-600 hover:bg-slate-100 transition-all disabled:opacity-40 font-bold"
                onClick={handleSwapLanguage}
                disabled={langSwitching}
              >
                ⇄
              </button>
              <select
                className="bg-transparent text-xs font-semibold text-slate-700 outline-none cursor-pointer disabled:opacity-50"
                value={tgtLang}
                onChange={(e) => handleSetLanguage(srcLang, e.target.value)}
                disabled={langSwitching}
              >
                {SUPPORTED_LANGS.map(lang => (
                  <option key={lang.code} value={lang.code}>
                    {lang.icon} {lang.label}
                  </option>
                ))}
              </select>
            </div>

            {/* 窗口控制按钮 */}
            <div className="flex items-center gap-1 text-slate-400">
              <button
                onClick={handleTogglePin}
                className={`p-1.5 rounded-lg hover:bg-white hover:text-slate-700 transition-all ${
                  isPinned ? 'text-blue-600 bg-blue-50' : ''
                }`}
                title="置顶窗口"
              >
                <Pin className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleMinimize}
                className="p-1.5 rounded-lg hover:bg-white hover:text-slate-700 transition-all"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <button className="p-1.5 rounded-lg hover:bg-white hover:text-slate-700 transition-all">
                <Square className="w-3 h-3" />
              </button>
              <button
                onClick={handleClose}
                className="p-1.5 rounded-lg hover:bg-rose-50 hover:text-rose-600 transition-all"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </header>

        {/* ── 3. 主栅格工作区 ──────────────────────────────────── */}
        <main className="flex-1 px-6 pb-6 pt-2 overflow-hidden min-h-0">
          
          {/* 设置/关于页直接全屏显示 */}
          {activeTab === 'audio' && (
            <div className="h-full bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-y-auto p-5">
              <SettingsPanel activeSection="audio" />
            </div>
          )}
          {activeTab === 'settings' && (
            <div className="h-full bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-y-auto p-5">
              <SettingsPanel activeSection="settings" />
            </div>
          )}
          {activeTab === 'about' && (
            <div className="h-full bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-y-auto p-5">
              <SettingsPanel activeSection="about" />
            </div>
          )}

          {/* 弹幕与同传字幕主视图 */}
          {(activeTab === 'danmaku' || activeTab === 'subtitle') && (
            <div className="h-full grid grid-cols-12 gap-4">
              
              {/* ── 左侧面板 (占 4/12) ── */}
              <div className="col-span-4 flex flex-col gap-4 min-h-0">
                {/* 授权状态卡片 */}
                <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs shrink-0">
                  <div className="flex items-center justify-between mb-2">
                    <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <span className="text-[10px] text-emerald-600 bg-emerald-50 font-semibold px-2 py-0.5 rounded-full">
                      授权正常
                    </span>
                  </div>
                  <div className="text-[11px] font-semibold text-slate-400">当前授权方案</div>
                  <div className="text-xl font-black text-slate-900 tracking-tight mt-0.5">
                    中越同传专业版
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">已激活双语实时识别、TTS合成与弹幕捕获</p>
                  <button className="w-full mt-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs shadow-blue-500/20 transition-all cursor-pointer">
                    卡密兑换 / 授权管理
                  </button>
                </div>

                {/* 快捷操作 */}
                <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex-1 flex flex-col justify-between overflow-y-auto">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 mb-2.5">快捷操作</h4>
                    <div className="space-y-2">
                      <button className="w-full p-2.5 rounded-xl bg-slate-50/80 hover:bg-blue-50/50 border border-slate-100 hover:border-blue-100 flex items-center justify-between transition-all group">
                        <div className="flex items-center gap-2.5 text-left">
                          <Copy className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 shrink-0" />
                          <div>
                            <div className="text-xs font-bold text-slate-800">一键复制机器码</div>
                            <div className="text-[10px] text-slate-400">用于绑定授权设备</div>
                          </div>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-600 shrink-0" />
                      </button>

                      <button
                        onClick={() => clearMessages()}
                        className="w-full p-2.5 rounded-xl bg-slate-50/80 hover:bg-blue-50/50 border border-slate-100 hover:border-blue-100 flex items-center justify-between transition-all group"
                      >
                        <div className="flex items-center gap-2.5 text-left">
                          <Download className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600" />
                          <div>
                            <div className="text-xs font-bold text-slate-800">清空屏幕与历史</div>
                            <div className="text-[10px] text-slate-400">重置弹幕与当前会话</div>
                          </div>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-600" />
                      </button>

                      <button
                        onClick={() => setActiveTab('audio')}
                        className="w-full p-2.5 rounded-xl bg-slate-50/80 hover:bg-blue-50/50 border border-slate-100 hover:border-blue-100 flex items-center justify-between transition-all group"
                      >
                        <div className="flex items-center gap-2.5 text-left">
                          <Volume2 className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600" />
                          <div>
                            <div className="text-xs font-bold text-slate-800">音频设备配置</div>
                            <div className="text-[10px] text-slate-400">选择麦克风与监听声卡</div>
                          </div>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-600" />
                      </button>
                    </div>
                  </div>

                  {/* 状态指示 */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                    <span>WS: <strong className={wsStatus === 'connected' ? 'text-emerald-600' : 'text-slate-500'}>{wsStatus}</strong></span>
                    <span>弹幕: {messages.length}</span>
                  </div>
                </div>
              </div>

              {/* ── 右侧主展示区 (占 8/12) ── */}
              <div className="col-span-8 flex flex-col gap-4 min-h-0">
                
                {/* 顶部状态微胶囊 */}
                <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-2xs grid grid-cols-4 gap-3 shrink-0">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium">
                      <span className={`w-1.5 h-1.5 rounded-full ${backendReady ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
                      本地引擎
                    </div>
                    <div className="text-sm font-black text-slate-900 font-mono">
                      {backendReady ? backendPort : '启动中...'}
                    </div>
                  </div>

                  <div className="space-y-0.5 border-l border-slate-100 pl-3">
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium">
                      <span className={`w-1.5 h-1.5 rounded-full ${wsStatus === 'connected' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                      网络连接
                    </div>
                    <div className="text-sm font-black text-slate-900">
                      {wsStatus === 'connected' ? '就绪 (WS)' : '待连接'}
                    </div>
                  </div>

                  <div className="space-y-0.5 border-l border-slate-100 pl-3">
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                      当前会话
                    </div>
                    <div className="text-sm font-black text-slate-900 font-mono">
                      {history.length} 句
                    </div>
                  </div>

                  <div className="space-y-0.5 border-l border-slate-100 pl-3">
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium">
                      <span className={`w-1.5 h-1.5 rounded-full ${ttsEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                      TTS 合成
                    </div>
                    <div className="text-sm font-black text-slate-900">
                      {ttsEnabled ? '已开启' : '已静音'}
                    </div>
                  </div>
                </div>

                {/* 主视口卡片（弹幕/字幕） */}
                <div className="flex-1 bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden flex flex-col min-h-0">
                  {/* 标题栏 */}
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4 text-blue-600" />
                      <span className="text-xs font-bold text-slate-900">
                        {activeTab === 'danmaku' ? '实时弹幕流' : '实时同传字幕'}
                      </span>
                    </div>
                    {isSubtitleTab && transcription && (
                      <div className="flex items-center gap-1.5 text-emerald-600 text-[11px] font-medium animate-pulse">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <span className="truncate max-w-[200px]">{transcription.transcription.text}</span>
                      </div>
                    )}
                  </div>

                  {/* 核心内容区 */}
                  <div className="flex-1 overflow-hidden min-h-0 relative">
                    {activeTab === 'danmaku' && (
                      <DanmakuPanel messages={messages} />
                    )}

                    {activeTab === 'subtitle' && (
                      <div className="h-full flex flex-col gap-3 p-4 overflow-hidden">
                        {transcription ? (
                          <div className="rounded-xl bg-blue-50/60 border border-blue-100 p-4 space-y-1 shrink-0 animate-[slide-in-up_0.3s_ease]">
                            <div className="text-xs text-slate-500 font-medium line-clamp-2">
                              {transcription.transcription.text}
                            </div>
                            <div className="text-base font-bold text-blue-600">
                              {transcription.translation.text}
                            </div>
                          </div>
                        ) : (
                          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-slate-400">
                            <Radio className="w-8 h-8 mb-2 text-slate-300 animate-pulse" />
                            <div className="text-xs font-semibold text-slate-600">点击下方按钮开始语音识别</div>
                            <div className="text-[11px] mt-0.5">{t('dashboard.noHistoryHint')}</div>
                          </div>
                        )}
                        
                        {history.length > 0 && (
                          <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
                            {history.slice(-20).reverse().map((item, i) => (
                              <div key={i} className="rounded-lg bg-slate-50 border border-slate-100 border-l-2 border-l-blue-400 p-2.5">
                                <div className="text-xs text-slate-400">{item.transcription.text}</div>
                                <div className="text-xs font-semibold text-slate-700 mt-0.5">{item.translation.text}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 底部主控制条 */}
                  <div className="p-3 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={isRecording ? stopRecording : startRecording}
                        className={`px-5 py-2 rounded-xl text-xs font-bold shadow-xs flex items-center gap-2 transition-all cursor-pointer ${
                          isRecording
                            ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/20'
                            : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20'
                        }`}
                      >
                        <Zap className="w-3.5 h-3.5 fill-current" />
                        <span>{isRecording ? '停止识别' : '开始识别'}</span>
                      </button>

                      <button
                        onClick={() => toggleTTSEnabled(!ttsEnabled)}
                        className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all ${
                          ttsEnabled
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-600'
                            : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        <span>{ttsEnabled ? '🔊 TTS 已开启' : '🔇 TTS 已静音'}</span>
                      </button>
                    </div>

                    <div className="w-28 shrink-0">
                      <AudioSpectrum height={18} spectrumData={spectrumData} />
                    </div>
                  </div>
                </div>

              </div>

            </div>
          )}

        </main>
      </div>

    </div>
  )
}
