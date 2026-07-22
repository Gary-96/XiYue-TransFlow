import { contextBridge, ipcRenderer } from 'electron'

const electronAPI = {
  // 窗口控制
  minimize: () => ipcRenderer.invoke('window:minimize'),
  close: () => ipcRenderer.invoke('window:close'),
  toggleAlwaysOnTop: () => ipcRenderer.invoke('window:toggle-always-on-top'),
  toggleDevTools: () => ipcRenderer.invoke('window:toggle-devtools'),

  // 悬浮字幕岛
  showOverlay: () => ipcRenderer.invoke('overlay:show'),
  hideOverlay: () => ipcRenderer.invoke('overlay:hide'),

  // OBS 绿幕
  showOBS: () => ipcRenderer.invoke('obs:show'),
  hideOBS: () => ipcRenderer.invoke('obs:hide'),

  // 外部链接
  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),

  // 监听主进程消息
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    ipcRenderer.on(channel, (_event, ...args) => callback(...args))
  }
}

export type ElectronAPI = typeof electronAPI

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
