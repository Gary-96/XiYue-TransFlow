/**
 * useDashboardLogic — Dashboard 业务逻辑 Hook
 * 持有全部状态与副作用：弹幕流 / 音频同传 / 平台控制 / 语言配置 / 后端生命周期 / 窗口与快捷操作
 * Dashboard.tsx 只做布局调度，业务通信链路在此完整收敛
 */
import { useState, useEffect } from 'react'
import {
  useStreamWebSocket,
  useAudioWebSocket,
  useLanguageChangeListener,
} from '../../hooks/useWebSocket'
import { usePlatform } from '../../hooks/usePlatform'
import { API_BASE } from '../../services/api'
import type { LangOption } from './TopHeader'

export type Platform = 'tiktok' | 'douyin'
export type ActiveTab = 'danmaku' | 'subtitle' | 'audio' | 'settings' | 'about'

const electron = window.electronAPI

export function useDashboardLogic() {
  // ── 标签 / 平台 / 窗口状态 ──
  const [activeTab, setActiveTab] = useState<ActiveTab>('danmaku')
  const [platform, setPlatform] = useState<Platform>('douyin')
  const [roomId, setRoomId] = useState('')
  const [isPinned, setIsPinned] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [appVersion, setAppVersion] = useState<string>('加载中...')
  const [backendReady, setBackendReady] = useState(false)
  const [backendFailed, setBackendFailed] = useState(false)
  const [backendPort] = useState<number>(15387)

  // ── 弹幕流 + 音频同传 ──
  const { messages, status: wsStatus, clearMessages } = useStreamWebSocket()
  const [micInputId, setMicInputId] = useState<number | null>(null)
  const [remoteInputId, setRemoteInputId] = useState<number | null>(null)
  const [spectrumData, setSpectrumData] = useState<number[]>([])
  const {
    transcription, history, isRecording, ttsEnabled,
    startRecording, stopRecording, toggleTTSEnabled, getTTSStatus, setSpectrumCallback,
  } = useAudioWebSocket(micInputId, remoteInputId)

  // ── 平台控制 + 语言配置 ──
  const { status, switchPlatform, stopPlatform, fetchStatus, checkHealth } = usePlatform()
  const [srcLang, setSrcLang] = useState('zh')
  const [tgtLang, setTgtLang] = useState('vi')
  const [langSwitching, setLangSwitching] = useState(false)
  const [supportedLangs, setSupportedLangs] = useState<LangOption[]>([])

  // ── 初始化：版本 / 频谱回调 / 语言配置 / TTS 状态 ──
  useEffect(() => {
    electron?.getAppVersion?.().then((v: string) => setAppVersion(v || '0.2.0')).catch(() => setAppVersion('0.2.0'))
    setSpectrumCallback((data: number[]) => setSpectrumData([...data]))
    fetch(`${API_BASE}/api/language/get`).then((res) => res.json()).then((data) => {
      if (data.src_lang) setSrcLang(data.src_lang)
      if (data.tgt_lang) setTgtLang(data.tgt_lang)
      if (data.available_languages) {
        setSupportedLangs(Object.entries(data.available_languages)
          .filter(([k]) => k !== 'auto')
          .map(([code, v]) => ({ code, label: (v as { label: string }).label, icon: (v as { icon: string }).icon })))
      }
    }).catch(() => {})
    getTTSStatus().catch(() => {})
  }, [setSpectrumCallback, getTTSStatus])

  // ── 后端语言变更监听 ──
  useLanguageChangeListener((src, tgt) => { setSrcLang(src); setTgtLang(tgt) })

  // ── 后端生命周期监听 ──
  useEffect(() => {
    const ready = () => setBackendReady(true)
    const failed = () => setBackendFailed(true)
    electron?.on?.('backend:ready', ready)
    electron?.on?.('backend:failed', failed)
    electron?.on?.('backend:crashed', failed)
    return () => {
      electron?.removeListener?.('backend:ready', ready)
      electron?.removeListener?.('backend:failed', failed)
      electron?.removeListener?.('backend:crashed', failed)
    }
  }, [])

  // ── 健康检查轮询 (5s) ──
  useEffect(() => {
    const timer = setInterval(() => { checkHealth().then((h) => { if (h) fetchStatus() }) }, 5000)
    return () => clearInterval(timer)
  }, [checkHealth, fetchStatus])

  // ── 音频设备配置加载 ──
  useEffect(() => {
    fetch(`${API_BASE}/api/audio/devices`).then((res) => res.json()).then((data) => {
      if (data.inputs && data.outputs) {
        fetch(`${API_BASE}/api/config/`).then((r) => r.json()).then((cfg) => {
          if (cfg.status === 'success' && cfg.data?.audio_devices) {
            setMicInputId(cfg.data.audio_devices.mic_input ?? null)
            setRemoteInputId(cfg.data.audio_devices.remote_input ?? null)
          }
        }).catch(() => {})
      }
    }).catch(() => {})
  }, [])

  // ── 语言操作 ──
  const handleSetLanguage = async (src: string, tgt: string) => {
    if (src === tgt) return
    setLangSwitching(true)
    try {
      const opts = { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ src_lang: src, tgt_lang: tgt }) }
      await fetch(`${API_BASE}/api/language/set`, opts)
      setSrcLang(src)
      setTgtLang(tgt)
    } catch (e) { console.error('Language switch failed:', e) } finally { setLangSwitching(false) }
  }

  const handleSwapLanguage = async () => {
    setLangSwitching(true)
    try {
      const data = await fetch(`${API_BASE}/api/language/switch`, { method: 'POST' }).then((r) => r.json())
      if (data.status === 'success') { setSrcLang(data.src_lang); setTgtLang(data.tgt_lang) }
    } catch (e) { console.error('Language swap failed:', e) } finally { setLangSwitching(false) }
  }

  // ── 平台连接 / 断开 ──
  const platformActive = status?.active_platform != null
  const handleToggleConnection = async () => {
    if (platformActive) { await stopPlatform(); return }
    if (!roomId.trim()) return
    setIsConnecting(true)
    try {
      await switchPlatform(platform, roomId.trim())
    } finally {
      setIsConnecting(false)
    }
  }

  // ── 窗口控制 + 快捷操作 ──
  const handleTogglePin = async () => { setIsPinned(!!(await electron?.toggleAlwaysOnTop?.())) }
  const handleMinimize = () => electron?.minimize?.()
  const handleClose = () => electron?.close?.()

  const handleCopyMachineCode = async () => {
    try {
      const id = await electron?.getMachineId?.()
      if (id) await navigator.clipboard.writeText(id)
    } catch (e) { console.error('Copy machine code failed:', e) }
  }

  return {
    activeTab, setActiveTab,
    platform, setPlatform,
    roomId, setRoomId,
    isPinned, isConnecting,
    appVersion,
    backendReady, backendFailed, backendPort,
    messages, wsStatus, clearMessages,
    transcription, history, isRecording, ttsEnabled,
    startRecording, stopRecording, toggleTTSEnabled,
    spectrumData, supportedLangs,
    srcLang, tgtLang, langSwitching,
    platformActive,
    handleSetLanguage, handleSwapLanguage,
    handleToggleConnection,
    handleTogglePin, handleMinimize, handleClose,
    handleCopyMachineCode,
  }
}
