import { contextBridge, ipcRenderer } from 'electron'

const electronAPI = {
  // 窗口控制
  minimize: () => ipcRenderer.invoke('window:minimize'),
  close: () => ipcRenderer.invoke('window:close'),
  toggleAlwaysOnTop: () => ipcRenderer.invoke('window:toggle-always-on-top'),
  toggleDevTools: () => ipcRenderer.invoke('window:toggle-devtools'),

  // 外部链接
  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),

  // 监听主进程消息
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    ipcRenderer.on(channel, (_event, ...args) => callback(...args))
  },
  removeListener: (channel: string, callback: (...args: unknown[]) => void) => {
    ipcRenderer.removeListener(channel, callback)
  },

  // 获取后端地址
  getBackendUrl: (): string => {
    // 生产环境下可以从环境变量或 Electron IPC 获取
    return import.meta.env.VITE_API_BASE_URL?.replace(/^http:/, 'http:') || 'http://127.0.0.1:15387'
  },

  // 打开后端日志文件
  openBackendLog: () => ipcRenderer.invoke('backend:open-log'),

  // ── 自动更新 ──────────────────────────────
  checkForUpdate: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  quitAndInstall: () => ipcRenderer.invoke('update:quit-and-install'),
  getAppVersion: () => ipcRenderer.invoke('update:get-version'),
}

export type ElectronAPI = typeof electronAPI

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
