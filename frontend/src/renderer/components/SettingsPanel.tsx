/**
 * SettingsPanel — 设置面板主组件 (Light Theme)
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

  const sectionTitles: Record<string, string> = {
    audio: t('settings.audioRoute'),
    settings: t('settings.title'),
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-4 space-y-4 bg-slate-50">
      {/* 标题 */}
      <div className="flex items-center gap-2 pb-3 border-b border-slate-200">
        <span className="text-base">⚙️</span>
        <h3 className="text-sm font-semibold text-slate-800">{t('settings.title')}</h3>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium border animate-[slide-in-up_0.3s_ease] ${
          toast.type === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
            : toast.type === 'error'
              ? 'bg-red-50 border-red-200 text-red-700'
              : 'bg-blue-50 border-blue-200 text-blue-700'
        }`}>
          <span>{toast.type === 'success' ? '✅' : toast.type === 'error' ? '❌' : 'ℹ️'}</span>
          <span>{toast.msg}</span>
        </div>
      )}

      {/* 配置组件 */}
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
