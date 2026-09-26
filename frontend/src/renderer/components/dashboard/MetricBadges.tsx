/**
 * MetricBadges — 4 列状态微胶囊 (Dashboard 子组件)
 * 本地引擎端口 / 网络连接 / 会话翻译句数 / TTS 合成状态
 */
import type { ConnectionStatus } from '../../types'

interface MetricBadgesProps {
  backendReady: boolean
  backendFailed: boolean
  backendPort: number
  wsStatus: ConnectionStatus
  historyCount: number
  ttsEnabled: boolean
}

export default function MetricBadges({
  backendReady,
  backendFailed,
  backendPort,
  wsStatus,
  historyCount,
  ttsEnabled,
}: MetricBadgesProps) {
  const items = [
    {
      dot: backendReady ? 'bg-emerald-500' : backendFailed ? 'bg-rose-500' : 'bg-amber-500 animate-pulse',
      label: '本地引擎',
      value: backendReady ? String(backendPort) : backendFailed ? '已断开' : '启动中...',
      mono: true,
    },
    {
      dot: wsStatus === 'connected' ? 'bg-emerald-500' : wsStatus === 'connecting' ? 'bg-amber-500 animate-pulse' : 'bg-slate-300',
      label: '网络连接',
      value: wsStatus === 'connected' ? '就绪 (WS)' : wsStatus === 'connecting' ? '连接中' : '待连接',
      mono: false,
    },
    {
      dot: 'bg-blue-500',
      label: '当前会话',
      value: `${historyCount} 句`,
      mono: true,
    },
    {
      dot: ttsEnabled ? 'bg-emerald-500' : 'bg-slate-300',
      label: 'TTS 合成',
      value: ttsEnabled ? '已开启' : '已静音',
      mono: false,
    },
  ]

  return (
    <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-2xs grid grid-cols-4 gap-3 shrink-0">
      {items.map((item, i) => (
        <div key={item.label} className={`space-y-0.5 ${i > 0 ? 'border-l border-slate-100 pl-3' : ''}`}>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${item.dot}`} />
            {item.label}
          </div>
          <div className={`text-sm font-black text-slate-900 ${item.mono ? 'font-mono' : ''}`}>
            {item.value}
          </div>
        </div>
      ))}
    </div>
  )
}
