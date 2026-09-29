/**
 * 喜阅 TransFlow · Channel B 弹幕采集 conveyor 模块（主进程侧 IPC 面）
 *
 * 与静默视口（lib/main/sniffer.ts）配套：renderer 经
 * `conveyor.danmaku.start/stop/status` 控制隐藏视口，
 * 帧批次经 `onBatch` 事件推给全部已跟踪窗口。
 */
import { z } from 'zod'
import { createEmitter } from 'electron-conveyor/main'
import { defineModule, command, query, event } from '../init'
import { sniffer } from '@/lib/main/sniffer'
import { windows } from '@/lib/main/app'
import type { StandardDanmaku } from '@/types'

/** 与 StandardDanmaku.type（DanmakuType 联合）严格对齐的枚举值 */
const DANMAKU_TYPES = [
  'comment',
  'gift',
  'member_join',
  'social',
  'room_stats',
  'platform_connected',
  'platform_disconnected',
  'collector_started',
  'collector_stopped',
] as const

/** 批量推送的载荷 schema（dev-only 校验；type 用枚举保证与 DanmakuType 可赋值） */
const standardBatchSchema = z.array(
  z.object({
    id: z.string(),
    user: z.string(),
    text: z.string(),
    platform: z.string(),
    timestamp: z.number(),
    type: z.enum(DANMAKU_TYPES).optional(),
    channel: z.enum(['A', 'B']).optional(),
  }),
)

export const danmakuModule = defineModule({
  /** 打开静默视口并启动帧管道（重复调用会先关掉旧视口） */
  start: command(
    z.object({ url: z.string().min(1), platform: z.string().min(1) }),
    ({ input }) => {
      sniffer.open(input.url, input.platform, pushBatch)
      return sniffer.status()
    },
  ),

  /** 关闭静默视口（disconnect / quit 共用路径） */
  stop: command(() => {
    sniffer.close()
    return { closed: true }
  }),

  status: query(() => sniffer.status()),

  // main → renderer push
  onBatch: event(standardBatchSchema),
})

/**
 * 延迟创建 emitter：模块 id 由 createRouter 在注册时才分配，
 * 模块文件作用域执行时 id 尚未就绪（import 顺序问题）。
 * 目标用 `windows.broadcast()` 解析器，保持对新开窗口实时有效。
 */
let batchEmitter: { onBatch: (items: StandardDanmaku[]) => void } | null = null

function pushBatch(items: StandardDanmaku[]): void {
  // createEmitter 的 EmitTarget 需要“解析器”（函数），传 () => windows.broadcast()
  // 保持对新开窗口实时有效（broadcast() 每次调用都返回当前存活窗口列表）
  if (!batchEmitter) batchEmitter = createEmitter(danmakuModule, () => windows.broadcast())
  batchEmitter.onBatch(items)
}
