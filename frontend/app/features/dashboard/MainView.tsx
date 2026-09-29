/**
 * 主视口布局
 * 顶部指标卡 + 中部内容区 + 底部主控栏
 */
import { Server, Radio, Users, Heart, MessageSquare, Mic, RefreshCw, Settings } from 'lucide-react'
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
  activeTab: 'danmaku' | 'subtitle' | 'audio' | 'settings' | 'about'
  onStartRecognition: () => void
  onToggleTTS: (enabled: boolean) => void
  onClearMessages: () => void
  onOpenSettings: () => void
}

const MetricCard = ({
  icon: Icon,
  label,
  value,
  status,
}: {
  icon: typeof Server
  label: string
  value: string
  status?: 'ok' | 'warn' | 'error' | 'idle'
}) => {
  const statusColor = {
    ok: 'text-emerald-500',
    warn: 'text-amber-500',
    error: 'text-red-500',
    idle: 'text-muted-foreground',
  }[status ?? 'idle']

  const bgColor = {
    ok: 'bg-emerald-500/10',
    warn: 'bg-amber-500/10',
    error: 'bg-red-500/10',
    idle: 'bg-muted/40',
  }[status ?? 'idle']

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
      <div className={`flex h-7 w-7 items-center justify-center rounded-md ${bgColor}`}>
        <Icon className={`h-3.5 w-3.5 ${statusColor}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] text-muted-foreground">{label}</div>
        <div className={`text-xs font-medium ${statusColor}`}>{value}</div>
      </div>
    </div>
  )
}

export default function MainView({
  wsStatus,
  engineStatus,
  ttsEnabled,
  isTTSSpeaking,
  messages,
  callHistory,
  spectrumData,
  activeTab,
  onStartRecognition,
  onToggleTTS,
  onClearMessages,
  onOpenSettings,
}: MainViewProps) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* 顶部指标栏 */}
      <div className="grid grid-cols-4 gap-2 p-3">
        <MetricCard
          icon={Server}
          label="本地引擎"
          value={engineStatus === 'ok' ? '15387 ✓' : engineStatus}
          status={engineStatus === 'ok' ? 'ok' : 'error'}
        />
        <MetricCard
          icon={Radio}
          label="网络 WS"
          value={
            wsStatus === 'connected' ? '已连接' :
            wsStatus === 'connecting' ? '连接中...' : '断开'
          }
          status={wsStatus === 'connected' ? 'ok' : wsStatus === 'connecting' ? 'warn' : 'error'}
        />
        <MetricCard
          icon={Users}
          label="会话计数"
          value={String(messages.length)}
          status="idle"
        />
        <MetricCard
          icon={Heart}
          label="TTS 状态"
          value={isTTSSpeaking ? '播放中' : ttsEnabled ? '已启用' : '已关闭'}
          status={isTTSSpeaking ? 'ok' : ttsEnabled ? 'warn' : 'idle'}
        />
      </div>

      {/* 主内容区 */}
      <div className="flex flex-1 gap-2 px-3 pb-2">
        {activeTab === 'danmaku' && (
          <div className="flex-1 overflow-hidden rounded-lg border border-border bg-card">
            <DanmakuPanel messages={messages} />
          </div>
        )}

        {activeTab === 'subtitle' && (
          <div className="flex-1 overflow-hidden rounded-lg border border-border bg-card">
            <SubtitlePanel subtitles={callHistory} />
          </div>
        )}

        {(activeTab === 'audio' || activeTab === 'settings' || activeTab === 'about') && (
          <div className="flex-1 overflow-hidden rounded-lg border border-border bg-card p-4">
            <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <div className="w-12 h-12 rounded-full bg-muted/40 border border-border flex items-center justify-center">
                {activeTab === 'audio' && <Mic className="w-6 h-6 text-muted-foreground" />}
                {activeTab === 'settings' && <Settings className="w-6 h-6 text-muted-foreground" />}
                {activeTab === 'about' && <MessageSquare className="w-6 h-6 text-muted-foreground" />}
              </div>
              <div className="text-sm font-medium text-foreground">
                {activeTab === 'audio' && '音频设备设置'}
                {activeTab === 'settings' && '模型设置'}
                {activeTab === 'about' && '关于应用'}
              </div>
              <div className="text-xs text-muted-foreground">
                {activeTab === 'audio' && '选择麦克风和扬声器设备'}
                {activeTab === 'settings' && '配置 Whisper 模型参数'}
                {activeTab === 'about' && '喜阅 TransFlow v2.0'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 底部主控栏 */}
      <div className="flex items-center gap-3 px-3 py-2">
        {/* 左侧控制 */}
        <div className="flex items-center gap-2">
          <button
            onClick={onStartRecognition}
            className="flex h-9 items-center gap-1.5 rounded-md bg-indigo-600 px-4 text-xs font-medium text-white transition-colors hover:bg-indigo-500 active:scale-[0.98]"
          >
            <Mic className="h-3.5 w-3.5" />
            开始识别
          </button>
          <button
            onClick={() => onToggleTTS(!ttsEnabled)}
            className={`flex h-9 items-center gap-1.5 rounded-md px-4 text-xs font-medium transition-colors active:scale-[0.98] ${
              ttsEnabled
                ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20'
                : 'border border-input text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            }`}
          >
            <Heart className={`h-3.5 w-3.5 ${isTTSSpeaking ? 'animate-pulse' : ''}`} />
            TTS {ttsEnabled ? '已开启' : '已关闭'}
          </button>
        </div>

        {/* 中间：频谱展示 */}
        <div className="flex-1">
          <AudioSpectrum
            height={40}
            spectrumData={spectrumData}
          />
        </div>

        {/* 右侧辅助 */}
        <div className="flex items-center gap-2">
          <button
            onClick={onClearMessages}
            className="flex h-8 items-center gap-1.5 rounded-md px-3 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground active:scale-[0.98]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            清空
          </button>
          <button
            onClick={onOpenSettings}
            className="flex h-8 items-center gap-1.5 rounded-md px-3 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground active:scale-[0.98]"
          >
            <Settings className="h-3.5 w-3.5" />
            设置
          </button>
        </div>
      </div>
    </div>
  )
}
