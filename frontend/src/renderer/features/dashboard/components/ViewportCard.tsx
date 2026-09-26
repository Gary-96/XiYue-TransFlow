/**
 * ViewportCard — 核心视口卡片 (Dashboard 子组件)
 * 弹幕流 / 同传字幕展示 + 底部识别主控条与动态频谱
 */
import { useTranslation } from 'react-i18next'
import { Activity, Radio, Zap } from 'lucide-react'
import DanmakuPanel from '../../danmaku/DanmakuPanel'
import AudioSpectrum from '../../subtitle/AudioSpectrum'
import type { StreamMessage, AudioTranscription, ConnectionStatus } from '../../../types'

type ActiveTab = 'danmaku' | 'subtitle'

interface ViewportCardProps {
  activeTab: ActiveTab
  messages: StreamMessage[]
  transcription: AudioTranscription | null
  history: AudioTranscription[]
  isRecording: boolean
  wsStatus: ConnectionStatus
  ttsEnabled: boolean
  spectrumData: number[]
  onStartRecording: () => void
  onStopRecording: () => void
  onToggleTTS: (enabled: boolean) => void
}

export default function ViewportCard({
  activeTab,
  messages,
  transcription,
  history,
  isRecording,
  wsStatus,
  ttsEnabled,
  spectrumData,
  onStartRecording,
  onStopRecording,
  onToggleTTS,
}: ViewportCardProps) {
  const { t } = useTranslation()
  const isSubtitleTab = activeTab === 'subtitle'

  return (
    <div className="flex-1 bg-white/10 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xs overflow-hidden flex flex-col min-h-0">
      {/* 标题栏 */}
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-blue-600" />
          <span className="text-xs font-bold text-white">
            {isSubtitleTab ? '实时同传字幕' : '实时弹幕流'}
          </span>
        </div>
        {isSubtitleTab && transcription && (
          <div className="flex items-center gap-1.5 text-emerald-400 text-[11px] font-medium animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="truncate max-w-[200px]">{transcription.transcription.text}</span>
          </div>
        )}
      </div>

      {/* 核心内容区 */}
      <div className="flex-1 overflow-hidden min-h-0 relative">
        {!isSubtitleTab && <DanmakuPanel messages={messages} />}

        {isSubtitleTab && (
          <div className="h-full flex flex-col gap-3 p-4 overflow-hidden">
            {transcription ? (
              <div className="rounded-xl bg-blue-50/60 border border-blue-100 p-4 space-y-1 shrink-0 animate-[slide-in-up_0.3s_ease]">
                <div className="text-xs text-white/70 font-medium line-clamp-2">
                  {transcription.transcription.text}
                </div>
                <div className="text-base font-bold text-blue-400">
                  {transcription.translation.text}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-white/50">
                <Radio className="w-8 h-8 mb-2 text-white/20 animate-pulse" />
                <div className="text-xs font-semibold text-white/70">点击下方按钮开始语音识别</div>
                <div className="text-[11px] mt-0.5 text-white/60">{t('dashboard.noHistoryHint')}</div>
              </div>
            )}

            {history.length > 0 && (
              <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
                {history.slice(-20).reverse().map((item, i) => (
                  <div key={i} className="rounded-lg bg-white/5 border border-white/10 border-l-2 border-l-blue-400 p-2.5">
                    <div className="text-xs text-white/50">{item.transcription.text}</div>
                    <div className="text-xs font-semibold text-white/80 mt-0.5">{item.translation.text}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 底部主控条：识别开关 + TTS + 动态频谱 */}
      <div className="p-3 bg-white/5 backdrop-blur-md border-t border-white/10 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={isRecording ? onStopRecording : onStartRecording}
            className={`px-5 py-2 rounded-xl text-xs font-bold shadow-xs flex items-center gap-2 transition-all cursor-pointer appearance-none border-none outline-none ${
              isRecording
                ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/20 animate-[pulse-glow_2s_ease-in-out_infinite]'
                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20'
            }`}
          >
            <Zap className="w-3.5 h-3.5 fill-current" />
            <span>{isRecording ? '停止识别' : '开始识别'}</span>
          </button>

          <button
            onClick={() => onToggleTTS(!ttsEnabled)}
            className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all ${
              ttsEnabled
                ? 'border-emerald-300 bg-emerald-50 text-emerald-600'
                : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10'
            }`}
          >
            <span>{ttsEnabled ? '🔊 TTS 已开启' : '🔇 TTS 已静音'}</span>
          </button>
        </div>

        <div className="w-28 shrink-0">
          <AudioSpectrum height={18} spectrumData={spectrumData} />
        </div>
      </div>
    </div>
  )
}
