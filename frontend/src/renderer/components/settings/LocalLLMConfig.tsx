/**
 * 本地大模型配置组件 (Glassmorphism Aurora 深色)
 */
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { API_BASE } from '../../services/api'
import type { LocalModel, LocalLLMStatus, Toast } from '../../types'

interface LocalLLMConfigProps {
  onToast?: (toast: Toast) => void
}

export default function LocalLLMConfig({ onToast }: LocalLLMConfigProps) {
  const { t } = useTranslation()
  const [localLLMStatus, setLocalLLMStatus] = useState<LocalLLMStatus | null>(null)
  const [localModels, setLocalModels] = useState<LocalModel[]>([])
  const [localBackend, setLocalBackend] = useState<'ollama' | 'cuda'>('ollama')
  const [localOllamaUrl, setLocalOllamaUrl] = useState('http://127.0.0.1:11434')
  const [localModelName, setLocalModelName] = useState('')
  const [localModelDir, setLocalModelDir] = useState('')
  const [localCudaModelPath, setLocalCudaModelPath] = useState('')
  const [localCudaDownloadUrl, setLocalCudaDownloadUrl] = useState('')
  const [pullModelName, setPullModelName] = useState('')
  const [pulling, setPulling] = useState(false)
  const [savingLocal, setSavingLocal] = useState(false)

  // ── Load Local LLM ────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const [statusRes, modelsRes] = await Promise.all([
          fetch(`${API_BASE}/api/local-llm/status`),
          fetch(`${API_BASE}/api/local-llm/models`),
        ])
        const statusData = await statusRes.json()
        if (statusData.status === 'success') {
          setLocalLLMStatus(statusData)
          setLocalBackend(statusData.backend as 'ollama' | 'cuda')
          setLocalOllamaUrl(statusData.ollama_url)
          setLocalModelDir(statusData.model_dir)
          setLocalCudaModelPath(statusData.cuda_model_path)
        }
        const modelsData = await modelsRes.json()
        if (modelsData.status === 'success') {
          setLocalModels(modelsData.models || [])
        }
      } catch {
        // 忽略错误
      }
    }
    load()
  }, [])

  // ── Handlers ──────────────────────────────────────────
  const handleSaveLocalConfig = async () => {
    setSavingLocal(true)
    try {
      const res = await fetch(`${API_BASE}/api/local-llm/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          local_backend: localBackend,
          local_ollama_url: localOllamaUrl,
          local_model_name: localModelName,
          local_model_dir: localModelDir,
          local_cuda_model_path: localCudaModelPath,
          local_cuda_download_url: localCudaDownloadUrl,
        }),
      })
      const data = await res.json()
      if (data.status === 'success') {
        onToast?.({ type: 'success', msg: t('settings.toastLocalSaved') })
        const statusRes = await fetch(`${API_BASE}/api/local-llm/status`)
        const statusData = await statusRes.json()
        if (statusData.status === 'success') {
          setLocalLLMStatus(statusData)
        }
      } else {
        onToast?.({ type: 'error', msg: data.message || t('settings.saveOnly') })
      }
    } catch (e) {
      onToast?.({ type: 'error', msg: `${t('settings.netError')}: ${(e as Error).message}` })
    } finally {
      setSavingLocal(false)
    }
  }

  const handlePullModel = async () => {
    if (!pullModelName) {
      onToast?.({ type: 'error', msg: t('settings.toastNeedModelName') })
      return
    }
    setPulling(true)
    try {
      const res = await fetch(`${API_BASE}/api/local-llm/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_name: pullModelName }),
      })
      const data = await res.json()
      if (data.status === 'success') {
        onToast?.({ type: 'success', msg: `${t('settings.toastModelPulled')}: ${pullModelName}` })
        setPullModelName('')
        const modelsRes = await fetch(`${API_BASE}/api/local-llm/models`)
        const modelsData = await modelsRes.json()
        if (modelsData.status === 'success') {
          setLocalModels(modelsData.models || [])
        }
      } else {
        onToast?.({ type: 'error', msg: data.message || t('settings.saveOnly') })
      }
    } catch (e) {
      onToast?.({ type: 'error', msg: `${t('settings.netError')}: ${(e as Error).message}` })
    } finally {
      setPulling(false)
    }
  }

  const handleDeleteModel = async (modelName: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/local-llm/models/${encodeURIComponent(modelName)}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (data.status === 'success') {
        setLocalModels(prev => prev.filter(m => m.name !== modelName))
        onToast?.({ type: 'success', msg: `${t('settings.toastModelDeleted')}: ${modelName}` })
      }
    } catch {
      onToast?.({ type: 'error', msg: t('settings.toastDeleteFail') })
    }
  }

  return (
    <div className="rounded-xl glass p-4 space-y-4">
      <label className="text-[10px] font-medium text-white/40 uppercase tracking-widest">{t('settings.localLLM')}</label>
      
      {/* Backend 选择 */}
      <div className="flex gap-2">
        {(['ollama', 'cuda'] as const).map(b => (
          <button
            key={b}
            className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${
              localBackend === b
                ? 'border-blue-400/50 bg-blue-500/15 text-blue-200 shadow-[0_0_12px_rgba(99,102,241,0.2)]'
                : 'border-white/[0.1] bg-white/[0.04] text-white/50 hover:text-white/80 hover:border-white/[0.2]'
            }`}
            onClick={() => setLocalBackend(b)}
          >
            {b === 'ollama' ? t('settings.ollama') : t('settings.cuda')}
          </button>
        ))}
      </div>

      {/* Ollama 配置 */}
      {localBackend === 'ollama' && (
        <div className="rounded-lg bg-white/[0.04] border border-white/[0.1] p-3 space-y-2">
          <div className="space-y-1.5">
            <label className="text-xs text-white/60">{t('settings.ollamaUrl')}</label>
            <input
              className="w-full max-w-full box-border bg-white/[0.04] border border-white/[0.1] rounded-lg px-3 py-1.5 text-sm text-white/90 outline-none focus:border-blue-400/60 focus:ring-2 focus:ring-blue-500/20"
              value={localOllamaUrl}
              onChange={(e) => setLocalOllamaUrl(e.target.value)}
              placeholder="http://127.0.0.1:11434"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-white/60">{t('settings.modelDir')}</label>
            <input
              className="w-full max-w-full box-border bg-white/[0.04] border border-white/[0.1] rounded-lg px-3 py-1.5 text-sm text-white/90 outline-none focus:border-blue-400/60 focus:ring-2 focus:ring-blue-500/20"
              value={localModelDir}
              onChange={(e) => setLocalModelDir(e.target.value)}
              placeholder="默认: %APPDATA%/leman-translate/models"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-white/60">{t('settings.modelName')}</label>
            <input
              className="w-full max-w-full box-border bg-white/[0.04] border border-white/[0.1] rounded-lg px-3 py-1.5 text-sm text-white/90 outline-none focus:border-blue-400/60 focus:ring-2 focus:ring-blue-500/20"
              value={localModelName}
              onChange={(e) => setLocalModelName(e.target.value)}
              placeholder="如: qwen2.5:7b"
            />
          </div>
          <div className="flex items-center gap-2 px-3 py-2 bg-white/[0.04] border border-white/[0.1] rounded-lg">
            <span className={`w-2 h-2 rounded-full ${localLLMStatus?.ollama_available ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]' : 'bg-rose-400'}`} />
            <span className="text-xs text-white/60">
              {localLLMStatus?.ollama_available ? t('settings.ollamaOnline') : t('settings.ollamaOffline')}
            </span>
          </div>
        </div>
      )}

      {/* CUDA 配置 */}
      {localBackend === 'cuda' && (
        <div className="rounded-lg bg-white/[0.04] border border-white/[0.1] p-3 space-y-2">
          <div className="space-y-1.5">
            <label className="text-xs text-white/60">{t('settings.cudaModelPath')}</label>
            <input
              className="w-full bg-white/[0.04] border border-white/[0.1] rounded-lg px-3 py-1.5 text-sm text-white/90 outline-none focus:border-blue-400/60 focus:ring-2 focus:ring-blue-500/20"
              value={localCudaModelPath}
              onChange={(e) => setLocalCudaModelPath(e.target.value)}
              placeholder="C:\\models\\qwen2.5-7b-instruct-q4_k_m.gguf"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-white/60">{t('settings.cudaModelUrl')}</label>
            <input
              className="w-full bg-white/[0.04] border border-white/[0.1] rounded-lg px-3 py-1.5 text-sm text-white/90 outline-none focus:border-blue-400/60 focus:ring-2 focus:ring-blue-500/20"
              value={localCudaDownloadUrl}
              onChange={(e) => setLocalCudaDownloadUrl(e.target.value)}
              placeholder="https://huggingface.co/.../model.gguf"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-white/60">{t('settings.modelDir')}</label>
            <input
              className="w-full bg-white/[0.04] border border-white/[0.1] rounded-lg px-3 py-1.5 text-sm text-white/90 outline-none focus:border-blue-400/60 focus:ring-2 focus:ring-blue-500/20"
              value={localModelDir}
              onChange={(e) => setLocalModelDir(e.target.value)}
              placeholder="默认: %APPDATA%/leman-translate/models"
            />
          </div>
          <div className="flex items-center gap-2 px-3 py-2 bg-white/[0.04] border border-white/[0.1] rounded-lg">
            <span className={`w-2 h-2 rounded-full ${localLLMStatus?.cuda_available ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]' : 'bg-rose-400'}`} />
            <span className="text-xs text-white/60">
              {localLLMStatus?.cuda_available ? t('settings.cudaReady') : t('settings.cudaNeedPath')}
            </span>
          </div>
        </div>
      )}

      {/* 保存按钮 */}
      <button
        className="w-full btn-grad disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 rounded-lg transition-all active:scale-[0.98]"
        onClick={handleSaveLocalConfig}
        disabled={savingLocal}
      >
        {savingLocal ? t('settings.savingLocal') : t('settings.saveLocalModel')}
      </button>

      {/* 拉取模型 */}
      <div className="space-y-2">
        <label className="text-[10px] font-medium text-white/40 uppercase tracking-widest">{t('settings.pullModel')}</label>
        <div className="flex gap-2">
          <input
            className="flex-1 min-w-0 bg-white/[0.04] border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-white/90 outline-none placeholder-white/30 focus:border-blue-400/60 focus:ring-2 focus:ring-blue-500/20"
            placeholder={localBackend === 'ollama' ? t('settings.pullModelPlaceholderOllama') : t('settings.pullModelPlaceholderCuda')}
            value={pullModelName}
            onChange={(e) => setPullModelName(e.target.value)}
          />
          <button
            className="px-4 btn-grad disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-all active:scale-[0.98]"
            onClick={handlePullModel}
            disabled={pulling}
          >
            {pulling ? t('settings.pulling') : t('settings.pullModelBtn')}
          </button>
        </div>
      </div>

      {/* 已安装模型 */}
      {localModels.length > 0 && (
        <div className="space-y-2">
          <label className="text-[10px] font-medium text-white/40 uppercase tracking-widest">{t('settings.installedModels')}</label>
          <div className="space-y-1.5">
            {localModels.map(model => (
              <div key={model.name} className="flex items-center gap-3 px-3 py-2 bg-white/[0.04] border border-white/[0.1] rounded-lg">
                <span className="flex-1 text-sm text-white/80 font-medium">{model.name}</span>
                <span className="text-xs text-white/40">{model.size_human}</span>
                <button
                  className="w-7 h-7 flex items-center justify-center rounded-lg border border-white/[0.1] text-white/40 hover:text-rose-300 hover:border-rose-400/40 hover:bg-rose-500/15 transition-all"
                  onClick={() => handleDeleteModel(model.name)}
                  type="button"
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
