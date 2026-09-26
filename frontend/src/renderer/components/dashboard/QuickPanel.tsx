/**
 * QuickPanel — 左侧 3/12 列 (Dashboard 子组件)
 * 授权方案信息卡 + 快捷操作 2×2 Bento (复制机器码 / 清空历史 / 声卡配置 / 会话状态)
 */
import { useState } from 'react'
import { Copy, ListRestart, Volume2, ShieldCheck, KeyRound, Check } from 'lucide-react'
import { toast } from '../../hooks/use-toast'
import type { ConnectionStatus } from '../../types'

interface QuickPanelProps {
  backendReady: boolean
  backendFailed: boolean
  wsStatus: ConnectionStatus
  messageCount: number
  onCopyMachineCode: () => void
  onClearMessages: () => void
  onOpenAudioSettings: () => void
}

export default function QuickPanel({
  backendReady,
  backendFailed,
  wsStatus,
  messageCount,
  onCopyMachineCode,
  onClearMessages,
  onOpenAudioSettings,
}: QuickPanelProps) {
  const [copied, setCopied] = useState(false)

  const handleCopyMachineCode = async () => {
    await onCopyMachineCode()
    setCopied(true)
    toast({
      title: '已复制到剪贴板',
      duration: 2000,
    })
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="col-span-3 flex flex-col gap-3 min-h-0">
      {/* 授权 & 引擎状态卡（紧凑单卡） */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">当前授权方案</div>
            <div className="text-[13px] font-black text-slate-900 tracking-tight truncate">中越同传专业版</div>
          </div>
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md shrink-0 ${
            backendReady ? 'bg-emerald-50 text-emerald-600' :
            backendFailed ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'
          }`}>
            {backendReady ? '在线' : backendFailed ? '离线' : '启动中'}
          </span>
        </div>
        <button className="w-full mt-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-500 text-[11px] font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer">
          <KeyRound className="w-3 h-3" />
          卡密兑换 / 授权管理
        </button>
      </div>

      {/* 快捷操作（2×2 紧凑图标网格，不纵向拉伸占满整列） */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs shrink-0">
        <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">快捷操作</div>
        <div className="grid grid-cols-2 gap-2">
          <div className="relative">
            <button
              onClick={handleCopyMachineCode}
              className={`group rounded-xl bg-slate-50/80 hover:bg-blue-50/60 border border-slate-100 hover:border-blue-100 p-2 transition-all text-left cursor-pointer appearance-none border-none outline-none ${
                copied ? 'ring-2 ring-blue-500' : ''
              }`}
            >
              <Copy className={`w-3.5 h-3.5 transition-colors ${copied ? 'text-blue-600' : 'text-slate-400 group-hover:text-blue-600'}`} />
              <div className={`text-[11px] font-bold mt-1.5 leading-tight transition-colors ${copied ? 'text-blue-600' : 'text-slate-600 group-hover:text-slate-900'}`}>
                {copied ? '已复制' : '复制机器码'}
              </div>
            </button>
            {copied && (
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center animate-[ping_0.5s_ease-out]">
                <Check className="w-2.5 h-2.5 text-white" />
              </div>
            )}
          </div>
          <button
            onClick={onClearMessages}
            className="group rounded-xl bg-slate-50/80 hover:bg-blue-50/60 border border-slate-100 hover:border-blue-100 p-2 transition-all text-left cursor-pointer"
          >
            <ListRestart className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 transition-colors" />
            <div className="text-[11px] font-bold text-slate-600 group-hover:text-slate-900 mt-1.5 leading-tight">清空历史</div>
          </button>
          <button
            onClick={onOpenAudioSettings}
            className="group rounded-xl bg-slate-50/80 hover:bg-blue-50/60 border border-slate-100 hover:border-blue-100 p-2 transition-all text-left cursor-pointer"
          >
            <Volume2 className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 transition-colors" />
            <div className="text-[11px] font-bold text-slate-600 group-hover:text-slate-900 mt-1.5 leading-tight">声卡配置</div>
          </button>
          {/* 实时状态 mini 卡 */}
          <div className="rounded-xl bg-slate-50/60 border border-slate-100 p-2">
            <div className="text-[9px] font-medium text-slate-400">会话状态</div>
            <div className="text-[11px] font-bold font-mono text-slate-700 mt-1.5 truncate">
              <span className={wsStatus === 'connected' ? 'text-emerald-600' : 'text-amber-600'}>
                {wsStatus === 'connected' ? 'WS OK' : wsStatus}
              </span>
              <span className="text-slate-300 mx-0.5">·</span>{messageCount}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
