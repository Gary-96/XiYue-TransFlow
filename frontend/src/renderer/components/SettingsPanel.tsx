/**
 * SettingsPanel — 设置面板主组件
 *
 * 支持两种模式：
 * 1. 全量模式（activeSection 为空）：显示所有设置组件
 * 2. 分区模式（activeSection 指定）：只渲染对应区块
 *    - "audio"    → 音频设备路由
 *    - "settings" → API Key 管理 + 本地大模型
 */

import { useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import LanguageConfig from './settings/LanguageConfig'
import AudioDevicesConfig from './settings/AudioDevicesConfig'
import ApiKeysConfig from './settings/ApiKeysConfig'
import LocalLLMConfig from './settings/LocalLLMConfig'
import WhisperConfig from './settings/WhisperConfig'
import type { Toast } from '../types'

interface SettingsPanelProps {
  activeSection?: string
}

export default function SettingsPanel({ activeSection }: SettingsPanelProps) {
  const { t } = useTranslation()
  const [toast, setToast] = useState<Toast | null>(null)

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3500)
      return () => clearTimeout(timer)
    }
  }, [toast])

  const handleToast = useCallback((newToast: Toast) => {
    setToast(newToast)
  }, [])

  const showAll = !activeSection
  const showAudio = showAll || activeSection === 'audio'
  const showSettings = showAll || activeSection === 'settings'

  // 分区模式下隐藏的 Tab 列表
  const sectionTitles: Record<string, string> = {
    audio: t('settings.audioRoute'),
    settings: t('settings.title'),
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-4 space-y-4">
      {/* 标题 — 分区模式显示对应区块名，全量模式显示通用标题 */}
      {!showAll && (
        <div className="flex items-center gap-2 pb-3 border-b border-zinc-800/50">
          <span className="text-base">
            {activeSection === 'audio' ? '🎛️' : '⚙️'}
          </span>
          <h3 className="text-sm font-semibold text-zinc-100">
            {sectionTitles[activeSection!] || t('settings.title')}
          </h3>
        </div>
      )}

      {showAll && (
        <div className="flex items-center gap-2 pb-3 border-b border-zinc-800/50">
          <span className="text-base">⚙️</span>
          <h3 className="text-sm font-semibold text-zinc-100">{t('settings.title')}</h3>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium border animate-[slide-in-up_0.3s_ease] ${
            toast.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
              : toast.type === 'error'
                ? 'bg-red-500/10 border-red-500/25 text-red-400'
                : 'bg-cyan-500/8 border-cyan-500/20 text-cyan-400'
          }`}
        >
          <span>
            {toast.type === 'success' ? '✅' : toast.type === 'error' ? '❌' : 'ℹ️'}
          </span>
          <span>{toast.msg}</span>
        </div>
      )}

      {/* 全量模式显示语言配置 + 音频 + API + 本地 LLM + Whisper */}
      {showAll && <LanguageConfig onToast={handleToast} />}
      {showAudio && <AudioDevicesConfig onToast={handleToast} />}
      {showSettings && (
        <>
          <ApiKeysConfig onToast={handleToast} />
          <LocalLLMConfig onToast={handleToast} />
          <WhisperConfig onToast={handleToast} />
        </>
      )}
    </div>
  )
}
