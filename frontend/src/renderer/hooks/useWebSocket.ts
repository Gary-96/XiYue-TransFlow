/**
 * 后端 WebSocket 通信 Hook
 * 管理弹幕流 /ws/stream 和音频同传 /ws/audio
 *
 * 修复内容：
 * 1. 移除全局 EventEmitter 单例，改为 hook 实例内部管理
 * 2. 消除所有 any 类型
 * 3. 完善 useEffect cleanup 防止内存泄漏
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { WS_BASE } from '../services/api'
import type {
  StreamMessage,
  AudioTranscription,
  ConnectionStatus,
  CallSubtitle,
  WebSocketMessage,
  CallDevicesResponse,
  AudioSpectrumData,
} from '../types'
import { apiPut, apiGet } from '../services/api'

// ── 内部事件发射器类（每个 hook 实例独立持有）──────────────────────────────
class EventEmitter {
  private events = new Map<string, Set<(...args: unknown[]) => void>>()

  on(event: string, callback: (...args: unknown[]) => void): void {
    this.events.get(event)?.add(callback)
  }

  off(event: string, callback: (...args: unknown[]) => void): void {
    this.events.get(event)?.delete(callback)
  }

  emit(event: string, ...args: unknown[]): void {
    this.events.get(event)?.forEach(cb => cb(...args))
  }
}

// ── 事件类型常量 ──
export const WS_EVENTS = {
  LANGUAGE_CHANGED: 'language_changed',
  VOICE_CHANGED: 'voice_changed',
} as const

// ── Stream WebSocket Hook ────────────────────────────────────────
export function useStreamWebSocket() {
  const [messages, setMessages] = useState<StreamMessage[]>([])
  const [status, setStatus] = useState<ConnectionStatus>('disconnected')
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<number | null>(null)
  const retryCountRef = useRef(0)
  const MAX_RETRY_DELAY = 30000 // 最大重连延迟 30 秒
  // 每个实例独立持有 eventEmitter，避免多窗口串台
  const eventEmitterRef = useRef<EventEmitter>(new EventEmitter())

  const connect = useCallback(() => {
    // 如果已有连接且处于打开状态，直接返回
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    // 关闭旧连接
    if (wsRef.current) {
      wsRef.current.close()
    }

    setStatus('connecting')
    const ws = new WebSocket(`${WS_BASE}/ws/stream`)
    wsRef.current = ws

    ws.onopen = () => {
      setStatus('connected')
      retryCountRef.current = 0 // 重置重试计数
      console.warn('[Stream WS] 已连接')
    }

    ws.onmessage = (event: MessageEvent) => {
      try {
        const parsed = JSON.parse(event.data) as WebSocketMessage

        // 通过事件发射器分发语言/音色变更事件
        if (parsed.type === 'language_changed' || parsed.type === 'language_switched') {
          const msg = parsed as Exclude<WebSocketMessage, CallSubtitle> & { src_lang: string; tgt_lang: string }
          eventEmitterRef.current.emit(WS_EVENTS.LANGUAGE_CHANGED, msg.src_lang, msg.tgt_lang)
        }
        if (parsed.type === 'voice_changed') {
          const msg = parsed as Exclude<WebSocketMessage, CallSubtitle> & { voice_id: string }
          eventEmitterRef.current.emit(WS_EVENTS.VOICE_CHANGED, msg.voice_id)
        }

        // 其他消息按 StreamMessage 处理
        if (parsed.type !== 'language_changed' && parsed.type !== 'language_switched' &&
          parsed.type !== 'voice_changed' && parsed.type !== 'tts_status' &&
          parsed.type !== 'audio_spectrum' && parsed.type !== 'call_subtitle') {
          setMessages((prev) => [...prev.slice(-200), parsed as StreamMessage])
        }
      } catch (e) {
        console.error('[Stream WS] 解析失败:', e)
      }
    }

    ws.onclose = () => {
      setStatus('disconnected')
      wsRef.current = null

      // 指数退避重连：初始 3s，每次翻倍，最大 30s
      retryCountRef.current += 1
      const delay = Math.min(3000 * Math.pow(2, retryCountRef.current - 1), MAX_RETRY_DELAY)
      console.warn(`[Stream WS] 断开，${delay}ms 后重连 (重试 #${retryCountRef.current})`)

      reconnectTimerRef.current = window.setTimeout(connect, delay)
    }

    ws.onerror = (event: Event) => {
      console.error('[Stream WS] 错误:', event)
      // onclose 会自动处理重连
    }
  }, [])

  const send = useCallback((data: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data))
    }
  }, [])

  const clearMessages = useCallback(() => setMessages([]), [])

  useEffect(() => {
    connect()
    return () => {
      // 清理重连定时器
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      // 关闭 WebSocket 连接
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      // 清空事件监听器，防止内存泄漏
      eventEmitterRef.current = new EventEmitter()
    }
  }, [connect])

  return { messages, status, send, clearMessages }
}

// ── 事件监听器 Hook ─────────────────────────────────────────────
/**
 * 语言变更监听器 Hook
 * @param callback - 语言变更回调函数
 */
export function useLanguageChangeListener(
  callback: (srcLang: string, tgtLang: string) => void
): void {
  // 每个 hook 实例持有独立的 EventEmitter 和监听器引用
  const emitterRef = useRef<EventEmitter>(new EventEmitter())
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    const handler: (...args: unknown[]) => void = (...args) => {
      const [srcLang, tgtLang] = args as [string, string]
      callback(srcLang, tgtLang)
    }
    emitterRef.current.on(WS_EVENTS.LANGUAGE_CHANGED, handler)
    return () => {
      emitterRef.current.off(WS_EVENTS.LANGUAGE_CHANGED, handler)
    }
  }, [])
}

/**
 * 音色变更监听器 Hook
 * @param callback - 音色变更回调函数
 */
export function useVoiceChangeListener(callback: (voiceId: string) => void): void {
  const emitterRef = useRef<EventEmitter>(new EventEmitter())

  useEffect(() => {
    const handler: (...args: unknown[]) => void = (...args) => {
      const [voiceId] = args as [string]
      callback(voiceId)
    }
    emitterRef.current.on(WS_EVENTS.VOICE_CHANGED, handler)
    return () => {
      emitterRef.current.off(WS_EVENTS.VOICE_CHANGED, handler)
    }
  }, [])
}

// ── Audio WebSocket Hook ────────────────────────────────────────
export function useAudioWebSocket(micDeviceId?: number | null, remoteDeviceId?: number | null) {
  const [transcription, setTranscription] = useState<AudioTranscription | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [history, setHistory] = useState<AudioTranscription[]>([])
  const [isTTSSpeaking, setIsTTSSpeaking] = useState(false)
  const [ttsEnabled, setTTSEnabled] = useState(true)
  const [ttsCurrentText, setTtsCurrentText] = useState<string>('')
  const wsRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const ttsAudioContextRef = useRef<AudioContext | null>(null)
  const currentAudioBufferRef = useRef<AudioBuffer | null>(null)

  // 通话同传状态
  const [callRunning, setCallRunning] = useState(false)
  const [callMode, setCallMode] = useState<'subtitle_only' | 'tts_auto'>('subtitle_only')
  const [callHistory, setCallHistory] = useState<CallSubtitle[]>([])
  const [callDevices, setCallDevices] = useState<CallDevicesResponse | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const callWsRef = useRef<WebSocket | null>(null) // 通话 WebSocket 引用（保留以备扩展）

  // 频谱数据回调
  const spectrumCallbackRef = useRef<((data: number[]) => void) | null>(null)

  // 设备 ID 引用（用于在回调中访问最新值）
  const micDeviceIdRef = useRef<number | null | undefined>(micDeviceId)
  const remoteDeviceIdRef = useRef<number | null | undefined>(remoteDeviceId)

  // 设备 ID 变化时，如果正在录音，自动重启
  useEffect(() => {
    micDeviceIdRef.current = micDeviceId
    if (isRecording) {
      // 延迟重启以避免竞态条件
      const timer = setTimeout(() => {
        stopRecording()
        setTimeout(() => startRecording(), 200)
      }, 100)
      return () => clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [micDeviceId])

  useEffect(() => {
    remoteDeviceIdRef.current = remoteDeviceId
  }, [remoteDeviceId])

  // ── TTS 控制 ──
  const toggleTTSEnabled = useCallback(async (enabled: boolean) => {
    setTTSEnabled(enabled)
    try {
      await apiPut('/api/tts/enable', { enabled })
    } catch (e) {
      console.error('TTS enable failed:', e)
    }
  }, [])

  const getTTSStatus = useCallback(async () => {
    try {
      const data = await apiGet<{ status: string; enabled: boolean }>('/api/tts/status')
      if (data?.status === 'success') {
        setTTSEnabled(data.enabled)
      }
      return data
    } catch (e) {
      console.error('TTS status failed:', e)
      return null
    }
  }, [])

  // ── 录音控制 ─────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    try {
      // 构建音频约束：支持指定设备 ID
      const audioConstraints: MediaTrackConstraints = {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      }

      const currentDeviceId = micDeviceIdRef.current
      if (currentDeviceId != null && currentDeviceId >= 0) {
        audioConstraints.deviceId = { exact: String(currentDeviceId) }
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
      })
      streamRef.current = stream

      // 使用 16kHz 采样率
      const audioContext = new AudioContext({ sampleRate: 16000 })
      audioContextRef.current = audioContext

      const source = audioContext.createMediaStreamSource(stream)

      // 使用 ScriptProcessorNode 采集 PCM
      const processor = audioContext.createScriptProcessor(4096, 1, 1)
      processorRef.current = processor

      const ws = new WebSocket(`${WS_BASE}/ws/audio`)
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      ws.onopen = () => {
        console.warn('[Audio WS] 已连接')
        setIsRecording(true)
      }

      ws.onmessage = (event: MessageEvent) => {
        // 处理二进制 TTS 音频数据
        if (event.data instanceof ArrayBuffer) {
          const buffered = wsRef.current?.bufferedAmount ?? 0
          if (buffered > 64 * 1024) return // 防堆积
          const audioCtx = ttsAudioContextRef.current || new AudioContext({ sampleRate: 24000 })
          ttsAudioContextRef.current = audioCtx
          audioCtx.decodeAudioData(event.data, (decoded) => {
            currentAudioBufferRef.current = decoded
          }).catch(() => {})
          return
        }

        try {
          const data = JSON.parse(event.data) as WebSocketMessage

          if (data.type === 'audio_transcription') {
            const trans = data as AudioTranscription
            setTranscription(trans)
            setHistory((prev) => [...prev.slice(-50), trans])
          } else if (data.type === 'audio_spectrum' && Array.isArray((data as AudioSpectrumData).data)) {
            const spectrumData = (data as AudioSpectrumData).data
            if (spectrumCallbackRef.current) {
              spectrumCallbackRef.current(spectrumData)
            }
          } else if (data.type === 'tts_status') {
            const ttsData = data as Exclude<WebSocketMessage, CallSubtitle> & { speaking: boolean; text?: string }
            setIsTTSSpeaking(ttsData.speaking)
            setTtsCurrentText(ttsData.text || '')
            if (ttsData.speaking && ttsEnabled && currentAudioBufferRef.current) {
              const ctx = ttsAudioContextRef.current || new AudioContext({ sampleRate: 24000 })
              ttsAudioContextRef.current = ctx
              const source = ctx.createBufferSource()
              source.buffer = currentAudioBufferRef.current
              source.connect(ctx.destination)
              source.start()
              source.onended = () => { currentAudioBufferRef.current = null }
            }
          } else if (data.type === 'call_subtitle') {
            const subtitle = data as CallSubtitle
            setCallHistory((prev) => [...prev.slice(-50), subtitle])
          }
        } catch (e) {
          console.error('[Audio WS] 解析失败:', e)
        }
      }

      ws.onclose = () => {
        console.warn('[Audio WS] 断开')
        setIsRecording(false)
      }

      ws.onerror = (event: Event) => {
        console.error('[Audio WS] 错误:', event)
        setIsRecording(false)
      }

      processor.onaudioprocess = (e: AudioProcessingEvent) => {
        if (ws.readyState === WebSocket.OPEN) {
          const inputData = e.inputBuffer.getChannelData(0)
          // float32 → int16 PCM
          const pcm16 = new Int16Array(inputData.length)
          for (let i = 0; i < inputData.length; i++) {
            const s = Math.max(-1, Math.min(1, inputData[i]))
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
          }
          ws.send(pcm16.buffer)
        }
      }

      source.connect(processor)
      processor.connect(audioContext.destination)

    } catch (e) {
      console.error('麦克风启动失败:', e)
      setIsRecording(false)
    }
  }, [ttsEnabled])

  const stopRecording = useCallback(() => {
    // 断开处理器
    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current = null
    }

    // 停止音频流
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }

    // 关闭音频上下文
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
    }

    // 关闭 TTS 音频上下文
    if (ttsAudioContextRef.current) {
      ttsAudioContextRef.current.close().catch(() => {})
      ttsAudioContextRef.current = null
    }

    // 关闭 WebSocket
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }

    setIsRecording(false)
  }, [])

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      stopRecording()
    }
  }, [stopRecording])

  // 注册频谱数据回调
  const setSpectrumCallback = useCallback((cb: ((data: number[]) => void) | null) => {
    spectrumCallbackRef.current = cb
  }, [])

  return {
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
  }
}
