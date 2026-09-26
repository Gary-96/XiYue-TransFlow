/**
 * Whisper 语音识别配置组件 (Glassmorphism Aurora 深色)
 */
import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { API_BASE } from '../../services/api'
import type { Toast } from '../../types'

interface WhisperConfigProps {
  onToast?: (toast: Toast) => void
}

const WHISPER_SIZES = [
  { value: 'tiny', label: 'Tiny (75MB)' },
  { value: 'base', label: 'Base (145MB)' },
  { value: 'small', label: 'Small (483MB)' },
  { value: 'medium', label: 'Medium (1.5GB)' },
  { value: 'large-v2', label: 'Large v2 (2.9GB)' },
  { value: 'large-v3', label: 'Large v3 (2.9GB)' },
]

const WHISPER_DEVICES = [
  { value: 'auto', label: '自动检测' },
  { value: 'cuda', label: 'CUDA (GPU)' },
  { value: 'cpu', label: 'CPU' },
]

export default function WhisperConfig({ onToast }: WhisperConfigProps) {
  const { t } = useTranslation()
  const [modelSize, setModelSize] = useState<string>('base')
  const [device, setDevice] = useState<string>('cuda')
  const [modelDir, setModelDir] = useState<string>('')
  const [loaded, setLoaded] = useState<boolean>(false)
  const [modelLoaded, setModelLoaded] = useState<boolean>(false)
  const [saving, setSaving] = useState(false)

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/config`)
      const data = await res.json()
      if (data.status === 'success') {
        setModelSize(data.config.whisper_model_size || 'base')
        setDevice(data.config.whisper_device || 'cuda')
        setModelDir(data.config.whisper_model_dir || '')
      }
      setLoaded(true)
    } catch {
      setLoaded(true)
    }
  }, [])

  const loadHealth = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/health`)
      const data = await res.json()
      setModelLoaded(data.device && data.device !== 'not_loaded')
    } catch {
      setModelLoaded(false)
    }
  }, [])

  useEffect(() => { loadConfig(); loadHealth() }, [loadConfig, loadHealth])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(`${API_BASE}/api/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          whisper_model_size: modelSize,
          whisper_device: device,
          whisper_model_dir: modelDir,
        }),
      })
      const data = await res.json()
      if (data.status === 'success') {
        onToast?.({ type: 'success', msg: '✅ Whisper 配置已保存（模型重启后生效）' })
      } else {
        onToast?.({ type: 'error', msg: data.message || t('settings.saveOnly') })
      }
    } catch {
      onToast?.({ type: 'error', msg: t('settings.netError') })
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) return null

  return (
    <div className="rounded-xl glass p-4 space-y-3">
      {/* 标题行 */}
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-medium text-white/40 uppercase tracking-widest">🎙️ {t('settings.whisperTitle')}</label>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${
          modelLoaded
            ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-300'
            : 'bg-white/[0.05] border-white/[0.1] text-white/40'
        }`}>
          {modelLoaded ? t('settings.modelLoaded') : t('settings.modelNotLoaded')}
        </span>
      </div>

      {/* 模型大小 */}
      <div className="space-y-1.5">
        <label className="text-xs text-white/60">{t('settings.modelSize')}</label>
        <select
          className="w-full bg-white/[0.04] border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-white/90 outline-none focus:border-blue-400/60 focus:ring-2 focus:ring-blue-500/20"
          value={modelSize}
          onChange={(e) => setModelSize(e.target.value)}
          disabled={saving}
        >
          {WHISPER_SIZES.map(s => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      {/* 运行设备 */}
      <div className="space-y-1.5">
        <label className="text-xs text-white/60">{t('settings.runDevice')}</label>
        <select
          className="w-full bg-white/[0.04] border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-white/90 outline-none focus:border-blue-400/60 focus:ring-2 focus:ring-blue-500/20"
          value={device}
          onChange={(e) => setDevice(e.target.value)}
          disabled={saving}
        >
          {WHISPER_DEVICES.map(d => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </select>
      </div>

      {/* 模型目录 */}
      <div className="space-y-1.5">
        <label className="text-xs text-white/60">{t('settings.modelDir')}</label>
        <input
          type="text"
          className="w-full bg-white/[0.04] border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-white/90 font-mono outline-none placeholder-white/30 focus:border-purple-400/60 focus:ring-2 focus:ring-purple-500/20"
          placeholder="留空使用默认缓存目录"
          value={modelDir}
          onChange={(e) => setModelDir(e.target.value)}
          disabled={saving}
          spellCheck={false}
        />
      </div>

      {/* 保存按钮 */}
      <button
        className="w-full py-2 rounded-lg border border-blue-400/40 bg-blue-500/15 text-blue-300 hover:bg-blue-500/25 font-medium text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? t('settings.savingLocal') : '💾 保存 Whisper 配置'}
      </button>

      {/* 底部提示 */}
      <p className="text-[9px] text-white/30 leading-relaxed">
        {t('settings.whisperHint')}
      </p>
    </div>
  )
}
