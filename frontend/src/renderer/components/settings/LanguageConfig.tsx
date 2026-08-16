/**
 * 语言与音色配置组件 (Glassmorphism Aurora 深色)
 */
import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { API_BASE } from '../../services/api'
import type { VoiceOption, Toast } from '../../types'

const LANGUAGES: Record<string, { label: string; icon: string }> = {
  auto: { label: 'auto', icon: '🔍' },
  zh: { label: '中文', icon: '🇨🇳' },
  vi: { label: '越南语', icon: '🇻🇳' },
  en: { label: '英语', icon: '🇺🇸' },
  ja: { label: '日语', icon: '🇯🇵' },
  ko: { label: '韩语', icon: '🇰🇷' },
  th: { label: '泰语', icon: '🇹🇭' },
}

interface LanguageConfigProps {
  onToast?: (toast: Toast) => void
}

export default function LanguageConfig({ onToast }: LanguageConfigProps) {
  const { t } = useTranslation()
  const [srcLang, setSrcLang] = useState<string>('zh')
  const [tgtLang, setTgtLang] = useState<string>('vi')
  const [languageAvailable, setLanguageAvailable] = useState<Record<string, { label: string; icon: string }>>(LANGUAGES)
  const [voiceOptions, setVoiceOptions] = useState<VoiceOption[]>([])
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>('zh-CN-female-1')
  const [loadingVoices, setLoadingVoices] = useState(false)
  const [saving, setSaving] = useState(false)

  const loadLanguage = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/language/get`)
      const data = await res.json()
      if (data.status === 'success') {
        setSrcLang(data.src_lang || 'zh')
        setTgtLang(data.tgt_lang || 'vi')
        if (data.available_languages) {
          const langs: Record<string, { label: string; icon: string }> = {}
          for (const [k, v] of Object.entries(data.available_languages as Record<string, { label: string; icon: string }>)) {
            langs[k] = { label: v.label, icon: v.icon }
          }
          setLanguageAvailable(langs)
        }
      }
    } catch {
      // 静默失败
    }
  }, [])

  useEffect(() => { loadLanguage() }, [loadLanguage])

  const loadVoices = useCallback(async () => {
    setLoadingVoices(true)
    try {
      const res = await fetch(`${API_BASE}/api/voice/list`)
      const data = await res.json()
      if (data.status === 'success') {
        const opts: VoiceOption[] = (Object.values(data.voices) as VoiceOption[]).sort((a, b) => {
          if (a.id === data.current_voice_id) return -1
          if (b.id === data.current_voice_id) return 1
          if ((a.is_custom && !b.is_custom)) return 1
          if ((!a.is_custom && b.is_custom)) return -1
          return 0
        })
        setVoiceOptions(opts)
        setSelectedVoiceId(data.current_voice_id || 'zh-CN-female-1')
      }
    } catch {
      // 忽略错误
    }
    finally { setLoadingVoices(false) }
  }, [])

  useEffect(() => { loadVoices() }, [loadVoices])

  const handleSetLanguage = async (langType: 'src' | 'tgt', langCode: string) => {
    const newSrc = langType === 'src' ? langCode : srcLang
    const newTgt = langType === 'tgt' ? langCode : tgtLang
    if (langType === 'src') setSrcLang(langCode)
    else setTgtLang(langCode)
    
    setSaving(true)
    try {
      const res = await fetch(`${API_BASE}/api/language/set`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ src_lang: newSrc, tgt_lang: newTgt }),
      })
      const data = await res.json()
      if (data.status === 'success') {
        onToast?.({ type: 'success', msg: `${t('settings.toastLangChanged')}: ${LANGUAGES[newSrc]?.icon || ''}${LANGUAGES[newSrc]?.label || newSrc} → ${LANGUAGES[newTgt]?.icon || ''}${LANGUAGES[newTgt]?.label || newTgt}` })
      } else {
        onToast?.({ type: 'error', msg: data.message || t('settings.netError') })
      }
    } catch {
      onToast?.({ type: 'error', msg: t('settings.netError') })
    }
    finally { setSaving(false) }
  }

  const handleSwitchLanguage = async () => {
    setSaving(true)
    try {
      const res = await fetch(`${API_BASE}/api/language/switch`, { method: 'POST' })
      const data = await res.json()
      if (data.status === 'success') {
        setSrcLang(data.src_lang)
        setTgtLang(data.tgt_lang)
        onToast?.({ type: 'success', msg: `${t('settings.toastLangSwapped')}: ${LANGUAGES[data.src_lang]?.icon || ''}${LANGUAGES[data.src_lang]?.label || data.src_lang} ↔ ${LANGUAGES[data.tgt_lang]?.icon || ''}${LANGUAGES[data.tgt_lang]?.label || data.tgt_lang}` })
      } else {
        onToast?.({ type: 'error', msg: data.message || t('settings.netError') })
      }
    } catch {
      onToast?.({ type: 'error', msg: t('settings.netError') })
    }
    finally { setSaving(false) }
  }

  const handleVoiceChange = async (voiceId: string) => {
    setSelectedVoiceId(voiceId)
    try {
      const res = await fetch(`${API_BASE}/api/voice/set`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voice_id: voiceId }),
      })
      const data = await res.json()
      if (data.status === 'success') {
        onToast?.({ type: 'success', msg: `${t('settings.toastVoiceChanged')}: ${voiceId}` })
      } else {
        onToast?.({ type: 'error', msg: data.message || t('settings.netError') })
      }
    } catch (e) {
      onToast?.({ type: 'error', msg: `${t('settings.netError')}: ${(e as Error).message}` })
    }
  }

  return (
    <>
      {/* 🌐 语言对 */}
      <div className="rounded-xl glass p-4 space-y-3">
        <label className="text-[10px] font-medium text-white/40 uppercase tracking-widest">{t('settings.langPairControl')}</label>
        <div className="flex items-center gap-2">
          <select 
            className="flex-1 bg-white/[0.04] border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-white/90 outline-none focus:border-blue-400/60 focus:ring-2 focus:ring-blue-500/20" 
            value={srcLang} 
            onChange={(e) => handleSetLanguage('src', e.target.value)} 
            disabled={saving}
          >
            {Object.entries(languageAvailable).map(([code, lang]) => (
              <option key={code} value={code}>{lang.icon} {lang.label}</option>
            ))}
          </select>
          <button 
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-white/[0.1] bg-white/[0.04] text-blue-300 hover:bg-blue-500/15 transition-all disabled:opacity-40" 
            onClick={handleSwitchLanguage} 
            disabled={saving || loadingVoices} 
            title="🔄"
          >
            ⇄
          </button>
          <select 
            className="flex-1 bg-white/[0.04] border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-white/90 outline-none focus:border-blue-400/60 focus:ring-2 focus:ring-blue-500/20" 
            value={tgtLang} 
            onChange={(e) => handleSetLanguage('tgt', e.target.value)} 
            disabled={saving}
          >
            {Object.entries(languageAvailable).filter(([k]) => k !== 'auto').map(([code, lang]) => (
              <option key={code} value={code}>{lang.icon} {lang.label}</option>
            ))}
          </select>
        </div>
        <div className="text-[11px] text-white/50 bg-white/[0.04] rounded-md px-3 py-1.5">
          {t('settings.currentLang')}: {LANGUAGES[srcLang]?.icon} {LANGUAGES[srcLang]?.label || srcLang} → {LANGUAGES[tgtLang]?.icon} {LANGUAGES[tgtLang]?.label || tgtLang}
        </div>
      </div>

      {/* 🔊 音色 */}
      <div className="rounded-xl glass p-4 space-y-3">
        <label className="text-[10px] font-medium text-white/40 uppercase tracking-widest">{t('settings.voice')}</label>
        {loadingVoices ? (
          <div className="flex items-center gap-2 text-white/50 text-sm">
            <span className="w-3 h-3 border-2 border-white/20 border-t-blue-400 rounded-full animate-spin" />
            {t('settings.voiceLoading')}
          </div>
        ) : (
          <select 
            className="w-full bg-white/[0.04] border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-white/90 outline-none focus:border-blue-400/60 focus:ring-2 focus:ring-blue-500/20" 
            value={selectedVoiceId} 
            onChange={(e) => handleVoiceChange(e.target.value)} 
            disabled={saving}
          >
            <optgroup label={t('settings.voiceDefault')}>
              {voiceOptions.filter(v => !v.is_custom && !v.edge_voice?.startsWith('zh-CN-Xiaoyi') && !v.edge_voice?.includes('-')).slice(0, 6).map(v => (
                <option key={v.id} value={v.id}>{v.name} ({v.lang}-{v.gender})</option>
              ))}
            </optgroup>
            <optgroup label={t('settings.voiceEdge')}>
              {voiceOptions.filter(v => v.edge_voice && v.edge_voice.startsWith('zh-CN-Xiaoyi')).map(v => (
                <option key={v.id} value={v.id}>{v.name} ({v.lang})</option>
              ))}
              {voiceOptions.filter(v => v.edge_voice && !v.edge_voice.startsWith('zh-CN') && !v.edge_voice.startsWith('vi-VN')).slice(0, 10).map(v => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </optgroup>
            {voiceOptions.some(v => v.is_custom) && (
              <optgroup label={t('settings.voiceCustom')}>
                {voiceOptions.filter(v => v.is_custom).map(v => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </optgroup>
            )}
          </select>
        )}
        <div className="text-[11px] text-white/50 bg-white/[0.04] rounded-md px-3 py-1.5">
          {t('settings.currentLang')}: {voiceOptions.find(v => v.id === selectedVoiceId)?.name || selectedVoiceId}
        </div>
      </div>
    </>
  )
}
