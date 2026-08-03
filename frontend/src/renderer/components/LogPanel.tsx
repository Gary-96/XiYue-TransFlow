// 乐曼同传 — 日志面板组件
// 实时显示后端服务器日志，支持自动滚动、过滤、清空
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

export interface LogEntry {
  timestamp: string
  level: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR'
  logger: string
  message: string
}

interface LogPanelProps {
  maxLines?: number
}

const LEVEL_COLORS: Record<string, { bg: string; text: string; badge: string }> = {
  DEBUG:   { bg: 'bg-zinc-800/40',   text: 'text-zinc-400',   badge: 'bg-zinc-700/60 text-zinc-400' },
  INFO:    { bg: 'bg-blue-950/20',   text: 'text-blue-300',   badge: 'bg-blue-900/40 text-blue-300' },
  WARNING: { bg: 'bg-amber-950/20',  text: 'text-amber-300',  badge: 'bg-amber-900/40 text-amber-300' },
  ERROR:   { bg: 'bg-red-950/20',    text: 'text-red-300',    badge: 'bg-red-900/40 text-red-300' },
}

const LEVEL_LABELS: Record<string, string> = {
  DEBUG: 'D', INFO: 'I', WARNING: 'W', ERROR: 'E',
}

export default function LogPanel({ maxLines = 500 }: LogPanelProps) {
  const { t } = useTranslation()
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [filter, setFilter] = useState<string>('ALL')
  const [autoScroll, setAutoScroll] = useState(true)
  const [wsConnected, setWsConnected] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 连接 WebSocket 接收实时日志
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/logs`)
    wsRef.current = ws

    ws.onopen = () => {
      setWsConnected(true)
      console.log('[LogPanel] WebSocket 已连接')
    }

    ws.onmessage = (event) => {
      try {
        const entry: LogEntry = JSON.parse(event.data)
        setEntries(prev => {
          const next = [...prev, entry]
          return next.slice(-maxLines)
        })
      } catch {
        // 忽略解析错误
      }
    }

    ws.onclose = () => {
      setWsConnected(false)
      // 3 秒后重连
      reconnectTimer.current = setTimeout(() => {
        console.log('[LogPanel] 尝试重连...')
      }, 3000)
    }

    ws.onerror = () => {
      setWsConnected(false)
    }

    return () => {
      ws.close()
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
    }
  }, [maxLines])

  // 自动滚动
  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [entries, autoScroll])

  const clearLogs = () => setEntries([])

  const filtered = filter === 'ALL'
    ? entries
    : entries.filter(e => e.level === filter)

  const errorCount = entries.filter(e => e.level === 'ERROR').length
  const warnCount = entries.filter(e => e.level === 'WARNING').length

  return (
    <div className="h-full flex flex-col">
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/50">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-zinc-200">📋 {t('nav.log')}</span>
          <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-400 animate-pulse' : 'bg-red-500'}`} />
        </div>
        <div className="flex items-center gap-2">
          {/* 统计 */}
          {errorCount > 0 && (
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-900/40 text-red-400 font-mono">
              E:{errorCount}
            </span>
          )}
          {warnCount > 0 && (
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-900/40 text-amber-400 font-mono">
              W:{warnCount}
            </span>
          )}
          {/* 自动滚动开关 */}
          <button
            className={`px-2 py-0.5 rounded text-[10px] border transition-all ${
              autoScroll
                ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-400'
                : 'border-zinc-700/40 text-zinc-500 hover:text-zinc-300'
            }`}
            onClick={() => setAutoScroll(v => !v)}
            title={autoScroll ? '停止自动滚动' : '启用自动滚动'}
          >
            {autoScroll ? '⬇ 自动' : '⬆ 锁定'}
          </button>
          {/* 清空 */}
          <button
            className="px-2 py-0.5 rounded text-[10px] text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 border border-zinc-700/40 transition-all"
            onClick={clearLogs}
          >
            {t('danmaku.clear')}
          </button>
        </div>
      </div>

      {/* 过滤栏 */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-zinc-800/30 bg-zinc-900/20">
        {['ALL', 'INFO', 'WARNING', 'ERROR', 'DEBUG'].map(level => (
          <button
            key={level}
            className={`px-2 py-0.5 rounded text-[10px] font-mono transition-all ${
              filter === level
                ? 'bg-zinc-700/60 text-white'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40'
            }`}
            onClick={() => setFilter(level)}
          >
            {level === 'ALL' ? '全部' : LEVEL_LABELS[level]}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-zinc-600 font-mono">
          {filtered.length} 条
        </span>
      </div>

      {/* 日志列表 */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-2">
        {filtered.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-zinc-600">
            <div className="text-2xl opacity-40">📋</div>
            <div className="text-xs">暂无日志</div>
          </div>
        ) : (
          filtered.map((entry, i) => {
            const colors = LEVEL_COLORS[entry.level] || LEVEL_COLORS.INFO
            return (
              <div
                key={i}
                className={`flex items-start gap-2 py-1 px-2 rounded-md text-[11px] font-mono hover:bg-zinc-800/30 transition-colors ${colors.bg}`}
              >
                {/* 等级 */}
                <span className={`flex-shrink-0 px-1 py-0.5 rounded text-[9px] font-bold ${colors.badge}`}>
                  {LEVEL_LABELS[entry.level]}
                </span>
                {/* 时间 */}
                <span className="flex-shrink-0 text-zinc-500">
                  {entry.timestamp}
                </span>
                {/* 来源 */}
                <span className="flex-shrink-0 text-zinc-600 max-w-[100px] truncate">
                  {entry.logger.replace('backend.main_manager', 'main')}
                </span>
                {/* 内容 */}
                <span className={`flex-1 overflow-hidden text-ellipsis whitespace-nowrap ${colors.text}`}>
                  {entry.message}
                </span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
