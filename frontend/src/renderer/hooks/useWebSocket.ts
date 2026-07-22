/**
 * 后端 WebSocket 通信 Hook
 * 管理弹幕流 /ws/stream 和音频同传 /ws/audio
 */
import { useEffect, useRef, useState, useCallback } from 'react'

const BACKEND_URL = 'ws://localhost:8000'

/** 弹幕/礼物/系统消息 */
export interface StreamMessage {
  type: string
  user: string
  text: string
  platform: string
  language?: string
  translated_text?: string
  gift_name?: string
  gift_count?: number
  social_type?: string
  room_id?: string
  timestamp?: number
  message?: string
  viewer_count?: number
}

/** 音频同传结果 */
export interface AudioTranscription {
  type: 'audio_transcription'
  transcription: {
    text: string
    language: string
    confidence: number
  }
  translation: {
    text: string
    source_language: string
    target_language: string
  }
}

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

// ── 全局回调 ───────────────────────────────────────────────
let onLanguageChangedCallback: ((srcLang: string, tgtLang: string) => void) | null = null
let onVoiceChangedCallback: ((voiceId: string) => void) | null = null

export function setLanguageChangedListener(cb: (srcLang: string, tgtLang: string) => void) {
  onLanguageChangedCallback = cb
}

export function setVoiceChangedListener(cb: (voiceId: string) => void) {
  onVoiceChangedCallback = cb
}

export function useStreamWebSocket() {
  const [messages, setMessages] = useState<StreamMessage[]>([])
  const [status, setStatus] = useState<ConnectionStatus>('disconnected')
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<number>()

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    setStatus('connecting')
    const ws = new WebSocket(`${BACKEND_URL}/ws/stream`)

    ws.onopen = () => {
      setStatus('connected')
      console.log('[Stream WS] 已连接')
    }

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data)

        // 监听后端广播的音色/语言变更通知
        if (parsed.type === 'language_changed' || parsed.type === 'language_switched') {
          if (onLanguageChangedCallback) {
            onLanguageChangedCallback(parsed.src_lang, parsed.tgt_lang)
          }
        }
        if (parsed.type === 'voice_changed') {
          if (onVoiceChangedCallback) {
            onVoiceChangedCallback(parsed.voice_id)
          }
        }

        // 其他消息按 StreamMessage 处理
        const msg: StreamMessage = parsed
        setMessages((prev) => [...prev.slice(-200), msg])
      } catch (e) {
        console.error('[Stream WS] 解析失败:', e)
      }
    }

    ws.onclose = () => {
      setStatus('disconnected')
      console.log('[Stream WS] 断开，3s 后重连')
      reconnectTimer.current = window.setTimeout(connect, 3000)
    }

    ws.onerror = (e) => {
      console.error('[Stream WS] 错误:', e)
      ws.close()
    }

    wsRef.current = ws
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
      clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [connect])

  return { messages, status, send, clearMessages }
}

export function useAudioWebSocket(deviceId?: number | null) {
  const [transcription, setTranscription] = useState<AudioTranscription | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [history, setHistory] = useState<AudioTranscription[]>([])
  const wsRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)

  // deviceId 变化时，如果正在录音，自动重启
  const deviceIdRef = useRef<number | null | undefined>(deviceId)
  useEffect(() => {
    deviceIdRef.current = deviceId
    if (isRecording) {
      stopRecording()
      // 给一个短延迟让旧流完全释放
      const timer = setTimeout(() => startRecording(), 200)
      return () => clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId])

  const startRecording = useCallback(async () => {
    try {
      // 构建音频约束：支持指定设备 ID
      const audioConstraints: MediaTrackConstraints = {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      }
      
      const currentDeviceId = deviceIdRef.current
      if (currentDeviceId != null && currentDeviceId >= 0) {
        // 通过 deviceId 精确选择设备（Web Audio API 标准约束）
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

      const ws = new WebSocket(`${BACKEND_URL}/ws/audio`)
      ws.binaryType = 'arraybuffer'

      ws.onopen = () => {
        console.log('[Audio WS] 已连接')
        setIsRecording(true)
      }

      ws.onmessage = (event) => {
        try {
          const data: AudioTranscription = JSON.parse(event.data)
          if (data.type === 'audio_transcription') {
            setTranscription(data)
            setHistory((prev) => [...prev.slice(-50), data])
          }
        } catch (e) {
          console.error('[Audio WS] 解析失败:', e)
        }
      }

      ws.onclose = () => {
        console.log('[Audio WS] 断开')
        setIsRecording(false)
      }

      ws.onerror = (e) => {
        console.error('[Audio WS] 错误:', e)
        setIsRecording(false)
      }

      wsRef.current = ws

      processor.onaudioprocess = (e) => {
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
  }, [])

  const stopRecording = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    setIsRecording(false)
  }, [])

  useEffect(() => {
    return () => stopRecording()
  }, [stopRecording])

  return {
    transcription,
    history,
    isRecording,
    startRecording,
    stopRecording,
  }
}
