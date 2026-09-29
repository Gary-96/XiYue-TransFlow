/**
 * 喜阅 TransFlow — WebRTC 音频设备枚举 Hook
 *
 * 对齐 Voicebox 级音频工作站标准：
 *  - 枚举前用一条临时麦克风流唤醒系统权限，确保 enumerateDevices() 能读到物理 Label；
 *  - 监听 mediaDevices.devicechange，支持专业声卡（Yamaha/Focusrite 等）、USB 麦热插即刷；
 *  - deviceId 采用 WebRTC 字符串 GUID（hash），与 useAudioWebSocket 的 exact 约束一致；
 *  - 识别"立体声混音 / Loopback"通道，便于绑定直播声卡回流。
 */
import { useCallback, useEffect, useState } from 'react'

export interface WebAudioDevice {
  /** WebRTC 字符串 GUID（hash），用于 MediaTrackConstraints.deviceId.exact */
  deviceId: string
  /** 物理设备名（无权限时回退为通用名） */
  label: string
  kind: 'audioinput' | 'audiooutput'
  groupId: string
  /** 是否为立体声混音 / Loopback 回流通道 */
  isLoopback: boolean
  /** 是否识别为专业声卡/设备 */
  isPro: boolean
}

/** Loopback / 立体声混音通道关键词（与后端 PRO_DEVICE_KEYWORDS 中回流项对齐） */
const LOOPBACK_KEYWORDS = [
  'stereo mix', 'wave out mix', 'what u hear', 'loopback',
  'cable input', 'vb-cable input', 'vb audio', 'virtual audio',
  '立体声混音', '回流',
]

/** 专业声卡 / 直播设备品牌关键词 */
const PRO_KEYWORDS = [
  'asio', 'focusrite', 'scarlett', 'clarett', 'apollo', 'yamaha',
  'rode', 'røde', 'shure', 'sm7b', 'mv7', 'audient', 'steinberg',
  'motu', 'preonus', 'behringer', 'm-audio', 'native instruments',
  'universal audio', 'rme', 'babyface', 'antelope', 'tascam', 'umc',
  'elgato', 'wave link', 'goxlr', 'tc-helicon', 'voicemeeter',
  'realtek', 'conexant', 'usb audio', 'streamcast', 'podcast',
]

function hasAny(haystack: string, needles: string[]): boolean {
  const low = haystack.toLowerCase()
  return needles.some((k) => low.includes(k))
}

/**
 * 枚举并实时跟踪 WebRTC 音频输入/输出设备。
 * 返回 inputs / outputs（已分类），以及权限状态与手动刷新方法。
 */
export function useAudioDevices() {
  const [devices, setDevices] = useState<WebAudioDevice[]>([])
  const [hasPermission, setHasPermission] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const refresh = useCallback(async () => {
    const md = navigator.mediaDevices
    if (!md) return
    setIsRefreshing(true)
    try {
      // 权限预检：临时取一条麦克风流唤醒 label 读取权限（取完立即释放）
      let probe: MediaStream | null = null
      try {
        probe = await md.getUserMedia({ audio: true })
        setHasPermission(true)
      } catch {
        setHasPermission(false)
      }

      const list = await md.enumerateDevices()
      if (probe) probe.getTracks().forEach((t) => t.stop())

      const next: WebAudioDevice[] = list
        .filter((d): d is MediaDeviceInfo => d.kind === 'audioinput' || d.kind === 'audiooutput')
        .map((d) => {
          const kind = d.kind as 'audioinput' | 'audiooutput'
          const rawLabel = d.label
          const fallback = rawLabel || `未命名${kind === 'audioinput' ? '输入' : '输出'}设备 ${d.deviceId.slice(0, 5)}`
          return {
            deviceId: d.deviceId,
            label: fallback,
            kind,
            groupId: d.groupId,
            isLoopback: hasAny(fallback, LOOPBACK_KEYWORDS),
            isPro: hasAny(fallback, PRO_KEYWORDS),
          }
        })
      setDevices(next)
    } catch (e) {
      console.warn('[AudioDevices] 枚举失败:', e)
    } finally {
      setIsRefreshing(false)
    }
  }, [])

  // 首次枚举
  useEffect(() => {
    void refresh()
  }, [refresh])

  // 热插拔：devicechange 自动刷新
  useEffect(() => {
    const md = navigator.mediaDevices
    if (!md) return
    const onChange = () => { void refresh() }
    md.addEventListener('devicechange', onChange)
    return () => md.removeEventListener('devicechange', onChange)
  }, [refresh])

  const inputs = devices.filter((d) => d.kind === 'audioinput')
  const outputs = devices.filter((d) => d.kind === 'audiooutput')

  return { devices, inputs, outputs, hasPermission, isRefreshing, refresh }
}
