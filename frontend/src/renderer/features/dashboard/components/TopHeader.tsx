/**
 * TopHeader — 顶部操作栏 (Dashboard 子组件)
 * 居中直播连接条 + 双语快速切换 + 窗口控制组
 * 保留 Electron 无边框窗口拖拽区域：整体 drag，交互控件 no-drag
 */
import type { CSSProperties } from 'react'
import { Search, Pin, Minus, Square, X, Loader2 } from 'lucide-react'

export interface LangOption {
  code: string
  label: string
  icon: string
}

type Platform = 'douyin' | 'tiktok'

interface TopHeaderProps {
  platform: Platform
  onPlatformChange: (p: Platform) => void
  roomId: string
  onRoomIdChange: (v: string) => void
  platformActive: boolean
  isConnecting: boolean
  onConnectToggle: () => void
  supportedLangs: LangOption[]
  srcLang: string
  tgtLang: string
  langSwitching: boolean
  onSetLanguage: (src: string, tgt: string) => void
  onSwapLanguage: () => void
  isPinned: boolean
  onTogglePin: () => void
  onMinimize: () => void
  onClose: () => void
}

export default function TopHeader({
  platform,
  onPlatformChange,
  roomId,
  onRoomIdChange,
  platformActive,
  isConnecting,
  onConnectToggle,
  supportedLangs,
  srcLang,
  tgtLang,
  langSwitching,
  onSetLanguage,
  onSwapLanguage,
  isPinned,
  onTogglePin,
  onMinimize,
  onClose,
}: TopHeaderProps) {
  const dragRegion = { WebkitAppRegion: 'drag' } as CSSProperties
  const noDragRegion = { WebkitAppRegion: 'no-drag' } as CSSProperties

  const renderLangSelect = (
    value: string,
    onSelect: (code: string) => void,
    disabled: boolean,
    ariaLabel: string
  ) => (
    <select
      aria-label={ariaLabel}
      className="bg-transparent text-xs font-semibold text-white/80 outline-none cursor-pointer appearance-none border-none disabled:opacity-50"
      value={value}
      onChange={(e) => onSelect(e.target.value)}
      disabled={disabled}
    >
      {supportedLangs.map((lang) => (
        <option key={lang.code} value={lang.code} className="bg-zinc-900 text-white">
          {lang.icon} {lang.label}
        </option>
      ))}
    </select>
  )

  return (
    <header
      className="h-14 px-6 flex items-center justify-between bg-transparent"
      style={dragRegion}
    >
      {/* 居中：直播间连接条 */}
      <div
        className="flex items-center gap-2 w-full max-w-xl bg-white/10 backdrop-blur-md rounded-full px-3 py-1.5 border border-white/10"
        style={noDragRegion}
      >
        {/* 平台微型切换胶囊 */}
        <div className="flex bg-slate-100 p-0.5 rounded-full text-xs font-semibold shrink-0">
          <button
            onClick={() => onPlatformChange('douyin')}
            className={`px-3 py-1 rounded-full transition-all appearance-none border-none outline-none cursor-pointer ${
              platform === 'douyin'
                ? 'bg-white/20 text-white shadow-sm'
                : 'text-white/50 hover:text-white/80'
            }`}
          >
            抖音
          </button>
          <button
            onClick={() => onPlatformChange('tiktok')}
            className={`px-3 py-1 rounded-full transition-all appearance-none border-none outline-none cursor-pointer ${
              platform === 'tiktok'
                ? 'bg-white/20 text-white shadow-sm'
                : 'text-white/50 hover:text-white/80'
            }`}
          >
            TikTok
          </button>
        </div>

        <div className="h-4 w-px bg-white/10 shrink-0" />

        {/* 直播间 ID / 链接输入 */}
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <Search className="w-3.5 h-3.5 text-white/40 shrink-0" />
          <input
            type="text"
            placeholder={
              platform === 'douyin'
                ? '粘贴直播间分享链接或输入直播房间 ID...'
                : 'Paste TikTok room link or ID...'
            }
            value={roomId}
            onChange={(e) => onRoomIdChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onConnectToggle()}
            className="w-full bg-transparent text-xs text-white/90 placeholder-white/30 outline-none truncate appearance-none border-none"
          />
        </div>

        {/* 连接 / 断开 */}
        <button
          onClick={onConnectToggle}
          disabled={!roomId.trim() || isConnecting}
          className={`px-4 py-2 rounded-full text-xs font-semibold transition-all shadow-xs shrink-0 cursor-pointer appearance-none border-none outline-none disabled:cursor-not-allowed flex items-center gap-1.5 ${
            platformActive
              ? 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 border border-rose-500/30'
              : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/20 disabled:opacity-40'
          }`}
        >
          {isConnecting && <Loader2 className="w-3 h-3 animate-spin" />}
          {platformActive ? '断开' : isConnecting ? '连接中...' : '连接'}
        </button>
      </div>

      {/* 右侧：语言对 + 窗口控制 */}
      <div className="flex items-center gap-2 shrink-0" style={noDragRegion}>
        <div className="flex items-center gap-1 bg-white/10 backdrop-blur-md px-2 py-1 rounded-xl border border-white/10">
          {renderLangSelect(
            srcLang,
            (code) => onSetLanguage(code, tgtLang),
            langSwitching,
            '源语言'
          )}
          <button
            aria-label="交换语言对"
            className="w-4 h-4 flex items-center justify-center rounded text-[11px] text-blue-400 hover:bg-white/10 transition-all disabled:opacity-40 font-bold appearance-none border-none outline-none cursor-pointer"
            onClick={onSwapLanguage}
            disabled={langSwitching}
          >
            ⇄
          </button>
          {renderLangSelect(
            tgtLang,
            (code) => onSetLanguage(srcLang, code),
            langSwitching,
            '目标语言'
          )}
        </div>

        <div className="flex items-center gap-1 text-white/50">
          <button
            onClick={onTogglePin}
            className={`p-1.5 rounded-lg hover:bg-white/10 hover:text-white transition-all ${
              isPinned ? 'text-blue-400 bg-blue-500/20' : ''
            }`}
            title="置顶窗口"
          >
            <Pin className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onMinimize}
            className="p-1.5 rounded-lg hover:bg-white/10 hover:text-white transition-all"
            title="最小化"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            className="p-1.5 rounded-lg hover:bg-white/10 hover:text-white transition-all"
            title="全屏"
          >
            <Square className="w-3 h-3" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-rose-500/20 hover:text-rose-400 transition-all"
            title="关闭"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  )
}
