import { shell, dialog } from 'electron'
import { app } from 'electron'
import { createWriteStream } from 'node:fs'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { defineModule, query, command, stream } from '../init'
import type { ModelDownloadChunk } from '@/app/features/models/model-catalog'

/**
 * 模型管理 IPC 模块（主进程）。
 * renderer 持有模型清单（catalog），本模块只提供通用文件系统能力：
 * 存储路径读取/打开/更改/持久化、目录扫描、流式下载（进度 + 取消）、删除。
 * 下载进度通过 `stream` 的 AsyncGenerator 逐块 yield，渲染端 useStream 消费，
 * `ctx.signal`（renderer 取消）即中断 fetch。
 */

const PATHS_FILE = 'models-path.json'
const PROGRESS_INTERVAL_MS = 80

/** 已持久化的模型存储目录，缺省为应用数据目录下的 models/。 */
function defaultModelDir(): string {
  return path.join(app.getPath('userData'), 'models')
}

async function readStoredPath(): Promise<string> {
  try {
    const raw = await fs.readFile(path.join(app.getPath('userData'), PATHS_FILE), 'utf8')
    const parsed = JSON.parse(raw) as { modelsDir?: string }
    if (typeof parsed.modelsDir === 'string' && parsed.modelsDir.length > 0) return parsed.modelsDir
  } catch {
    /* 首次运行或文件损坏 → 回退默认 */
  }
  return defaultModelDir()
}

export const modelsModule = defineModule({
  /** 当前生效的模型存储目录（持久化值优先，否则默认）。 */
  getStoragePath: query(async () => readStoredPath()),

  /** 确保目录存在并返回其绝对路径。 */
  ensureDir: command(z.string().min(1), async ({ input }) => {
    await fs.mkdir(input, { recursive: true })
    return { path: input }
  }),

  /** 在系统文件管理器中打开目录（shell.openPath 在 Windows 上即资源管理器）。 */
  openDir: command(z.string().min(1), async ({ input }) => {
    await fs.mkdir(input, { recursive: true })
    const err = await shell.openPath(input)
    return { ok: err === '' }
  }),

  /** 打开目录选择对话框，允许用户自由更改存储分区。 */
  chooseDir: command(async ({ ctx }) => {
    const win = ctx.window
    const res = win
      ? await dialog.showOpenDialog(win, {
          title: '选择模型存储位置',
          properties: ['openDirectory', 'createDirectory'],
        })
      : await dialog.showOpenDialog({
          title: '选择模型存储位置',
          properties: ['openDirectory', 'createDirectory'],
        })
    const chosen = res.canceled ? null : (res.filePaths[0] ?? null)
    if (chosen) {
      await fs.mkdir(chosen, { recursive: true })
      await fs.writeFile(
        path.join(app.getPath('userData'), PATHS_FILE),
        JSON.stringify({ modelsDir: chosen }, null, 2),
        'utf8',
      )
    }
    return { path: chosen }
  }),

  /** 扫描目录中给定文件的存在性与大小，返回以 file 名为键的就绪表。 */
  scanDir: command(
    z.object({ dir: z.string().min(1), files: z.array(z.string()) }),
    async ({ input }) => {
      const dir = input.dir
      const report: Record<string, { exists: boolean; bytes: number }> = {}
      for (const file of input.files) {
        try {
          const stat = await fs.stat(path.join(dir, file))
          report[file] = { exists: true, bytes: stat.size }
        } catch {
          report[file] = { exists: false, bytes: 0 }
        }
      }
      return { dir, files: report }
    },
  ),

  /** 删除单个模型文件。 */
  deleteModel: command(
    z.object({ dir: z.string().min(1), file: z.string().min(1) }),
    async ({ input }) => {
      await fs.rm(path.join(input.dir, input.file), { force: true })
      return { ok: true }
    },
  ),

  /** 通用文本保存：弹出“另存为”对话框并写盘（用于历史导出 .txt/.srt）。 */
  saveTextFile: command(
    z.object({ fileName: z.string().min(1), content: z.string() }),
    async ({ input, ctx }) => {
      const opts = {
        title: '保存导出文件',
        defaultPath: input.fileName,
        filters: [
          { name: '文本文件', extensions: ['txt', 'srt'] },
          { name: '所有文件', extensions: ['*'] },
        ],
      }
      const res = ctx.window
        ? await dialog.showSaveDialog(ctx.window, opts)
        : await dialog.showSaveDialog(opts)
      if (res.canceled || !res.filePath) return { saved: false, path: null as string | null }
      await fs.writeFile(res.filePath, input.content, 'utf8')
      return { saved: true, path: res.filePath }
    },
  ),

  /**
   * 流式下载：逐块写入临时文件并 yield 进度。renderer 取消（stream abort）即中断。
   * 完成后把临时文件 rename 为正式文件。
   */
  downloadModel: stream(
    z.object({
      dir: z.string().min(1),
      file: z.string().min(1),
      url: z.string().url(),
      /** 预期字节数，缺省则按 Content-Length 解析，再缺省则仅显示已下载量。 */
      total: z.number().int().positive().optional(),
    }),
    async function* ({ input, signal }): AsyncGenerator<ModelDownloadChunk> {
      const target = path.join(input.dir, input.file)
      const tmp = `${target}.part`
      await fs.mkdir(input.dir, { recursive: true })

      let res: Response
      try {
        res = await fetch(input.url, { signal })
      } catch (e) {
        yield { kind: 'error', message: `网络错误：${(e as Error).message}` }
        return
      }
      if (!res.body) {
        yield { kind: 'error', message: '下载源未返回响应体' }
        return
      }

      const contentLength = Number(res.headers.get('content-length')) || input.total || 0
      const reader = res.body.getReader()
      const writer = createWriteStream(tmp)
      const startedAt = Date.now()
      let received = 0
      let lastTick = 0

      try {
        for (;;) {
          if (signal.aborted) break
          const { value, done } = await reader.read()
          if (done) break
          if (value) {
            writer.write(Buffer.from(value))
            received += value.length
            const now = Date.now()
            if (now - lastTick >= PROGRESS_INTERVAL_MS) {
              lastTick = now
              const total = contentLength > 0 ? contentLength : 0
              const percent = total > 0 ? Math.round((received / total) * 100) : 0
              const elapsedSec = Math.max((now - startedAt) / 1000, 1)
              const speedKBs = Math.round(received / 1024 / elapsedSec)
              yield { kind: 'progress', received, total, percent, speedKBs }
            }
          }
        }
      } catch (e) {
        writer.close()
        await fs.rm(tmp, { force: true }).catch(() => {})
        yield { kind: 'error', message: `下载中断：${(e as Error).message}` }
        return
      }

      await new Promise<void>((resolve) => writer.end(() => resolve()))

      if (signal.aborted) {
        await fs.rm(tmp, { force: true }).catch(() => {})
        return
      }

      await fs.rename(tmp, target)
      yield { kind: 'done', received }
    },
  ),
})
