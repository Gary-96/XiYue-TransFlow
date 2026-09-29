import type { CallSubtitle } from '@/types'

export interface ArchivedSession {
  id: string
  /** 归档时刻（ms） */
  archivedAt: number
  roomLabel: string
  items: CallSubtitle[]
}

const LS_KEY = 'transflow.history.sessions.v1'

export function loadSessions(): ArchivedSession[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as ArchivedSession[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveSessions(sessions: ArchivedSession[]): void {
  localStorage.setItem(LS_KEY, JSON.stringify(sessions))
}

/** 把内存字幕归档为一条历史会话（去重相同 id）。 */
export function archiveSession(items: CallSubtitle[], roomLabel: string): ArchivedSession[] {
  if (items.length === 0) return loadSessions()
  const now = Date.now()
  const session: ArchivedSession = {
    id: `s-${now}-${Math.random().toString(36).slice(2, 8)}`,
    archivedAt: now,
    roomLabel,
    items,
  }
  const next = [session, ...loadSessions()].slice(0, 50)
  saveSessions(next)
  return next
}

export function removeSession(id: string): ArchivedSession[] {
  const next = loadSessions().filter((s) => s.id !== id)
  saveSessions(next)
  return next
}

// ── 导出格式 ───────────────────────────────────────────────

/** 纯文本回放：逐行 原文 / 译文 / 说话人 + 时间。 */
export function toPlainText(s: ArchivedSession): string {
  const lines = s.items.map((it) => {
    const t = new Date(it.timestamp).toLocaleTimeString('zh-CN', { hour12: false })
    return `[${t}] ${it.speaker}\n  原文：${it.source_text}\n  译文：${it.translated_text}`
  })
  return `# 喜阅 TransFlow · 同传历史记录\n房间：${s.roomLabel}\n导出时间：${new Date(s.archivedAt).toLocaleString('zh-CN')}\n\n${lines.join('\n\n')}\n`
}

/** SRT 字幕：使用真实时间戳，基于各条字幕的 timestamp 字段。 */
export function toSrt(s: ArchivedSession): string {
  if (s.items.length === 0) return ''

  // 使用第一条字幕的时间作为基准时间
  const baseMs = s.items[0]?.timestamp ? s.items[0].timestamp * 1000 : s.archivedAt
  const perLineMs = 3000 // 每条字幕显示时长

  const lines = s.items.map((it, i) => {
    const startMs = baseMs + i * perLineMs
    const endMs = startMs + perLineMs
    return `${i + 1}\n${fmtSrtTime(startMs)} --> ${fmtSrtTime(endMs)}\n${it.translated_text || it.source_text}`
  })

  return `WEBVTT\n\n${lines.join('\n\n')}`
}

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

/** ms → SRT 时间戳 `HH:MM:SS,mmm` */
function fmtSrtTime(ms: number): string {
  const total = Math.max(0, ms)
  const h = Math.floor(total / 3_600_000)
  const m = Math.floor((total % 3_600_000) / 60_000)
  const s = Math.floor((total % 60_000) / 1000)
  const mm = total % 1000
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(mm).padStart(3, '0')}`
}
