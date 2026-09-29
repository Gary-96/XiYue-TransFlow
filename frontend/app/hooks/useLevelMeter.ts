/**
 * 喜阅 TransFlow — 硬件动态电平反馈 Hook（Voicebox 核心体验）
 *
 * 基于 AudioContext + AnalyserNode，实时把选中输入设备的电平量化成 0~1 归一值，
 * 供 UI 渲染 -60dB → 0dB 的动态条。主播无需发声测试即可判断设备是否通畅。
 *
 * 注意：浏览器侧电平仅作为"设备是否有声"的直观反馈；
 * 真正送入后端的 16k PCM 链路仍由 useAudioWebSocket 管理，二者互不干扰。
 */
import { useCallback, useEffect, useRef, useState } from 'react'

/** 把线性幅度(0~1)映射到分贝（下限 -60dB，与 Voicebox 标准一致） */
export function amplitudeToDb(amp: number): number {
  if (amp <= 0) return -60
  const db = 20 * Math.log10(amp)
  return Math.max(-60, Math.min(0, db))
}

/** 把分贝映射到 0~1（-60→0，0dB→1），用于 UI 进度条 */
export function dbToPercent(db: number): number {
  const clamped = Math.max(-60, Math.min(0, db))
  return (clamped + 60) / 60
}

export interface UseLevelMeterResult {
  /** 归一化电平 0~1（已做平滑） */
  level: number
  /** 当前分贝值（-60 ~ 0） */
  db: number
  /** 是否正在监听 */
  active: boolean
  start: () => Promise<void>
  stop: () => void
}

export function useLevelMeter(deviceId?: string | null) {
  const [level, setLevel] = useState(0)
  const [db, setDb] = useState(-60)
  const [active, setActive] = useState(false)

  const ctxRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const smoothRef = useRef(0)

  const stop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (ctxRef.current) {
      void ctxRef.current.close().catch(() => {})
      ctxRef.current = null
    }
    analyserRef.current = null
    smoothRef.current = 0
    setLevel(0)
    setDb(-60)
    setActive(false)
  }, [])

  const start = useCallback(async () => {
    stop()
    if (!navigator.mediaDevices) return

    const md = navigator.mediaDevices
    // 权限预检：临时流唤醒 label 读取（失败则静默降级为默认设备）
    try {
      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      }
      const stream = await md.getUserMedia(constraints)
      streamRef.current = stream

      const Ctx: typeof AudioContext =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new Ctx({ sampleRate: 44100 })
      ctxRef.current = ctx

      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      analyser.smoothingTimeConstant = 0.4
      source.connect(analyser)
      // 不接 destination，避免监听设备形成回声/啸叫
      analyserRef.current = analyser

      const data = new Uint8Array(analyser.fftSize)
      const tick = () => {
        const a = analyserRef.current
        if (!a) return
        a.getByteTimeDomainData(data)
        let peak = 0
        for (let i = 0; i < data.length; i++) {
          const v = Math.abs(data[i] - 128) / 128
          if (v > peak) peak = v
        }
        // 攻击快、释放慢的一阶平滑，条形更跟手
        const prev = smoothRef.current
        const alpha = peak > prev ? 0.55 : 0.12
        smoothRef.current = prev + alpha * (peak - prev)

        const lvl = smoothRef.current
        setLevel(lvl)
        setDb(amplitudeToDb(lvl))
        rafRef.current = requestAnimationFrame(tick)
      }
      setActive(true)
      rafRef.current = requestAnimationFrame(tick)
    } catch (e) {
      console.warn('[LevelMeter] 启动失败:', e)
      stop()
    }
  }, [deviceId, stop])

  // 设备变更或卸载时自动停止
  useEffect(() => {
    return stop
  }, [stop])

  return { level, db, active, start, stop }
}
