import { app, BrowserWindow } from 'electron'
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
        preload: join(app.isPackaged ? app.getAppPath() : '', 'dist-electron', 'preload', 'index.js'),
        nodeIntegration: false,
        contextIsolation: true
      }
    })

    // 开发环境加载 dev server，生产环境加载打包文件
    // 使用 app.isPackaged 判断，避免 NODE_ENV 在打包后仍为 development 导致误开 DevTools
    if (!app.isPackaged) {
      win.loadURL('http://localhost:5173')
      win.webContents.openDevTools({ mode: 'detach' })
    } else {
      // 生产环境：使用 app.getAppPath() 获取应用路径
      // dist/ 目录在 app.asar 内，Electron 会自动解析
      win.loadFile(join(app.getAppPath(), 'dist', 'index.html'))
    }

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
