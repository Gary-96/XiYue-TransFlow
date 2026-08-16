import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useStreamWebSocket,
  useAudioWebSocket,
  useLanguageChangeListener,
  useVoiceChangeListener
} from '../hooks/useWebSocket'
import { usePlatform } from '../hooks/usePlatform'
import { API_BASE } from '../services/api'
import Sidebar from './Sidebar'
import DanmakuPanel from './DanmakuPanel'
import SettingsPanel from './SettingsPanel'
import AudioSpectrum from './AudioSpectrum'
import {
  Search,
  Pin,
  Minus,
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

type Platform = 'tiktok' | 'douyin'
type ActiveTab = 'danmaku' | 'subtitle' | 'audio' | 'settings' | 'about'

interface LanguageOption {
  code: string
  label: string
  icon: string
}

const electron = window.electronAPI

export default function Dashboard() {
  const { t } = useTranslation()
  const [SUPPORTED_LANGS, setSUPPORTED_LANGS] = useState<LanguageOption[]>([])
  const { messages, status: wsStatus, clearMessages } = useStreamWebSocket()
  const [micInputId, setMicInputId] = useState<number | null>(null)
  const [remoteInputId, setRemoteInputId] = useState<number | null>(null)
  const [spectrumData, setSpectrumData] = useState<number[]>([])

  const {
    transcription,
    history,
    isRecording,
    isTTSSpeaking,
    ttsEnabled,
    ttsCurrentText,
    startRecording,
    stopRecording,
    setSpectrumCallback,
    toggleTTSEnabled,
    getTTSStatus,
  } = useAudioWebSocket(micInputId, remoteInputId)

  const { status, switchPlatform, stopPlatform, fetchStatus, checkHealth } = usePlatform()

  const [platform, setPlatform] = useState<Platform>('douyin')
  const [roomId, setRoomId] = useState('')
  const [isPinned, setIsPinned] = useState(false)
  const [activeTab, setActiveTab] = useState<ActiveTab>('danmaku')
  const [health, setHealth] = useState<Record<string, unknown> | null>(null)
  const [srcLang, setSrcLang] = useState('zh')
  const [tgtLang, setTgtLang] = useState('vi')
  const [langSwitching, setLangSwitching] = useState(false)
  const [backendReady, setBackendReady] = useState(false)
  const [backendFailed, setBackendFailed] = useState(false)
  const [backendError, setBackendError] = useState<string>('')
  const [backendPort] = useState<number>(15387)

  const [appVersion, setAppVersion] = useState<string>('')
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'>('idle')
  const [updateError, setUpdateError] = useState<string>('')
  const [downloadProgress, setDownloadProgress] = useState<{ percent: number; speed: string } | null>(null)
  const [machineId, setMachineId] = useState<string>('读取中...')
  const [copiedNotice, setCopiedNotice] = useState(false)

  useEffect(() => {
    setSpectrumCallback((data) => setSpectrumData([...data]))
  }, [setSpectrumCallback])

  useLanguageChangeListener((src: string, tgt: string) => { setSrcLang(src); setTgtLang(tgt) })
  useVoiceChangeListener(() => {})

  // ── 后端生命周期监听 ────────────────────────────────────
  useEffect(() => {
    const onReady = (_data?: unknown) => {
      setBackendReady(true)
    }
    const onFailed = (_info?: unknown) => {
      setBackendFailed(true)
      setBackendError('')
    }
    electron?.on?.('backend:ready', onReady)
    electron?.on?.('backend:failed', onFailed)
    electron?.on?.('backend:crashed', onFailed)
    return () => {
      electron?.removeListener?.('backend:ready', onReady)
      electron?.removeListener?.('backend:failed', onFailed)
      electron?.removeListener?.('backend:crashed', onFailed)
    }
  }, [])

  // ── 初始加载 ────────────────────────────────────────────
  useEffect(() => {
    fetch(`${API_BASE}/api/language/get`)
      .then(res => res.json())
      .then(data => {
        if (data.status === 'success') {
          setSrcLang(data.src_lang)
          setTgtLang(data.tgt_lang)
          if (data.available_languages) {
            const langs: LanguageOption[] = Object.entries(data.available_languages as Record<string, { label: string; icon: string }>)
              .filter(([k]) => k !== 'auto')
              .map(([code, v]) => ({ code, label: v.label, icon: v.icon }))
            setSUPPORTED_LANGS(langs)
          }
        }
      })
      .catch(() => {})
    getTTSStatus().catch(() => {})

    // 读取设备机器码
    electron?.getMachineId?.().then((id: string) => setMachineId(id || 'MAC-8F3A2B'))
  }, [getTTSStatus])

  useEffect(() => {
    const timer = setInterval(async () => {
      const h = await checkHealth()
      setHealth(h)
      if (h) fetchStatus()
    }, 5000)
    return () => clearInterval(timer)
  }, [checkHealth, fetchStatus])

  useEffect(() => {
    fetch(`${API_BASE}/api/audio/devices`)
      .then(res => res.json())
      .then(data => {
        if (data.inputs && data.outputs) {
          // 从配置读取已保存的设备 ID
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

  // ── 自动更新事件 ────────────────────────────────────────
  useEffect(() => {
    // 动态获取版本号
    electron?.getAppVersion?.()?.then((v: string) => setAppVersion(v || '0.2.0'))
    const handlers: Array<[string, (info?: unknown) => void]> = [
      ['update-available', (info) => { const i = info as { version: string } | undefined; setUpdateStatus('available'); setUpdateError('') }],
      ['update-not-available', () => { setUpdateStatus('not-available'); setUpdateError('') }],
      ['download-progress', (data) => { const d = data as { percent: number; bytesPerSecond: number }; setUpdateStatus('downloading'); setDownloadProgress({ percent: d.percent, speed: `${(d.bytesPerSecond / 1048576).toFixed(1)} MB/s` }) }],
      ['update-downloaded', () => { setUpdateStatus('downloaded'); setDownloadProgress(null) }],
      ['update:error', (data) => { const d = data as { message: string }; setUpdateStatus('error'); setUpdateError(d.message) }],
    ]
    handlers.forEach(([event, fn]) => electron?.on?.(event, fn))
    return () => {
      handlers.forEach(([event, fn]) => electron?.removeListener?.(event, fn))
    }
  }, [])

  // ── 更新相关回调 ────────────────────────────────────────
  const handleCheckUpdate = useCallback(async () => {
    setUpdateStatus('checking'); setUpdateError(''); setDownloadProgress(null)
    await electron?.checkForUpdate?.()
  }, [])

  // ── 语言 / 平台 / 置顶 ──────────────────────────────────
  const handleSetLanguage = async (src: string, tgt: string) => {
    if (src === tgt) return
    setLangSwitching(true)
    try {
      await fetch(`${API_BASE}/api/language/set`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ src_lang: src, tgt_lang: tgt }) })
      setSrcLang(src); setTgtLang(tgt)
    } catch (e) { console.error('Language switch failed:', e) }
    finally { setLangSwitching(false) }
  }

  const handleSwapLanguage = async () => {
    setLangSwitching(true)
    try {
      const res = await fetch(`${API_BASE}/api/language/switch`, { method: 'POST' })
      const data = await res.json()
      if (data.status === 'success') { setSrcLang(data.src_lang); setTgtLang(data.tgt_lang) }
    } catch (e) { console.error('Language swap failed:', e) }
    finally { setLangSwitching(false) }
  }

  const handleSwitchPlatform = async () => { if (!roomId.trim()) return; await switchPlatform(platform, roomId.trim()) }
  const handleTogglePin = async () => { if (electron?.toggleAlwaysOnTop) setIsPinned(await electron.toggleAlwaysOnTop()) }
  const handleCopyMachineId = () => {
    navigator.clipboard.writeText(machineId)
    setCopiedNotice(true)
    setTimeout(() => setCopiedNotice(false), 2000)
  }
  const platformActive = status?.active_platform != null

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#f4f7fb] text-slate-800 font-sans select-none antialiased">
      
      {/* ── 1. 左侧边栏 ────────────────────────────────────────── */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab as ActiveTab)}
        messageCount={messages.length}
        historyCount={history.length}
        backendReady={backendReady}
        backendFailed={backendFailed}
        backendPort={backendPort}
        appVersion={appVersion}
        updateStatus={updateStatus}
        onCheckUpdate={handleCheckUpdate}
      />

      {/* ── 2. 右侧主体工作区 ──────────────────────────────────── */}
      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        
        {/* 顶部 Header：拖拽栏 + 直播间连接 + 语言切换 + 窗口控制 */}
        <header className="h-14 px-5 flex items-center justify-between shrink-0 bg-transparent z-20 gap-3" style={{ WebkitAppRegion: 'drag' } as any}>
          
          {/* 中部直播间连接与搜索条 */}
          <div className="flex items-center gap-2 flex-1 max-w-2xl bg-white rounded-full px-3 py-1.5 border border-slate-200/80 shadow-2xs" style={{ WebkitAppRegion: 'no-drag' } as any}>
            {/* 平台分段切换器 */}
            <div className="flex bg-slate-100 p-0.5 rounded-full text-xs font-semibold shrink-0">
              <button
                onClick={() => setPlatform('douyin')}
                className={`px-3 py-1 rounded-full transition-all ${
                  platform === 'douyin' ? 'bg-white text-blue-600 shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {t('dashboard.douyin')}
              </button>
              <button
                onClick={() => setPlatform('tiktok')}
                className={`px-3 py-1 rounded-full transition-all ${
                  platform === 'tiktok' ? 'bg-white text-blue-600 shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {t('dashboard.tiktok')}
              </button>
            </div>

            <div className="h-4 w-px bg-slate-200 shrink-0" />

            {/* 输入框 */}
            <div className="flex-1 flex items-center gap-2 min-w-0">
              <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <input
                type="text"
                placeholder={platform === 'douyin' ? t('dashboard.roomInput') : t('dashboard.roomInputTiktok')}
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSwitchPlatform()}
                className="w-full bg-transparent text-xs text-slate-800 placeholder-slate-400 outline-none truncate"
              />
            </div>

            {/* 连接/断开 按钮 */}
            <button
              onClick={platformActive ? stopPlatform : handleSwitchPlatform}
              disabled={!roomId.trim() && !platformActive}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all shadow-xs shrink-0 cursor-pointer ${
                platformActive
                  ? 'bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200'
                  : 'bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40 shadow-blue-500/20'
              }`}
            >
              {platformActive ? t('dashboard.disconnect') : t('dashboard.connect')}
            </button>
          </div>

          {/* 右侧：语言对切换与窗口操作 */}
          <div className="flex items-center gap-2 shrink-0" style={{ WebkitAppRegion: 'no-drag' } as any}>
            {/* 紧凑型语言对切换器 */}
            <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-xl border border-slate-200/80 shadow-2xs">
              <select
                className="bg-transparent text-xs font-semibold text-slate-700 outline-none cursor-pointer disabled:opacity-50"
                value={srcLang}
                onChange={(e) => handleSetLanguage(e.target.value, tgtLang)}
                disabled={langSwitching}
              >
                {SUPPORTED_LANGS.map(lang => <option key={lang.code} value={lang.code}>{lang.icon} {lang.label}</option>)}
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
                {SUPPORTED_LANGS.map(lang => <option key={lang.code} value={lang.code}>{lang.icon} {lang.label}</option>)}
              </select>
            </div>

            {/* 窗口按钮 */}
            <div className="flex items-center gap-1 text-slate-400">
              <button
                onClick={handleTogglePin}
                className={`p-1.5 rounded-lg hover:bg-white hover:text-slate-700 transition-all ${
                  isPinned ? 'text-blue-600 bg-white shadow-2xs' : ''
                }`}
                title={t('dashboard.pin')}
              >
                <Pin className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => electron?.minimize?.()}
                className="p-1.5 rounded-lg hover:bg-white hover:text-slate-700 transition-all"
                title={t('dashboard.minimize')}
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => electron?.close?.()}
                className="p-1.5 rounded-lg hover:bg-rose-50 hover:text-rose-600 transition-all"
                title={t('dashboard.close')}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </header>

        {/* ── 3. 主栅格工作区 ──────────────────────────────────── */}
        <main className="flex-1 px-5 pb-5 pt-1 overflow-hidden min-h-0">
          
          {/* 设置/关于页直接全屏卡片显示 */}
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

          {/* 弹幕与同传字幕主视图（双列卡片化布局） */}
          {(activeTab === 'danmaku' || activeTab === 'subtitle') && (
            <div className="h-full grid grid-cols-12 gap-4">
              
              {/* ── 左侧快捷操作与状态区 (占 4/12) ── */}
              <div className="col-span-4 flex flex-col gap-4 min-h-0">
                {/* 1. 授权状态卡片 */}
                <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs shrink-0 flex flex-col justify-between">
                  <div>
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
                  </div>

                  <button
                    onClick={() => {
                      const evt = new CustomEvent('leman:license-expired')
                      window.dispatchEvent(evt)
                    }}
                    className="w-full mt-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs shadow-blue-500/20 transition-all cursor-pointer"
                  >
                    卡密兑换 / 授权管理
                  </button>
                </div>

                {/* 2. 快捷操作列表 */}
                <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex-1 flex flex-col justify-between overflow-y-auto">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 mb-2.5">快捷操作</h4>
                    <div className="space-y-2">
                      <button
                        onClick={handleCopyMachineId}
                        className="w-full p-2.5 rounded-xl bg-slate-50/80 hover:bg-blue-50/50 border border-slate-100 hover:border-blue-100 flex items-center justify-between transition-all group"
                      >
                        <div className="flex items-center gap-2.5 text-left truncate">
                          <Copy className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 shrink-0" />
                          <div className="truncate">
                            <div className="text-xs font-bold text-slate-800">
                              {copiedNotice ? '已复制到剪贴板' : '一键复制机器码'}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono truncate">{machineId}</div>
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
                            <div className="text-[10px] text-slate-400">重置弹幕与当前会话列表</div>
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
                    <span>WS 状态: <strong className={wsStatus === 'connected' ? 'text-emerald-600' : 'text-slate-500'}>{wsStatus}</strong></span>
                    <span>弹幕: {messages.length}</span>
                  </div>
                </div>
              </div>

              {/* ── 右侧主展示区 (占 8/12) ── */}
              <div className="col-span-8 flex flex-col gap-4 min-h-0">
                
                {/* 顶部 4 状态微胶囊 */}
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
                    {isTTSSpeaking && (
                      <div className="flex items-center gap-1.5 text-emerald-600 text-[11px] font-medium animate-pulse">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <span className="truncate max-w-[200px]">{ttsCurrentText}</span>
                      </div>
                    )}
                  </div>

                  {/* 核心内容区 */}
                  <div className="flex-1 overflow-hidden min-h-0 relative">
                    {activeTab === 'danmaku' && (
                      <DanmakuPanel messages={messages} onClear={clearMessages} />
                    )}

                    {activeTab === 'subtitle' && (
                      <div className="h-full flex flex-col gap-3 p-4 overflow-hidden">
                        {transcription ? (
                          <div className="rounded-xl bg-blue-50/60 border border-blue-100 p-4 space-y-1 shrink-0 animate-[slide-in-up_0.3s_ease]">
                            <div className="text-xs text-slate-500 font-medium line-clamp-2">{transcription.transcription.text}</div>
                            <div className="text-base font-bold text-blue-600">{transcription.translation.text}</div>
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
                        <span>{isRecording ? t('dashboard.stopRecord') : t('dashboard.startRecord')}</span>
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