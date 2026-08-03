/**
 * 本地大模型配置组件
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
    <div className="rounded-xl bg-zinc-950/40 border border-zinc-800/50 p-4 space-y-4">
      <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest">{t('settings.localLLM')}</label>
      
      {/* Backend 选择 */}
      <div className="flex gap-2">
        {(['ollama', 'cuda'] as const).map(b => (
          <button
            key={b}
            className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${
              localBackend === b
                ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-400'
                : 'border-zinc-700/50 bg-zinc-900/40 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600'
            }`}
            onClick={() => setLocalBackend(b)}
          >
            {b === 'ollama' ? t('settings.ollama') : t('settings.cuda')}
          </button>
        ))}
      </div>

      {/* Ollama 配置 */}
      {localBackend === 'ollama' && (
        <div className="rounded-lg bg-zinc-900/40 border border-zinc-800/40 p-3 space-y-2">
          <div className="space-y-1">
            <label className="text-xs text-zinc-500">{t('settings.ollamaUrl')}</label>
            <input
              className="w-full bg-zinc-950/60 border border-zinc-700/50 rounded-lg px-3 py-1.5 text-sm text-zinc-200 outline-none focus:border-cyan-500/50"
              value={localOllamaUrl}
              onChange={(e) => setLocalOllamaUrl(e.target.value)}
              placeholder="http://127.0.0.1:11434"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-zinc-500">{t('settings.modelDir')}</label>
            <input
              className="w-full bg-zinc-950/60 border border-zinc-700/50 rounded-lg px-3 py-1.5 text-sm text-zinc-200 outline-none focus:border-cyan-500/50"
              value={localModelDir}
              onChange={(e) => setLocalModelDir(e.target.value)}
              placeholder="默认: %APPDATA%/leman-translate/models"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-zinc-500">{t('settings.modelName')}</label>
            <input
              className="w-full bg-zinc-950/60 border border-zinc-700/50 rounded-lg px-3 py-1.5 text-sm text-zinc-200 outline-none focus:border-cyan-500/50"
              value={localModelName}
              onChange={(e) => setLocalModelName(e.target.value)}
              placeholder="如: qwen2.5:7b"
            />
          </div>
          <div className="flex items-center gap-2 px-3 py-2 bg-zinc-950/40 rounded-lg">
            <span className={`w-2 h-2 rounded-full ${localLLMStatus?.ollama_available ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]' : 'bg-red-500'}`} />
            <span className="text-xs text-zinc-400">
              {localLLMStatus?.ollama_available ? t('settings.ollamaOnline') : t('settings.ollamaOffline')}
            </span>
          </div>
        </div>
      )}

      {/* CUDA 配置 */}
      {localBackend === 'cuda' && (
        <div className="rounded-lg bg-zinc-900/40 border border-zinc-800/40 p-3 space-y-2">
          <div className="space-y-1">
            <label className="text-xs text-zinc-500">{t('settings.cudaModelPath')}</label>
            <input
              className="w-full bg-zinc-950/60 border border-zinc-700/50 rounded-lg px-3 py-1.5 text-sm text-zinc-200 outline-none focus:border-cyan-500/50"
              value={localCudaModelPath}
              onChange={(e) => setLocalCudaModelPath(e.target.value)}
              placeholder="C:\\models\\qwen2.5-7b-instruct-q4_k_m.gguf"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-zinc-500">{t('settings.cudaModelUrl')}</label>
            <input
              className="w-full bg-zinc-950/60 border border-zinc-700/50 rounded-lg px-3 py-1.5 text-sm text-zinc-200 outline-none focus:border-cyan-500/50"
              value={localCudaDownloadUrl}
              onChange={(e) => setLocalCudaDownloadUrl(e.target.value)}
              placeholder="https://huggingface.co/.../model.gguf"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-zinc-500">{t('settings.modelDir')}</label>
            <input
              className="w-full bg-zinc-950/60 border border-zinc-700/50 rounded-lg px-3 py-1.5 text-sm text-zinc-200 outline-none focus:border-cyan-500/50"
              value={localModelDir}
              onChange={(e) => setLocalModelDir(e.target.value)}
              placeholder="默认: %APPDATA%/leman-translate/models"
            />
          </div>
          <div className="flex items-center gap-2 px-3 py-2 bg-zinc-950/40 rounded-lg">
            <span className={`w-2 h-2 rounded-full ${localLLMStatus?.cuda_available ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]' : 'bg-red-500'}`} />
            <span className="text-xs text-zinc-400">
              {localLLMStatus?.cuda_available ? t('settings.cudaReady') : t('settings.cudaNeedPath')}
            </span>
          </div>
        </div>
      )}

      {/* 保存按钮 */}
      <button
        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white text-sm font-medium py-2.5 rounded-lg transition-all active:scale-[0.98] disabled:cursor-not-allowed"
        onClick={handleSaveLocalConfig}
        disabled={savingLocal}
      >
        {savingLocal ? t('settings.savingLocal') : t('settings.saveLocalModel')}
      </button>

      {/* 拉取模型 */}
      <div className="space-y-2">
        <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest">{t('settings.pullModel')}</label>
        <div className="flex gap-2">
          <input
            className="flex-1 bg-zinc-900/60 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none placeholder-zinc-700 focus:border-violet-500/50"
            placeholder={localBackend === 'ollama' ? t('settings.pullModelPlaceholderOllama') : t('settings.pullModelPlaceholderCuda')}
            value={pullModelName}
            onChange={(e) => setPullModelName(e.target.value)}
          />
          <button
            className="px-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white text-sm font-medium rounded-lg transition-all active:scale-[0.98] disabled:cursor-not-allowed"
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
          <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest">{t('settings.installedModels')}</label>
          <div className="space-y-1.5">
            {localModels.map(model => (
              <div key={model.name} className="flex items-center gap-3 px-3 py-2 bg-zinc-900/40 border border-zinc-800/40 rounded-lg">
                <span className="flex-1 text-sm text-zinc-200 font-medium">{model.name}</span>
                <span className="text-xs text-zinc-600">{model.size_human}</span>
                <button
                  className="w-7 h-7 flex items-center justify-center rounded-lg border border-zinc-700/40 text-zinc-500 hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/10 transition-all"
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
