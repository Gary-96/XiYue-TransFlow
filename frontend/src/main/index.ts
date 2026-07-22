import { app, BrowserWindow, ipcMain, shell, screen } from 'electron'
import { join } from 'path'
import { spawn, ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { windowManager } from './windowManager'

let backendProcess: ChildProcess | null = null
let isQuitting = false

/**
 * 启动 Python 后端
 * - 生产环境：运行 extraResources 中的 backend_engine.exe
 * - 开发环境：运行 python main_manager.py
 */
function startBackend(): void {
  const isDev = process.env.NODE_ENV === 'development' || !!process.env.VITE_DEV_SERVER_URL

  if (isDev) {
    // ── 开发模式：直接运行 Python 脚本 ──────────────────
    const backendDir = join(__dirname, '..', '..', '..', 'backend')
    const pythonScript = join(backendDir, 'main_manager.py')
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3'

    if (!existsSync(pythonScript)) {
      console.warn(`[DEV] 后端脚本不存在: ${pythonScript}`)
      return
    }

    console.log(`[DEV] 启动后端: ${pythonCmd} ${pythonScript}`)
    backendProcess = spawn(pythonCmd, [pythonScript], {
      cwd: backendDir,
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe']
    })
  } else {
    // ── 生产模式：运行打包后的 backend_engine.exe ────────
    // extraResources 中的文件在运行时被放到 process.resourcesPath 下
    const backendExe = join(process.resourcesPath, 'backend_engine', 'backend_engine.exe')

    if (!existsSync(backendExe)) {
      console.error(`[PROD] 后端引擎不存在: ${backendExe}`)
      return
    }

    console.log(`[PROD] 启动后端引擎: ${backendExe}`)
    backendProcess = spawn(backendExe, [], {
      cwd: join(process.resourcesPath, 'backend_engine'),
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe']
    })
  }

  backendProcess.stdout?.on('data', (data: Buffer) => {
    console.log(`[Backend] ${data.toString().trim()}`)
  })

  backendProcess.stderr?.on('data', (data: Buffer) => {
    console.error(`[Backend Error] ${data.toString().trim()}`)
  })

  backendProcess.on('exit', (code) => {
    console.log(`后端进程退出，代码: ${code}`)
    backendProcess = null
  })
}

/**
 * 关闭后端进程
 */
function stopBackend(): void {
  if (backendProcess) {
    isQuitting = true
    backendProcess.kill('SIGTERM')
    backendProcess = null
  }
}

/**
 * 应用入口
 */
app.whenReady().then(() => {
  // 启动后端
  startBackend()

  // 等待后端就绪后创建窗口
  setTimeout(() => {
    windowManager.createDashboard()
  }, 2000)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      windowManager.createDashboard()
    }
  })
})

app.on('window-all-closed', () => {
  stopBackend()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  stopBackend()
})

// IPC 处理
ipcMain.handle('window:minimize', () => {
  const win = BrowserWindow.getFocusedWindow()
  win?.minimize()
})

ipcMain.handle('window:close', () => {
  const win = BrowserWindow.getFocusedWindow()
  win?.close()
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
  const win = BrowserWindow.getFocusedWindow()
  win?.webContents.toggleDevTools()
})

ipcMain.handle('overlay:show', () => {
  windowManager.createOverlay()
})

ipcMain.handle('overlay:hide', () => {
  windowManager.closeOverlay()
})

ipcMain.handle('obs:show', () => {
  windowManager.createOBSWindow()
})

ipcMain.handle('obs:hide', () => {
  windowManager.closeOBSWindow()
})

// 开发环境快捷键
ipcMain.handle('shell:open-external', (_event, url: string) => {
  shell.openExternal(url)
})
