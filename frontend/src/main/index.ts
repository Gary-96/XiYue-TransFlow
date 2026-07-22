import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import { spawn, execSync, ChildProcess } from 'child_process'
import { existsSync, mkdirSync, appendFileSync } from 'fs'
import { windowManager } from './windowManager'
import net from 'net'

// ── 状态 ──────────────────────────────────────────────────────
let backendProcess: ChildProcess | null = null
let isQuitting = false
let healthCheckRetryCount = 0
const MAX_HEALTH_RETRIES = 30 // 30 × 1s = 30s 超时

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
  appendFileSync(LOG_FILE, line, 'utf-8')
  if (level === 'ERROR') {
    console.error(line.trimEnd())
  } else {
    console.log(line.trimEnd())
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
    const backendDir = join(__dirname, '..', '..', '..', 'backend')
    return {
      exe: join(backendDir, 'main_manager.py'),
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
    // tasklist + 过滤 backend_engine.exe
    const output = execSync('tasklist /FI "IMAGENAME eq backend_engine.exe" /FO CSV /NH', {
      windowsHide: true,
      timeout: 5000,
    }).toString()

    if (output.includes('backend_engine.exe')) {
      writeLog('WARN', '检测到残留 backend_engine.exe 进程，正在清理...')
      execSync('taskkill /IM backend_engine.exe /F', {
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

  // stdout
  backendProcess.stdout?.on('data', (data: Buffer) => {
    const text = data.toString().trim()
    if (text) writeLog('INFO', `[stdout] ${text}`)
  })

  // stderr — 关键：捕获错误日志
  backendProcess.stderr?.on('data', (data: Buffer) => {
    const text = data.toString().trim()
    if (text) writeLog('ERROR', `[stderr] ${text}`)
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

// ── 健康检查 ──────────────────────────────────────────────────
function checkBackendHealth(): Promise<boolean> {
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
    socket.connect(8000, '127.0.0.1')
  })
}

// ── 等待后端就绪 ──────────────────────────────────────────────
async function waitForBackendAndCreateWindow(): Promise<void> {
  // 先创建主窗口显示加载态
  windowManager.createDashboard()

  while (healthCheckRetryCount < MAX_HEALTH_RETRIES) {
    const healthy = await checkBackendHealth()
    if (healthy) {
      writeLog('INFO', `健康检查通过 (第 ${healthCheckRetryCount + 1} 次尝试)`)
      notifyRenderer('backend:ready')
      return
    }
    healthCheckRetryCount++
    writeLog('INFO', `等待中... (${healthCheckRetryCount}/${MAX_HEALTH_RETRIES})`)
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  // 超时
  const msg = `健康检查超时 (${MAX_HEALTH_RETRIES}s)，后端可能未正常启动`
  writeLog('ERROR', msg)
  notifyRenderer('backend:failed', { error: msg, logPath: LOG_FILE })
}

// ── 停止后端 ──────────────────────────────────────────────────
function stopBackend(): void {
  if (backendProcess) {
    isQuitting = true
    writeLog('INFO', `停止后端进程 (PID: ${backendProcess.pid})`)
    try {
      backendProcess.kill('SIGTERM')
    } catch {
      // 进程可能已退出
    }
    backendProcess = null
  }
}

// ── 异常退出自动重启 ──────────────────────────────────────────
function handleBackendExit(code: number | null): void {
  if (isQuitting) return

  if (code !== 0 && restartCount < MAX_RESTART_COUNT) {
    restartCount++
    healthCheckRetryCount = 0 // 重置健康检查计数器
    const delay = restartCount * 3000 // 3s, 6s, 9s
    writeLog('WARN', `${delay / 1000}秒后自动重启 (第 ${restartCount}/${MAX_RESTART_COUNT} 次)`)
    setTimeout(() => {
      if (!isQuitting) {
        startBackend()
        waitForBackendAndCreateWindow()
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

  // 2. 启动后端
  startBackend()

  // 3. 轮询等待后端就绪
  waitForBackendAndCreateWindow()

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
  BrowserWindow.getFocusedWindow()?.webContents.toggleDevTools()
})

ipcMain.handle('shell:open-external', (_event, url: string) => {
  shell.openExternal(url)
})

// 新增：打开日志文件
ipcMain.handle('backend:open-log', () => {
  shell.openPath(LOG_FILE)
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
