import { useState } from 'react'
import { History, Download, FileText, ScrollText, Trash2, PlayCircle } from 'lucide-react'
import { conveyor } from '@/conveyor/client'
import type { CallSubtitle } from '@/types'
import {
  loadSessions,
  archiveSession,
  removeSession,
  toPlainText,
  toSrt,
  type ArchivedSession,
} from './history-store'

interface HistoryViewProps {
  /** 当前内存字幕（实时导播态），用于「归档当前会话」 */
  liveItems: CallSubtitle[]
  roomLabel: string
}

export default function HistoryView({ liveItems, roomLabel }: HistoryViewProps) {
  const [sessions, setSessions] = useState<ArchivedSession[]>(() => loadSessions())
  const [openId, setOpenId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const flash = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }

  const archiveNow = () => {
    if (liveItems.length === 0) {
      flash('当前没有可归档的字幕内容')
      return
    }
    const next = archiveSession(liveItems, roomLabel)
    setSessions(next)
    setOpenId(next[0]?.id ?? null)
    flash('已归档当前会话')
  }

  const exportText = async (s: ArchivedSession) => {
    const res = await conveyor.models.saveTextFile({
      fileName: `${s.roomLabel || '同传记录'}-${s.archivedAt}.txt`,
      content: toPlainText(s),
    })
    flash(res.saved ? `已导出 ${res.path}` : '已取消导出')
  }

  const exportSrt = async (s: ArchivedSession) => {
    const res = await conveyor.models.saveTextFile({
      fileName: `${s.roomLabel || '同传记录'}-${s.archivedAt}.srt`,
      content: toSrt(s),
    })
    flash(res.saved ? `已导出 ${res.path}` : '已取消导出')
  }

  const remove = (id: string) => {
    setSessions(removeSession(id))
    if (openId === id) setOpenId(null)
  }

  const open = sessions.find((s) => s.id === openId) ?? null

  return (
    <div className="flex h-full min-h-0">
      {/* 左列：会话列表 */}
      <div className="flex w-72 shrink-0 flex-col border-r border-border bg-background">
        <div className="flex items-center justify-between gap-2 border-b border-border p-4">
          <div>
            <h1 className="text-sm font-semibold text-foreground">历史记录</h1>
            <p className="mt-0.5 text-[10px] text-muted-foreground">往期同传会话归档</p>
          </div>
          <button
            onClick={archiveNow}
            className="flex h-7 items-center gap-1.5 rounded-lg bg-indigo-600 px-2.5 text-[11px] font-medium text-white transition-all duration-150 hover:bg-indigo-500 active:scale-[0.98]"
            title="把当前实时会话归档"
          >
            <History className="h-3 w-3" />
            归档当前
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {sessions.length === 0 && (
            <div className="rounded-xl border border-dashed border-border p-4 text-center">
              <ScrollText className="mx-auto h-5 w-5 text-muted-foreground" />
              <p className="mt-2 text-[11px] text-muted-foreground">
                暂无历史会话。实时导播时点击「归档当前」即可保存回放。
              </p>
            </div>
          )}
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => setOpenId(s.id)}
              className={`flex w-full items-center gap-2.5 rounded-xl border p-3 text-left transition-colors ${
                openId === s.id
                  ? 'border-brand/40 bg-brand-soft/40'
                  : 'border-border bg-card hover:bg-accent'
              }`}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <PlayCircle className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-foreground">
                  {s.roomLabel || '未命名会话'}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(s.archivedAt).toLocaleString('zh-CN')} · {s.items.length} 条字幕
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 右列：详情回放 */}
      <div className="flex min-w-0 flex-1 flex-col bg-background">
        {open ? (
          <>
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
              <div className="min-w-0">
                <h2 className="truncate text-xs font-semibold text-foreground">
                  {open.roomLabel || '未命名会话'}
                </h2>
                <p className="text-[10px] text-muted-foreground">
                  {new Date(open.archivedAt).toLocaleString('zh-CN')} · 共 {open.items.length} 条
                </p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <ActionBtn onClick={() => exportText(open)}>
                  <FileText className="h-3.5 w-3.5" /> .txt
                </ActionBtn>
                <ActionBtn onClick={() => exportSrt(open)}>
                  <Download className="h-3.5 w-3.5" /> .srt
                </ActionBtn>
                <ActionBtn danger onClick={() => remove(open.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </ActionBtn>
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
              {open.items.map((it, i) => (
                <div key={i} className="rounded-xl border border-border bg-card p-3">
                  <div className="mb-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                    <span>{it.speaker}</span>
                    <span>
                      {new Date(it.timestamp).toLocaleTimeString('zh-CN', { hour12: false })}
                    </span>
                  </div>
                  <p className="text-xs text-foreground">{it.source_text}</p>
                  <p className="mt-1 text-xs text-brand">{it.translated_text}</p>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <ScrollText className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-2 text-xs text-muted-foreground">选择左侧会话查看文本回放</p>
            </div>
          </div>
        )}
      </div>

      {toast && (
        <div className="pointer-events-none fixed bottom-4 left-1/2 -translate-x-1/2 rounded-lg border border-border bg-popover px-3 py-2 text-xs text-foreground shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}

function ActionBtn({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium transition-all duration-150 active:scale-[0.98] ${
        danger
          ? 'border-destructive/30 text-destructive hover:bg-destructive/10'
          : 'border-border text-foreground hover:bg-accent'
      }`}
    >
      {children}
    </button>
  )
}
