/**
 * 音频设备配置组件 (Glassmorphism Aurora 深色)
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

  const loadAudioDevices = useCallback(async () => {
    setLoadingDevices(true)
    try {
      const res = await fetch(`${API_BASE}/api/audio/devices`)
      const data = await res.json()
      // 后端 /api/audio/devices 直接返回 { inputs, outputs, current_devices? }
      if (data && data.inputs && data.outputs) {
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
      const res = await fetch(`${API_BASE}/api/audio/device`, {
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
    <div className="rounded-xl glass p-4 space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-medium text-white/40 uppercase tracking-widest">{t('settings.audioRoute')}</label>
        <button 
          className="px-2.5 py-1 rounded-md text-xs text-white/50 hover:text-white/80 hover:bg-white/[0.08] border border-white/[0.1] transition-all disabled:opacity-40" 
          onClick={loadAudioDevices} 
          disabled={loadingDevices} 
          title={t('settings.refreshDevices')}
        >
          {loadingDevices ? '⏳' : '🔄'}
        </button>
      </div>
      
      {[
        { key: 'mic_input', label: t('settings.micInput'), devices: inputDevices },
        { key: 'translation_output', label: t('settings.translationOutput'), devices: outputDevices },
        { key: 'remote_input', label: t('settings.remoteInput'), devices: inputDevices },
        { key: 'remote_output', label: t('settings.remoteOutput'), devices: outputDevices },
      ].map(({ key, label, devices }) => (
        <div key={key} className="space-y-1.5">
          <label className="text-xs text-white/60">{label}</label>
          <select
            className="w-full bg-white/[0.04] border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-white/90 outline-none focus:border-blue-400/60 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50"
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
        <div className="text-xs text-purple-300 bg-purple-500/15 border border-purple-400/30 rounded-md px-3 py-2">
          ⭐ {t('settings.proDevicesHint')} {inputDevices.filter(d => d.is_pro_device).length + outputDevices.filter(d => d.is_pro_device).length} {t('settings.professionalDevices')}
        </div>
      )}
    </div>
  )
}
