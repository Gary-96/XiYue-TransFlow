import { useEffect, useState } from 'react'
import { FolderOpen, Pencil, RefreshCw, Boxes, Languages } from 'lucide-react'
import { conveyor } from '@/conveyor/client'
import { MODEL_CATALOG, modelsByGroup } from './model-catalog'
import { useModelDownloads } from './useModelDownloads'
import ModelCard from './ModelCard'

const LS_DIR_KEY = 'transflow.models.dir'
const LS_CURRENT_ASR = 'transflow.models.current.asr'

export default function ModelsView() {
  const [dir, setDir] = useState<string>(() => localStorage.getItem(LS_DIR_KEY) || '')
  const [currentAsr, setCurrentAsr] = useState<string>(
    () => localStorage.getItem(LS_CURRENT_ASR) || 'whisper-base',
  )
  const [busy, setBusy] = useState(false)

  const { ready, bytes, downloads, scanning, rescan, startDownload, cancelDownload, deleteModel } =
    useModelDownloads(dir, MODEL_CATALOG)

  // 首次或目录变更：先取主进程持久化路径，再扫描
  useEffect(() => {
    let cancelled = false
    const init = async () => {
      const stored = await conveyor.models.getStoragePath()
      if (cancelled) return
      setDir((prev) => prev || stored)
    }
    init()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (dir) rescan()
  }, [dir])

  const handleOpen = async () => {
    if (!dir) return
    setBusy(true)
    try {
      await conveyor.models.openDir(dir)
    } finally {
      setBusy(false)
    }
  }

  const handleChoose = async () => {
    setBusy(true)
    try {
      const res = await conveyor.models.chooseDir()
      if (res.path) {
        localStorage.setItem(LS_DIR_KEY, res.path)
        setDir(res.path)
      }
    } finally {
      setBusy(false)
    }
  }

  const handleSetCurrent = (id: string) => {
    setCurrentAsr(id)
    localStorage.setItem(LS_CURRENT_ASR, id)
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      {/* 标题区 */}
      <div>
        <h1 className="text-lg font-semibold text-foreground">模型管理</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          下载和管理用于本地离线转录与翻译合成的 AI 大模型
        </p>
      </div>

      {/* 存储路径卡片 */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          <Boxes className="h-3.5 w-3.5" />
          存储位置
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-muted px-3 py-2 text-xs text-foreground" title={dir}>
            {dir || '正在读取默认目录…'}
          </code>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={handleOpen}
              disabled={!dir || busy}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-foreground transition-all duration-150 hover:bg-accent active:scale-[0.98] disabled:opacity-40"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              打开
            </button>
            <button
              onClick={handleChoose}
              disabled={busy}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-foreground transition-all duration-150 hover:bg-accent active:scale-[0.98] disabled:opacity-40"
            >
              <Pencil className="h-3.5 w-3.5" />
              更改
            </button>
          </div>
        </div>
      </div>

      {/* 扫描状态提示 */}
      {dir && (
        <div className="flex items-center justify-between px-1">
          <p className="text-[11px] text-muted-foreground">
            {scanning ? '正在扫描本地模型文件…' : '本地模型就绪状态基于目录扫描实时刷新'}
          </p>
          <button
            onClick={() => rescan()}
            className="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <RefreshCw className={`h-3 w-3 ${scanning ? 'animate-spin' : ''}`} />
            重新扫描
          </button>
        </div>
      )}

      {/* 分组一：ASR */}
      <div className="space-y-3">
        <GroupHeading icon={<Languages className="h-4 w-4" />} title="语音识别模型 (ASR)" desc="Whisper 系列离线转录引擎" />
        <div className="space-y-2.5">
          {modelsByGroup('asr').map((m) => (
            <ModelCard
              key={m.id}
              model={m}
              ready={!!ready[m.file]}
              localBytes={bytes[m.file] ?? 0}
              download={downloads[m.id]}
              onDownload={() => startDownload(m)}
              onCancel={() => cancelDownload(m.id)}
              onDelete={() => deleteModel(m)}
              showSetCurrent
              isCurrent={currentAsr === m.id}
              onSetCurrent={() => handleSetCurrent(m.id)}
            />
          ))}
        </div>
      </div>

      {/* 分组二：MT */}
      <div className="space-y-3">
        <GroupHeading icon={<Boxes className="h-4 w-4" />} title="离线中越翻译模型 (MT)" desc="断网纯本地翻译合成" />
        <div className="space-y-2.5">
          {modelsByGroup('mt').map((m) => (
            <ModelCard
              key={m.id}
              model={m}
              ready={!!ready[m.file]}
              localBytes={bytes[m.file] ?? 0}
              download={downloads[m.id]}
              onDownload={() => startDownload(m)}
              onCancel={() => cancelDownload(m.id)}
              onDelete={() => deleteModel(m)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function GroupHeading({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      {icon}
      <h2 className="text-xs font-semibold text-foreground">{title}</h2>
      <span className="text-[10px] text-muted-foreground/70">{desc}</span>
    </div>
  )
}
