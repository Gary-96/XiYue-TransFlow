import { useEffect, useRef, useState, useCallback } from 'react'

/**
 * Voicebox 风格 — 极细动态立柱频谱
 * — 20 频段，单柱 w-1，间距 gap-1
 * — 低频靛蓝 → 高频荧光绿的渐变配色
 * — Peak Hold + Smooth Decay
 */

const BAND_COUNT = 20
const ATTACK = 0.55    // 上升灵敏度
const DECAY = 0.22     // 下降平滑度
const PEAK_DECAY = 0.03 // 峰值回落速度

export default function AudioSpectrum({
  height = 40,
  className = '',
  spectrumData,
}: {
  height?: number
  className?: string
  spectrumData?: number[]
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)

  // 原始数据 → 平滑值 → 峰值
  const rawRef = useRef<number[]>(new Array(BAND_COUNT).fill(0))
  const smoothRef = useRef<number[]>(new Array(BAND_COUNT).fill(0))
  const peakRef = useRef<number[]>(new Array(BAND_COUNT).fill(0))

  // ── 接收外部数据 ──────────────────────────────────
  useEffect(() => {
    if (spectrumData && Array.isArray(spectrumData)) {
      for (let i = 0; i < BAND_COUNT && i < spectrumData.length; i++) {
        rawRef.current[i] = spectrumData[i] / 100
      }
    }
  }, [spectrumData])

  // ── Canvas 渲染 ───────────────────────────────────
  const draw = useCallback(() => {
    animRef.current = requestAnimationFrame(draw)
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const W = canvas.width
    const H = canvas.height

    ctx.clearRect(0, 0, W, H)

    const barCount = BAND_COUNT
    // 细条：每个 bar 宽 2px，间距 2px
    const barW = 2
    const gap = 2
    const totalBarWidth = barCount * (barW + gap) - gap
    const offsetX = Math.max(0, (W - totalBarWidth) / 2)

    for (let i = 0; i < barCount; i++) {
      // 平滑过渡
      const target = rawRef.current[i]
      const cur = smoothRef.current[i]
      smoothRef.current[i] = cur + (target - cur) * (target > cur ? ATTACK : DECAY)

      // 峰值追踪
      const sv = smoothRef.current[i]
      if (sv >= peakRef.current[i]) {
        peakRef.current[i] = sv
      } else {
        peakRef.current[i] = Math.max(sv, peakRef.current[i] - PEAK_DECAY)
      }

      const x = offsetX + i * (barW + gap)
      const barH = Math.max(0, sv * H * 0.9)
      const peakH = Math.max(0, peakRef.current[i] * H * 0.9)

      // 渐变：低频靛蓝 → 中紫 → 高荧光绿
      const freqRatio = i / (barCount - 1) // 0=低, 1=高
      const grad = ctx.createLinearGradient(0, H, 0, H - barH)
      if (freqRatio < 0.33) {
        grad.addColorStop(0, '#4f46e5')  // 靛蓝
        grad.addColorStop(1, '#6366f1')  // 浅靛
      } else if (freqRatio < 0.66) {
        grad.addColorStop(0, '#7c3aed')  // 紫
        grad.addColorStop(1, '#a855f7')  // 亮紫
      } else {
        grad.addColorStop(0, '#059669')  // 深绿
        grad.addColorStop(1, '#10b981')  // 荧光绿
      }

      // 主柱
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
        ctx.fillStyle = 'rgba(255,255,255,0.8)'
        ctx.fillRect(x, py - 1, barW, 1.5)
      }
    }
  }, [])

  useEffect(() => {
    draw()
    return () => cancelAnimationFrame(animRef.current)
  }, [draw])

  // ── 尺寸自适应 ────────────────────────────────────
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
      className={`rounded-lg overflow-hidden bg-zinc-900/40 border border-zinc-800/50 ${className}`}
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
