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
import { existsSync, mkdirSync, appendFileSync, readFileSync } from 'fs'
import { windowManager } from './windowManager'
import { initAutoUpdater } from './autoUpdater'
import net from 'net'

// ── 状态 ──────────────────────────────────────────────────────
let backendProcess: ChildProcess | null = null
let isQuitting = false
let healthCheckRetryCount = 0
const MAX_HEALTH_RETRIES = 60 // 60 × 300ms = 18s 超时（后端启动需要约 8s）

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
  } catch (e) {
    // 写日志本身失败（EPIPE 等）不应崩溃
  }
  // 控制台输出包裹 try-catch，防止 EPIPE
  try {
    if (level === 'ERROR') {
      console.error(line.trimEnd())
    } else {
      console.log(line.trimEnd())
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

// ── 扫描端口获取实际端口号 ────────────────────────────────────
async function detectBackendPort(): Promise<number | null> {
  // 1. 先从磁盘配置文件读取端口（后端还没启动，API 不可用）
  const filePort = getConfigPortFromFile()
  const startPort = filePort ?? 15387
  if (filePort) {
    writeLog('INFO', `从配置文件读取到端口: ${filePort}`)
  }

  // 2. 尝试配置端口，最多偏移 10 个端口
  for (let offset = 0; offset <= 10; offset++) {
    const port = startPort + offset
    const healthy = await checkBackendHealth(port)
    if (healthy) {
      return port
    }
  }
  // 3. 扫描失败，返回配置文件端口（或默认端口），后续做健康检查轮询时会等到后端启动
  return startPort
}

// ── 获取配置中的默认端口 ────────────────────────────────────
// 先从磁盘配置文件读取（解决「先有鸡还是先有蛋」问题：后端还没启动时 API 不可用）
function getConfigPortFromFile(): number | null {
  try {
    // Windows: %APPDATA%\leman-translate\config.json
    const configPath = join(app.getPath('appData'), 'leman-translate', 'config.json')
    if (existsSync(configPath)) {
      const raw = readFileSync(configPath, 'utf-8')
      const json = JSON.parse(raw)
      if (json?.server_port && typeof json.server_port === 'number') {
        return json.server_port
      }
    }
  } catch {
    // 配置文件读取失败，忽略
  }
  return null
}

// ── 获取配置中的默认端口（从后端 API 读取，后端已启动时可用）────────
async function getConfigPort(): Promise<{ server_port: number } | null> {
  try {
    const http = await import('http')
    return new Promise((resolve) => {
      const req = http.get('http://127.0.0.1:15387/api/config', (res) => {
        let data = ''
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () => {
          try {
            const json = JSON.parse(data)
            resolve(json?.data ?? null)
          } catch {
            resolve(null)
          }
        })
      })
      req.on('error', () => resolve(null))
      req.setTimeout(2000, () => {
        req.destroy()
        resolve(null)
      })
    })
  } catch {
    return null
  }
}

// ── 等待后端就绪 ──────────────────────────────────────────────
let detectedBackendPort = 15387

async function waitForBackendAndCreateWindow(): Promise<void> {
  // 先创建主窗口显示加载态
  windowManager.createDashboard()

  // 扫描端口（后端可能还没启动，detectBackendPort 会返回配置端口用于后续轮询）
  const port = await detectBackendPort()
  if (port) {
    detectedBackendPort = port
    writeLog('INFO', `使用后端端口: ${port}（等待后端启动...）`)
  } else {
    writeLog('WARN', '端口检测失败，使用默认端口 15387')
  }

  // 尝试连接检测到的端口
  while (healthCheckRetryCount < MAX_HEALTH_RETRIES) {
    const healthy = await checkBackendHealth(detectedBackendPort)
    if (healthy) {
      writeLog('INFO', `健康检查通过 (第 ${healthCheckRetryCount + 1} 次尝试)`)
      notifyRenderer('backend:ready', { port: detectedBackendPort })
      return
    }
    healthCheckRetryCount++
    writeLog('INFO', `等待中... (${healthCheckRetryCount}/${MAX_HEALTH_RETRIES})`)
    await new Promise((resolve) => setTimeout(resolve, 300))
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
      // 先移除 stdio 监听器，防止 kill 后管道断开触发 EPIPE
      backendProcess.stdout?.removeAllListeners()
      backendProcess.stderr?.removeAllListeners()
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

  // 4. 初始化自动更新
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
  // 仅开发环境允许手动切换 DevTools
  if (!app.isPackaged) {
    BrowserWindow.getFocusedWindow()?.webContents.toggleDevTools()
  }
})

ipcMain.handle('shell:open-external', (_event, url: string) => {
  shell.openExternal(url)
})

// 新增：打开日志文件
ipcMain.handle('backend:open-log', () => {
  shell.openPath(LOG_FILE)
})

// 新增：获取后端地址（动态端口）
ipcMain.handle('backend:get-url', () => {
  return `http://127.0.0.1:${detectedBackendPort}`
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
