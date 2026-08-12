import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useStreamWebSocket, useAudioWebSocket, useLanguageChangeListener, useVoiceChangeListener } from '../hooks/useWebSocket'
import { usePlatform } from '../hooks/usePlatform'
import { API_BASE } from '../services/api'
import Sidebar from './Sidebar'
import DanmakuPanel from './DanmakuPanel'
import SettingsPanel from './SettingsPanel'
import AudioSpectrum from './AudioSpectrum'

type Platform = 'tiktok' | 'douyin'
type ActiveTab = 'danmaku' | 'subtitle' | 'audio' | 'settings'

interface LanguageOption {
  code: string
  label: string
  icon: string
}

// 安全获取 electronAPI，防止 preload 未加载时崩溃
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
    electron?.on('backend:ready', onReady)
    electron?.on('backend:failed', onFailed)
    electron?.on('backend:crashed', onFailed)
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
  }, [])

  useEffect(() => {
    const timer = setInterval(async () => {
      const h = await checkHealth()
      setHealth(h)
      if (h) fetchStatus()
    }, 5000)
    return () => clearInterval(timer)
  }, [checkHealth, fetchStatus])

  useEffect(() => {
    fetch(`${API_BASE}/api/audio/devices/config`)
      .then(res => res.json())
      .then(data => {
        if (data.status === 'success' && data.audio_devices) {
          setMicInputId(data.audio_devices.mic_input ?? null)
          setRemoteInputId(data.audio_devices.remote_input ?? null)
        }
      })
      .catch(() => {})
  }, [])

  // ── 自动更新事件 ────────────────────────────────────────
  useEffect(() => {
    electron.getAppVersion().then((v: string) => setAppVersion(v))
    const handlers: Array<[string, (info?: unknown) => void]> = [
      ['update-available', (info) => { const i = info as { version: string } | undefined; setUpdateStatus('available'); setUpdateError('') }],
      ['update-not-available', () => { setUpdateStatus('not-available'); setUpdateError('') }],
      ['download-progress', (data) => { const d = data as { percent: number; bytesPerSecond: number }; setUpdateStatus('downloading'); setDownloadProgress({ percent: d.percent, speed: `${(d.bytesPerSecond / 1048576).toFixed(1)} MB/s` }) }],
      ['update-downloaded', () => { setUpdateStatus('downloaded'); setDownloadProgress(null) }],
      ['update:error', (data) => { const d = data as { message: string }; setUpdateStatus('error'); setUpdateError(d.message) }],
    ]
    handlers.forEach(([event, fn]) => electron.on(event, fn))
    return () => {
      handlers.forEach(([event, fn]) => electron.removeListener?.(event, fn))
    }
  }, [])

  // ── 更新相关回调 ────────────────────────────────────────
  const handleCheckUpdate = useCallback(async () => {
    setUpdateStatus('checking'); setUpdateError(''); setDownloadProgress(null)
    await electron.checkForUpdate()
  }, [])
  const handleDownloadUpdate = useCallback(async () => {
    setUpdateStatus('downloading'); setUpdateError('')
    await electron.downloadUpdate()
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
  const handleTogglePin = async () => { setIsPinned(await electron.toggleAlwaysOnTop()) }
  const platformActive = status?.active_platform != null

  // ── 加载态 / 失败态 ─────────────────────────────────────
  if (!backendReady && !backendFailed) {
    return (
      <div className="h-full bg-slate-50 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="text-5xl animate-pulse">⚡</div>
          <div className="text-lg font-medium text-blue-600">{t('dashboard.loadingBackend')}</div>
          <div className="text-sm text-slate-400">{t('dashboard.firstStart')}</div>
        </div>
      </div>
    )
  }

  if (backendFailed) {
    return (
      <div className="h-full bg-slate-50 flex items-center justify-center">
        <div className="text-center space-y-3 max-w-sm">
          <div className="text-5xl">⚠️</div>
          <div className="text-lg font-medium text-red-600">{t('dashboard.backendFailed')}</div>
          <div className="text-sm text-slate-500 leading-relaxed">{backendError}</div>
          <button
            onClick={() => electron.openBackendLog?.()}
            className="px-5 py-2 rounded-lg border border-red-300 bg-red-50 text-red-600 text-sm hover:bg-red-100 transition-all"
          >
            {t('dashboard.viewLog')}
          </button>
        </div>
      </div>
    )
  }

  // ── 主布局 ─────────────────────────────────────────────
  return (
    <div className="h-full w-full bg-slate-50 flex flex-col overflow-hidden relative">
      {/* 顶部标题栏 */}
      <header className="flex items-center justify-end px-4 h-11 bg-white border-b border-slate-200 relative z-10 drag-region">
        <div className="flex gap-1 no-drag-region">
          <button
            className={`w-7 h-7 flex items-center justify-center rounded-md transition-all text-xs ${isPinned ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'}`}
            onClick={handleTogglePin}
            title={t('dashboard.pin')}
          >
            {isPinned ? '📌' : '📍'}
          </button>
          <button className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all text-xs" onClick={() => electron.minimize()} title={t('dashboard.minimize')}>—</button>
          <button className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all text-xs" onClick={() => electron.close()} title={t('dashboard.close')}>✕</button>
        </div>
      </header>

      {/* 主体：左侧边栏 + 右侧内容 */}
      <main className="flex-1 flex overflow-hidden relative z-10">
        {/* ── 左侧导航边栏 ──────────────────────────────── */}
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

        {/* ── 右侧内容区 ────────────────────────────────── */}
        <section className="flex-1 flex flex-col overflow-hidden">
          {/* Tab 内容 */}
          <div className="flex-1 overflow-hidden">
            {activeTab === 'danmaku' && (
              <DanmakuPanel messages={messages} onClear={clearMessages} />
            )}
            {activeTab === 'subtitle' && (
              <div className="h-full flex flex-col gap-3 p-4 overflow-hidden">
                {transcription && (
                  <div className="rounded-xl bg-white border border-slate-200 p-4 space-y-2 shadow-sm animate-[slide-in-up_0.3s_ease]">
                    <div className="text-sm text-slate-500 line-clamp-2">{transcription.transcription.text}</div>
                    <div className="text-lg font-bold text-blue-600">{transcription.translation.text}</div>
                  </div>
                )}
                <div className="flex-1 overflow-y-auto space-y-2">
                  {history.slice(-20).reverse().map((item, i) => (
                    <div key={i} className="rounded-lg bg-white border border-slate-100 border-l-2 border-l-blue-400 p-3 shadow-sm animate-[slide-in-up_0.2s_ease]">
                      <div className="text-xs text-slate-400">{item.transcription.text}</div>
                      <div className="text-sm text-slate-700 mt-1">{item.translation.text}</div>
                    </div>
                  ))}
                  {history.length === 0 && (
                    <div className="h-full flex items-center justify-center text-sm text-slate-400">
                      {t('dashboard.noHistoryHint')}
                    </div>
                  )}
                </div>
              </div>
            )}
            {activeTab === 'audio' && (
              <SettingsPanel activeSection="audio" />
            )}
            {activeTab === 'settings' && (
              <SettingsPanel activeSection="settings" />
            )}
          </div>

          {/* ── 底部控制面板 ── */}
          {(activeTab === 'danmaku' || activeTab === 'subtitle') && (
            <div className="border-t border-slate-200 bg-white p-3 space-y-3">
              {/* 语言对控制 */}
              <div className="flex items-center gap-2">
                <select
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
                  value={srcLang}
                  onChange={(e) => handleSetLanguage(e.target.value, tgtLang)}
                  disabled={langSwitching}
                >
                  {SUPPORTED_LANGS.map(lang => <option key={lang.code} value={lang.code}>{lang.icon} {lang.label}</option>)}
                </select>
                <button
                  className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-blue-600 hover:bg-blue-50 transition-all text-sm disabled:opacity-40"
                  onClick={handleSwapLanguage}
                  disabled={langSwitching}
                >
                  ⇄
                </button>
                <select
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
                  value={tgtLang}
                  onChange={(e) => handleSetLanguage(srcLang, e.target.value)}
                  disabled={langSwitching}
                >
                  {SUPPORTED_LANGS.map(lang => <option key={lang.code} value={lang.code}>{lang.icon} {lang.label}</option>)}
                </select>
              </div>

              {/* 平台 + 同传控制 */}
              <div className="flex items-center gap-3">
                <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
                  <button
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${platform === 'douyin' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    onClick={() => setPlatform('douyin')}
                  >
                    {t('dashboard.douyin')}
                  </button>
                  <button
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${platform === 'tiktok' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    onClick={() => setPlatform('tiktok')}
                  >
                    {t('dashboard.tiktok')}
                  </button>
                </div>

                <input
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 outline-none placeholder-slate-400 focus:border-blue-400 transition-all"
                  type="text"
                  placeholder={platform === 'douyin' ? t('dashboard.roomInput') : t('dashboard.roomInputTiktok')}
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSwitchPlatform()}
                />

                <button
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    platformActive
                      ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
                      : 'bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 disabled:opacity-40'
                  }`}
                  onClick={platformActive ? stopPlatform : handleSwitchPlatform}
                  disabled={!roomId.trim() && !platformActive}
                >
                  {platformActive ? t('dashboard.disconnect') : t('dashboard.connect')}
                </button>

                <div className="w-px h-6 bg-slate-200" />

                <button
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                    isRecording
                      ? 'border-red-300 bg-red-50 text-red-600 hover:bg-red-100'
                      : 'border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100'
                  }`}
                  onClick={isRecording ? stopRecording : startRecording}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-blue-500'}`} />
                  {isRecording ? t('dashboard.stopRecord') : t('dashboard.startRecord')}
                </button>

                <button
                  className={`w-7 h-7 flex items-center justify-center rounded-lg border text-xs transition-all ${
                    ttsEnabled
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-600'
                      : 'border-slate-200 bg-slate-50 text-slate-400 hover:text-slate-600'
                  }`}
                  onClick={() => toggleTTSEnabled(!ttsEnabled)}
                  title={ttsEnabled ? t('dashboard.ttsToggle') : t('dashboard.ttsDisabled')}
                >
                  {ttsEnabled ? '🔊' : '🔇'}
                </button>
              </div>

              {/* 频谱 + TTS 状态 */}
              <div className="flex items-center gap-3">
                <AudioSpectrum height={24} spectrumData={spectrumData} />
                {isTTSSpeaking && (
                  <div className="flex-1 flex items-center gap-2 px-3 py-1 bg-emerald-50 rounded-lg border border-emerald-200 text-xs text-emerald-700 truncate">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
                    <span className="truncate">{ttsCurrentText}</span>
                  </div>
                )}
                {health && (
                  <div className="flex items-center gap-2 text-[10px] text-slate-400">
                    <span className={`w-1.5 h-1.5 rounded-full ${wsStatus === 'connected' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                    <span>{wsStatus === 'connected' ? 'WS 已连接' : wsStatus === 'connecting' ? '连接中...' : '未连接'}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
