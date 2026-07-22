/**
 * SettingsPanel — API Key 管理与设置持久化
 * 亚克力毛玻璃 + 深空电竞极光风
 */
import { useState, useEffect, useCallback } from 'react'

const API_BASE = 'http://localhost:8000'

type ProviderKey = 'gemini' | 'groq' | 'deepseek' | 'openai'

interface SafeConfig {
  current_provider: string
  keys: Record<string, string>
  custom_endpoints: Record<string, string>
  models: Record<string, string>
  mode: string
  audio_device_id?: number | null
}

// ── 音频设备类型 ────────────────────────────────────────
interface AudioDevice {
  id: number
  name: string
  is_default: boolean
  channels: number
  max_input_channels: number
  default_samplerate: number
  driver: string
  hostapi: string
  is_pro_device: boolean
}

interface ValidationResult {
  valid: boolean
  message: string
  latency_ms: number
}

export default function SettingsPanel() {
  const [config, setConfig] = useState<SafeConfig | null>(null)
  const [providers, setProviders] = useState<Record<string, string>>({})
  const [configPath, setConfigPath] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [validating, setValidating] = useState<string | null>(null)

  // 本地编辑态（不受后端脱敏值干扰）
  const [editKeys, setEditKeys] = useState<Record<string, string>>({})
  const [editEndpoints, setEditEndpoints] = useState<Record<string, string>>({})
  const [editModels, setEditModels] = useState<Record<string, string>>({})
  const [selectedProvider, setSelectedProvider] = useState<string>('gemini')

  // 显隐密码
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({})

  // Toast
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; msg: string } | null>(null)

  // ── 音频设备状态 ──────────────────────────────────────
  const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | null>(null)
  const [loadingDevices, setLoadingDevices] = useState(false)
  const [switchingDevice, setSwitchingDevice] = useState(false)

  // ── 加载配置 ──────────────────────────────────────────
  const loadConfig = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/config`)
      const data = await res.json()
      if (data.status === 'success') {
        setConfig(data.config)
        setProviders(data.providers || {})
        setConfigPath(data.config_path || '')
        setSelectedProvider(data.config.current_provider)

        // 初始化编辑态：脱敏值原样保留，用户修改时覆盖
        setEditKeys({ ...data.config.keys })
        setEditEndpoints({ ...data.config.custom_endpoints })
        setEditModels({ ...data.config.models })
        
        // 同步音频设备 ID
        setSelectedDeviceId(data.config.audio_device_id ?? null)
      }
    } catch {
      setToast({ type: 'error', msg: '无法连接后端服务' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  // ── 加载音频设备列表 ──────────────────────────────────
  const loadAudioDevices = useCallback(async () => {
    setLoadingDevices(true)
    try {
      const res = await fetch(`${API_BASE}/api/audio/devices`)
      const data = await res.json()
      if (data.status === 'success') {
        setAudioDevices(data.devices || [])
        setSelectedDeviceId(data.current_device_id ?? null)
      }
    } catch {
      setToast({ type: 'error', msg: '无法获取音频设备列表' })
    } finally {
      setLoadingDevices(false)
    }
  }, [])

  // 页面加载时自动获取设备列表
  useEffect(() => {
    loadAudioDevices()
  }, [loadAudioDevices])

  // ── 切换音频输入设备 ──────────────────────────────────
  const handleSwitchAudioDevice = async (deviceId: number | null) => {
    setSwitchingDevice(true)
    setSelectedDeviceId(deviceId)
    try {
      const res = await fetch(`${API_BASE}/api/audio/device`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: deviceId }),
      })
      const data = await res.json()
      if (data.status === 'success') {
        const devName = deviceId === null 
          ? '系统默认设备' 
          : audioDevices.find(d => d.id === deviceId)?.name || `设备 ${deviceId}`
        setToast({ type: 'success', msg: `🎤 已切换到: ${devName}` })
      } else {
        setToast({ type: 'error', msg: data.message || '切换失败' })
        // 恢复之前的选择
        setSelectedDeviceId(config?.audio_device_id ?? null)
      }
    } catch (e) {
      setToast({ type: 'error', msg: `网络错误: ${(e as Error).message}` })
      setSelectedDeviceId(config?.audio_device_id ?? null)
    } finally {
      setSwitchingDevice(false)
    }
  }

  // Toast 自动消失
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3500)
      return () => clearTimeout(timer)
    }
  }, [toast])

  // ── 保存并测试连接 ────────────────────────────────────
  const handleSaveAndTest = async () => {
    if (!selectedProvider) {
      setToast({ type: 'error', msg: '请先选择服务商' })
      return
    }

    const apiKey = editKeys[selectedProvider] || ''
    if (!apiKey || apiKey.includes('****')) {
      setToast({ type: 'error', msg: '请输入完整的 API Key' })
      return
    }

    // 1. 先校验
    setValidating(selectedProvider)
    setToast({ type: 'info', msg: `正在校验 ${providers[selectedProvider] || selectedProvider} API Key...` })

    try {
      const validateRes = await fetch(`${API_BASE}/api/config/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: selectedProvider, api_key: apiKey }),
      })
      const validateData = await validateRes.json()

      if (validateData.status !== 'success' || !validateData.result.valid) {
        const msg = validateData.result?.message || '校验失败'
        setToast({ type: 'error', msg })
        setValidating(null)
        return
      }

      // 2. 校验成功 → 保存配置
      setSaving(true)
      const saveRes = await fetch(`${API_BASE}/api/config`, {
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
      const saveData = await saveRes.json()

      if (saveData.status === 'success') {
        setConfig(saveData.config)
        setEditKeys({ ...saveData.config.keys })
        setToast({ type: 'success', msg: `✅ ${validateData.result.message}，配置已保存` })
      } else {
        setToast({ type: 'error', msg: saveData.message || '保存失败' })
      }
    } catch (e) {
      setToast({ type: 'error', msg: `网络错误: ${(e as Error).message}` })
    } finally {
      setValidating(null)
      setSaving(false)
    }
  }

  // ── 仅保存（不校验）─────────────────────────────────
  const handleSaveOnly = async () => {
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
        setToast({ type: 'success', msg: '配置已保存' })
      } else {
        setToast({ type: 'error', msg: data.message || '保存失败' })
      }
    } catch (e) {
      setToast({ type: 'error', msg: `网络错误: ${(e as Error).message}` })
    } finally {
      setSaving(false)
    }
  }

  // ── 切换服务商 ────────────────────────────────────────
  const handleProviderChange = async (provider: string) => {
    setSelectedProvider(provider)
    // 立即切换并保存
    try {
      await fetch(`${API_BASE}/api/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_provider: provider }),
      })
      setToast({ type: 'info', msg: `已切换到 ${providers[provider] || provider}` })
    } catch {
      // 静默
    }
  }

  const toggleKeyVisible = (provider: string) => {
    setVisibleKeys((prev) => ({ ...prev, [provider]: !prev[provider] }))
  }

  const providerList: ProviderKey[] = ['gemini', 'groq', 'deepseek', 'openai']

  // ── 加载态 ────────────────────────────────────────────
  if (loading) {
    return (
      <div className="settings-panel glass">
        <div className="settings-loading">
          <div className="loading-spinner" />
          <span>加载配置中...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="settings-panel glass">
      <div className="settings-header">
        <span className="settings-icon">⚙️</span>
        <h3>API & 模型设置</h3>
      </div>

      {/* ── 🎙️ 音频输入设置 ─────────────────────────── */}
      <section className="settings-section">
        <label className="setting-label">🎙️ 音频输入设备</label>
        <div className="audio-device-selector">
          <select
            className="device-select"
            value={selectedDeviceId ?? -1}
            onChange={(e) => {
              const val = e.target.value
              handleSwitchAudioDevice(val === '-1' ? null : parseInt(val, 10))
            }}
            disabled={switchingDevice || loadingDevices}
          >
            <option value={-1}>系统默认设备</option>
            {audioDevices.map((dev) => (
              <option key={dev.id} value={dev.id}>
                {dev.is_pro_device ? '⭐ ' : ''}{dev.name}
                {dev.is_default ? ' (默认)' : ''}
                {' — '}{dev.driver} · {dev.channels}ch · {dev.default_samplerate}Hz
              </option>
            ))}
          </select>
          <button
            className="refresh-devices-btn"
            onClick={loadAudioDevices}
            disabled={loadingDevices}
            type="button"
            title="刷新设备列表"
          >
            {loadingDevices ? '🔄' : '🔄'}
          </button>
        </div>
        {audioDevices.filter(d => d.is_pro_device).length > 0 && (
          <div className="pro-devices-hint">
            ⭐ 已识别 {audioDevices.filter(d => d.is_pro_device).length} 个专业设备
            {audioDevices.filter(d => d.is_pro_device).map(d => ` · ${d.name}`).join('')}
          </div>
        )}
      </section>

      <div className="settings-divider" />
      <section className="settings-section">
        <label className="setting-label">当前生效服务商</label>
        <div className="provider-selector">
          {providerList.map((p) => (
            <button
              key={p}
              className={`provider-card ${selectedProvider === p ? 'active' : ''}`}
              onClick={() => handleProviderChange(p)}
            >
              <span className="provider-card-icon">
                {p === 'gemini' && '✦'}
                {p === 'groq' && '⚡'}
                {p === 'deepseek' && '🧠'}
                {p === 'openai' && '🌟'}
              </span>
              <span className="provider-card-name">{providers[p] || p}</span>
              {selectedProvider === p && <span className="provider-check">✓</span>}
            </button>
          ))}
        </div>
      </section>

      {/* 分割线 */}
      <div className="settings-divider" />

      {/* 各服务商 API Key 输入 */}
      <section className="settings-section">
        <label className="setting-label">API Key 管理</label>
        <div className="api-key-list">
          {providerList.map((p) => (
            <div key={p} className={`api-key-row ${selectedProvider === p ? 'active' : ''}`}>
              <div className="api-key-header">
                <span className="api-key-label">
                  {providers[p] || p}
                </span>
                {selectedProvider === p && (
                  <span className="active-badge">当前使用</span>
                )}
              </div>
              <div className="api-key-input-row">
                <input
                  type={visibleKeys[p] ? 'text' : 'password'}
                  className="api-key-input"
                  placeholder={`输入 ${providers[p] || p} API Key`}
                  value={editKeys[p] || ''}
                  onChange={(e) => setEditKeys((prev) => ({ ...prev, [p]: e.target.value }))}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  className="toggle-visible-btn"
                  onClick={() => toggleKeyVisible(p)}
                  title={visibleKeys[p] ? '隐藏' : '显示'}
                  type="button"
                >
                  {visibleKeys[p] ? '🙈' : '👁️'}
                </button>
              </div>
              {/* 自定义端点（仅非 Gemini）*/}
              {p !== 'gemini' && (
                <input
                  type="text"
                  className="endpoint-input"
                  placeholder="API 端点 (https://...)"
                  value={editEndpoints[p] || ''}
                  onChange={(e) => setEditEndpoints((prev) => ({ ...prev, [p]: e.target.value }))}
                  spellCheck={false}
                />
              )}
              {/* 模型名 */}
              <input
                type="text"
                className="model-input"
                placeholder="模型名 (如 gpt-4o-mini)"
                value={editModels[p] || ''}
                onChange={(e) => setEditModels((prev) => ({ ...prev, [p]: e.target.value }))}
                spellCheck={false}
              />
            </div>
          ))}
        </div>
      </section>

      {/* 配置文件路径 */}
      {configPath && (
        <div className="config-path-hint">
          📁 配置文件: <code>{configPath}</code>
        </div>
      )}

      {/* 操作按钮 */}
      <div className="settings-actions">
        <button
          className="action-btn primary"
          onClick={handleSaveAndTest}
          disabled={saving || validating !== null}
        >
          {validating ? (
            <>
              <span className="btn-spinner" />
              校验中...
            </>
          ) : saving ? (
            '保存中...'
          ) : (
            '💾 保存并测试连接'
          )}
        </button>
        <button
          className="action-btn secondary"
          onClick={handleSaveOnly}
          disabled={saving}
        >
          仅保存
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`settings-toast ${toast.type}`}>
          <span className="toast-icon">
            {toast.type === 'success' && '✅'}
            {toast.type === 'error' && '❌'}
            {toast.type === 'info' && 'ℹ️'}
          </span>
          <span className="toast-msg">{toast.msg}</span>
        </div>
      )}

      <style>{`
        .settings-panel {
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          height: 100%;
          overflow-y: auto;
          position: relative;
        }

        .settings-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 4px;
        }
        .settings-icon { font-size: 20px; }
        .settings-header h3 {
          font-size: 18px;
          font-weight: 700;
          color: var(--text-primary);
          letter-spacing: 0.5px;
        }

        .settings-section {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .setting-label {
          font-size: 11px;
          font-weight: 500;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 1.5px;
        }

        /* 服务商选择卡片 */
        .provider-selector {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        .provider-card {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 14px;
          border: 1px solid var(--border-glass);
          border-radius: var(--radius-sm);
          background: rgba(0, 0, 0, 0.2);
          color: var(--text-secondary);
          cursor: pointer;
          font-size: 13px;
          transition: var(--transition);
          position: relative;
        }
        .provider-card:hover {
          background: var(--bg-glass-hover);
          border-color: var(--border-glow);
          color: var(--text-primary);
        }
        .provider-card.active {
          background: linear-gradient(135deg, rgba(0, 229, 255, 0.1), rgba(168, 85, 247, 0.1));
          border-color: var(--accent-cyan);
          color: var(--accent-cyan);
          box-shadow: inset 0 0 0 1px rgba(0, 229, 255, 0.2), 0 0 12px rgba(0, 229, 255, 0.08);
        }
        .provider-card-icon {
          font-size: 16px;
          line-height: 1;
        }
        .provider-card-name {
          flex: 1;
          font-weight: 500;
        }
        .provider-check {
          color: var(--accent-cyan);
          font-weight: 700;
        }

        /* 分割线 */
        .settings-divider {
          height: 1px;
          background: linear-gradient(90deg, transparent, var(--border-glass), transparent);
          margin: 4px 0;
        }

        /* 音频设备选择器 */
        .audio-device-selector {
          display: flex;
          gap: 6px;
        }
        .device-select {
          flex: 1;
          padding: 9px 12px;
          border: 1px solid var(--border-glass);
          border-radius: var(--radius-sm);
          background: rgba(0, 0, 0, 0.35);
          color: var(--text-primary);
          font-size: 13px;
          outline: none;
          transition: var(--transition);
          cursor: pointer;
        }
        .device-select:focus {
          border-color: var(--accent-cyan);
          box-shadow: 0 0 0 2px rgba(0, 229, 255, 0.1);
        }
        .device-select:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .device-select option {
          background: var(--bg-deep);
          color: var(--text-primary);
          padding: 8px;
        }
        .refresh-devices-btn {
          width: 36px;
          height: 36px;
          border: 1px solid var(--border-glass);
          border-radius: var(--radius-sm);
          background: rgba(0, 0, 0, 0.3);
          color: var(--text-secondary);
          cursor: pointer;
          font-size: 14px;
          transition: var(--transition);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .refresh-devices-btn:hover:not(:disabled) {
          background: var(--bg-glass-hover);
          color: var(--text-primary);
          border-color: var(--border-glow);
        }
        .refresh-devices-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .pro-devices-hint {
          font-size: 11px;
          color: var(--accent-purple);
          padding: 6px 10px;
          background: rgba(168, 85, 247, 0.06);
          border-radius: var(--radius-sm);
          border: 1px solid rgba(168, 85, 247, 0.15);
          line-height: 1.5;
        }

        /* API Key 列表 */
        .api-key-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .api-key-row {
          padding: 12px;
          border-radius: var(--radius-sm);
          background: rgba(0, 0, 0, 0.15);
          border: 1px solid transparent;
          transition: var(--transition);
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .api-key-row.active {
          border-color: rgba(0, 229, 255, 0.2);
          background: rgba(0, 229, 255, 0.03);
        }
        .api-key-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .api-key-label {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-primary);
        }
        .active-badge {
          font-size: 10px;
          padding: 2px 8px;
          border-radius: 10px;
          background: rgba(0, 229, 255, 0.15);
          color: var(--accent-cyan);
          font-weight: 500;
        }

        .api-key-input-row {
          display: flex;
          gap: 6px;
        }
        .api-key-input {
          flex: 1;
          padding: 9px 12px;
          border: 1px solid var(--border-glass);
          border-radius: var(--radius-sm);
          background: rgba(0, 0, 0, 0.35);
          color: var(--text-primary);
          font-size: 13px;
          font-family: 'SF Mono', 'Fira Code', monospace;
          outline: none;
          transition: var(--transition);
        }
        .api-key-input:focus {
          border-color: var(--accent-cyan);
          box-shadow: 0 0 0 2px rgba(0, 229, 255, 0.1);
        }
        .api-key-input::placeholder {
          color: var(--text-muted);
        }

        .toggle-visible-btn {
          width: 36px;
          height: 36px;
          border: 1px solid var(--border-glass);
          border-radius: var(--radius-sm);
          background: rgba(0, 0, 0, 0.3);
          color: var(--text-secondary);
          cursor: pointer;
          font-size: 14px;
          transition: var(--transition);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .toggle-visible-btn:hover {
          background: var(--bg-glass-hover);
          color: var(--text-primary);
        }

        .endpoint-input,
        .model-input {
          width: 100%;
          padding: 7px 12px;
          border: 1px solid var(--border-glass);
          border-radius: var(--radius-sm);
          background: rgba(0, 0, 0, 0.25);
          color: var(--text-secondary);
          font-size: 12px;
          outline: none;
          transition: var(--transition);
        }
        .endpoint-input:focus,
        .model-input:focus {
          border-color: var(--accent-purple);
        }
        .endpoint-input::placeholder,
        .model-input::placeholder {
          color: var(--text-muted);
        }

        /* 配置路径 */
        .config-path-hint {
          font-size: 11px;
          color: var(--text-muted);
          padding: 8px 12px;
          background: rgba(0, 0, 0, 0.2);
          border-radius: var(--radius-sm);
          border: 1px solid var(--border-glass);
        }
        .config-path-hint code {
          color: var(--accent-purple);
          font-size: 11px;
          word-break: break-all;
        }

        /* 操作按钮 */
        .settings-actions {
          display: flex;
          gap: 10px;
          margin-top: 4px;
        }
        .action-btn {
          flex: 1;
          padding: 11px;
          border: none;
          border-radius: var(--radius-sm);
          cursor: pointer;
          font-size: 13px;
          font-weight: 600;
          transition: var(--transition);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }
        .action-btn.primary {
          background: linear-gradient(135deg, var(--accent-cyan), var(--accent-blue));
          color: #001020;
        }
        .action-btn.primary:hover:not(:disabled) {
          box-shadow: var(--glow-cyan);
          transform: translateY(-1px);
        }
        .action-btn.primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .action-btn.secondary {
          background: var(--bg-glass);
          color: var(--text-secondary);
          border: 1px solid var(--border-glass);
        }
        .action-btn.secondary:hover:not(:disabled) {
          background: var(--bg-glass-hover);
          color: var(--text-primary);
        }
        .action-btn.secondary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .btn-spinner {
          width: 14px;
          height: 14px;
          border: 2px solid rgba(0, 16, 32, 0.3);
          border-top-color: #001020;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }

        /* Toast */
        .settings-toast {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 16px;
          border-radius: var(--radius-sm);
          font-size: 13px;
          font-weight: 500;
          animation: slide-in-up 0.3s ease;
          backdrop-filter: blur(20px);
        }
        .settings-toast.success {
          background: rgba(16, 217, 163, 0.12);
          border: 1px solid rgba(16, 217, 163, 0.3);
          color: var(--accent-green);
          box-shadow: 0 0 20px rgba(16, 217, 163, 0.15);
        }
        .settings-toast.error {
          background: rgba(239, 68, 68, 0.12);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: var(--accent-red);
          box-shadow: 0 0 20px rgba(239, 68, 68, 0.15);
        }
        .settings-toast.info {
          background: rgba(0, 229, 255, 0.08);
          border: 1px solid rgba(0, 229, 255, 0.2);
          color: var(--accent-cyan);
        }
        .toast-icon {
          font-size: 16px;
          flex-shrink: 0;
        }
        .toast-msg {
          line-height: 1.4;
        }

        /* 加载态 */
        .settings-loading {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 40px;
          color: var(--text-muted);
          font-size: 14px;
        }
        .loading-spinner {
          width: 20px;
          height: 20px;
          border: 2px solid rgba(120, 180, 255, 0.15);
          border-top-color: var(--accent-cyan);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
