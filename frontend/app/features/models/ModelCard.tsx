import { Download, Trash2, Check, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ModelSpec } from './model-catalog'
import type { DownloadState } from './useModelDownloads'

function fmtSize(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`
}

function fmtSpeed(kbs: number): string {
  return kbs >= 1024 ? `${(kbs / 1024).toFixed(1)} MB/s` : `${kbs} KB/s`
}

interface ModelCardProps {
  model: ModelSpec
  ready: boolean
  localBytes: number
  download?: DownloadState
  onDownload: () => void
  onCancel: () => void
  onDelete: () => void
  /** 设为当前：仅对 ASR 组暴露（决定 Whisper 档位），由父层控制 */
  showSetCurrent?: boolean
  isCurrent?: boolean
  onSetCurrent?: () => void
}

export default function ModelCard({
  model,
  ready,
  download,
  onDownload,
  onCancel,
  onDelete,
  showSetCurrent,
  isCurrent,
  onSetCurrent,
}: ModelCardProps) {
  const dl = download
  const isDownloading = dl?.status === 'downloading'

  return (
    <div
      className={cn(
        'group rounded-xl border border-border bg-card p-4 transition-colors',
        isCurrent && 'border-brand/40 bg-brand-soft/40',
      )}
    >
      {/* 左侧：名称 + 详情 */}
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-foreground">{model.name}</span>
            {isCurrent && (
              <span className="shrink-0 rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-medium text-brand">
                当前使用
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{model.note}</p>
        </div>

        {/* 右侧：状态与操作 */}
        <div className="flex shrink-0 items-center gap-2">
          {/* 未下载 */}
          {!ready && !isDownloading && (
            <button
              onClick={onDownload}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-xs font-medium text-white transition-all duration-150 hover:bg-indigo-500 active:scale-[0.98]"
            >
              <Download className="h-3.5 w-3.5" />
              下载
            </button>
          )}

          {/* 下载中 */}
          {isDownloading && dl && (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
              <span className="text-xs tabular-nums text-muted-foreground">
                {dl.percent}% · {fmtSpeed(dl.speedKBs)}
              </span>
              <button
                onClick={onCancel}
                title="取消下载"
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-[0.98]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* 下载错误 */}
          {dl?.status === 'error' && (
            <span className="max-w-[10rem] truncate text-[11px] text-destructive" title={dl.error}>
              {dl.error ?? '下载失败'}
            </span>
          )}

          {/* 已就绪 */}
          {ready && !isDownloading && (
            <div className="flex items-center gap-2">
              {showSetCurrent && (
                <button
                  onClick={onSetCurrent}
                  disabled={isCurrent}
                  className={cn(
                    'flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-all duration-150 active:scale-[0.98]',
                    isCurrent
                      ? 'border-brand/40 bg-brand-soft text-brand'
                      : 'border-border text-foreground hover:bg-accent disabled:opacity-40',
                  )}
                >
                  {isCurrent ? '使用中' : '设为当前'}
                </button>
              )}
              <button
                onClick={onDelete}
                title="删除本地模型"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive active:scale-[0.98]"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 体积徽标：未下载显示大小，已下载显示本地实占 */}
      <div className="mt-3 flex items-center gap-2">
        <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] tabular-nums text-muted-foreground">
          {fmtSize(model.sizeMB)}
        </span>
        {ready && <Check className="h-3.5 w-3.5 text-success" />}
        {ready && <span className="text-[11px] font-medium text-success">已就绪</span>}
      </div>

      {/* 进度条：下载中显示 */}
      {isDownloading && dl && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-indigo-500 transition-all duration-200"
            style={{ width: `${dl.percent}%` }}
          />
        </div>
      )}
    </div>
  )
}
