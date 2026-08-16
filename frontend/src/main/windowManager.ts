import { app, BrowserWindow, screen } from 'electron'
import { join } from 'path'

interface WindowState {
  dashboard: BrowserWindow | null
}

class WindowManager {
  private state: WindowState = {
    dashboard: null
  }

  /**
   * 创建控制台主窗口
   */
  createDashboard(): BrowserWindow {
    if (this.state.dashboard && !this.state.dashboard.isDestroyed()) {
      this.state.dashboard.focus()
      return this.state.dashboard
    }

    // 获取屏幕尺寸用于居中窗口
    const primaryDisplay = screen.getPrimaryDisplay()
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize
    const x = Math.round((screenWidth - 1180) / 2)
    const y = Math.round((screenHeight - 780) / 2)

    const win = new BrowserWindow({
      width: 1180,
      height: 780,
      minWidth: 900,
      minHeight: 600,
      frame: false,
      transparent: false,
      resizable: true,
      show: false,
      x,
      y,
      backgroundColor: '#06060f',
      titleBarStyle: 'hidden',
      webPreferences: {
        // __dirname 在 Electron main process 中可用
        // __dirname = dist-electron/main，所以需要 .. 到 dist-electron
        preload: join(__dirname, '..', 'preload', 'index.js'),
        nodeIntegration: false,
        contextIsolation: true
      }
    })

    // 开发环境加载 dev server，生产环境加载打包文件
    // 使用 app.isPackaged 判断，避免 NODE_ENV 在打包后仍为 development 导致误开 DevTools
    if (!app.isPackaged) {
      win.loadURL('http://localhost:5173')
      // 开发环境开启 DevTools 方便调试
      win.webContents.openDevTools({ mode: 'detach' })
    } else {
      // 生产环境：使用 app.getAppPath() 获取应用路径
      // dist/ 目录在 app.asar 内，Electron 会自动解析
      win.loadFile(join(app.getAppPath(), 'dist', 'index.html'))
      // 临时开启 DevTools 以便排查问题
      // win.webContents.openDevTools({ mode: 'detach' })
    }

    // 等待页面加载完成后显示窗口
    win.webContents.on('did-finish-load', () => {
      if (!win.isDestroyed()) {
        win.show()
        win.focus()
      }
    })

    // 捕获渲染进程 console 消息
    win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      const levelStr = ['LOG', 'WARN', 'ERROR'][level] || 'LOG'
      try {
        console.log(`[Renderer ${levelStr}] ${message} (${sourceId}:${line})`)
      } catch { /* EPIPE guard */ }
    })

    // 捕获渲染进程崩溃
    win.webContents.on('render-process-gone', (_event, details) => {
      try {
        console.error(`[Renderer crashed] reason=${details.reason} exitCode=${details.exitCode}`)
      } catch { /* EPIPE guard */ }
    })

    // 页面加载错误时显示窗口并打开 DevTools
    win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
      console.error(`[Window] Failed to load page: ${errorCode} ${errorDescription}`)
      // 显示 DevTools 以便查看错误
      win.webContents.openDevTools({ mode: 'detach' })
      if (!win.isDestroyed()) {
        win.show()
      }
    })

    win.on('closed', () => {
      this.state.dashboard = null
    })

    this.state.dashboard = win
    return win
  }

  /**
   * 向所有窗口广播消息
   */
  broadcastToAll(channel: string, data: unknown): void {
    if (this.state.dashboard && !this.state.dashboard.isDestroyed()) {
      this.state.dashboard.webContents.send(channel, data)
    }
  }

  /**
   * 获取窗口状态
   */
  getWindows(): WindowState {
    return this.state
  }
}

export const windowManager = new WindowManager()
