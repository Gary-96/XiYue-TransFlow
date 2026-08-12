/**
 * API Key 与模型配置组件 — Tab 切换版 (Light Theme)
 */
import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { API_BASE } from '../../services/api'
import type { ProviderKey, SafeConfig, Toast } from '../../types'

interface ApiKeysConfigProps {
  onToast?: (toast: Toast) => void
}

const PROVIDER_META: Record<string, { icon: string; name: string; url: string; defaultEndpoint?: string }> = {
  gemini: { icon: '✦', name: 'Google Gemini', url: 'https://aistudio.google.com/apikey' },
  deepseek: { icon: '🧠', name: 'DeepSeek', url: 'https://platform.deepseek.com/api_keys' },
  groq: { icon: '⚡', name: 'Groq', url: 'https://console.groq.com/keys' },
  openai: { icon: '🌟', name: 'OpenAI', url: 'https://platform.openai.com/api-keys' },
}

type TestStatus = 'idle' | 'testing' | 'success' | 'error'

export default function ApiKeysConfig({ onToast }: ApiKeysConfigProps) {
  const { t } = useTranslation()
  const [config, setConfig] = useState<SafeConfig | null>(null)
  const [providers, setProviders] = useState<Record<string, string>>({})
  const [configPath, setConfigPath] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState<ProviderKey>('gemini')
  const [editKeys, setEditKeys] = useState<Record<string, string>>({})
  const [editEndpoints, setEditEndpoints] = useState<Record<string, string>>({})
  const [editModels, setEditModels] = useState<Record<string, string>>({})
  const [visibleKey, setVisibleKey] = useState(false)
  const [testStatus, setTestStatus] = useState<TestStatus>('idle')
  const [testMessage, setTestMessage] = useState<string>('')

  const loadConfig = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/config`)
      const data = await res.json()
      if (data.status === 'success') {
        setConfig(data.config)
        setProviders(data.providers || {})
        setConfigPath(data.config_path || '')
        const provider = data.config.current_provider as ProviderKey || 'gemini'
        setSelectedProvider(provider)
        setEditKeys({ ...data.config.keys })
        setEditEndpoints({ ...data.config.custom_endpoints })
        setEditModels({ ...data.config.models })
        setVisibleKey(false)
      }
    } catch {
      onToast?.({ type: 'error', msg: t('dashboard.toastConnectFail') })
    } finally {
      setLoading(false)
    }
  }, [t, onToast])

  useEffect(() => { loadConfig() }, [loadConfig])

  const handleTabChange = useCallback((provider: ProviderKey) => {
    setSelectedProvider(provider)
    setVisibleKey(false)
    setTestStatus('idle')
    setTestMessage('')
  }, [])

  const toggleKeyVisible = () => setVisibleKey(v => !v)

  const handleTestConnection = async () => {
    const apiKey = editKeys[selectedProvider] || ''
    if (!apiKey || apiKey.includes('****')) {
      setTestStatus('error')
      setTestMessage(t('settings.enterApiKey'))
      onToast?.({ type: 'error', msg: t('settings.enterApiKey') })
      return
    }

    setTestStatus('testing')
    setTestMessage(t('settings.testingConnection'))

    try {
      const res = await fetch(`${API_BASE}/api/config/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: selectedProvider,
          api_key: apiKey,
          endpoint: editEndpoints[selectedProvider],
        }),
      })
      const data = await res.json()
      if (data.status === 'success' && data.result?.valid) {
        setTestStatus('success')
        setTestMessage(`${data.result.message || t('settings.connectionSuccess')}`)
        onToast?.({ type: 'success', msg: data.result.message || t('settings.connectionSuccess') })
      } else {
        setTestStatus('error')
        setTestMessage(data.result?.message || t('settings.connectionFailed'))
        onToast?.({ type: 'error', msg: data.result?.message || t('settings.connectionFailed') })
      }
    } catch (e) {
      setTestStatus('error')
      setTestMessage(`${t('settings.netError')}: ${(e as Error).message}`)
      onToast?.({ type: 'error', msg: `${t('settings.netError')}: ${(e as Error).message}` })
    }
  }

  const handleSave = async (testFirst = false) => {
    const apiKey = editKeys[selectedProvider] || ''
    if (testFirst && (!apiKey || apiKey.includes('****'))) {
      onToast?.({ type: 'error', msg: t('settings.enterApiKey') })
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`${API_BASE}/api/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_provider: selectedProvider,
          keys: editKeys,
          custom_endpoints: editEndpoints,
          models: editModels,
          mode: config?.mode || 'auto',
        }),
      })
      const data = await res.json()
      if (data.status === 'success') {
        setConfig(data.config)
        setEditKeys({ ...data.config.keys })
        onToast?.({ type: 'success', msg: t('settings.saveSuccess') })
      } else {
        onToast?.({ type: 'error', msg: data.message || t('settings.saveOnly') })
      }
    } catch (e) {
      onToast?.({ type: 'error', msg: `${t('settings.netError')}: ${(e as Error).message}` })
    } finally {
      setSaving(false)
    }
  }

  const providerList: ProviderKey[] = Object.keys(providers) as ProviderKey[]
  const meta = PROVIDER_META[selectedProvider] || { icon: '🌐', name: selectedProvider }
  const showEndpoint = selectedProvider !== 'gemini'

  if (loading) {
    return (
      <div className="rounded-xl bg-white border border-slate-200 p-4 flex items-center justify-center min-h-[120px] shadow-sm">
        <div className="flex items-center gap-3 text-slate-500 text-sm">
          <span className="w-4 h-4 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
          {t('settings.loadingConfig')}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl bg-white border border-slate-200 overflow-hidden shadow-sm">
      {/* ── Tab 导航栏 ──────────────────────────────────── */}
      <div className="flex border-b border-slate-200 bg-slate-50">
        {providerList.map(p => {
          const pMeta = PROVIDER_META[p]
          const isActive = selectedProvider === p
          return (
            <button
              key={p}
              onClick={() => handleTabChange(p as ProviderKey)}
              className={`flex-1 flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-all relative ${
                isActive
                  ? 'text-blue-700 bg-white'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
              }`}
            >
              <span>{pMeta?.icon || '🌐'}</span>
              <span className="truncate">{pMeta?.name || p}</span>
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />
              )}
            </button>
          )
        })}
      </div>

      {/* ── 当前 Tab 内容区 ─────────────────────────────── */}
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
          <span className="text-lg">{meta.icon}</span>
          <div className="flex-1">
            <div className="text-sm font-semibold text-slate-800">{meta.name}</div>
            <a
              href={meta.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-slate-400 hover:text-blue-600 transition-colors flex items-center gap-1"
            >
              <span>🔗</span>
              {t('settings.getApiKey')}
            </a>
          </div>
          {config?.current_provider === selectedProvider && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium border border-blue-200">
              {t('settings.current')}
            </span>
          )}
        </div>

        {/* API Key */}
        <div className="space-y-1.5">
          <label className="text-[10px] text-slate-500 uppercase tracking-wider">{t('settings.apiKey')}</label>
          <div className="flex gap-2">
            <input
              type={visibleKey ? 'text' : 'password'}
              className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 font-mono outline-none placeholder-slate-400 focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
              placeholder={`${t('settings.apiKeyPlaceholder')} (${meta.name})`}
              value={editKeys[selectedProvider] || ''}
              onChange={(e) => setEditKeys(prev => ({ ...prev, [selectedProvider]: e.target.value }))}
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              className="px-3 rounded-lg border border-slate-200 bg-slate-50 text-slate-500 hover:text-slate-700 transition-all text-sm"
              onClick={toggleKeyVisible}
              title={visibleKey ? t('settings.toggleHide') : t('settings.toggleShow')}
            >
              {visibleKey ? '🙈' : '👁️'}
            </button>
          </div>
        </div>

        {/* 自定义端点 */}
        {showEndpoint && (
          <div className="space-y-1.5">
            <label className="text-[10px] text-slate-500 uppercase tracking-wider">{t('settings.endpoint')}</label>
            <input
              type="text"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 font-mono outline-none placeholder-slate-400 focus:border-violet-400 focus:ring-1 focus:ring-violet-100"
              placeholder={meta.defaultEndpoint || t('settings.endpointPlaceholder')}
              value={editEndpoints[selectedProvider] || ''}
              onChange={(e) => setEditEndpoints(prev => ({ ...prev, [selectedProvider]: e.target.value }))}
              spellCheck={false}
            />
          </div>
        )}

        {/* 模型名 */}
        <div className="space-y-1.5">
          <label className="text-[10px] text-slate-500 uppercase tracking-wider">{t('settings.modelName')}</label>
          <input
            type="text"
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 outline-none placeholder-slate-400 focus:border-violet-400 focus:ring-1 focus:ring-violet-100"
            placeholder={t('settings.modelPlaceholder')}
            value={editModels[selectedProvider] || ''}
            onChange={(e) => setEditModels(prev => ({ ...prev, [selectedProvider]: e.target.value }))}
            spellCheck={false}
          />
        </div>

        {/* 测试连接 */}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testStatus === 'testing' || saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-600 hover:text-slate-800 hover:border-slate-300 transition-all text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {testStatus === 'testing' ? (
              <><span className="w-3 h-3 border-2 border-slate-400 border-t-blue-500 rounded-full animate-spin" />{t('settings.testingConnection')}</>
            ) : testStatus === 'success' ? (
              <><span>✅</span>{t('settings.connectionSuccess')}</>
            ) : testStatus === 'error' ? (
              <><span>❌</span>{testMessage}</>
            ) : (
              <><span>🧪</span>{t('settings.testConnection')}</>
            )}
          </button>
          {testStatus === 'success' && (
            <span className="text-xs text-emerald-600 animate-[slide-in-up_0.2s_ease]">
              {testMessage}
            </span>
          )}
        </div>

        {/* 配置文件路径 */}
        {configPath && (
          <div className="text-[10px] text-slate-400 bg-slate-50 rounded-md px-3 py-2">
            📁 {t('settings.configPath')}: <code className="text-violet-600 font-mono break-all">{configPath}</code>
          </div>
        )}
      </div>

      {/* ── 底部操作按钮 ────────────────────────────────── */}
      <div className="flex gap-2 p-4 pt-0 border-t border-slate-100">
        <button
          className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-medium py-2 rounded-lg transition-all active:scale-[0.98] disabled:cursor-not-allowed flex items-center justify-center gap-2"
          onClick={() => handleSave(true)}
          disabled={saving || testStatus === 'testing'}
        >
          {saving ? (
            <><span className="w-3 h-3 border-2 border-slate-400 border-t-white rounded-full animate-spin" />{t('settings.saving')}</>
          ) : (
            <>💾 {t('settings.saveTest')}</>
          )}
        </button>
        <button
          className="flex-1 bg-slate-100 hover:bg-slate-200 disabled:bg-slate-50 disabled:text-slate-400 text-slate-600 border border-slate-200 text-sm font-medium py-2 rounded-lg transition-all active:scale-[0.98] disabled:cursor-not-allowed"
          onClick={() => handleSave(false)}
          disabled={saving}
        >
          {t('settings.saveOnly')}
        </button>
      </div>
    </div>
  )
}
