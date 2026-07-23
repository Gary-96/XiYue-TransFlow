import { useState, useEffect, useCallback } from 'react'
import { useStreamWebSocket, useAudioWebSocket, setLanguageChangedListener, setVoiceChangedListener } from '../hooks/useWebSocket'
import { usePlatform } from '../hooks/usePlatform'
import DanmakuPanel from './DanmakuPanel'
import SettingsPanel from './SettingsPanel'
import AudioSpectrum from './AudioSpectrum'

type Platform = 'tiktok' | 'douyin'

interface LanguageOption {
  code: string
  label: string
  icon: string
}

const SUPPORTED_LANGS: LanguageOption[] = [
  { code: 'zh', label: '中文', icon: '🇨🇳' },
  { code: 'vi', label: '越南语', icon: '🇻🇳' },
  { code: 'en', label: '英语', icon: '🇺🇸' },
  { code: 'ja', label: '日语', icon: '🇯🇵' },
  { code: 'ko', label: '韩语', icon: '🇰🇷' },
  { code: 'th', label: '泰语', icon: '🇹🇭' },
]

const electron = (window as any).electronAPI

const API_BASE = 'http://localhost:8000'

export default function Dashboard() {
  const { messages, status: wsStatus, clearMessages } = useStreamWebSocket()
  const [audioDeviceId, setAudioDeviceId] = useState<number | null>(null)
  const [spectrumData, setSpectrumData] = useState<number[]>([])
  const {
    transcription,
    history,
    isRecording,
    startRecording,
    stopRecording,
    setSpectrumCallback,
  } = useAudioWebSocket(audioDeviceId)

  // 注册频谱回调：后端 audio_spectrum 消息通过单一 WS 连接分发
  useEffect(() => {
    setSpectrumCallback((data) => {
      setSpectrumData([...data])
    })
  }, [setSpectrumCallback])
  const { status, switchPlatform, stopPlatform, fetchStatus, checkHealth } = usePlatform()

  const [platform, setPlatform] = useState<Platform>('douyin')
  const [roomId, setRoomId] = useState('')
  const [isPinned, setIsPinned] = useState(false)
  const [activeTab, setActiveTab] = useState<'danmaku' | 'subtitle' | 'settings'>('danmaku')
  const [health, setHealth] = useState<Record<string, unknown> | null>(null)

  // 语言对状态
  const [srcLang, setSrcLang] = useState('zh')
  const [tgtLang, setTgtLang] = useState('vi')
  const [langSwitching, setLangSwitching] = useState(false)

  // 后端启动状态
  const [backendReady, setBackendReady] = useState(false)
  const [backendFailed, setBackendFailed] = useState(false)
  const [backendError, setBackendError] = useState<string>('')

  // ── 自动更新状态（侧边栏底部卡片）────────────────────
  const [appVersion, setAppVersion] = useState<string>('')
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'>('idle')
  const [updateVersion, setUpdateVersion] = useState<string>('')
  const [downloadProgress, setDownloadProgress] = useState<{ percent: number; speed: string } | null>(null)
  const [updateError, setUpdateError] = useState<string>('')

  // 监听后端就绪/失败事件
  useEffect(() => {
    const onReady = () => setBackendReady(true)
    const onFailed = (info?: { error?: string; logPath?: string }) => {
      setBackendFailed(true)
      setBackendError(info?.error || '后端启动失败')
    }

    electron.on('backend:ready', onReady)
    electron.on('backend:failed', onFailed)
    electron.on('backend:crashed', onFailed)
  }, [])

  // 注册语言变更监听（来自后端广播）
  useEffect(() => {
    setLanguageChangedListener((src, tgt) => {
      setSrcLang(src)
      setTgtLang(tgt)
    })
    setVoiceChangedListener(() => {
      // 音色变更不需要在 Dashboard 处理，SettingsPanel 自行管理
    })
  }, [])

  // 初始化时加载语言对配置
  useEffect(() => {
    fetch(`${API_BASE}/api/language/get`)
      .then(res => res.json())
      .then(data => {
        if (data.status === 'success') {
          setSrcLang(data.src_lang)
          setTgtLang(data.tgt_lang)
        }
      })
      .catch(() => {/* 静默 */})
  }, [])

  // 定期检查后端健康
  useEffect(() => {
    const timer = setInterval(async () => {
      const h = await checkHealth()
      setHealth(h)
      if (h) fetchStatus()
    }, 5000)
    return () => clearInterval(timer)
  }, [checkHealth, fetchStatus])

  // 初始化时加载当前音频设备配置
  useEffect(() => {
    fetch(`${API_BASE}/api/audio/current-device`)
      .then(res => res.json())
      .then(data => {
        if (data.status === 'success' && data.device_id != null) {
          setAudioDeviceId(data.device_id)
        }
      })
      .catch(() => {/* 静默 */})
  }, [])

  // ── 自动更新：获取版本号 + 监听主进程事件 ────────────
  useEffect(() => {
    electron.getAppVersion().then((v: string) => setAppVersion(v))

    const onAvailable = (info: unknown) => {
      const i = info as { version: string }
      setUpdateStatus('available')
      setUpdateVersion(i.version)
      setUpdateError('')
    }
    const onNotAvailable = () => {
      setUpdateStatus('not-available')
      setUpdateError('')
    }
    const onProgress = (data: unknown) => {
      const d = data as { percent: number; bytesPerSecond: number }
      setUpdateStatus('downloading')
      const speedMB = (d.bytesPerSecond / 1048576).toFixed(1)
      setDownloadProgress({ percent: d.percent, speed: `${speedMB} MB/s` })
    }
    const onDownloaded = () => {
      setUpdateStatus('downloaded')
      setDownloadProgress(null)
    }
    const onError = (data: unknown) => {
      const d = data as { message: string }
      setUpdateStatus('error')
      setUpdateError(d.message)
    }

    electron.on('update-available', onAvailable)
    electron.on('update-not-available', onNotAvailable)
    electron.on('download-progress', onProgress)
    electron.on('update-downloaded', onDownloaded)
    electron.on('update:error', onError)
  }, [])

  const handleCheckUpdate = useCallback(async () => {
    setUpdateStatus('checking')
    setUpdateError('')
    setUpdateVersion('')
    setDownloadProgress(null)
    await electron.checkForUpdate()
  }, [])

  const handleDownloadUpdate = useCallback(async () => {
    setUpdateStatus('downloading')
    setUpdateError('')
    await electron.downloadUpdate()
  }, [])

  const handleQuitAndInstall = useCallback(async () => {
    await electron.quitAndInstall()
  }, [])

  // 语言切换处理
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
    const pinned = await electron.toggleAlwaysOnTop()
    setIsPinned(pinned)
  }

  const platformActive = status?.active_platform != null

  if (!backendReady && !backendFailed) {
    return (
      <div className="dashboard-root" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚡</div>
          <div style={{ fontSize: '16px', color: 'var(--accent-cyan)', marginBottom: '8px' }}>
            正在启动后端引擎...
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            首次启动可能需要 10-30 秒
          </div>
        </div>
        <style>{`body { margin: 0; background: var(--bg-deep); }`}</style>
      </div>
    )
  }

  if (backendFailed) {
    return (
      <div className="dashboard-root" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)', maxWidth: '420px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
          <div style={{ fontSize: '16px', color: 'var(--accent-red)', marginBottom: '8px' }}>
            后端引擎启动失败
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: 1.6 }}>
            {backendError}
          </div>
          <button
            onClick={() => electron.openBackendLog?.()}
            style={{
              padding: '8px 20px',
              borderRadius: '8px',
              border: '1px solid var(--accent-cyan)',
              background: 'rgba(16, 185, 129, 0.1)',
              color: 'var(--accent-cyan)',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            查看日志文件
          </button>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '12px' }}>
            请重启应用，或检查杀毒软件是否拦截了 backend_engine.exe
          </div>
        </div>
        <style>{`body { margin: 0; background: var(--bg-deep); }`}</style>
      </div>
    )
  }

  return (
    <div className="dashboard-root">
      {/* 背景极光球 */}
      <div className="aurora-bg">
        <div className="aurora-orb orb-1" />
        <div className="aurora-orb orb-2" />
        <div className="aurora-orb orb-3" />
      </div>

      {/* 标题栏 */}
      <header className="title-bar">
        <div className="brand">
          <span className="brand-icon">🌐</span>
          <span className="brand-name">乐曼同传小助手</span>
          <span className="brand-sub">LEMAN TRANSLATE</span>
        </div>
        <div className="window-controls">
          <button
            className={`ctrl-btn ${isPinned ? 'active' : ''}`}
            onClick={handleTogglePin}
            title="置顶"
          >
            📌
          </button>
          <button className="ctrl-btn" onClick={() => electron.minimize()} title="最小化">
            —
          </button>
          <button className="ctrl-btn close" onClick={() => electron.close()} title="关闭">
            ✕
          </button>
        </div>
      </header>

      {/* 主体内容 */}
      <main className="main-content">
        {/* 左侧面板 — 控制 */}
        <aside className="side-panel glass">
          {/* 后端状态 */}
          <section className="panel-section">
            <div className="section-label">
              <span className="dot" data-status={health ? 'online' : 'offline'} />
              后端服务
            </div>
            <div className="status-grid">
              <div className="status-item">
                <span className="status-key">设备</span>
                <span className="status-val">{(health?.device as string) || '—'}</span>
              </div>
              <div className="status-item">
                <span className="status-key">消息数</span>
                <span className="status-val">
                  {status?.global_stats?.total_messages ?? 0}
                </span>
              </div>
              <div className="status-item">
                <span className="status-key">WS</span>
                <span className="status-val" data-ws={wsStatus}>
                  {wsStatus === 'connected' ? '🟢' : wsStatus === 'connecting' ? '🟡' : '🔴'}
                </span>
              </div>
            </div>
          </section>

          {/* 语言对切换 */}
          <section className="panel-section">
            <div className="section-label">翻译语言对</div>
            <div className="lang-pair-row">
              <select
                className="lang-select"
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
                className="swap-btn"
                onClick={handleSwapLanguage}
                disabled={langSwitching}
                title="交换语言"
              >
                ⇄
              </button>
              <select
                className="lang-select"
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
          </section>

          {/* 平台控制 */}
          <section className="panel-section">
            <div className="section-label">直播平台</div>
            <div className="platform-switch">
              <button
                className={`platform-btn ${platform === 'douyin' ? 'active' : ''}`}
                onClick={() => setPlatform('douyin')}
              >
                🎵 抖音
              </button>
              <button
                className={`platform-btn ${platform === 'tiktok' ? 'active' : ''}`}
                onClick={() => setPlatform('tiktok')}
              >
                🎵 TikTok
              </button>
            </div>
            <input
              className="room-input"
              type="text"
              placeholder={platform === 'douyin' ? '输入直播间ID' : '输入 @用户名'}
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSwitchPlatform()}
            />
            <div className="action-row">
              <button
                className="action-btn primary"
                onClick={handleSwitchPlatform}
                disabled={!roomId.trim() || platformActive}
              >
                连接
              </button>
              <button
                className="action-btn danger"
                onClick={() => stopPlatform()}
                disabled={!platformActive}
              >
                断开
              </button>
            </div>
          </section>

          {/* 同传控制 */}
          <section className="panel-section">
            <div className="section-label">实时同传</div>
            <button
              className={`record-btn ${isRecording ? 'recording' : ''}`}
              onClick={isRecording ? stopRecording : startRecording}
            >
              <span className="rec-dot" />
              {isRecording ? '停止同传' : '开始同传'}
            </button>
            <AudioSpectrum height={40} spectrumData={spectrumData} />
          </section>

          {/* 版本与更新卡片 — 底部固定 */}
          <section className="panel-section update-card-section">
            <div className="update-card-version">
              <span className="update-card-app-name">乐曼同传小助手</span>
              <span className="update-card-version-tag">v{appVersion || '...'}</span>
            </div>

            {updateStatus === 'idle' && (
              <button className="update-card-btn" onClick={handleCheckUpdate}>
                🔍 检查更新
              </button>
            )}

            {updateStatus === 'checking' && (
              <button className="update-card-btn" disabled>
                <span className="update-card-spinner" /> 正在检查...
              </button>
            )}

            {updateStatus === 'not-available' && (
              <div className="update-card-info">
                <span className="update-card-icon">✅</span>
                <span>已是最新版本</span>
                <button className="update-card-btn-sm" onClick={handleCheckUpdate}>重新检查</button>
              </div>
            )}

            {updateStatus === 'available' && (
              <div className="update-card-available">
                <div className="update-card-available-header">
                  <span className="update-card-icon">🎉</span>
                  <span>发现新版本 <strong>v{updateVersion}</strong></span>
                </div>
                <button className="update-card-btn" onClick={handleDownloadUpdate}>
                  ⬇️ 下载更新
                </button>
              </div>
            )}

            {updateStatus === 'downloading' && downloadProgress && (
              <div className="update-card-download">
                <div className="update-card-download-header">
                  <span>下载中 {downloadProgress.percent}%</span>
                  <span className="update-card-speed">{downloadProgress.speed}</span>
                </div>
                <div className="update-card-progress-bar">
                  <div className="update-card-progress-fill" style={{ width: `${downloadProgress.percent}%` }} />
                </div>
              </div>
            )}

            {updateStatus === 'downloaded' && (
              <div className="update-card-downloaded">
                <div className="update-card-downloaded-header">
                  <span className="update-card-icon">✅</span>
                  <span>下载完成，准备安装</span>
                </div>
                <button className="update-card-btn update-card-btn-restart" onClick={handleQuitAndInstall}>
                  🔄 重启升级
                </button>
              </div>
            )}

            {updateStatus === 'error' && (
              <div className="update-card-error">
                <span className="update-card-icon">❌</span>
                <span>更新失败: {updateError}</span>
                <button className="update-card-btn-sm" onClick={handleCheckUpdate}>重试</button>
              </div>
            )}
          </section>
        </aside>

        {/* 右侧 — 内容区 */}
        <section className="content-area">
          {/* Tab 导航 */}
          <nav className="tab-nav">
            <button
              className={`tab-btn ${activeTab === 'danmaku' ? 'active' : ''}`}
              onClick={() => setActiveTab('danmaku')}
            >
              弹幕翻译
              {messages.length > 0 && <span className="badge">{messages.length}</span>}
            </button>
            <button
              className={`tab-btn ${activeTab === 'subtitle' ? 'active' : ''}`}
              onClick={() => setActiveTab('subtitle')}
            >
              同传字幕
              {history.length > 0 && <span className="badge">{history.length}</span>}
            </button>
            <button
              className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveTab('settings')}
            >
              ⚙️ API & 设置
            </button>
          </nav>

          {/* Tab 内容 */}
          <div className="tab-content">
            {activeTab === 'danmaku' && (
              <DanmakuPanel messages={messages} onClear={clearMessages} />
            )}
            {activeTab === 'subtitle' && (
              <div className="subtitle-history">
                {transcription && (
                  <div className="current-subtitle glass">
                    <div className="sub-zh">{transcription.transcription.text}</div>
                    <div className="sub-vi glow-text-cyan">
                      {transcription.translation.text}
                    </div>
                  </div>
                )}
                <div className="history-list">
                  {history.slice(-20).reverse().map((item, i) => (
                    <div key={i} className="history-item">
                      <div className="hist-zh">{item.transcription.text}</div>
                      <div className="hist-vi">{item.translation.text}</div>
                    </div>
                  ))}
                  {history.length === 0 && (
                    <div className="empty-hint">点击"开始同传"启动语音识别</div>
                  )}
                </div>
              </div>
            )}
            {activeTab === 'settings' && <SettingsPanel />}
          </div>
        </section>
      </main>

      <style>{`
        .dashboard-root {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          background: var(--bg-deep);
          border-radius: var(--radius-lg);
          overflow: hidden;
          position: relative;
          border: 1px solid var(--border-glass);
        }

        /* 极光背景 */
        .aurora-bg {
          position: absolute;
          inset: 0;
          overflow: hidden;
          pointer-events: none;
          z-index: 0;
        }
        .aurora-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          opacity: 0.25;
          animation: float 8s ease-in-out infinite;
        }
        .orb-1 {
          width: 400px; height: 400px;
          background: var(--accent-cyan);
          top: -100px; left: -100px;
        }
        .orb-2 {
          width: 350px; height: 350px;
          background: var(--accent-purple);
          bottom: -80px; right: -80px;
          animation-delay: 2s;
        }
        .orb-3 {
          width: 250px; height: 250px;
          background: var(--accent-blue);
          top: 40%; right: 30%;
          opacity: 0.15;
          animation-delay: 4s;
        }

        /* 标题栏 */
        .title-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 16px;
          height: 44px;
          background: rgba(8, 12, 28, 0.6);
          backdrop-filter: blur(30px);
          border-bottom: 1px solid var(--border-glass);
          position: relative;
          z-index: 10;
          -webkit-app-region: drag;
        }
        .brand {
          display: flex;
          align-items: center;
          gap: 8px;
          -webkit-app-region: no-drag;
        }
        .brand-icon { font-size: 20px; }
        .brand-name {
          font-size: 16px;
          font-weight: 700;
          color: var(--text-primary);
          letter-spacing: 1px;
        }
        .brand-sub {
          font-size: 10px;
          color: var(--text-muted);
          letter-spacing: 2px;
          text-transform: uppercase;
        }
        .window-controls {
          display: flex;
          gap: 4px;
          -webkit-app-region: no-drag;
        }
        .ctrl-btn {
          width: 30px; height: 30px;
          border: none;
          border-radius: var(--radius-sm);
          background: transparent;
          color: var(--text-secondary);
          cursor: pointer;
          font-size: 14px;
          transition: var(--transition);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .ctrl-btn:hover {
          background: var(--bg-glass-hover);
          color: var(--text-primary);
        }
        .ctrl-btn.active {
          background: rgba(0, 229, 255, 0.15);
          color: var(--accent-cyan);
        }
        .ctrl-btn.close:hover {
          background: rgba(239, 68, 68, 0.2);
          color: var(--accent-red);
        }

        /* 主体 */
        .main-content {
          flex: 1;
          display: flex;
          gap: 12px;
          padding: 12px;
          position: relative;
          z-index: 1;
          overflow: hidden;
        }

        /* 侧栏 */
        .side-panel {
          width: 260px;
          flex-shrink: 0;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          overflow-y: auto;
        }
        .panel-section {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .section-label {
          font-size: 11px;
          font-weight: 500;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 1.5px;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .dot {
          width: 8px; height: 8px;
          border-radius: 50%;
          background: var(--accent-red);
        }
        .dot[data-status="online"] {
          background: var(--accent-green);
          box-shadow: 0 0 8px rgba(16, 217, 163, 0.6);
        }
        .dot[data-status="offline"] {
          background: var(--accent-red);
        }

        .status-grid {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 6px;
        }
        .status-item {
          background: rgba(0, 0, 0, 0.25);
          border-radius: var(--radius-sm);
          padding: 6px 8px;
          text-align: center;
        }
        .status-key {
          display: block;
          font-size: 10px;
          color: var(--text-muted);
        }
        .status-val {
          display: block;
          font-size: 12px;
          font-weight: 500;
          color: var(--text-primary);
          margin-top: 2px;
        }

        .platform-switch {
          display: flex;
          gap: 4px;
          background: rgba(0, 0, 0, 0.3);
          border-radius: var(--radius-sm);
          padding: 3px;
        }
        .platform-btn {
          flex: 1;
          padding: 8px;
          border: none;
          border-radius: 6px;
          background: transparent;
          color: var(--text-secondary);
          cursor: pointer;
          font-size: 13px;
          transition: var(--transition);
        }
        .platform-btn.active {
          background: linear-gradient(135deg, rgba(0, 229, 255, 0.15), rgba(168, 85, 247, 0.15));
          color: var(--accent-cyan);
          box-shadow: inset 0 0 0 1px var(--border-glow);
        }

        .room-input {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid var(--border-glass);
          border-radius: var(--radius-sm);
          background: rgba(0, 0, 0, 0.3);
          color: var(--text-primary);
          font-size: 13px;
          outline: none;
          transition: var(--transition);
        }
        .room-input:focus {
          border-color: var(--accent-cyan);
          box-shadow: 0 0 0 2px rgba(0, 229, 255, 0.1);
        }

        .action-row {
          display: flex;
          gap: 8px;
        }
        .action-btn {
          flex: 1;
          padding: 8px;
          border: none;
          border-radius: var(--radius-sm);
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
          transition: var(--transition);
        }
        .action-btn.primary {
          background: linear-gradient(135deg, var(--accent-cyan), var(--accent-blue));
          color: #001020;
        }
        .action-btn.primary:hover:not(:disabled) {
          box-shadow: var(--glow-cyan);
        }
        .action-btn.primary:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .action-btn.danger {
          background: rgba(239, 68, 68, 0.15);
          color: var(--accent-red);
          border: 1px solid rgba(239, 68, 68, 0.3);
        }
        .action-btn.danger:hover:not(:disabled) {
          background: rgba(239, 68, 68, 0.25);
        }
        .action-btn.danger:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        .record-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          padding: 12px;
          border: 1px solid var(--border-glow);
          border-radius: var(--radius-sm);
          background: rgba(0, 229, 255, 0.05);
          color: var(--accent-cyan);
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: var(--transition);
        }
        .record-btn:hover {
          background: rgba(0, 229, 255, 0.1);
          box-shadow: var(--glow-cyan);
        }
        .record-btn.recording {
          background: rgba(239, 68, 68, 0.1);
          border-color: rgba(239, 68, 68, 0.3);
          color: var(--accent-red);
        }
        .record-btn.recording .rec-dot {
          background: var(--accent-red);
          box-shadow: 0 0 8px var(--accent-red);
          animation: pulse-glow 1s ease-in-out infinite;
        }
        .rec-dot {
          width: 10px; height: 10px;
          border-radius: 50%;
          background: var(--accent-cyan);
          box-shadow: 0 0 8px var(--accent-cyan);
        }

        /* 内容区 */
        .content-area {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 8px;
          overflow: hidden;
        }
        .tab-nav {
          display: flex;
          gap: 4px;
          padding: 0 4px;
        }
        .tab-btn {
          padding: 8px 16px;
          border: none;
          border-radius: var(--radius-sm) var(--radius-sm) 0 0;
          background: transparent;
          color: var(--text-secondary);
          cursor: pointer;
          font-size: 13px;
          position: relative;
          transition: var(--transition);
        }
        .tab-btn:hover {
          color: var(--text-primary);
        }
        .tab-btn.active {
          color: var(--accent-cyan);
        }
        .tab-btn.active::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: linear-gradient(90deg, var(--accent-cyan), var(--accent-purple));
          border-radius: 2px;
        }
        .badge {
          display: inline-block;
          margin-left: 4px;
          padding: 1px 6px;
          font-size: 10px;
          background: rgba(0, 229, 255, 0.15);
          color: var(--accent-cyan);
          border-radius: 10px;
        }

        .tab-content {
          flex: 1;
          overflow: hidden;
        }

        /* 字幕历史 */
        .subtitle-history {
          height: 100%;
          display: flex;
          flex-direction: column;
          gap: 12px;
          overflow: hidden;
        }
        .current-subtitle {
          padding: 16px 20px;
          animation: slide-in-up 0.3s ease;
        }
        .sub-zh {
          font-size: 18px;
          font-weight: 500;
          color: var(--text-primary);
          margin-bottom: 8px;
        }
        .sub-vi {
          font-size: 20px;
          font-weight: 700;
          color: var(--accent-cyan);
          text-shadow: 0 0 12px rgba(0, 229, 255, 0.4);
        }
        .history-list {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .history-item {
          padding: 10px 14px;
          background: rgba(0, 0, 0, 0.2);
          border-radius: var(--radius-sm);
          border-left: 2px solid var(--accent-purple);
          animation: slide-in-up 0.2s ease;
        }
        .hist-zh {
          font-size: 13px;
          color: var(--text-secondary);
        }
        .hist-vi {
          font-size: 14px;
          color: var(--text-primary);
          margin-top: 4px;
        }
        .empty-hint {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: var(--text-muted);
          font-size: 14px;
        }

        /* 设置面板 */
        .settings-panel {
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .settings-panel h3 {
          font-size: 16px;
          color: var(--text-primary);
          margin-bottom: 8px;
        }
        .setting-row {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .setting-row label {
          font-size: 12px;
          color: var(--text-muted);
        }
        .setting-row input {
          padding: 8px 12px;
          border: 1px solid var(--border-glass);
          border-radius: var(--radius-sm);
          background: rgba(0, 0, 0, 0.3);
          color: var(--text-secondary);
          font-size: 12px;
          outline: none;
        }

        /* 语言对选择器 */
        .lang-pair-row {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .lang-select {
          flex: 1;
          padding: 6px 8px;
          border: 1px solid var(--border-glass);
          border-radius: var(--radius-sm);
          background: rgba(0, 0, 0, 0.3);
          color: var(--text-primary);
          font-size: 12px;
          outline: none;
          cursor: pointer;
          transition: var(--transition);
        }
        .lang-select:hover {
          border-color: var(--border-glow);
        }
        .lang-select:focus {
          border-color: var(--accent-cyan);
          box-shadow: 0 0 0 2px rgba(0, 229, 255, 0.1);
        }
        .lang-select:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .lang-select option {
          background: var(--bg-deep);
          color: var(--text-primary);
        }
        .swap-btn {
          width: 32px;
          height: 32px;
          border: 1px solid var(--border-glass);
          border-radius: var(--radius-sm);
          background: rgba(0, 229, 255, 0.05);
          color: var(--accent-cyan);
          cursor: pointer;
          font-size: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: var(--transition);
          flex-shrink: 0;
        }
        .swap-btn:hover:not(:disabled) {
          background: rgba(0, 229, 255, 0.15);
          box-shadow: var(--glow-cyan);
        }
        .swap-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        /* ── 版本与更新卡片（侧边栏底部） ── */
        .update-card-section {
          margin-top: auto;
          padding-top: 16px;
          border-top: 1px solid var(--border-glass);
        }
        .update-card-version {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 8px;
        }
        .update-card-app-name {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-secondary);
        }
        .update-card-version-tag {
          font-size: 11px;
          color: var(--accent-cyan);
          background: rgba(0, 229, 255, 0.1);
          border: 1px solid rgba(0, 229, 255, 0.2);
          padding: 2px 8px;
          border-radius: 6px;
          font-family: 'SF Mono', 'Consolas', monospace;
        }
        .update-card-btn {
          width: 100%;
          padding: 8px;
          border: 1px solid var(--border-glow);
          border-radius: var(--radius-sm);
          background: rgba(0, 229, 255, 0.05);
          color: var(--accent-cyan);
          cursor: pointer;
          font-size: 12px;
          font-weight: 500;
          transition: var(--transition);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }
        .update-card-btn:hover:not(:disabled) {
          background: rgba(0, 229, 255, 0.12);
          box-shadow: var(--glow-cyan);
        }
        .update-card-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .update-card-btn-sm {
          padding: 3px 10px;
          border: 1px solid var(--border-glass);
          border-radius: 4px;
          background: rgba(0, 0, 0, 0.2);
          color: var(--text-secondary);
          cursor: pointer;
          font-size: 11px;
          transition: var(--transition);
        }
        .update-card-btn-sm:hover {
          background: var(--bg-glass-hover);
          color: var(--text-primary);
        }
        .update-card-btn-restart {
          animation: pulse-glow 2s ease-in-out infinite;
        }
        .update-card-info {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: var(--text-secondary);
          flex-wrap: wrap;
        }
        .update-card-available {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .update-card-available-header {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          color: var(--accent-green);
        }
        .update-card-download {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .update-card-download-header {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          color: var(--text-primary);
        }
        .update-card-speed {
          color: var(--accent-cyan);
          font-family: 'SF Mono', 'Consolas', monospace;
        }
        .update-card-progress-bar {
          height: 4px;
          background: rgba(0, 0, 0, 0.3);
          border-radius: 2px;
          overflow: hidden;
        }
        .update-card-progress-fill {
          height: 100%;
          background: linear-gradient(90deg, var(--accent-cyan), var(--accent-green));
          border-radius: 2px;
          transition: width 0.3s ease;
        }
        .update-card-downloaded {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .update-card-downloaded-header {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          color: var(--accent-green);
        }
        .update-card-error {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          color: var(--accent-red);
          flex-wrap: wrap;
        }
        .update-card-icon {
          font-size: 14px;
          flex-shrink: 0;
        }
        .update-card-spinner {
          width: 12px;
          height: 12px;
          border: 2px solid rgba(0, 16, 32, 0.3);
          border-top-color: var(--accent-cyan);
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }
      `}</style>
    </div>
  )
}
