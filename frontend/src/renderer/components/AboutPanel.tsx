/**
 * AboutPanel — 关于应用面板
 * 展示应用信息、版本号、快捷操作按钮
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

const APP_VERSION = '0.1.1'
const GITHUB_URL = 'https://github.com/Gary-96/leman-translate'

export default function AboutPanel() {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { t } = useTranslation()
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [, forceUpdate] = useState(0)
  const [checking, setChecking] = useState(false)
  const electron = window.electronAPI

  const handleCheckUpdate = async () => {
    setChecking(true)
    try {
      const result = await electron.checkForUpdate()
      if (result?.ok) {
        console.log('[About] 更新检查结果:', result)
      }
    } catch (err) {
      console.error('[About] 检查更新失败:', err)
    } finally {
      setChecking(false)
    }
  }

  const handleOpenGitHub = () => {
    electron.openExternal(GITHUB_URL)
  }

  return (
    <div className="h-full flex flex-col items-center justify-center p-8 overflow-y-auto">
      {/* Logo + 标题 */}
      <div className="flex flex-col items-center gap-4 mb-10">
        {/* Logo 图标 */}
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30 flex items-center justify-center shadow-[0_0_30px_rgba(16,185,129,0.2)]">
          <span className="text-4xl">🌐</span>
        </div>

        {/* 主标题 */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white tracking-wide">
            乐曼同传小助手
          </h1>
          <p className="text-xs text-zinc-500 tracking-widest uppercase mt-1">
            Leman Translate · v{APP_VERSION}
          </p>
        </div>
      </div>

      {/* 简介卡片 */}
      <div className="w-full max-w-sm bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-6 mb-6">
        <p className="text-sm text-zinc-300 leading-relaxed text-center">
          面向中越跨境直播的
          <span className="text-emerald-400 font-medium"> 实时同声传译 </span>
          与
          <span className="text-cyan-400 font-medium"> 弹幕双语互译 </span>
          工具
        </p>
        <div className="mt-4 pt-4 border-t border-zinc-800/50 text-center">
          <span className="text-xs text-zinc-500">创建者 </span>
          <span className="text-xs text-amber-400 font-medium">Gary-96</span>
        </div>
      </div>

      {/* 操作按钮组 */}
      <div className="w-full max-w-sm space-y-3">
        {/* 检查更新 */}
        <button
          onClick={handleCheckUpdate}
          disabled={checking}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-zinc-700/40 bg-zinc-800/30 text-zinc-200 hover:bg-zinc-800/60 hover:border-amber-500/30 hover:text-amber-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="text-lg">{checking ? '⏳' : '🔍'}</span>
          <span className="flex-1 text-left text-sm font-medium">
            {checking ? '正在检查...' : '检查更新'}
          </span>
          {checking && (
            <span className="w-4 h-4 border-2 border-amber-500/40 border-t-amber-500 rounded-full animate-spin" />
          )}
        </button>

        {/* GitHub 仓库 */}
        <button
          onClick={handleOpenGitHub}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-zinc-700/40 bg-zinc-800/30 text-zinc-200 hover:bg-zinc-800/60 hover:border-emerald-500/30 hover:text-emerald-300 transition-all"
        >
          <span className="text-lg">🐙</span>
          <span className="flex-1 text-left text-sm font-medium">GitHub 仓库</span>
          <span className="text-xs text-zinc-500">↗</span>
        </button>

        {/* 开源协议 */}
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-zinc-800/40 bg-zinc-900/20">
          <span className="text-lg">📜</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-zinc-300 font-medium">开源协议</div>
            <div className="text-[11px] text-zinc-500 font-mono">MIT License</div>
          </div>
        </div>
      </div>

      {/* 底部技术栈 */}
      <div className="mt-10 text-center">
        <p className="text-[10px] text-zinc-600 font-mono leading-relaxed">
          FastAPI · Electron · React 18 · faster-whisper
        </p>
        <p className="text-[10px] text-zinc-700 mt-1">
          © 2026 Gary-96 · All rights reserved
        </p>
      </div>
    </div>
  )
}
