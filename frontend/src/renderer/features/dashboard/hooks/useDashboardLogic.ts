/**
 * useDashboardLogic — Dashboard 业务逻辑 Hook
 * 持有全部状态与副作用：弹幕流 / 音频同传 / 平台控制 / 语言配置 / 后端生命周期 / 窗口与快捷操作
 * Dashboard.tsx 只做布局调度，业务通信链路在此完整收敛
 */
import { useState, useEffect, useCallback } from 'react'
import {
  useStreamWebSocket,
  useAudioWebSocket,
  useLanguageChangeListener,
} from '../../../hooks/useWebSocket'
import { usePlatform } from '../../../hooks/usePlatform'
import { apiGet, apiPost, apiPut } from '../../../services/api'
import { toast } from '../../../hooks/use-toast'
import type { LangOption } from '../components/TopHeader'

export type Platform = 'tiktok' | 'douyin'
export type ActiveTab = 'danmaku' | 'subtitle' | 'audio' | 'settings' | 'about'

// 安全的 Electron API 访问
const electronAPI = window.electronAPI

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
    startRecording, stopRecording, toggleTTSEnabled, setSpectrumCallback,
  } = useAudioWebSocket(micInputId, remoteInputId)

  // ── 平台控制 + 语言配置 ──
  const { status, switchPlatform, stopPlatform, fetchStatus, checkHealth } = usePlatform()
  const [srcLang, setSrcLang] = useState('zh')
  const [tgtLang, setTgtLang] = useState('vi')
  const [langSwitching, setLangSwitching] = useState(false)
  const [supportedLangs, setSupportedLangs] = useState<LangOption[]>([])

  // ── 初始化：版本 / 频谱回调 ──
  useEffect(() => {
    // 安全访问 Electron API
    const versionPromise = Promise.resolve(electronAPI?.getAppVersion?.() ?? '0.2.0')
    setSpectrumCallback((data: number[]) => setSpectrumData([...data]))
  }, [setSpectrumCallback])

  // ── 后端就绪后拉取配置（语言 + 设备） ──
  const loadConfig = useCallback(async () => {
    try {
      const [langData, deviceData] = await Promise.all([
        apiGet<{ src_lang: string; tgt_lang: string; available_languages: Record<string, { label: string; icon: string }> }>('/api/language/get'),
        apiGet<{ inputs: Array<{ id: number; name: string }>; outputs: Array<{ id: number; name: string }> }>('/api/audio/devices'),
      ])

      if (langData?.src_lang) setSrcLang(langData.src_lang)
      if (langData?.tgt_lang) setTgtLang(langData.tgt_lang)
      if (langData?.available_languages) {
        setSupportedLangs(Object.entries(langData.available_languages)
          .filter(([k]) => k !== 'auto')
          .map(([code, v]) => ({ code, label: v.label, icon: v.icon })))
      }

      if (deviceData?.inputs && deviceData?.outputs) {
        try {
          const cfg = await apiGet<{ status: string; data?: { audio_devices?: { mic_input?: number; remote_input?: number } } }>('/api/config/')
          if (cfg?.data?.audio_devices) {
            setMicInputId(cfg.data.audio_devices.mic_input ?? null)
            setRemoteInputId(cfg.data.audio_devices.remote_input ?? null)
          }
        } catch {
          // config 接口可选，失败不影响主流程
        }
      }

    } catch {
      // 静默失败，等待后端就绪后重试
    }
  }, [])

  useEffect(() => {
    if (backendReady) {
      loadConfig()
    }
  }, [backendReady, loadConfig])

  // ── 后端语言变更监听 ──
  useLanguageChangeListener((src, tgt) => { setSrcLang(src); setTgtLang(tgt) })

  // ── 后端生命周期监听 ──
  useEffect(() => {
    const ready = () => setBackendReady(true)
    const failed = () => setBackendFailed(true)
    electronAPI?.on?.('backend:ready', ready)
    electronAPI?.on?.('backend:failed', failed)
    electronAPI?.on?.('backend:crashed', failed)
    return () => {
      electronAPI?.removeListener?.('backend:ready', ready)
      electronAPI?.removeListener?.('backend:failed', failed)
      electronAPI?.removeListener?.('backend:crashed', failed)
    }
  }, [])

  // ── 健康检查轮询 (5s) ──
  useEffect(() => {
    const timer = setInterval(() => { checkHealth().then((h) => { if (h) fetchStatus() }) }, 5000)
    return () => clearInterval(timer)
  }, [checkHealth, fetchStatus])

  // ── 音频设备配置加载（已移至 loadConfig） ──

  // ── 语言操作 ──
  const handleSetLanguage = async (src: string, tgt: string) => {
    if (src === tgt) return
    setLangSwitching(true)
    try {
      const data = await apiPut<{ status: string }>('/api/language/set', { src_lang: src, tgt_lang: tgt })
      if (data?.status === 'success') {
        setSrcLang(src)
        setTgtLang(tgt)
      }
    } catch (e) {
      console.error('[Language] switch failed:', e)
      toast({ title: '语言切换失败', variant: 'destructive', duration: 3000 })
    } finally {
      setLangSwitching(false)
    }
  }

  const handleSwapLanguage = async () => {
    setLangSwitching(true)
    try {
      const data = await apiPost<{ status: string; src_lang: string; tgt_lang: string }>('/api/language/switch')
      if (data?.status === 'success') {
        setSrcLang(data.src_lang)
        setTgtLang(data.tgt_lang)
      }
    } catch (e) {
      console.error('[Language] swap failed:', e)
      toast({ title: '语言交换失败', variant: 'destructive', duration: 3000 })
    } finally {
      setLangSwitching(false)
    }
  }

  // ── 平台连接 / 断开 ──
  const platformActive = status?.active_platform != null
  const handleToggleConnection = async () => {
    if (platformActive) { await stopPlatform(); return }
    if (!roomId.trim()) return
    setIsConnecting(true)
    try {
      await switchPlatform(platform, roomId.trim())
    } catch (e) {
      console.error('[Platform] connection failed:', e)
      toast({ title: '连接失败', variant: 'destructive', duration: 3000 })
    } finally {
      setIsConnecting(false)
    }
  }

  // ── 窗口控制 + 快捷操作 ──
  const handleTogglePin = async () => {
    try {
      const isPinned = !!(await electronAPI?.toggleAlwaysOnTop?.())
      setIsPinned(isPinned)
    } catch (e) {
      console.error('[Window] toggle pin failed:', e)
    }
  }
  const handleMinimize = () => electronAPI?.minimize?.()
  const handleClose = () => electronAPI?.close?.()

  const handleCopyMachineCode = async () => {
    try {
      const id = await electronAPI?.getMachineId?.() ?? ''
      if (id) {
        await navigator.clipboard.writeText(id)
        toast({ title: '已复制到剪贴板', duration: 2000 })
      }
    } catch (e) {
      console.error('[MachineCode] copy failed:', e)
    }
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
