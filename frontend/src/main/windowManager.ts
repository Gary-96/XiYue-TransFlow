import { BrowserWindow, screen } from 'electron'
import { join } from 'path'

interface WindowState {
  dashboard: BrowserWindow | null
  overlay: BrowserWindow | null
  obs: BrowserWindow | null
}

class WindowManager {
  private state: WindowState = {
    dashboard: null,
    overlay: null,
    obs: null
  }

  /**
   * 创建控制台主窗口
   */
  createDashboard(): BrowserWindow {
    if (this.state.dashboard && !this.state.dashboard.isDestroyed()) {
      this.state.dashboard.focus()
      return this.state.dashboard
    }

    const win = new BrowserWindow({
      width: 1180,
      height: 780,
      minWidth: 900,
      minHeight: 600,
      frame: false,
      transparent: true,
      resizable: true,
      show: true,
      backgroundColor: '#00000000',
      titleBarStyle: 'hidden',
      webPreferences: {
        preload: join(__dirname, '..', 'preload', 'index.js'),
        nodeIntegration: false,
        contextIsolation: true
      }
    })

    // 开发环境加载 dev server，生产环境加载打包文件
    if (process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL) {
      win.loadURL('http://localhost:5173')
      win.webContents.openDevTools({ mode: 'detach' })
    } else {
      win.loadFile(join(__dirname, '..', '..', 'dist', 'index.html'))
    }

    win.on('closed', () => {
      this.state.dashboard = null
    })

    this.state.dashboard = win
    return win
  }

  /**
   * 创建悬浮字幕岛窗口（透明置顶）
   */
  createOverlay(): BrowserWindow {
    if (this.state.overlay && !this.state.overlay.isDestroyed()) {
      this.state.overlay.show()
      return this.state.overlay
    }

    const primaryDisplay = screen.getPrimaryDisplay()
    const { width } = primaryDisplay.workAreaSize

    const win = new BrowserWindow({
      width: 600,
      height: 120,
      x: Math.round((width - 600) / 2),
      y: 60,
      frame: false,
      transparent: true,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: false,
      show: true,
      webPreferences: {
        preload: join(__dirname, '..', 'preload', 'index.js'),
        nodeIntegration: false,
        contextIsolation: true
      }
    })

    if (process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL) {
      win.loadURL('http://localhost:5173/#/overlay')
    } else {
      win.loadFile(join(__dirname, '..', '..', 'dist', 'index.html'), { hash: '/overlay' })
    }

    win.on('closed', () => {
      this.state.overlay = null
    })

    this.state.overlay = win
    return win
  }

  /**
   * 创建 OBS 绿幕窗口
   */
  createOBSWindow(): BrowserWindow {
    if (this.state.obs && !this.state.obs.isDestroyed()) {
      this.state.obs.show()
      return this.state.obs
    }

    const win = new BrowserWindow({
      width: 800,
      height: 200,
      frame: false,
      transparent: true,
      resizable: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: true,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: join(__dirname, '..', 'preload', 'index.js'),
        nodeIntegration: false,
        contextIsolation: true
      }
    })

    if (process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL) {
      win.loadURL('http://localhost:5173/#/obs')
    } else {
      win.loadFile(join(__dirname, '..', '..', 'dist', 'index.html'), { hash: '/obs' })
    }

    win.on('closed', () => {
      this.state.obs = null
    })

    this.state.obs = win
    return win
  }

  /**
   * 关闭悬浮字幕岛
   */
  closeOverlay(): void {
    if (this.state.overlay && !this.state.overlay.isDestroyed()) {
      this.state.overlay.close()
    }
    this.state.overlay = null
  }

  /**
   * 关闭 OBS 窗口
   */
  closeOBSWindow(): void {
    if (this.state.obs && !this.state.obs.isDestroyed()) {
      this.state.obs.close()
    }
    this.state.obs = null
  }

  /**
   * 向所有窗口广播消息
   */
  broadcastToAll(channel: string, data: unknown): void {
    const windows = [this.state.dashboard, this.state.overlay, this.state.obs]
    windows.forEach((win) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send(channel, data)
      }
    })
  }

  /**
   * 获取窗口状态
   */
  getWindows(): WindowState {
    return this.state
  }
}

export const windowManager = new WindowManager()
