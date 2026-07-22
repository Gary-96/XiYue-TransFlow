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

  // 打开后端日志文件
  openBackendLog: () => ipcRenderer.invoke('backend:open-log')
}

export type ElectronAPI = typeof electronAPI

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
