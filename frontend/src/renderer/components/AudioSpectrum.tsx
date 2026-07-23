import { useEffect, useRef, useState, useCallback } from 'react'

/**
 * 专业级 Canvas 频谱 / 律动波形
 * — Peak Hold + Smooth Decay + 霓虹渐变配色
 * — 60FPS requestAnimationFrame 驱动
 *
 * 数据来源：后端 /ws/audio 推送的 { type: "audio_spectrum", data: [0~100, ...] }
 */

const BAND_COUNT = 20
const PEAK_HOLD_MS = 300      // 峰值滞留时间
const PEAK_FALL_SPEED = 0.15   // 峰值下落速度 (px/frame)
const DECAY_SMOOTHING = 0.25   // 柱体平滑下落系数 (越小越平滑)
const ATTACK_SMOOTHING = 0.65  // 柱体上升系数 (越大越灵敏)

// 霓虹渐变配色
const COLOR_BOTTOM = '#10B981' // 翡翠绿
const COLOR_MID = '#FBBF24'    // 金黄
const COLOR_TOP = '#EF4444'    // 霓虹红

interface PeakState {
  value: number      // 当前峰值高度 (0~1)
  holdTimer: number  // 滞留剩余帧数
}

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
  const animationRef = useRef<number>()

  // 频谱数据 (0~100) — 来自父组件（useAudioWebSocket 统一 WS 连接）
  const spectrumDataRef = useRef<number[]>(new Array(BAND_COUNT).fill(0))
  // 平滑后的当前值 (0~1) — 用于绘制
  const smoothRef = useRef<number[]>(new Array(BAND_COUNT).fill(0))
  // 峰值状态
  const peakRef = useRef<PeakState[]>(
    Array.from({ length: BAND_COUNT }, () => ({ value: 0, holdTimer: 0 }))
  )

  // ── 接收外部频谱数据 ────────────────────────────────
  useEffect(() => {
    if (spectrumData && Array.isArray(spectrumData)) {
      for (let i = 0; i < BAND_COUNT && i < spectrumData.length; i++) {
        spectrumDataRef.current[i] = spectrumData[i]
      }
    }
  }, [spectrumData])

  // ── Canvas 渲染循环 ──────────────────────────────────
  const draw = useCallback(() => {
    animationRef.current = requestAnimationFrame(draw)

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    
    const W = canvas.width
    const H = canvas.height

    // 清空画布
    ctx.clearRect(0, 0, W, H)

    const barCount = BAND_COUNT
    const gap = 2
    const barWidth = (W - gap * (barCount - 1)) / barCount

    for (let i = 0; i < barCount; i++) {
      // 目标值 (0~1)
      const target = spectrumDataRef.current[i] / 100

      // 平滑过渡：上升快，下降慢
      const current = smoothRef.current[i]
      if (target > current) {
        // Attack — 快速上升
        smoothRef.current[i] = current + (target - current) * ATTACK_SMOOTHING
      } else {
        // Decay — 平缓下落
        smoothRef.current[i] = current + (target - current) * DECAY_SMOOTHING
      }

      const value = smoothRef.current[i]
      const barHeight = Math.max(0, value * H * 0.85)

      const x = i * (barWidth + gap)
      const y = H - barHeight

      // ── 柱体渐变（翡翠绿 → 金黄 → 霓虹红）──
      const grad = ctx.createLinearGradient(0, H, 0, 0)
      grad.addColorStop(0, COLOR_BOTTOM)
      grad.addColorStop(0.5, COLOR_MID)
      grad.addColorStop(1, COLOR_TOP)

      ctx.fillStyle = grad
      // 圆角矩形
      drawRoundedRect(ctx, x, y, barWidth, barHeight, Math.min(barWidth / 2, 2))

      // ── Peak Hold（峰值滞留切线）──
      const peak = peakRef.current[i]
      if (value >= peak.value) {
        // 新峰值
        peak.value = value
        peak.holdTimer = Math.ceil(PEAK_HOLD_MS / (1000 / 60)) // 转换为帧数
      } else {
        // 滞留倒计时
        if (peak.holdTimer > 0) {
          peak.holdTimer--
        } else {
          // 重力下落
          peak.value = Math.max(value, peak.value - PEAK_FALL_SPEED / H)
        }
      }

      // 绘制峰值切线（高亮小线）
      if (peak.value > 0.02) {
        const peakY = H - peak.value * H * 0.85
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
        ctx.fillRect(x, peakY - 1, barWidth, 1.5)

        // 峰值发光效果
        ctx.shadowColor = COLOR_TOP
        ctx.shadowBlur = 4
        ctx.fillRect(x, peakY - 1, barWidth, 1.5)
        ctx.shadowBlur = 0
      }
    }

    // 底部辉光
    const glowGrad = ctx.createLinearGradient(0, H - 2, 0, H)
    glowGrad.addColorStop(0, 'rgba(16, 185, 129, 0)')
    glowGrad.addColorStop(1, 'rgba(16, 185, 129, 0.15)')
    ctx.fillStyle = glowGrad
    ctx.fillRect(0, H - 2, W, 2)
  }, [])

  // 启动渲染循环
  useEffect(() => {
    draw()
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [draw])

  // ── Canvas 尺寸自适应 ──────────────────────────────
  const [canvasSize, setCanvasSize] = useState({ w: 240, h: height })
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth
        setCanvasSize({ w: Math.max(w, 100), h: height })
      }
    }
    updateSize()
    const ro = new ResizeObserver(updateSize)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [height])

  return (
    <div ref={containerRef} className={`audio-spectrum-container ${className}`} style={{ width: '100%', height: `${height}px` }}>
      <canvas
        ref={canvasRef}
        width={canvasSize.w}
        height={canvasSize.h}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
      <style>{`
        .audio-spectrum-container {
          position: relative;
          border-radius: 6px;
          overflow: hidden;
          background: rgba(2, 6, 23, 0.4);
          border: 1px solid rgba(56, 189, 248, 0.08);
        }
      `}</style>
    </div>
  )
}

// ── 工具函数：圆角矩形 ──────────────────────────────
function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  if (h < 1) return
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + w - radius, y)
  ctx.arcTo(x + w, y, x + w, y + radius, radius)
  ctx.lineTo(x + w, y + h)
  ctx.lineTo(x, y + h)
  ctx.lineTo(x, y + radius)
  ctx.arcTo(x, y, x + radius, y, radius)
  ctx.closePath()
  ctx.fill()
}
