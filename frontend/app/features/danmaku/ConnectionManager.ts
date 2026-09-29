/**
 * 喜阅 TransFlow · 双模弹幕采集连接管理器（renderer 侧状态机）
 *
 * 通道模型：
 *   Channel A — Python 原生协议采集（POST /api/collector/connect → /ws/stream 推送）
 *   Channel B — Electron 静默视口（conveyor.danmaku.start → WebCast WS 帧 → protobuf 解析）
 *
 * 降级策略：
 *   connect() 先尝试 Channel A；失败（403 / 签名失效 / 无鉴权）即无缝切换 B。
 *   运行期 5s 心跳看门狗：Channel A 超过 5s 无新消息自动降级 B。
 * 去重：
 *   双通道切换期存在重叠窗口，全局 200 容量 msg_id Set 做跨通道去重。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { conveyor } from '@/conveyor/client'
import { api } from '@/services/api'
import type { Platform, StandardDanmaku, StreamMessage } from '@/types'

export type Channel = 'A' | 'B'

export type DanmakuConnectionState =
  | { phase: 'idle' }
  | { phase: 'connecting'; channel: Channel }
  | { phase: 'active'; channel: Channel; degraded: boolean }
  | { phase: 'error'; channel: Channel; message: string }

/** 去重容量与心跳超时常量 */
const DEDUP_CAPACITY = 200
const HEARTBEAT_TIMEOUT_MS = 5000
const ITEMS_CAP = 200

/** 将房间标识归一化为直播间 URL（Channel B 视口加载地址） */
export function resolveRoomUrl(platform: Platform, identifier: string): string {
  const id = identifier.trim()
  if (/^https?:\/\//i.test(id)) return id
  if (platform === 'douyin') {
    const m = id.match(/(\d{6,})/)
    return m ? `https://live.douyin.com/${m[1]}` : `https://live.douyin.com/${id}`
  }
  return `https://live.tiktok.com/${id}`
}

export class DanmakuConnectionManager {
  /** 去重 Set（容量 200，FIFO 淘汰） */
  private readonly dedup = new Set<string>()
  private readonly dedupOrder: string[] = []

  /** 归一化后的最新弹幕（双通道合并、已去重，FIFO 上限 200） */
  items: StandardDanmaku[] = []

  state: DanmakuConnectionState = { phase: 'idle' }

  private aConnected = false
  private bActive = false
  private lastAActivity = 0
  private lastPlatform: Platform = 'douyin'
  private lastUrl = ''
  private watchdog: number | null = null
  private readonly listeners = new Set<() => void>()

  // ── 订阅（renderer hook 用） ────────────────────────────────────
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify(): void {
    this.listeners.forEach((fn) => fn())
  }

  private setState(next: DanmakuConnectionState): void {
    this.state = next
    this.notify()
  }

  // ── 连接 / 断开 ─────────────────────────────────────────────────
  /**
   * 连接采集：先 Channel A，失败即降级 Channel B。
   * 返回最终生效通道；双通道均失败时抛错。
   */
  async connect(platform: Platform, identifier: string): Promise<Channel> {
    this.teardownChannelB()
    this.clear()
    this.lastPlatform = platform
    this.lastUrl = resolveRoomUrl(platform, identifier)

    this.setState({ phase: 'connecting', channel: 'A' })
    try {
      const resp = await api.connectCollector(platform, identifier)
      if (resp.status !== 'success') throw new Error(resp.message ?? 'collector 连接失败')
      this.aConnected = true
      this.lastAActivity = Date.now()
      this.startWatchdog()
      this.setState({ phase: 'active', channel: 'A', degraded: false })
      return 'A'
    } catch {
      // 403 / 签名失效 / 无鉴权 → 无缝降级至静默视口
      try {
        await conveyor.danmaku.start({ url: this.lastUrl, platform })
        this.bActive = true
        this.setState({ phase: 'active', channel: 'B', degraded: true })
        return 'B'
      } catch (err) {
        this.setState({
          phase: 'error',
          channel: 'B',
          message: err instanceof Error ? err.message : '双通道均不可用',
        })
        throw err
      }
    }
  }

  /** 断开全部通道：销毁静默视口 + 停止 Python 采集线程 */
  disconnect(): void {
    void conveyor.danmaku.stop().catch(() => {})
    void api.disconnectCollector().catch(() => {})
    this.aConnected = false
    this.bActive = false
    this.stopWatchdog()
    this.clear()
    this.setState({ phase: 'idle' })
  }

  // ── 数据摄入 ────────────────────────────────────────────────────
  /** Channel A 摄入：/ws/stream 推送的弹幕（含系统消息），合成去重键 */
  feedA(messages: StreamMessage[]): void {
    if (messages.length === 0) return
    let pushed = 0
    const now = Date.now()
    for (const m of messages) {
      const id = `${m.type}|${m.user}|${m.text}`
      this.admit(id, {
        id,
        user: m.user,
        text: m.text,
        platform: this.lastPlatform,
        timestamp: m.timestamp ?? now,
        type: m.type,
        channel: 'A',
      })
      pushed += 1
    }
    if (pushed > 0) {
      this.lastAActivity = now
      if (this.aConnected && !this.bActive) this.startWatchdog()
    }
  }

  /** Channel B 摄入：主进程 WebCast 解析批次（msgId 天然去重键） */
  feedB(items: StandardDanmaku[]): void {
    for (const it of items) this.admit(it.id, { ...it, channel: 'B' })
  }

  /** 统一去重入口：200 容量 FIFO Set */
  private admit(id: string, item: StandardDanmaku): void {
    if (this.dedup.has(id)) return
    this.dedup.add(id)
    this.dedupOrder.push(id)
    if (this.dedupOrder.length > DEDUP_CAPACITY) {
      const evicted = this.dedupOrder.shift()
      if (evicted !== undefined) this.dedup.delete(evicted)
    }
    this.items = [...this.items.slice(-(ITEMS_CAP - 1)), item]
    this.notify()
  }

  private clear(): void {
    this.dedup.clear()
    this.dedupOrder.length = 0
    this.items = []
  }

  // ── 心跳看门狗：Channel A 静默 > 5s → 自动降级 B ───────────────
  private startWatchdog(): void {
    if (this.watchdog !== null) return
    this.watchdog = window.setInterval(() => {
      if (!this.aConnected || this.bActive) return
      if (Date.now() - this.lastAActivity > HEARTBEAT_TIMEOUT_MS) {
        this.aConnected = false
        this.stopWatchdog()
        void this.degradeToB()
      }
    }, 1000)
  }

  private stopWatchdog(): void {
    if (this.watchdog !== null) {
      window.clearInterval(this.watchdog)
      this.watchdog = null
    }
  }

  private async degradeToB(): Promise<void> {
    try {
      await conveyor.danmaku.start({ url: this.lastUrl, platform: this.lastPlatform })
      this.bActive = true
      this.setState({ phase: 'active', channel: 'B', degraded: true })
    } catch {
      this.setState({ phase: 'error', channel: 'A', message: '降级至安全通道失败' })
    }
  }

  private teardownChannelB(): void {
    if (this.bActive) void conveyor.danmaku.stop().catch(() => {})
    this.bActive = false
  }
}

// ── React hook 封装 ───────────────────────────────────────────────

/** 当前生效通道的展示文案（UI 用） */
export function channelLabel(state: DanmakuConnectionState): string | null {
  if (state.phase === 'connecting') return '连接中（协议通道）'
  if (state.phase !== 'active') return null
  if (state.channel === 'B') return '连接成功（安全通道）'
  return state.degraded ? '连接成功（协议通道·降级）' : '连接成功（协议通道）'
}

export function useDanmakuConnection() {
  const cmRef = useRef<DanmakuConnectionManager | null>(null)
  if (!cmRef.current) cmRef.current = new DanmakuConnectionManager()
  const cm = cmRef.current

  const [, setTick] = useState(0)
  useEffect(() => cm.subscribe(() => setTick((t) => t + 1)), [cm])

  // Channel B 批次事件（main → renderer 推送）
  conveyor.danmaku.onBatch.useEvent((items) => {
    cm.feedB(items)
  })

  const connect = useCallback(
    (platform: Platform, identifier: string) => cm.connect(platform, identifier),
    [cm],
  )
  const disconnect = useCallback(() => cm.disconnect(), [cm])
  const feedA = useCallback((messages: StreamMessage[]) => cm.feedA(messages), [cm])

  return {
    state: cm.state,
    items: cm.items,
    connect,
    disconnect,
    feedA,
    label: channelLabel(cm.state),
  }
}
