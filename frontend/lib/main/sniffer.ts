/**
 * 喜阅 TransFlow · 静默弹幕采集视口（Channel B — 主进程侧）
 *
 * 设计目标：
 * - 在隐藏、资源受限的 BrowserWindow 中加载直播间页面，劫持页面主世界里的
 *   WebCast WebSocket，把原始帧（base64）经 snifferPreload 桥回主进程；
 * - 主进程用 webcast.ts 解析 WebCast protobuf，产出 StandardDanmaku[]，
 *   经 conveyor danmaku 模块推给 renderer；
 * - onBeforeRequest 阻断视频/音频/图片/字体等重资源，目标 CPU < 2%；
 * - 生命周期：disconnect 时 close()；应用退出时 destroySniffer() 统一释放。
 */
import { BrowserWindow, ipcMain, session } from 'electron'
import { join } from 'path'
import { parseWebcastFrame } from './webcast'
import type { StandardDanmaku } from '@/types'
import type { RawDanmakuFrame } from '@/lib/preload/snifferPreload'

/** 独立持久 partition：与主窗口会话隔离，可跨次运行保留直播间 Cookie */
const SNIFTER_PARTITION = 'persist:transflow-sniffer'

/** 阻断的重资源：视频 / 音频 / 图片 / 字体（弹幕同传不需要任何媒体像素） */
const BLOCK_RE =
  /\.(flv|m3u8|mp4|ts|aac|m4s|mov|webm|mkv|mp3|wav|ogv|ogg|opus|wma|mid|mpga|png|jpe?g|gif|webp|bmp|svg|ico|avif|apng|ttf|otf|woff2?)(\?|$)/i

let win: BrowserWindow | null = null
let currentPlatform = 'douyin'
let batchSink: ((items: StandardDanmaku[]) => void) | null = null
let totalFrames = 0
let lastFrameAt = 0
let ipcWired = false
let sessionWired = false

/**
 * 主世界 WebSocket 镜像补丁：
 * 把页面全局 WebSocket 换成镜像构造函数——对每个实例追加 message 监听器，
 * 二进制帧 base64 后送 snifferPreload 暴露的 transflowSniffer.sendFrame。
 * 保留 prototype 与状态常量，页面的 instanceof / 状态判断不受影响。
 */
const WS_MIRROR_SCRIPT = `
(function () {
  if (window.__transflowWsPatched) return
  window.__transflowWsPatched = true
  function abToB64(buf) {
    var bytes = new Uint8Array(buf)
    var s = ''
    for (var i = 0; i < bytes.length; i += 0x8000) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
    }
    return btoa(s)
  }
  var RealWS = window.WebSocket
  function PatchedWS(url, protocols) {
    var ws = new RealWS(url, protocols)
    var sink = window.transflowSniffer
    if (sink && sink.sendFrame) {
      ws.addEventListener('message', function (ev) {
        try {
          var u = typeof url === 'string' ? url : String(url)
          if (ev.data instanceof ArrayBuffer) {
            sink.sendFrame({ url: u, kind: 'bin', data: abToB64(ev.data) })
          } else if (typeof ev.data === 'string') {
            sink.sendFrame({ url: u, kind: 'text', data: ev.data })
          }
        } catch (e) { /* 静默：采集通道永不拖累页面 */ }
      })
    }
    return ws
  }
  PatchedWS.prototype = RealWS.prototype
  PatchedWS.CONNECTING = RealWS.CONNECTING
  PatchedWS.OPEN = RealWS.OPEN
  PatchedWS.CLOSING = RealWS.CLOSING
  PatchedWS.CLOSED = RealWS.CLOSED
  window.WebSocket = PatchedWS
})()
`

function handleRawFrame(frame: RawDanmakuFrame): void {
  // 只关心二进制帧（WebCast PushFrame 载荷）；文本帧（心跳 ack 等）无弹幕信息
  if (!frame || frame.kind !== 'bin') return
  const bin = Buffer.from(frame.data, 'base64')
  if (bin.length === 0) return
  const items = parseWebcastFrame(new Uint8Array(bin), currentPlatform)
  if (items.length === 0) return
  totalFrames += items.length
  lastFrameAt = Date.now()
  if (batchSink) batchSink(items)
}

function ensureIpc(): void {
  if (ipcWired) return
  ipcWired = true
  ipcMain.on('danmaku:raw-frame', (_event, frame: RawDanmakuFrame) => {
    try {
      handleRawFrame(frame)
    } catch (err) {
      console.warn('[sniffer] frame 处理异常:', err)
    }
  })
}

function ensureSession(): void {
  if (sessionWired) return
  sessionWired = true
  const ses = session.fromPartition(SNIFTER_PARTITION)
  ses.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
    callback(BLOCK_RE.test(details.url) ? { cancel: true } : {})
  })
}

export interface SnifferStatus {
  running: boolean
  url: string | null
  platform: string
  frames: number
  lastFrameAt: number
}

export const sniffer = {
  /** 打开隐藏采集视口：加载房间页、阻断重资源、镜像 WS 帧并推批 */
  open(url: string, platform: string, onBatch: (items: StandardDanmaku[]) => void): void {
    this.close()
    ensureIpc()
    ensureSession()
    currentPlatform = platform
    batchSink = onBatch
    totalFrames = 0
    lastFrameAt = 0

    const w = new BrowserWindow({
      width: 1024,
      height: 576,
      show: false,
      frame: false,
      backgroundColor: '#000000',
      webPreferences: {
        preload: join(__dirname, '../preload/snifferPreload.js'),
        partition: SNIFTER_PARTITION,
        // sandbox 下 contextBridge + ipcRenderer.send 可用，保持最小攻击面
        sandbox: true,
        // 隐藏窗口不节流 SDK 心跳，WebCast WS 长连接才能维持
        backgroundThrottling: false,
        devTools: false,
        spellcheck: false,
      },
    })
    win = w
    w.setMenuBarVisibility(false)
    // 每次导航（新文档）主世界都是新 context，需重新注入镜像补丁
    w.webContents.on('dom-ready', () => {
      w.webContents.executeJavaScript(WS_MIRROR_SCRIPT).catch(() => {
        /* 窗口可能已销毁 —— 静默 */
      })
    })
    w.webContents.on('destroyed', () => {
      if (win === w) {
        win = null
        batchSink = null
      }
    })
    void w.loadURL(url)
  },

  /** 关闭视口并断开帧管道（disconnect 与 quit 共用） */
  close(): void {
    batchSink = null
    if (win && !win.isDestroyed()) win.destroy()
    win = null
  },

  status(): SnifferStatus {
    return {
      running: win !== null && !win.isDestroyed(),
      url: win && !win.isDestroyed() ? win.webContents.getURL() || null : null,
      platform: currentPlatform,
      frames: totalFrames,
      lastFrameAt,
    }
  },
}

/** 应用退出钩子：强制销毁静默视口，释放 IPC 管道与 partition 会话 */
export function destroySniffer(): void {
  sniffer.close()
}
