/**
 * AboutPanel — 关于应用面板 (Glassmorphism Aurora 深色)
 */
import { useState, useEffect } from 'react'

const GITHUB_URL = 'https://github.com/Gary-96/leman-translate'

export default function AboutPanel() {
  const [appVersion, setAppVersion] = useState<string>('0.2.0')
  const [checking, setChecking] = useState(false)
  const electron = window.electronAPI

  // 动态获取版本号
  useEffect(() => {
    electron?.getAppVersion?.()?.then((v: string) => setAppVersion(v || '0.2.0'))
  }, [])

  const handleCheckUpdate = async () => {
    setChecking(true)
    try {
      await electron.checkForUpdate()
      console.log('[About] 更新检查完成')
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
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500/30 to-purple-600/30 border border-white/[0.15] flex items-center justify-center shadow-[0_0_40px_rgba(99,102,241,0.4)]">
          <span className="text-4xl">🌐</span>
        </div>

        {/* 主标题 */}
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-wide">
            <span className="text-gradient">乐曼同传小助手</span>
          </h1>
          <p className="text-xs text-white/40 tracking-widest uppercase mt-1">
            Leman Translate · v{appVersion}
          </p>
        </div>
      </div>

      {/* 简介卡片 */}
      <div className="w-full max-w-sm glass rounded-2xl p-6 mb-6">
        <p className="text-sm text-white/70 leading-relaxed text-center">
          面向中越跨境直播的
          <span className="text-blue-300 font-medium"> 实时同声传译 </span>
          与
          <span className="text-emerald-300 font-medium"> 弹幕双语互译 </span>
          工具
        </p>
        <div className="mt-4 pt-4 border-t border-white/[0.08] text-center">
          <span className="text-xs text-white/40">创建者 </span>
          <span className="text-xs text-blue-300 font-medium">Gary-96</span>
        </div>
      </div>

      {/* 操作按钮组 */}
      <div className="w-full max-w-sm space-y-3">
        {/* 检查更新 */}
        <button
          onClick={handleCheckUpdate}
          disabled={checking}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl glass text-white/80 hover:bg-white/[0.08] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="text-lg">{checking ? '⏳' : '🔍'}</span>
          <span className="flex-1 text-left text-sm font-medium">
            {checking ? '正在检查...' : '检查更新'}
          </span>
          {checking && (
            <span className="w-4 h-4 border-2 border-white/20 border-t-blue-400 rounded-full animate-spin" />
          )}
        </button>

        {/* GitHub 仓库 */}
        <button
          onClick={handleOpenGitHub}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl glass text-white/80 hover:bg-white/[0.08] transition-all"
        >
          <span className="text-lg">🐙</span>
          <span className="flex-1 text-left text-sm font-medium">GitHub 仓库</span>
          <span className="text-xs text-white/40">↗</span>
        </button>

        {/* 开源协议 */}
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl glass">
          <span className="text-lg">📜</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-white/80 font-medium">开源协议</div>
            <div className="text-[11px] text-white/40 font-mono">MIT License</div>
          </div>
        </div>
      </div>

      {/* 底部技术栈 */}
      <div className="mt-10 text-center">
        <p className="text-[10px] text-white/40 font-mono leading-relaxed">
          FastAPI · Electron · React 18 · faster-whisper
        </p>
        <p className="text-[10px] text-white/30 mt-1">
          © 2026 Gary-96 · All rights reserved
        </p>
      </div>
    </div>
  )
}
