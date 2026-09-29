/**
 * 喜阅 TransFlow · 跨语言智能直播同传工作台 — WebSocket 通信 Hook
 * 管理弹幕流 (/ws/stream) 和音频流 (/ws/audio)
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import type {
  AudioSpectrumData,
  AudioTranscription,
  CallSubtitle,
  ConnectionStatus,
  LanguageChangedMessage,
  StreamMessage,
  TTSStatusMessage,
  VoiceChangedMessage,
  WebSocketMessage,
} from '../types'
import { apiGet, apiPut } from '../services/api'

// ── 事件类型常量 ──────────────────────────────────────────────────

export const WS_EVENTS = {
  LANGUAGE_CHANGED: 'language_changed',
  VOICE_CHANGED: 'voice_changed',
} as const

// ── 内部事件发射器类 ──────────────────────────────────────────────

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

// ── Stream WebSocket Hook ────────────────────────────────────────

export function useStreamWebSocket() {
  const [messages, setMessages] = useState<StreamMessage[]>([])
  const [status, setStatus] = useState<ConnectionStatus>('disconnected')
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<number | null>(null)
  const retryCountRef = useRef(0)
  const MAX_RETRY_DELAY = 30000

  const eventEmitterRef = useRef<EventEmitter>(new EventEmitter())

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    if (wsRef.current) {
      wsRef.current.close()
    }

    setStatus('connecting')
    const ws = new WebSocket('ws://127.0.0.1:15387/ws/stream')
    wsRef.current = ws

    ws.onopen = () => {
      setStatus('connected')
      retryCountRef.current = 0
      console.log('[Stream WS] 已连接')
    }

    ws.onmessage = (event: MessageEvent) => {
      try {
        const parsed = JSON.parse(event.data) as WebSocketMessage

        if (parsed.type === 'language_changed' || parsed.type === 'language_switched') {
          const langMsg = parsed as LanguageChangedMessage
          eventEmitterRef.current.emit(
            WS_EVENTS.LANGUAGE_CHANGED,
            langMsg.src_lang,
            langMsg.tgt_lang
          )
        }
        if (parsed.type === 'voice_changed') {
          const voiceMsg = parsed as VoiceChangedMessage
          eventEmitterRef.current.emit(WS_EVENTS.VOICE_CHANGED, voiceMsg.voice_id)
        }

        // 弹幕消息入队
        if (
          parsed.type !== 'language_changed' &&
          parsed.type !== 'language_switched' &&
          parsed.type !== 'voice_changed' &&
          parsed.type !== 'tts_status' &&
          parsed.type !== 'audio_spectrum' &&
          parsed.type !== 'call_subtitle'
        ) {
          setMessages(prev => [...prev.slice(-200), parsed as StreamMessage])
        }
      } catch (e) {
        console.error('[Stream WS] 解析失败:', e)
      }
    }

    ws.onclose = () => {
      setStatus('disconnected')
      wsRef.current = null

      retryCountRef.current += 1
      const delay = Math.min(3000 * Math.pow(2, retryCountRef.current - 1), MAX_RETRY_DELAY)
      console.warn(`[Stream WS] 断开，${delay}ms 后重连`)

      reconnectTimerRef.current = window.setTimeout(connect, delay)
    }

    ws.onerror = (event: Event) => {
      console.error('[Stream WS] 错误:', event)
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
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      eventEmitterRef.current = new EventEmitter()
    }
  }, [connect])

  return { messages, status, send, clearMessages }
}

// ── 事件监听器 Hook ─────────────────────────────────────────────

export function useLanguageChangeListener(
  callback: (srcLang: string, tgtLang: string) => void
): void {
  const emitterRef = useRef<EventEmitter>(new EventEmitter())
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    const handler = (...args: unknown[]) => {
      const [srcLang, tgtLang] = args as [string, string]
      callback(srcLang, tgtLang)
    }
    emitterRef.current.on(WS_EVENTS.LANGUAGE_CHANGED, handler)
    return () => {
      emitterRef.current.off(WS_EVENTS.LANGUAGE_CHANGED, handler)
    }
  }, [])
}

export function useVoiceChangeListener(callback: (voiceId: string) => void): void {
  const emitterRef = useRef<EventEmitter>(new EventEmitter())

  useEffect(() => {
    const handler = (...args: unknown[]) => {
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

export function useAudioWebSocket(micDeviceId?: string | null, remoteDeviceId?: string | null) {
  const [transcription, setTranscription] = useState<AudioTranscription | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [history, setHistory] = useState<AudioTranscription[]>([])
  const [isTTSSpeaking, setIsTTSSpeaking] = useState(false)
  const [ttsEnabled, setTTSEnabled] = useState(true)
  const [ttsCurrentText, setTtsCurrentText] = useState<string>('')
  const [callHistory, setCallHistory] = useState<CallSubtitle[]>([])

  const wsRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const ttsAudioContextRef = useRef<AudioContext | null>(null)
  const currentAudioBufferRef = useRef<AudioBuffer | null>(null)
  const spectrumCallbackRef = useRef<((data: number[]) => void) | null>(null)
  const micDeviceIdRef = useRef<string | null | undefined>(micDeviceId)
  const remoteDeviceIdRef = useRef<string | null | undefined>(remoteDeviceId)

  // 设备变化时重启录音
  useEffect(() => {
    micDeviceIdRef.current = micDeviceId
    if (isRecording && micDeviceId !== undefined) {
      const timer = setTimeout(() => {
        stopRecording()
        setTimeout(() => startRecording(), 200)
      }, 100)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [micDeviceId])

  useEffect(() => {
    remoteDeviceIdRef.current = remoteDeviceId
  }, [remoteDeviceId])

  // TTS 控制
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

  // 录音控制
  const startRecording = useCallback(async () => {
    try {
      const audioConstraints: MediaTrackConstraints = {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      }

      // WebRTC 标准：deviceId 为字符串 GUID（hash），用 exact 约束精准绑定
      const currentDeviceId = micDeviceIdRef.current
      if (currentDeviceId) {
        audioConstraints.deviceId = { exact: currentDeviceId }
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints })
      streamRef.current = stream

      const audioContext = new AudioContext({ sampleRate: 16000 })
      audioContextRef.current = audioContext

      const source = audioContext.createMediaStreamSource(stream)
      const processor = audioContext.createScriptProcessor(4096, 1, 1)
      processorRef.current = processor

      const ws = new WebSocket('ws://127.0.0.1:15387/ws/audio')
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      ws.onopen = () => {
        console.log('[Audio WS] 已连接')
        setIsRecording(true)
      }

      ws.onmessage = (event: MessageEvent) => {
        if (event.data instanceof ArrayBuffer) {
          const buffered = wsRef.current?.bufferedAmount ?? 0
          if (buffered > 64 * 1024) return
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
            setHistory(prev => [...prev.slice(-50), trans])
          } else if (data.type === 'audio_spectrum' && Array.isArray((data as AudioSpectrumData).data)) {
            const spectrumData = (data as AudioSpectrumData).data
            if (spectrumCallbackRef.current) {
              spectrumCallbackRef.current(spectrumData)
            }
          } else if (data.type === 'tts_status') {
            const ttsData = data as TTSStatusMessage
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
            setCallHistory(prev => [...prev.slice(-50), subtitle])
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
    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
    }
    if (ttsAudioContextRef.current) {
      ttsAudioContextRef.current.close().catch(() => {})
      ttsAudioContextRef.current = null
    }
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    setIsRecording(false)
  }, [])

  useEffect(() => {
    return () => {
      stopRecording()
    }
  }, [stopRecording])

  // 设备热拔插监听
  useEffect(() => {
    const handleDeviceChange = async () => {
      if (!isRecording) return
      console.warn('[Audio] 设备变化，重启录音...')
      try {
        await stopRecording()
        await new Promise(r => setTimeout(r, 300))
        await startRecording()
      } catch (e) {
        console.error('[Audio] 设备变化后重启失败:', e)
      }
    }
    navigator.mediaDevices?.addEventListener('devicechange', handleDeviceChange)
    return () => {
      navigator.mediaDevices?.removeEventListener('devicechange', handleDeviceChange)
    }
  }, [isRecording, startRecording, stopRecording])

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
    callHistory,
    startRecording,
    stopRecording,
    setSpectrumCallback,
    toggleTTSEnabled,
    getTTSStatus,
  }
}
