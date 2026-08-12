/**
 * Sidebar — 左侧固定导航边栏 (Light Theme)
 */

import { useState } from 'react'

interface NavItem {
  key: string
  icon: string
  label: string
  desc: string
}

const NAV_ITEMS: NavItem[] = [
  {
    key: 'danmaku',
    icon: '💬',
    label: '弹幕同传',
    desc: '抖音 / TikTok 弹幕采集与实时翻译',
  },
  {
    key: 'subtitle',
    icon: '🎧',
    label: '同传字幕',
    desc: '主播与对方声音双向同传字幕流',
  },
  {
    key: 'audio',
    icon: '🎛️',
    label: '音频设备',
    desc: '麦克风输入、翻译输出等 4 路设备独立路由设置',
  },
  {
    key: 'settings',
    icon: '⚙️',
    label: '模型设置',
    desc: 'Gemini / DeepSeek / Groq API Key 与 Prompt 配置',
  },
  {
    key: 'about',
    icon: 'ℹ️',
    label: '关于应用',
    desc: '版本信息、更新检查与开源协议',
  },
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
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const updateButtonText = (() => {
    switch (updateStatus) {
      case 'checking':
        return '⏳ 检查中...'
      case 'available':
        return '⬇️ 有新版本'
      case 'downloading':
        return '📥 下载中...'
      case 'downloaded':
        return '🔄 点击重启'
      case 'error':
        return '❌ 更新失败'
      default:
        return '🔍 检查更新'
    }
  })()

  const updateDisabled = updateStatus === 'checking' || updateStatus === 'downloading'

  return (
    <aside className="w-56 flex-shrink-0 flex flex-col bg-white border-r border-slate-200 select-none">
      {/* ── 顶部品牌区 ──────────────────────────────────────── */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-slate-100">
        <span className="text-xl">🌐</span>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold text-slate-800 tracking-wide">
            乐曼同传小助手
          </span>
          <span className="text-[10px] text-slate-400 tracking-widest uppercase">
            LEMAN TRANSLATE
          </span>
        </div>
      </div>

      {/* ── 中部功能导航区 ──────────────────────────────────── */}
      <nav className="flex-1 flex flex-col gap-0.5 px-2 py-3 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.key
          let badgeCount: number | null = null
          let badgeClass = ''
          if (item.key === 'danmaku' && messageCount > 0) {
            badgeCount = messageCount
            badgeClass = 'bg-blue-500 text-white'
          } else if (item.key === 'subtitle' && historyCount > 0) {
            badgeCount = historyCount
            badgeClass = 'bg-violet-500 text-white'
          }

          return (
            <button
              key={item.key}
              onClick={() => onTabChange(item.key)}
              className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 text-left ${
                isActive
                  ? 'bg-blue-50 text-blue-700 shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
              }`}
            >
              <span className="text-lg flex-shrink-0">{item.icon}</span>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-medium truncate">
                  {item.label}
                </span>
                <span className="text-[10px] text-slate-400 truncate leading-tight">
                  {item.desc}
                </span>
              </div>
              {badgeCount != null && (
                <span
                  className={`absolute top-1.5 right-2 min-w-[18px] h-[18px] text-[9px] rounded-full flex items-center justify-center font-bold px-1 ${badgeClass}`}
                >
                  {badgeCount > 99 ? '99+' : badgeCount}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* ── 底部状态与更新区 ────────────────────────────────── */}
      <div className="px-3 py-3 border-t border-slate-100 space-y-2.5">
        {/* 后端连接状态 */}
        <div className="flex items-center gap-2 px-1">
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 transition-all duration-300 ${
              backendReady
                ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]'
                : backendFailed
                  ? 'bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.4)] animate-pulse'
                  : 'bg-slate-300'
            }`}
          />
          <span className="text-[10px] text-slate-500 truncate font-medium">
            {backendReady
              ? `引擎在线 (${backendPort})`
              : backendFailed
                ? '引擎离线/重连中'
                : '启动中...'}
          </span>
        </div>

        {/* 检查更新 */}
        <button
          onClick={onCheckUpdate}
          disabled={updateDisabled}
          className={`w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all border ${
            updateDisabled
              ? 'bg-slate-50 text-slate-400 cursor-not-allowed border-slate-200'
              : updateStatus === 'available' || updateStatus === 'downloaded'
                ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
                : updateStatus === 'error'
                  ? 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
          }`}
        >
          {updateButtonText}
        </button>

        {/* 版本号 */}
        <div className="text-center text-[10px] text-slate-400 font-mono">
          v{appVersion || '0.1.1'}
        </div>

        {/* 高级设置折叠 */}
        <div className="border-t border-slate-100 pt-2">
          <button
            onClick={() => setAdvancedOpen(!advancedOpen)}
            className="w-full flex items-center justify-between px-2 py-1.5 rounded-md text-[10px] text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all"
          >
            <span>🔧 高级设置</span>
            <span className={`transition-transform duration-200 ${advancedOpen ? 'rotate-90' : ''}`}>
              ▶
            </span>
          </button>

          {advancedOpen && (
            <div className="mt-2 space-y-2 px-1 animate-[slide-in-up_0.2s_ease]">
              <div className="space-y-1">
                <label className="text-[9px] text-slate-400 uppercase tracking-wider">后端地址</label>
                <input
                  readOnly
                  className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-[10px] text-slate-600 font-mono outline-none focus:border-blue-300"
                  value={`http://127.0.0.1:${backendPort}`}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] text-slate-400 uppercase tracking-wider">WebSocket 端口</label>
                <input
                  readOnly
                  className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-[10px] text-slate-600 font-mono outline-none focus:border-blue-300"
                  value={`${backendPort}`}
                />
              </div>
              <p className="text-[9px] text-slate-400 leading-relaxed">
                端口配置仅供调试使用，请勿随意修改
              </p>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
