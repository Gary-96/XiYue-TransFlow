import { useCallback, useRef, useState } from 'react'
import { conveyor } from '@/conveyor/client'
import type { ModelSpec, ModelDownloadChunk } from './model-catalog'

export interface DownloadState {
  id: string
  status: 'idle' | 'downloading' | 'done' | 'error'
  received: number
  total: number
  percent: number
  speedKBs: number
  error?: string
}

/** 以模型目录为单位：本地文件扫描（就绪判定）+ 下载进度状态机。 */
export function useModelDownloads(dir: string, models: ModelSpec[]) {
  const [ready, setReady] = useState<Record<string, boolean>>({})
  const [bytes, setBytes] = useState<Record<string, number>>({})
  const [downloads, setDownloads] = useState<Record<string, DownloadState>>({})
  const [scanning, setScanning] = useState(false)
  const iterators = useRef<Record<string, AsyncIterator<ModelDownloadChunk>>>({})
  const files = useRef(models.map((m) => m.file))

  /** 扫描模型目录，刷新每个 file 的就绪状态。 */
  const rescan = useCallback(async () => {
    if (!dir) return
    setScanning(true)
    try {
      const res = await conveyor.models.scanDir({ dir, files: files.current })
      const r: Record<string, boolean> = {}
      const b: Record<string, number> = {}
      for (const f of files.current) {
        r[f] = res.files[f]?.exists ?? false
        b[f] = res.files[f]?.bytes ?? 0
      }
      setReady(r)
      setBytes(b)
    } catch {
      /* 目录不可读时保持原状 */
    } finally {
      setScanning(false)
    }
  }, [dir])

  /** 启动单个模型下载，进度随 chunk 更新，完成即重扫。 */
  const startDownload = useCallback(
    async (model: ModelSpec) => {
      const expected = Math.round(model.sizeMB * 1024 * 1024)
      setDownloads((s) => ({
        ...s,
        [model.id]: {
          id: model.id,
          status: 'downloading',
          received: 0,
          total: expected,
          percent: 0,
          speedKBs: 0,
        },
      }))
      const iterable = conveyor.models.downloadModel({
        dir,
        file: model.file,
        url: model.url,
        total: expected,
      })
      const it = iterable[Symbol.asyncIterator]()
      iterators.current[model.id] = it
      try {
        for (;;) {
          const { value, done } = await it.next()
          if (done) break
          if (value.kind === 'progress') {
            setDownloads((s) => ({
              ...s,
              [model.id]: {
                ...(s[model.id] as DownloadState),
                status: 'downloading',
                received: value.received,
                total: value.total || expected,
                percent: value.percent,
                speedKBs: value.speedKBs,
              },
            }))
          } else if (value.kind === 'done') {
            setDownloads((s) => ({
              ...s,
              [model.id]: {
                ...(s[model.id] as DownloadState),
                status: 'done',
                percent: 100,
              },
            }))
            await rescan()
          } else {
            setDownloads((s) => ({
              ...s,
              [model.id]: {
                ...(s[model.id] as DownloadState),
                status: 'error',
                error: value.message,
              },
            }))
          }
        }
      } catch (e) {
        setDownloads((s) => ({
          ...s,
          [model.id]: {
            ...(s[model.id] as DownloadState),
            status: 'error',
            error: (e as Error).message,
          },
        }))
      } finally {
        delete iterators.current[model.id]
      }
    },
    [dir, rescan],
  )

  /** 取消下载：abort 主进程生成器（清理临时文件）并重置该卡状态。 */
  const cancelDownload = useCallback((id: string) => {
    const it = iterators.current[id]
    if (it) void it.return?.(void 0)
    setDownloads((s) => {
      const prev = s[id]
      if (!prev) return s
      return { ...s, [id]: { ...prev, status: 'idle', percent: 0, speedKBs: 0 } }
    })
  }, [])

  /** 删除已下载的本地模型文件，随后重扫。 */
  const deleteModel = useCallback(
    async (model: ModelSpec) => {
      try {
        await conveyor.models.deleteModel({ dir, file: model.file })
      } finally {
        setDownloads((s) => {
          const prev = s[model.id]
          return { ...s, [model.id]: { ...prev, status: 'idle', percent: 0 } }
        })
        await rescan()
      }
    },
    [dir, rescan],
  )

  return { ready, bytes, downloads, scanning, rescan, startDownload, cancelDownload, deleteModel }
}
