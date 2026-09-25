// ── 全局异常防御（必须在所有 import 之前注册）──────────────────
// EPIPE: 子进程（backend_engine.exe）退出时 stdout/stderr 管道断开,
// Node.js 默认会抛 uncaughtException → Electron 弹崩溃对话框
process.on('uncaughtException', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EPIPE') {
    // 管道断开（子进程退出导致），静默忽略
    console.warn('捕获到子进程 EPIPE 管道断开信号，已忽略')
    return
  }
  console.error('未捕获的主进程异常:', error)
})

process.on('unhandledRejection', (reason: unknown) => {
  console.error('未处理的 Promise 拒绝:', reason)
})

import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import { spawn, execSync, ChildProcess } from 'child_process'
import { existsSync, mkdirSync, appendFileSync } from 'fs'
import { windowManager } from './windowManager'
import { initAutoUpdater } from './autoUpdater'
import net from 'net'
import { machineIdSync } from 'node-machine-id'

// ── 状态 ──────────────────────────────────────────────────────
let backendProcess: ChildProcess | null = null
let isQuitting = false
let healthCheckRetryCount = 0
const MAX_HEALTH_RETRIES = 30 // 30 × 300ms = 9s 超时（后端轻量启动约 2-4s）

let restartCount = 0
const MAX_RESTART_COUNT = 3

// ── 日志文件 ──────────────────────────────────────────────────
const LOG_DIR = join(app.getPath('userData'), 'logs')
const LOG_FILE = join(LOG_DIR, 'backend.log')

function ensureLogDir(): void {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true })
  }
}

function writeLog(level: string, message: string): void {
  ensureLogDir()
  const timestamp = new Date().toISOString()
  const line = `[${timestamp}] [${level}] ${message}\n`
  try {
    appendFileSync(LOG_FILE, line, 'utf-8')
  } catch {
    // 写日志本身失败（EPIPE 等）不应崩溃
  }
  // 控制台输出包裹 try-catch，防止 EPIPE
  try {
    if (level === 'ERROR') {
      console.error(line.trimEnd())
    } else {
      console.warn(line.trimEnd())
    }
  } catch {
    // console.error/log 可能因 stdout 管道断开抛 EPIPE，忽略
  }
}

// ── 路径解析 ──────────────────────────────────────────────────
interface BackendPaths {
  exe: string
  cwd: string
  isDev: boolean
}

function getBackendPaths(): BackendPaths {
  const isDev = !app.isPackaged

  if (isDev) {
    const backendDir = join(process.resourcesPath, '..', '..', 'backend')
    return {
      exe: join(backendDir, 'main.py'),
      cwd: backendDir,
      isDev: true,
    }
  }

  // 生产环境：extraResources 映射 output/backend_engine → resourcesPath/backend_engine
  const backendDir = join(process.resourcesPath, 'backend_engine')
  return {
    exe: join(backendDir, 'backend_engine.exe'),
    cwd: backendDir,
    isDev: false,
  }
}

// ── 残留进程清理 ──────────────────────────────────────────────
function killStaleBackend(): void {
  try {
    const output = execSync('tasklist /FI "IMAGENAME eq backend_engine.exe" /FO CSV /NH', {
      windowsHide: true,
      timeout: 5000,
    }).toString()

    if (output.includes('backend_engine.exe')) {
      writeLog('WARN', '检测到残留 backend_engine.exe 进程，正在清理...')
      execSync('taskkill /IM backend_engine.exe /F /T', {
        windowsHide: true,
        timeout: 5000,
      })
      writeLog('INFO', '残留进程已清理')
    }
  } catch {
    // tasklist 找不到进程会返回非零，正常情况，忽略
  }
}

// ── 启动后端 ──────────────────────────────────────────────────
function startBackend(): void {
  const paths = getBackendPaths()

  if (!existsSync(paths.exe)) {
    const msg = `后端引擎不存在: ${paths.exe}`
    writeLog('ERROR', msg)
    notifyRenderer('backend:failed', { error: msg })
    return
  }

  if (paths.isDev) {
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3'
    writeLog('INFO', `[DEV] 启动后端: ${pythonCmd} ${paths.exe}`)
    backendProcess = spawn(pythonCmd, [paths.exe], {
      cwd: paths.cwd,
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } else {
    writeLog('INFO', `[PROD] 启动后端引擎: ${paths.exe}`)
    backendProcess = spawn(paths.exe, [], {
      cwd: paths.cwd,
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  }

  const pid = backendProcess.pid
  writeLog('INFO', `后端进程已启动 (PID: ${pid})`)

  // stdout — 包裹 try-catch 防止 EPIPE
  backendProcess.stdout?.on('data', (data: Buffer) => {
    try {
      const text = data.toString().trim()
      if (text) writeLog('INFO', `[stdout] ${text}`)
    } catch {
      // 管道断开时 toString/write 可能抛 EPIPE
    }
  })

  // stdout 管道错误事件
  backendProcess.stdout?.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code !== 'EPIPE') {
      writeLog('WARN', `stdout pipe error: ${err.message}`)
    }
  })

  // stderr — 关键：捕获错误日志，包裹 try-catch
  backendProcess.stderr?.on('data', (data: Buffer) => {
    try {
      const text = data.toString().trim()
      if (text) writeLog('ERROR', `[stderr] ${text}`)
    } catch {
      // 管道断开时忽略
    }
  })

  // stderr 管道错误事件
  backendProcess.stderr?.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code !== 'EPIPE') {
      writeLog('WARN', `stderr pipe error: ${err.message}`)
    }
  })

  backendProcess.on('exit', (code, signal) => {
    writeLog('INFO', `后端进程退出 (code=${code}, signal=${signal})`)
    backendProcess = null
    handleBackendExit(code)
  })

  backendProcess.on('error', (err) => {
    writeLog('ERROR', `后端进程 spawn 错误: ${err.message}`)
    backendProcess = null
    notifyRenderer('backend:failed', { error: err.message })
  })
}

// ── 通知渲染进程 ──────────────────────────────────────────────
function notifyRenderer(channel: string, data?: unknown): void {
  const win = windowManager.getWindows().dashboard
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, data)
  }
}

// ── 健康检查（支持动态端口）────────────────────────────────────
async function checkBackendHealth(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    socket.setTimeout(2000)
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('timeout', () => {
      socket.destroy()
      resolve(false)
    })
    socket.once('error', () => {
      socket.destroy()
      resolve(false)
    })
    socket.connect(port, '127.0.0.1')
  })
}

// ── 等待后端就绪 ──────────────────────────────────────────────
let detectedBackendPort = 15387
const BACKEND_PORT = 15387

async function waitForBackend(): Promise<void> {
  const startPort = BACKEND_PORT

  // 轮询检查端口，支持小范围偏移探测
  while (healthCheckRetryCount < MAX_HEALTH_RETRIES) {
    for (let offset = 0; offset <= 3; offset++) {
      const targetPort = startPort + offset
      const healthy = await checkBackendHealth(targetPort)
      if (healthy) {
        detectedBackendPort = targetPort
        writeLog('INFO', `健康检查通过，后端运行于端口: ${targetPort} (第 ${healthCheckRetryCount + 1} 次尝试)`)
        notifyRenderer('backend:ready', { port: detectedBackendPort })
        return
      }
    }

    healthCheckRetryCount++
    writeLog('INFO', `等待后端启动中... (${healthCheckRetryCount}/${MAX_HEALTH_RETRIES})`)
    await new Promise((resolve) => setTimeout(resolve, 300))
  }

  // 超时 — 通知前端引擎启动失败
  const msg = `健康检查超时 (${(MAX_HEALTH_RETRIES * 300) / 1000}s)，后端未正常响应`
  writeLog('ERROR', msg)
  notifyRenderer('backend:failed', { error: msg, logPath: LOG_FILE })
}

// ── 停止后端 ──────────────────────────────────────────────────
function stopBackend(): void {
  if (backendProcess && backendProcess.pid) {
    isQuitting = true
    const pid = backendProcess.pid
    writeLog('INFO', `停止后端进程 (PID: ${pid})`)
    try {
      backendProcess.stdout?.removeAllListeners()
      backendProcess.stderr?.removeAllListeners()

      if (process.platform === 'win32') {
        execSync(`taskkill /pid ${pid} /T /F`, { windowsHide: true })
      } else {
        backendProcess.kill('SIGTERM')
      }
    } catch {
      // 进程可能已提前退出
    }
    backendProcess = null
  }
}

// ── 异常退出自动重启 ──────────────────────────────────────────
function handleBackendExit(code: number | null): void {
  if (isQuitting) return

  if (code !== 0 && restartCount < MAX_RESTART_COUNT) {
    restartCount++
    healthCheckRetryCount = 0
    const delay = restartCount * 3000
    writeLog('WARN', `${delay / 1000}秒后自动重启 (第 ${restartCount}/${MAX_RESTART_COUNT} 次)`)
    setTimeout(() => {
      if (!isQuitting) {
        startBackend()
        waitForBackend()
      }
    }, delay)
  } else if (code !== 0) {
    const msg = `已达到最大重启次数 (${MAX_RESTART_COUNT})，放弃重启`
    writeLog('ERROR', msg)
    notifyRenderer('backend:crashed', { code, restartCount, logPath: LOG_FILE })
  }
}

// ── 应用入口 ──────────────────────────────────────────────────
app.whenReady().then(() => {
  writeLog('INFO', '========== 乐曼同传启动 ==========')
  writeLog('INFO', `Electron: ${app.getVersion()} | Packaged: ${app.isPackaged}`)

  // 1. 清理残留进程
  if (app.isPackaged) {
    killStaleBackend()
  }

  // 2. 立即创建窗口（单一入口，无重复创建）
  windowManager.createDashboard()

  // 3. 启动后端（后台异步拉起）
  startBackend()

  // 4. 轮询健康检查，就绪后通知渲染进程
  waitForBackend()

  // 5. 初始化自动更新
  initAutoUpdater()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      windowManager.createDashboard()
    }
  })
})

// ── IPC ───────────────────────────────────────────────────────
ipcMain.handle('window:minimize', () => {
  BrowserWindow.getFocusedWindow()?.minimize()
})

ipcMain.handle('window:close', () => {
  BrowserWindow.getFocusedWindow()?.close()
})

ipcMain.handle('window:toggle-always-on-top', () => {
  const win = BrowserWindow.getFocusedWindow()
  if (win) {
    const isPinned = win.isAlwaysOnTop()
    win.setAlwaysOnTop(!isPinned)
    return !isPinned
  }
  return false
})

ipcMain.handle('window:toggle-devtools', () => {
  if (!app.isPackaged) {
    BrowserWindow.getFocusedWindow()?.webContents.toggleDevTools()
  }
})

ipcMain.handle('shell:open-external', (_event, url: string) => {
  shell.openExternal(url)
})

// 打开日志文件
ipcMain.handle('backend:open-log', () => {
  shell.openPath(LOG_FILE)
})

// 获取后端地址（动态端口）
ipcMain.handle('backend:get-url', () => {
  return `http://127.0.0.1:${detectedBackendPort}`
})

// 获取本机机器码
ipcMain.handle('machine:get-id', () => {
  try {
    const id = machineIdSync()
    return id || 'MAC-UNKNOWN'
  } catch (e) {
    console.error('[Main] 获取机器码失败:', e)
    return 'MAC-UNKNOWN'
  }
})

// ── 生命周期 ──────────────────────────────────────────────────
app.on('window-all-closed', () => {
  stopBackend()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  stopBackend()
})