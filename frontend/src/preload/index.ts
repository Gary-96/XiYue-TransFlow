import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

export interface ElectronAPI {
  // 窗口控制
  minimize: () => void
  close: () => void
  toggleAlwaysOnTop: () => Promise<boolean>
  toggleDevTools: () => void

  // 外部链接
  openExternal: (url: string) => void

  // 监听主进程消息
  on: (channel: string, callback: (...args: unknown[]) => void) => void
  removeListener: (channel: string, callback: (...args: unknown[]) => void) => void

  // 获取后端地址
  getBackendUrl: () => string

  // 打开后端日志文件
  openBackendLog: () => Promise<void>

  // 获取本机机器码
  getMachineId: () => Promise<string>

  // ── 自动更新 ──────────────────────────────
  checkForUpdate: () => Promise<{ ok: boolean; error?: string }>
  downloadUpdate: () => Promise<{ ok: boolean; error?: string }>
  quitAndInstall: () => Promise<{ ok: boolean }>
  getAppVersion: () => Promise<string>
}

const electronAPI: ElectronAPI = {
  // 窗口控制
  minimize: () => ipcRenderer.invoke('window:minimize'),
  close: () => ipcRenderer.invoke('window:close'),
  toggleAlwaysOnTop: () => ipcRenderer.invoke('window:toggle-always-on-top'),
  toggleDevTools: () => ipcRenderer.invoke('window:toggle-devtools'),

  // 外部链接
  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),

  // 监听主进程消息
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    // 捕获与防防碰撞包装
    const subscription = (_event: IpcRendererEvent, ...args: unknown[]) => callback(...args)
    ipcRenderer.on(channel, subscription)
  },
  removeListener: (channel: string, callback: (...args: unknown[]) => void) => {
    ipcRenderer.removeListener(channel, callback)
  },

  // 获取后端地址 (固定为 15387 端口)
  getBackendUrl: () => `http://127.0.0.1:15387`,

  // 打开后端日志文件
  openBackendLog: () => ipcRenderer.invoke('backend:open-log'),

  // 获取机器码
  getMachineId: () => ipcRenderer.invoke('machine:get-id'),

  // ── 自动更新 ──────────────────────────────
  checkForUpdate: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  quitAndInstall: () => ipcRenderer.invoke('update:quit-and-install'),
  getAppVersion: () => ipcRenderer.invoke('update:get-version')
}

// 🛡️ 兼容 expose：同时挂载 electronAPI 与 electron，双保险防前端找不到属性
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electronAPI', electronAPI)
    contextBridge.exposeInMainWorld('electron', electronAPI)
  } catch (error) {
    console.error('Preload contextBridge 挂载失败:', error)
  }
} else {
  // @ts-ignore
  window.electronAPI = electronAPI
  // @ts-ignore
  window.electron = electronAPI
}
