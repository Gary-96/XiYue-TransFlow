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
      className="bg-transparent text-xs font-semibold text-slate-700 outline-none cursor-pointer appearance-none border-none disabled:opacity-50"
      value={value}
      onChange={(e) => onSelect(e.target.value)}
      disabled={disabled}
    >
      {supportedLangs.map((lang) => (
        <option key={lang.code} value={lang.code}>
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
        className="flex items-center gap-2 w-full max-w-xl bg-white rounded-full px-3 py-1.5 border border-slate-200/80 shadow-2xs"
        style={noDragRegion}
      >
        {/* 平台微型切换胶囊 */}
        <div className="flex bg-slate-100 p-0.5 rounded-full text-xs font-semibold shrink-0">
          <button
            onClick={() => onPlatformChange('douyin')}
            className={`px-3 py-1 rounded-full transition-all appearance-none border-none outline-none cursor-pointer ${
              platform === 'douyin' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-500'
            }`}
          >
            抖音
          </button>
          <button
            onClick={() => onPlatformChange('tiktok')}
            className={`px-3 py-1 rounded-full transition-all appearance-none border-none outline-none cursor-pointer ${
              platform === 'tiktok' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-500'
            }`}
          >
            TikTok
          </button>
        </div>

        <div className="h-4 w-px bg-slate-200 shrink-0" />

        {/* 直播间 ID / 链接输入 */}
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
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
            className="w-full bg-transparent text-xs text-slate-800 placeholder-slate-400 outline-none truncate appearance-none border-none"
          />
        </div>

        {/* 连接 / 断开 */}
        <button
          onClick={onConnectToggle}
          disabled={!roomId.trim() || isConnecting}
          className={`px-4 py-2 rounded-full text-xs font-semibold transition-all shadow-xs shrink-0 cursor-pointer appearance-none border-none outline-none disabled:cursor-not-allowed flex items-center gap-1.5 ${
            platformActive
              ? 'bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200'
              : 'bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40 shadow-blue-500/20'
          }`}
        >
          {isConnecting && <Loader2 className="w-3 h-3 animate-spin" />}
          {platformActive ? '断开' : isConnecting ? '连接中...' : '连接'}
        </button>
      </div>

      {/* 右侧：语言对 + 窗口控制 */}
      <div className="flex items-center gap-2 shrink-0" style={noDragRegion}>
        <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-xl border border-slate-200/80 shadow-2xs">
          {renderLangSelect(
            srcLang,
            (code) => onSetLanguage(code, tgtLang),
            langSwitching,
            '源语言'
          )}
          <button
            aria-label="交换语言对"
            className="w-4 h-4 flex items-center justify-center rounded text-[11px] text-blue-600 hover:bg-slate-100 transition-all disabled:opacity-40 font-bold appearance-none border-none outline-none cursor-pointer"
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

        <div className="flex items-center gap-1 text-slate-400">
          <button
            onClick={onTogglePin}
            className={`p-1.5 rounded-lg hover:bg-white hover:text-slate-700 transition-all ${
              isPinned ? 'text-blue-600 bg-blue-50' : ''
            }`}
            title="置顶窗口"
          >
            <Pin className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onMinimize}
            className="p-1.5 rounded-lg hover:bg-white hover:text-slate-700 transition-all"
            title="最小化"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            className="p-1.5 rounded-lg hover:bg-white hover:text-slate-700 transition-all"
            title="全屏"
          >
            <Square className="w-3 h-3" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-rose-50 hover:text-rose-600 transition-all"
            title="关闭"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  )
}
