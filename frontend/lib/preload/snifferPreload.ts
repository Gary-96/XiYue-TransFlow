/**
 * 喜阅 TransFlow · 静默采集视口专用 preload（Channel B）
 *
 * 最小攻击面：仅暴露一个 contextBridge 方法，把劫持到的 WebCast WebSocket
 * 原始帧经 `danmaku:raw-frame` IPC 通道发回主进程。sandbox 模式下
 * contextBridge + ipcRenderer.send 均可用。
 */
import { contextBridge, ipcRenderer } from 'electron'

export interface RawDanmakuFrame {
  /** 产生该帧的 WebSocket 端点（用于日志/调试） */
  url: string
  /** bin = 二进制帧（已 base64 编码），text = 文本帧 */
  kind: 'text' | 'bin'
  data: string
}

contextBridge.exposeInMainWorld('transflowSniffer', {
  sendFrame(frame: RawDanmakuFrame): void {
    if (!frame || typeof frame.data !== 'string') return
    ipcRenderer.send('danmaku:raw-frame', frame)
  },
})
