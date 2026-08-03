/**
 * WhisperConfig — Whisper 语音识别模型配置组件
 * 控制模型大小（tiny~large-v3）、运行设备（cuda/cpu/auto）、模型下载目录
 */
import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { API_BASE } from '../../services/api'
import type { Toast } from '../../types'

interface WhisperConfigProps {
  onToast?: (toast: Toast) => void
}

const WHISPER_SIZES = [
  { value: 'tiny', label: 'Tiny (75MB, 极速)' },
  { value: 'base', label: 'Base (145MB, 推荐)' },
  { value: 'small', label: 'Small (488MB, 均衡)' },
  { value: 'medium', label: 'Medium (1.5GB, 高精度)' },
  { value: 'large-v2', label: 'Large-v2 (2.9GB, 最高精度)' },
  { value: 'large-v3', label: 'Large-v3 (2.9GB, 最新版)' },
] as const

const WHISPER_DEVICES = [
  { value: 'auto', label: '自动 (优先 GPU)' },
  { value: 'cuda', label: 'CUDA (NVIDIA GPU)' },
  { value: 'cpu', label: 'CPU (通用)' },
] as const

export default function WhisperConfig({ onToast }: WhisperConfigProps) {
  const { t } = useTranslation()
  const [modelSize, setModelSize] = useState('base')
  const [device, setDevice] = useState('auto')
  const [modelDir, setModelDir] = useState('')
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [modelInfo, setModelInfo] = useState<{ available: boolean; model: string } | null>(null)

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/config`)
      const data = await res.json()
      if (data.status === 'success') {
        const cfg = data.config || {}
        setModelSize(cfg.whisper_model_size || 'base')
        setDevice(cfg.whisper_device || 'auto')
        setModelDir(cfg.whisper_model_dir || '')
        setLoaded(true)
      }
    } catch {
      onToast?.({ type: 'error', msg: t('dashboard.toastConnectFail') })
    }
  }, [t, onToast])

  const loadHealth = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/health`)
      const data = await res.json()
      setModelInfo(data.device ? { available: data.device !== 'not_loaded', model: String(data.device) } : null)
    } catch { /* ignore */ }
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
          whisper_model_dir: modelDir.trim(),
        }),
      })
      const data = await res.json()
      if (data.status === 'success') {
        onToast?.({ type: 'success', msg: '✅ Whisper 配置已保存（模型重启后生效）' })
        await loadHealth()
      } else {
        onToast?.({ type: 'error', msg: data.message || '保存失败' })
      }
    } catch {
      onToast?.({ type: 'error', msg: '网络错误' })
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) return null

  return (
    <div className="space-y-3">
      {/* 标题行 */}
      <div className="flex items-center gap-2 pb-2 border-b border-zinc-800/50">
        <span className="text-base">🎙️</span>
        <h4 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
          Whisper 语音识别
        </h4>
        {modelInfo && (
          <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full ${
            modelInfo.available
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : 'bg-zinc-800 text-zinc-500'
          }`}>
            {modelInfo.available ? '已加载' : '未加载'}
          </span>
        )}
      </div>

      {/* 模型大小 */}
      <div className="space-y-1.5">
        <label className="text-[10px] text-zinc-500 uppercase tracking-wider">模型大小</label>
        <select
          className="w-full bg-zinc-950/60 border border-zinc-700/40 rounded-lg px-3 py-1.5 text-xs text-zinc-200 outline-none focus:border-amber-500/40"
          value={modelSize}
          onChange={(e) => setModelSize(e.target.value)}
        >
          {WHISPER_SIZES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      {/* 运行设备 */}
      <div className="space-y-1.5">
        <label className="text-[10px] text-zinc-500 uppercase tracking-wider">运行设备</label>
        <select
          className="w-full bg-zinc-950/60 border border-zinc-700/40 rounded-lg px-3 py-1.5 text-xs text-zinc-200 outline-none focus:border-amber-500/40"
          value={device}
          onChange={(e) => setDevice(e.target.value)}
        >
          {WHISPER_DEVICES.map((d) => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </select>
      </div>

      {/* 模型下载目录 */}
      <div className="space-y-1.5">
        <label className="text-[10px] text-zinc-500 uppercase tracking-wider">
          模型下载目录
          <span className="text-zinc-600 ml-1">（留空使用默认缓存路径）</span>
        </label>
        <input
          className="w-full bg-zinc-950/60 border border-zinc-700/40 rounded-lg px-3 py-1.5 text-xs text-zinc-200 outline-none placeholder-zinc-600 focus:border-amber-500/40 font-mono"
          type="text"
          placeholder="例: D:\models\faster-whisper"
          value={modelDir}
          onChange={(e) => setModelDir(e.target.value)}
        />
      </div>

      {/* 保存按钮 */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all border border-amber-500/20 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 disabled:opacity-40"
      >
        {saving ? '⏳ 保存中...' : '💾 保存 Whisper 配置'}
      </button>

      {/* 提示 */}
      <p className="text-[9px] text-zinc-600 leading-relaxed">
        修改模型大小或设备后需要重启应用才能生效。更大的模型提供更高精度但占用更多显存/内存。
      </p>
    </div>
  )
}
