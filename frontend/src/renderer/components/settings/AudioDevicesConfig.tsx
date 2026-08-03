/**
 * 音频设备配置组件
 */
import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { API_BASE } from '../../services/api'
import type { AudioDevice, Toast } from '../../types'

interface AudioDevicesConfigProps {
  onToast?: (toast: Toast) => void
}

export default function AudioDevicesConfig({ onToast }: AudioDevicesConfigProps) {
  const { t } = useTranslation()
  const [inputDevices, setInputDevices] = useState<AudioDevice[]>([])
  const [outputDevices, setOutputDevices] = useState<AudioDevice[]>([])
  const [micInputId, setMicInputId] = useState<number | null>(null)
  const [translationOutputId, setTranslationOutputId] = useState<number | null>(null)
  const [remoteInputId, setRemoteInputId] = useState<number | null>(null)
  const [remoteOutputId, setRemoteOutputId] = useState<number | null>(null)
  const [loadingDevices, setLoadingDevices] = useState(false)
  const [switchingDevice, setSwitchingDevice] = useState<string | null>(null)

  // ── Load Audio Devices ────────────────────────────────
  const loadAudioDevices = useCallback(async () => {
    setLoadingDevices(true)
    try {
      const res = await fetch(`${API_BASE}/api/audio/devices/all`)
      const data = await res.json()
      if (data.status === 'success') {
        setInputDevices(data.inputs || [])
        setOutputDevices(data.outputs || [])
        if (data.current_devices) {
          setMicInputId(data.current_devices.mic_input ?? null)
          setTranslationOutputId(data.current_devices.translation_output ?? null)
          setRemoteInputId(data.current_devices.remote_input ?? null)
          setRemoteOutputId(data.current_devices.remote_output ?? null)
        }
      }
    } catch {
      onToast?.({ type: 'error', msg: t('dashboard.toastDeviceFail') })
    } finally {
      setLoadingDevices(false)
    }
  }, [t, onToast])

  useEffect(() => { loadAudioDevices() }, [loadAudioDevices])

  // ── Handlers ──────────────────────────────────────────
  const handleSwitchAudioRoute = async (deviceKey: string, deviceId: number | null) => {
    const setters: Record<string, (id: number | null) => void> = {
      mic_input: setMicInputId,
      translation_output: setTranslationOutputId,
      remote_input: setRemoteInputId,
      remote_output: setRemoteOutputId,
    }
    const setter = setters[deviceKey]
    if (!setter) return
    
    setSwitchingDevice(deviceKey)
    setter(deviceId)
    
    try {
      const res = await fetch(`${API_BASE}/api/audio/devices/route`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_key: deviceKey, device_id: deviceId }),
      })
      const data = await res.json()
      if (data.status === 'success') {
        const labelMap: Record<string, string> = {
          mic_input: t('settings.micInput'),
          translation_output: t('settings.translationOutput'),
          remote_input: t('settings.remoteInput'),
          remote_output: t('settings.remoteOutput'),
        }
        const devices = deviceKey.includes('input') || deviceKey === 'mic_input' ? inputDevices : outputDevices
        const devName = deviceId === null 
          ? t('settings.defaultDevice')
          : (devices.find(d => d.id === deviceId)?.name) || `${t('settings.deviceLabel')} ${deviceId}`
        onToast?.({ type: 'success', msg: `${labelMap[deviceKey]} → ${devName}` })
      } else {
        onToast?.({ type: 'error', msg: data.message || t('settings.netError') })
      }
    } catch (e) {
      onToast?.({ type: 'error', msg: `${t('settings.netError')}: ${(e as Error).message}` })
    } finally {
      setSwitchingDevice(null)
    }
  }

  return (
    <div className="rounded-xl bg-zinc-950/40 border border-zinc-800/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest">{t('settings.audioRoute')}</label>
        <button 
          className="px-2.5 py-1 rounded-md text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 border border-zinc-700/40 transition-all disabled:opacity-40" 
          onClick={loadAudioDevices} 
          disabled={loadingDevices} 
          title={t('settings.refreshDevices')}
        >
          {loadingDevices ? '⏳' : t('settings.refreshDevices')}
        </button>
      </div>
      
      {[
        { key: 'mic_input', label: t('settings.micInput'), devices: inputDevices },
        { key: 'translation_output', label: t('settings.translationOutput'), devices: outputDevices },
        { key: 'remote_input', label: t('settings.remoteInput'), devices: inputDevices },
        { key: 'remote_output', label: t('settings.remoteOutput'), devices: outputDevices },
      ].map(({ key, label, devices }) => (
        <div key={key} className="space-y-1">
          <label className="text-xs text-zinc-400">{label}</label>
          <select
            className="w-full bg-zinc-900/60 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 disabled:opacity-50"
            value={(
              key === 'mic_input' ? micInputId :
              key === 'translation_output' ? translationOutputId :
              key === 'remote_input' ? remoteInputId :
              remoteOutputId
            ) ?? -1}
            onChange={(e) => {
              const val = e.target.value
              handleSwitchAudioRoute(key, val === '-1' ? null : parseInt(val, 10))
            }}
            disabled={switchingDevice === key || loadingDevices}
          >
            <option value={-1}>{t('settings.defaultDevice')}</option>
            {devices.map((dev) => (
              <option key={dev.id} value={dev.id}>
                {dev.is_pro_device ? '⭐ ' : ''}{dev.name}
                {dev.is_default ? ` (${t('settings.defaultDevice')})` : ''}
                {' — '}{dev.driver} · {dev.max_input_channels}ch · {dev.default_samplerate}Hz
              </option>
            ))}
          </select>
        </div>
      ))}
      
      {(inputDevices.filter(d => d.is_pro_device).length > 0 || outputDevices.filter(d => d.is_pro_device).length > 0) && (
        <div className="text-xs text-violet-400 bg-violet-500/5 border border-violet-500/15 rounded-md px-3 py-2">
          ⭐ {t('settings.proDevicesHint')} {inputDevices.filter(d => d.is_pro_device).length + outputDevices.filter(d => d.is_pro_device).length} {t('settings.professionalDevices')}
        </div>
      )}
    </div>
  )
}
