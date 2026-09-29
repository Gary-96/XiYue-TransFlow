/**
 * 主视口布局 — 双流并排工作台
 * 顶部指标栏(紧凑一行) | 中部双视口(左40%弹幕 / 右60%字幕+频谱) | 底部控制坞
 */
import { Server, Radio, Users, Heart, Mic, RefreshCw, Settings, Shield } from 'lucide-react'
import type { ConnectionStatus, StreamMessage, CallSubtitle } from '@/types'
import AudioSpectrum from '@/features/subtitle/AudioSpectrum'
import DanmakuPanel from '@/features/danmaku/DanmakuPanel'
import SubtitlePanel from '@/features/subtitle/SubtitlePanel'

interface MainViewProps {
  wsStatus: ConnectionStatus
  engineStatus: string
  ttsEnabled: boolean
  isTTSSpeaking: boolean
  messageCount: number
  messages: StreamMessage[]
  callHistory: CallSubtitle[]
  spectrumData?: number[]
  /** 双模采集通道状态文案（null 不显示） */
  channelLabel?: string | null
  onStartRecognition: () => void
  onToggleTTS: (enabled: boolean) => void
  onClearMessages: () => void
  onOpenConfig: () => void
}

const MetricCard = ({
  icon: Icon, label, value, status,
}: {
  icon: typeof Server
  label: string
  value: string
  status?: 'ok' | 'warn' | 'error' | 'idle'
}) => {
  const c = { ok: 'text-emerald-500', warn: 'text-amber-500', error: 'text-red-500', idle: 'text-muted-foreground' }[status ?? 'idle']
  const bg = { ok: 'bg-emerald-500/10', warn: 'bg-amber-500/10', error: 'bg-red-500/10', idle: 'bg-muted/40' }[status ?? 'idle']
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5">
      <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${bg}`}>
        <Icon className={`h-3 w-3 ${c}`} />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] text-muted-foreground truncate">{label}</div>
        <div className={`text-xs font-medium ${c} truncate`}>{value}</div>
      </div>
    </div>
  )
}

export default function MainView({
  wsStatus, engineStatus, ttsEnabled, isTTSSpeaking,
  messageCount, messages, callHistory, spectrumData, channelLabel,
  onStartRecognition, onToggleTTS, onClearMessages, onOpenConfig,
}: MainViewProps) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* 顶部指标栏 */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-background">
        <MetricCard icon={Server} label="引擎" value={engineStatus === 'ok' ? '15387 ✓' : engineStatus} status={engineStatus === 'ok' ? 'ok' : 'error'} />
        <MetricCard icon={Radio} label="WebSocket" value={wsStatus === 'connected' ? '已连接' : wsStatus === 'connecting' ? '连接中...' : '断开'} status={wsStatus === 'connected' ? 'ok' : wsStatus === 'connecting' ? 'warn' : 'error'} />
        {channelLabel && (
          <MetricCard icon={Shield} label="采集通道" value={channelLabel} status={channelLabel.includes('安全') ? 'warn' : 'ok'} />
        )}
        <MetricCard icon={Users} label="弹幕" value={String(messageCount)} status="idle" />
        <MetricCard icon={Heart} label="TTS" value={isTTSSpeaking ? '播放中' : ttsEnabled ? '已启用' : '关闭'} status={isTTSSpeaking ? 'ok' : ttsEnabled ? 'warn' : 'idle'} />
        <div className="flex-1" />
        <button onClick={onOpenConfig}
          className="flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground" title="同传配置">
          <Settings className="h-3.5 w-3.5" />配置
        </button>
      </div>

      {/* 双视口并排 */}
      <div className="flex flex-1 gap-px overflow-hidden bg-border">
        <div className="flex flex-col min-w-0" style={{ width: '40%' }}>
          <div className="px-3 py-1.5 border-b border-border bg-card/60">
            <span className="text-[11px] font-medium text-muted-foreground">💬 弹幕流 · {messageCount} 条</span>
          </div>
          <div className="flex-1 overflow-hidden bg-card"><DanmakuPanel messages={messages} /></div>
        </div>
        <div className="flex flex-col min-w-0" style={{ width: '60%' }}>
          <div className="px-3 py-1.5 border-b border-border bg-card/60 flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground">📝 同传字幕 · {callHistory.length} 条</span>
            <div className="h-6 flex-1 max-w-[180px] ml-3"><AudioSpectrum height={24} spectrumData={spectrumData} /></div>
          </div>
          <div className="flex-1 overflow-hidden bg-card"><SubtitlePanel subtitles={callHistory} /></div>
        </div>
      </div>

      {/* 底部控制坞 */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-t border-border bg-card/80 backdrop-blur-md">
        <div className="flex items-center gap-1.5">
          <button onClick={onStartRecognition}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-xs font-medium text-white transition-all hover:bg-indigo-500 active:scale-[0.97]">
            <Mic className="h-3.5 w-3.5" />开始识别
          </button>
          <button onClick={() => onToggleTTS(!ttsEnabled)}
            className={`flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-all active:scale-[0.97] ${
              ttsEnabled ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20' : 'border border-border bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            }`}>
            <Heart className={`h-3.5 w-3.5 ${isTTSSpeaking ? 'animate-pulse' : ''}`} />TTS {ttsEnabled ? '开' : '关'}
          </button>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-1">
          <button onClick={onClearMessages}
            className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground active:scale-[0.97]">
            <RefreshCw className="h-3.5 w-3.5" />清空
          </button>
        </div>
      </div>
    </div>
  )
}
