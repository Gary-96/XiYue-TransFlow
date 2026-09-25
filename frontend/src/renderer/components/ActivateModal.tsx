/**
 * ActivateModal — 卡密激活弹窗 (Glassmorphism Aurora 深色 + Dialog 组件)
 * 使用 ui/dialog.tsx 封装
 */
import { useState, useEffect, useRef } from 'react'
import { activateCard, getAuthState, startHeartbeat, type AuthState } from '../services/auth'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog'

interface ActivateModalProps {
  open: boolean
  onClose: () => void
  onActivated?: (state: AuthState) => void
}

export default function ActivateModal({ open, onClose, onActivated }: ActivateModalProps) {
  const [machineId, setMachineId] = useState<string>('')
  const [cardKey, setCardKey] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string>('')
  const [success, setSuccess] = useState<boolean>(false)
  const [copied, setCopied] = useState<boolean>(false)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (open) {
      getAuthState().then(state => {
        setMachineId(state.machineId || '')
      })
    }
  }, [open])

  const handleCopyMachineId = async () => {
    try {
      await navigator.clipboard.writeText(machineId)
      setError('')
      setCopied(true)
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('复制失败，请手动复制')
    }
  }

  const handleActivate = async () => {
    if (!cardKey.trim()) {
      setError('请输入激活码')
      return
    }

    setLoading(true)
    setError('')

    try {
      const state = await getAuthState()
      const result = await activateCard(cardKey.trim(), state.machineId!)

      if (result.success) {
        setSuccess(true)
        startHeartbeat((newState) => {
          onActivated?.(newState)
        })
        
        setTimeout(() => {
          onClose()
        }, 1500)
      } else {
        setError(result.message || '激活失败，请检查激活码')
      }
    } catch (e: unknown) {
      setError((e as Error).message || '网络连接失败，请检查云端服务')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md rounded-2xl shadow-2xl">
        {/* 顶部渐变条 */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500 rounded-t-2xl pointer-events-none" />
        
        <DialogHeader className="pt-4 pb-2">
          <DialogTitle className="text-base font-bold text-white/90">激活乐曼同传</DialogTitle>
          <p className="text-xs text-white/40 mt-0.5">输入卡密激活您的授权</p>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* 机器码展示 */}
          <div>
            <label className="block text-xs font-medium text-white/50 mb-1.5">
              🖥️ 本机机器码
            </label>
            <div className="flex gap-2">
              <div className="flex-1 min-w-0 px-3 py-2 bg-white/[0.05] border border-white/[0.1] rounded-lg text-xs font-mono text-white/70 truncate">
                {machineId || '加载中...'}
              </div>
              <button
                onClick={handleCopyMachineId}
                className={`px-2.5 py-2 rounded-lg text-xs font-medium transition-all flex-shrink-0 border ${
                  copied
                    ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-300'
                    : 'bg-white/[0.05] border-white/[0.1] text-white/60 hover:bg-blue-500/15 hover:border-blue-400/30 hover:text-blue-300'
                }`}
                title={copied ? '已复制' : '复制机器码'}
              >
                {copied ? '✓ 已复制' : '📋'}
              </button>
            </div>
            <p className="text-[10px] text-white/30 mt-1">此机器码用于绑定您的设备，请勿分享给他人</p>
          </div>

          {/* 激活码输入 */}
          <div>
            <label className="block text-xs font-medium text-white/50 mb-1.5">
              🔑 激活码
            </label>
            <input
              type="text"
              value={cardKey}
              onChange={(e) => setCardKey(e.target.value)}
              placeholder="输入 LEMAN-XXXX-XXXX-XXXX"
              className="w-full px-3.5 py-2.5 bg-white/[0.05] border border-white/[0.1] rounded-lg text-sm outline-none placeholder-white/30 focus:border-purple-400/60 focus:ring-2 focus:ring-purple-500/20 transition-all font-mono text-white/90"
              onKeyDown={(e) => e.key === 'Enter' && handleActivate()}
              disabled={loading || success}
            />
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="p-2.5 bg-rose-500/15 border border-rose-400/30 rounded-lg text-xs text-rose-300">
              ⚠️ {error}
            </div>
          )}

          {/* 激活按钮 */}
          <button
            onClick={handleActivate}
            disabled={loading || success}
            className="w-full py-2.5 btn-grad disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg font-semibold text-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                激活中...
              </>
            ) : success ? (
              <>
                <span>✅</span>
                激活成功！
              </>
            ) : (
              <>
                <span>🚀</span>
                立即激活
              </>
            )}
          </button>

          {/* 帮助链接 */}
          <div className="text-center text-xs text-white/40">
            没有激活码？请联系管理员获取或访问{' '}
            <a href="#" className="text-blue-300 hover:underline font-medium">授权管理中心</a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
