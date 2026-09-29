/**
 * 系统日志视图 — 实时监听 WebSocket 广播事件
 * 暗色终端风格，支持自动滚屏与清空
 */
import { useState, useEffect, useRef } from 'react'
import { Play, Pause, Trash2, Terminal } from 'lucide-react'

// ── 类型定义 ────────────────────────────────────────────────────────

interface LogEntry {
  id: string
  timestamp: string
  level: 'INFO' | 'WARN' | 'ERROR'
  tag: string
  message: string
}

// ── 工具函数 ────────────────────────────────────────────────────────

function formatTimestamp(date: Date): string {
  return date.toTimeString().slice(0, 8)
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10)
}

// ── 组件 ────────────────────────────────────────────────────────────

export default function LogView() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [autoScroll, setAutoScroll] = useState(true)
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const wsRef = useRef<WebSocket | null>(null)
  const logsEndRef = useRef<HTMLDivElement>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 自动滚到底部
  useEffect(() => {
    if (autoScroll) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, autoScroll])

  // WebSocket 连接管理
  useEffect(() => {
    const WS_URL = 'ws://127.0.0.1:15387/ws/stream'

    const connect = () => {
      setWsStatus('connecting')
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        setWsStatus('connected')
        addLog('INFO', 'SYSTEM', 'WebSocket 已连接')
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'system.log' || data.level) {
            addLog(
              (data.level ?? 'INFO') as 'INFO' | 'WARN' | 'ERROR',
              data.tag ?? 'EVENT',
              typeof data.message === 'string' ? data.message : JSON.stringify(data.message ?? data)
            )
          } else if (data.event) {
            addLog('INFO', data.event?.tag ?? 'EVENT', JSON.stringify(data.event))
          } else {
            addLog('INFO', 'STREAM', event.data.slice(0, 200))
          }
        } catch {
          addLog('WARN', 'PARSE', `消息解析失败: ${event.data.slice(0, 100)}`)
        }
      }

      ws.onclose = () => {
        setWsStatus('disconnected')
        addLog('WARN', 'SYSTEM', 'WebSocket 断开，3秒后重试...')
        reconnectTimerRef.current = setTimeout(connect, 3000)
      }

      ws.onerror = () => {
        setWsStatus('disconnected')
        addLog('ERROR', 'SYSTEM', 'WebSocket 连接错误')
      }
    }

    connect()

    return () => {
      wsRef.current?.close()
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
      }
    }
  }, [])

  const addLog = (level: LogEntry['level'], tag: string, message: string) => {
    setLogs((prev) => {
      const newLog: LogEntry = {
        id: generateId(),
        timestamp: formatTimestamp(new Date()),
        level,
        tag,
        message,
      }
      const updated = [...prev, newLog]
      return updated.length > 300 ? updated.slice(-300) : updated
    })
  }

  const handleClear = () => {
    setLogs([])
  }

  const toggleAutoScroll = () => {
    setAutoScroll((prev) => !prev)
  }

  const levelStyle = (level: LogEntry['level']) => {
    const base = 'px-1.5 py-0.5 rounded text-[10px] font-mono font-bold'
    const map = {
      INFO: 'bg-blue-500/20 text-blue-400',
      WARN: 'bg-amber-500/20 text-amber-400',
      ERROR: 'bg-red-500/20 text-red-400',
    }
    return `${base} ${map[level]}`
  }

  return (
    <div className="flex flex-col h-full bg-[#0d1117] text-gray-300 font-mono text-xs">
      {/* 顶部控制栏 */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 bg-[#161b22]">
        <div className="flex items-center gap-3">
          <Terminal className="h-4 w-4 text-gray-500" />
          <span className="font-semibold text-gray-200">系统日志</span>
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] ${
              wsStatus === 'connected'
                ? 'bg-emerald-500/20 text-emerald-400'
                : wsStatus === 'connecting'
                ? 'bg-amber-500/20 text-amber-400'
                : 'bg-red-500/20 text-red-400'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                wsStatus === 'connected'
                  ? 'bg-emerald-400 animate-pulse'
                  : wsStatus === 'connecting'
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-red-400'
              }`}
            />
            {wsStatus === 'connected' ? '已连接' : wsStatus === 'connecting' ? '连接中...' : '已断开'}
          </span>
          <span className="text-gray-600">· {logs.length} 条</span>
        </div>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 cursor-pointer text-gray-400 hover:text-gray-200">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={toggleAutoScroll}
              className="sr-only"
            />
            <span className="flex items-center gap-1 text-xs">
              {autoScroll ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              {autoScroll ? '自动滚屏' : '暂停滚屏'}
            </span>
          </label>

          <button
            onClick={handleClear}
            disabled={logs.length === 0}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Trash2 className="h-3 w-3" />
            清空
          </button>
        </div>
      </div>

      {/* 日志内容区 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-2">
            <Terminal className="h-8 w-8 opacity-30" />
            <p className="text-sm">暂无实时日志输出，等待系统事件产生...</p>
            <p className="text-xs text-gray-700">WebSocket 正在连接 <span className="text-emerald-500/60">ws://127.0.0.1:15387/ws/stream</span></p>
          </div>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              className="flex items-start gap-3 py-1 hover:bg-gray-800/50 rounded px-2 -mx-2 transition-colors"
            >
              <span className="text-gray-600 shrink-0">{log.timestamp}</span>
              <span className={levelStyle(log.level)}>{log.level}</span>
              <span className="text-cyan-400 shrink-0">[{log.tag}]</span>
              <span className="text-gray-300 break-all">{log.message}</span>
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>

      {/* 底部状态栏 */}
      <div className="flex items-center justify-between px-4 py-1.5 border-t border-gray-800 bg-[#161b22] text-[10px] text-gray-600">
        <span>缓冲上限: 300 条</span>
        <span>更新频率: 实时</span>
      </div>
    </div>
  )
}
