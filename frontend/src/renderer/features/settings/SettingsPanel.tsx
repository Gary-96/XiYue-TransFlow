/**
 * SettingsPanel — 设置面板主组件 (Glassmorphism Aurora 深色)
 */

import { useState, useCallback, useEffect } from 'react'
import LanguageConfig from './LanguageConfig'
import AudioDevicesConfig from './AudioDevicesConfig'
import ApiKeysConfig from './ApiKeysConfig'
import LocalLLMConfig from './LocalLLMConfig'
import WhisperConfig from './WhisperConfig'
import type { Toast } from '../../types'

interface SettingsPanelProps {
  activeSection?: string
}

export default function SettingsPanel({ activeSection }: SettingsPanelProps) {
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

  return (
    <div className="h-full overflow-y-auto px-4 py-4 space-y-4">
      {/* Toast */}
      {toast && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium border backdrop-blur-xl animate-[slide-in-up_0.3s_ease] ${
          toast.type === 'success'
            ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-300'
            : toast.type === 'error'
              ? 'bg-rose-500/15 border-rose-400/30 text-rose-300'
              : 'bg-blue-500/15 border-blue-400/30 text-blue-300'
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
