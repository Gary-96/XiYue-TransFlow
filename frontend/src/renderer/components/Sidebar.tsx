import { useState } from 'react'
import { 
  MessageSquareQuote, 
  Subtitles, 
  Mic, 
  Settings, 
  Info,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Download,
  ChevronDown,
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
  updateStatus: string
  onCheckUpdate: () => void
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
  updateStatus,
  onCheckUpdate,
}: SidebarProps) {
  const updateButtonText = (() => {
    switch (updateStatus) {
      case 'checking':    return '检查中...'
      case 'available':   return '更新可用'
      case 'downloading': return '下载中...'
      case 'downloaded':  return '更新就绪'
      case 'error':       return '更新失败'
      default:            return '检查更新'
    }
  })()

  const updateDisabled = updateStatus === 'checking' || updateStatus === 'downloading'
  const showUpdateButton = updateStatus !== 'idle' && updateStatus !== 'not-available'

  return (
    <aside className="w-52 flex-shrink-0 flex flex-col bg-white/[0.03] backdrop-blur-xl border-r border-white/[0.08] select-none h-full">
      <div className="flex flex-col h-full">
        {/* ── 导航菜单 ── */}
        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.key
            const Icon = item.icon
            let badge: number | null = null
            if (item.key === 'danmaku' && messageCount > 0) badge = messageCount
            else if (item.key === 'subtitle' && historyCount > 0) badge = historyCount

            return (
              <button
                key={item.key}
                onClick={() => onTabChange(item.key)}
                className={`relative flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-left transition-all duration-150 ${
                  isActive
                    ? 'bg-gradient-to-r from-blue-500/20 to-purple-500/20 text-blue-200 font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_16px_rgba(99,102,241,0.15)]'
                    : 'text-white/55 hover:bg-white/[0.06] hover:text-white/90'
                }`}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-gradient-to-b from-blue-400 to-purple-400" />
                )}
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="text-[13px] flex-1">{item.label}</span>
                {badge != null && (
                  <span className="min-w-[20px] h-5 text-[10px] rounded-full flex items-center justify-center font-bold px-1.5 bg-gradient-to-r from-blue-500 to-purple-500 text-white">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        {/* ── 分割线 ── */}
        <div className="mx-2 h-px bg-white/[0.08]" />

        {/* ── 底部状态区 ── */}
        <div className="px-3 py-3 space-y-2">
          {/* 后端状态 */}
          <div className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-white/[0.05] border border-white/[0.08]">
            {backendReady ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
            ) : backendFailed ? (
              <AlertCircle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
            ) : (
              <Loader2 className="w-3.5 h-3.5 text-white/40 flex-shrink-0 animate-spin" />
            )}
            <span className="text-[11px] text-white/60 truncate font-medium">
              {backendReady ? `引擎在线 · ${backendPort}` : backendFailed ? '引擎离线' : '启动中...'}
            </span>
          </div>

          {/* 检查更新 */}
          {showUpdateButton && (
            <button
              onClick={onCheckUpdate}
              disabled={updateDisabled}
              className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-[11px] font-medium border transition-all duration-150 ${
                updateDisabled
                  ? 'bg-white/[0.03] text-white/30 cursor-not-allowed border-white/[0.08]'
                  : updateStatus === 'available' || updateStatus === 'downloaded'
                    ? 'bg-amber-500/15 border-amber-400/30 text-amber-300 hover:bg-amber-500/25'
                    : 'bg-white/[0.05] border-white/[0.1] text-white/60 hover:bg-white/[0.08]'
              }`}
            >
              {updateStatus === 'checking' || updateStatus === 'downloading' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : updateStatus === 'available' || updateStatus === 'downloaded' ? (
                <Download className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
              {updateButtonText}
            </button>
          )}

          {/* 版本号 */}
          <div className="text-center pt-1">
            <span className="text-[10px] text-white/30 font-mono font-medium">v{appVersion || '0.2.0'}</span>
          </div>
        </div>
      </div>
    </aside>
  )
}
