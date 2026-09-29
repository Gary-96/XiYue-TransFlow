/**
 * 音频频谱可视化组件
 * Voicebox 风格 — 极细动态立柱频谱
 */
import { useEffect, useRef, useState, useCallback } from 'react'

const BAND_COUNT = 20
const ATTACK = 0.55
const DECAY = 0.22
const PEAK_DECAY = 0.03

interface AudioSpectrumProps {
  height?: number
  className?: string
  spectrumData?: number[]
}

export default function AudioSpectrum({
  height = 40,
  className = '',
  spectrumData,
}: AudioSpectrumProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)

  const rawRef = useRef<number[]>(new Array(BAND_COUNT).fill(0))
  const smoothRef = useRef<number[]>(new Array(BAND_COUNT).fill(0))
  const peakRef = useRef<number[]>(new Array(BAND_COUNT).fill(0))

  // 接收外部数据
  useEffect(() => {
    if (spectrumData && Array.isArray(spectrumData)) {
      for (let i = 0; i < BAND_COUNT && i < spectrumData.length; i++) {
        rawRef.current[i] = spectrumData[i] / 100
      }
    }
  }, [spectrumData])

  // Canvas 渲染
  const draw = useCallback(() => {
    animRef.current = requestAnimationFrame(draw)
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const W = canvas.width
    const H = canvas.height

    ctx.clearRect(0, 0, W, H)

    const barCount = BAND_COUNT
    const barW = 2
    const gap = 2
    const totalBarWidth = barCount * (barW + gap) - gap
    const offsetX = Math.max(0, (W - totalBarWidth) / 2)

    for (let i = 0; i < barCount; i++) {
      const target = rawRef.current[i]
      const cur = smoothRef.current[i]
      smoothRef.current[i] = cur + (target - cur) * (target > cur ? ATTACK : DECAY)

      const sv = smoothRef.current[i]
      if (sv >= peakRef.current[i]) {
        peakRef.current[i] = sv
      } else {
        peakRef.current[i] = Math.max(sv, peakRef.current[i] - PEAK_DECAY)
      }

      const x = offsetX + i * (barW + gap)
      const barH = Math.max(0, sv * H * 0.9)
      const peakH = Math.max(0, peakRef.current[i] * H * 0.9)

      // 渐变：柔和靛青系
      const freqRatio = i / (barCount - 1)
      const grad = ctx.createLinearGradient(0, H, 0, H - barH)
      if (freqRatio < 0.33) {
        grad.addColorStop(0, 'rgba(99, 102, 241, 0.55)')
        grad.addColorStop(1, 'rgba(129, 140, 248, 0.9)')
      } else if (freqRatio < 0.66) {
        grad.addColorStop(0, 'rgba(129, 140, 248, 0.55)')
        grad.addColorStop(1, 'rgba(165, 180, 252, 0.9)')
      } else {
        grad.addColorStop(0, 'rgba(165, 180, 252, 0.55)')
        grad.addColorStop(1, 'rgba(196, 181, 253, 0.9)')
      }

      ctx.fillStyle = grad
      ctx.beginPath()
      const r = Math.min(barW / 2, 1)
      const y = H - barH
      ctx.moveTo(x + r, y)
      ctx.lineTo(x + barW - r, y)
      ctx.arcTo(x + barW, y, x + barW, y + r, r)
      ctx.lineTo(x + barW, H)
      ctx.lineTo(x, H)
      ctx.lineTo(x, y + r)
      ctx.arcTo(x, y, x + r, y, r)
      ctx.closePath()
      ctx.fill()

      // 峰值亮点
      if (peakH > 2) {
        const py = H - peakH
        ctx.fillStyle = 'rgba(255,255,255,0.9)'
        ctx.fillRect(x, py - 1, barW, 1.5)
      }
    }
  }, [])

  useEffect(() => {
    draw()
    return () => cancelAnimationFrame(animRef.current)
  }, [draw])

  // 尺寸自适应
  const containerRef = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState({ w: 200, h: height })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => {
      const w = el.clientWidth
      setDims({ w: Math.max(w, 80), h: height })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [height])

  return (
    <div
      ref={containerRef}
      className={`rounded-lg overflow-hidden bg-card border border-border ${className}`}
      style={{ width: '100%', height: `${height}px` }}
    >
      <canvas
        ref={canvasRef}
        width={dims.w}
        height={dims.h}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
    </div>
  )
}
