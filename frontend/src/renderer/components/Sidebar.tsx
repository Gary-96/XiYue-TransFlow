import {
  MessageSquareQuote,
  Subtitles,
  Mic,
  Settings,
  Info,
} from 'lucide-react'

interface NavItem {
  key: string
  icon: typeof MessageSquareQuote
  label: string
}

const NAV_ITEMS: NavItem[] = [
  { key: 'danmaku',  icon: MessageSquareQuote, label: '弹幕同传' },
  { key: 'subtitle', icon: Subtitles, label: '同传字幕' },
  { key: 'audio',    icon: Mic, label: '音频设备' },
  { key: 'settings', icon: Settings, label: '模型设置' },
  { key: 'about',    icon: Info, label: '关于应用' },
]

interface SidebarProps {
  activeTab: string
  onTabChange: (tab: string) => void
  messageCount: number
  historyCount: number
  backendReady: boolean
  backendFailed: boolean
  backendPort: number
  appVersion: string
}

export default function Sidebar({
  activeTab,
  onTabChange,
  messageCount,
  historyCount,
  backendReady,
  backendFailed,
  backendPort,
  appVersion,
}: SidebarProps) {
  return (
    <aside className="w-60 flex flex-col justify-between p-4 bg-white/70 backdrop-blur-md border-r border-slate-200/60">
      <div className="flex flex-col h-full">
        {/* ── Logo 区域 ── */}
        <div className="flex items-center gap-2.5 px-2 py-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white font-bold text-base shadow-md shadow-blue-500/20">
            译
          </div>
          <div>
            <div className="font-bold text-sm text-slate-900 tracking-tight">乐曼同传</div>
            <p className="text-[11px] text-slate-400">中越双语直播同传</p>
          </div>
        </div>

        {/* ── 导航菜单 ── */}
        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const isActive = activeTab === item.key
            let badge: number | null = null
            if (item.key === 'danmaku' && messageCount > 0) badge = messageCount
            else if (item.key === 'subtitle' && historyCount > 0) badge = historyCount

            return (
              <button
                key={item.key}
                onClick={() => onTabChange(item.key)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/25'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </div>
                {badge != null && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    isActive ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-600'
                  }`}>
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </button>
            )
          })}
        </nav>
      </div>

      {/* ── 底部状态 ── */}
      <div className="bg-gradient-to-b from-white to-slate-50 p-3.5 rounded-2xl border border-slate-200/80 shadow-2xs">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-bold text-slate-800">引擎状态</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold ${
            backendReady ? 'bg-emerald-50 text-emerald-600' : 
            backendFailed ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'
          }`}>
            {backendReady ? '在线' : backendFailed ? '离线' : '启动中'}
          </span>
        </div>
        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mb-2">
          <div className={`h-full rounded-full transition-all ${
            backendReady ? 'bg-emerald-500 w-full' : 
            backendFailed ? 'bg-rose-500 w-1/4' : 'bg-amber-500 w-2/4 animate-pulse'
          }`} />
        </div>
        <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium">
          <span>{backendReady ? `端口 ${backendPort}` : 'FastAPI'}</span>
          <span className="text-[10px] font-mono">v{appVersion}</span>
        </div>
      </div>
    </aside>
  )
}
