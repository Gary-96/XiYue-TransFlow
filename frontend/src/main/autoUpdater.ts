/**
 * autoUpdater.ts — GitHub Releases 自动更新模块
 * 基于 electron-updater，封装 IPC 通信
 */
import { ipcMain, BrowserWindow, app } from 'electron'
import { autoUpdater } from 'electron-updater'
import { windowManager } from './windowManager'

// 配置：不自动下载，由用户确认后手动触发
autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = false

// 是否已通知前端"发现新版本"（避免重复通知）
let updateInfo: { version: string; releaseNotes: string | null } | null = null

function sendToRenderer(channel: string, data?: unknown): void {
  const win = windowManager.getWindows().dashboard
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, data)
  }
}

/**
 * 初始化自动更新 IPC 监听
 */
export function initAutoUpdater(): void {
  // ── 检查更新 ─────────────────────────────────
  ipcMain.handle('update:check', async () => {
    try {
      updateInfo = null
      await autoUpdater.checkForUpdates()
      return { ok: true }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      sendToRenderer('update:error', { message: msg })
      return { ok: false, error: msg }
    }
  })

  // ── 开始下载更新 ─────────────────────────────
  ipcMain.handle('update:download', async () => {
    try {
      await autoUpdater.downloadUpdate()
      return { ok: true }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      sendToRenderer('update:error', { message: msg })
      return { ok: false, error: msg }
    }
  })

  // ── 退出并安装 ───────────────────────────────
  ipcMain.handle('update:quit-and-install', () => {
    // 先停止后端进程，避免文件锁
    setImmediate(() => {
      autoUpdater.quitAndInstall()
    })
    return { ok: true }
  })

  // ── 获取当前版本 ─────────────────────────────
  ipcMain.handle('update:get-version', () => {
    return app.getVersion()
  })

  // ── electron-updater 事件转发到渲染进程 ─────

  // 发现新版本
  autoUpdater.on('update-available', (info) => {
    updateInfo = {
      version: info.version,
      releaseNotes: typeof info.releaseNotes === 'string'
        ? info.releaseNotes
        : null,
    }
    sendToRenderer('update-available', updateInfo)
  })

  // 当前已是最新版本
  autoUpdater.on('update-not-available', () => {
    sendToRenderer('update-not-available')
  })

  // 下载进度
  autoUpdater.on('download-progress', (progress) => {
    sendToRenderer('download-progress', {
      percent: Math.round(progress.percent),
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    })
  })

  // 下载完成
  autoUpdater.on('update-downloaded', () => {
    sendToRenderer('update-downloaded')
  })

  // 错误
  autoUpdater.on('error', (err) => {
    sendToRenderer('update:error', { message: err.message })
  })
}
