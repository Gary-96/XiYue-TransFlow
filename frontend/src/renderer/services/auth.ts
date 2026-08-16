/**
 * Auth Service — 云端授权服务
 * 机器码获取、卡密激活、心跳校验、授权状态管理
 */

// ── 云端授权服务地址配置 ───────────────────────────────────────────
// 生产环境请在 .env.production 或环境变量中配置
// 默认端口 15388（避免与主后端 15387 冲突）
const CLOUD_AUTH_URL = import.meta.env.VITE_CLOUD_AUTH_URL || 'http://127.0.0.1:15388'

// ── 本地存储键名 ──────────────────────────────────────────────────
const STORAGE_KEYS = {
  MACHINE_ID: 'leman_machine_id',
  CARD_KEY: 'leman_card_key',
  ACTIVATED_AT: 'leman_activated_at',
  EXPIRE_AT: 'leman_expire_at',
  LICENSE_STATUS: 'leman_license_status',  // active | expired | unknown
} as const

// ── 接口响应类型 ──────────────────────────────────────────────────
export interface ActivateResponse {
  success: boolean
  message: string
  remaining_days?: number
  expire_at?: string
}

export interface HeartbeatResponse {
  valid: boolean
  remaining_days: number
  expire_at?: string
  notice: string
  daily_token_limit: number
  daily_token_used: number
}

export interface AuthState {
  machineId: string | null
  cardKey: string | null
  isActive: boolean
  remainingDays: number
  expireAt: string | null
  lastHeartbeat: number | null
}

// ── 工具函数 ──────────────────────────────────────────────────────

/**
 * 生成/获取本机唯一机器码
 * 优先使用 Electron API，降级到 localStorage
 */
async function getMachineId(): Promise<string> {
  // 方式1: 使用 Node.js node-machine-id（已安装在主进程）
  const electronAPI = window as unknown as { electronAPI?: { getMachineId: () => Promise<string> } }
  if (electronAPI.electronAPI?.getMachineId) {
    try {
      const id = await electronAPI.electronAPI.getMachineId()
      if (id && id.length > 0) {
        localStorage.setItem(STORAGE_KEYS.MACHINE_ID, id)
        return id
      }
    } catch (e) {
      console.warn('[Auth] 获取机器码失败:', e)
    }
  }

  // 方式2: 从 localStorage 读取
  const cached = localStorage.getItem(STORAGE_KEYS.MACHINE_ID)
  if (cached) return cached

  // 方式3: 生成基于浏览器指纹的伪机器码
  const fingerprint = generateFingerprint()
  localStorage.setItem(STORAGE_KEYS.MACHINE_ID, fingerprint)
  return fingerprint
}

/**
 * 生成浏览器指纹作为备用机器码
 */
function generateFingerprint(): string {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.textBaseline = 'top'
    ctx.font = '14px Arial'
    ctx.fillStyle = '#f60'
    ctx.fillRect(120, 1, 60, 20)
    ctx.fillStyle = '#069'
    ctx.fillText('LemanTranslate', 2, 15)
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)'
    ctx.fillText('LemanTranslate', 4, 17)
    const dataUrl = canvas.toDataURL()
    return 'MAC-' + simpleHash(dataUrl).toUpperCase().slice(0, 12)
  }
  return 'MAC-' + simpleHash(navigator.userAgent + screen.colorDepth).toUpperCase().slice(0, 12)
}

function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(16).padStart(8, '0')
}

// ── 云端 API 调用 ─────────────────────────────────────────────────

/**
 * 激活卡密
 */
export async function activateCard(cardKey: string, machineId: string): Promise<ActivateResponse> {
  const res = await fetch(`${CLOUD_AUTH_URL}/api/client/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ card_key: cardKey, machine_id: machineId }),
  })
  
  const data = await res.json()
  
  if (data.success) {
    localStorage.setItem(STORAGE_KEYS.CARD_KEY, cardKey)
    localStorage.setItem(STORAGE_KEYS.ACTIVATED_AT, new Date().toISOString())
    if (data.expire_at) {
      localStorage.setItem(STORAGE_KEYS.EXPIRE_AT, data.expire_at)
    }
    localStorage.setItem(STORAGE_KEYS.LICENSE_STATUS, 'active')
  }
  
  return data
}

/**
 * 心跳校验
 */
export async function heartbeat(machineId: string): Promise<HeartbeatResponse> {
  const res = await fetch(`${CLOUD_AUTH_URL}/api/client/heartbeat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ machine_id: machineId }),
  })
  
  return res.json()
}

/**
 * 记录 Token 消耗
 */
export async function logUsage(machineId: string, tokens: number, detail?: string): Promise<{ success: boolean }> {
  const res = await fetch(`${CLOUD_AUTH_URL}/api/client/log_usage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ machine_id: machineId, tokens, detail }),
  })
  return res.json()
}

// ── 状态管理 ──────────────────────────────────────────────────────

let cachedState: AuthState | null = null
let heartbeatTimer: ReturnType<typeof setInterval> | null = null

/**
 * 获取当前授权状态
 */
export async function getAuthState(): Promise<AuthState> {
  if (cachedState && Date.now() - cachedState.lastHeartbeat! < 60000) {
    return cachedState
  }

  const machineId = await getMachineId()
  const cardKey = localStorage.getItem(STORAGE_KEYS.CARD_KEY)
  const expireAt = localStorage.getItem(STORAGE_KEYS.EXPIRE_AT)
  const status = localStorage.getItem(STORAGE_KEYS.LICENSE_STATUS) || 'unknown'

  let remainingDays = 0
  let isActive = false

  if (status === 'active' && expireAt) {
    const exp = new Date(expireAt).getTime()
    const now = Date.now()
    remainingDays = Math.max(0, Math.ceil((exp - now) / (1000 * 60 * 60 * 24)))
    isActive = remainingDays > 0
  }

  const state: AuthState = {
    machineId,
    cardKey,
    isActive,
    remainingDays,
    expireAt: isActive ? expireAt : null,
    lastHeartbeat: Date.now(),
  }

  cachedState = state
  return state
}

/**
 * 启动静默心跳（每5分钟一次）
 */
export function startHeartbeat(callback?: (state: AuthState) => void): void {
  stopHeartbeat()

  const tick = async () => {
    try {
      const state = await getAuthState()
      const hb = await heartbeat(state.machineId!)
      
      if (!hb.valid) {
        // 授权失效，清除本地状态
        clearLicense()
        callback?.({ ...state, isActive: false })
        // 触发弹窗事件
        window.dispatchEvent(new CustomEvent('leman:license-expired'))
      } else {
        // 更新本地缓存
        localStorage.setItem(STORAGE_KEYS.LICENSE_STATUS, 'active')
        if (hb.expire_at) {
          localStorage.setItem(STORAGE_KEYS.EXPIRE_AT, hb.expire_at)
        }
        cachedState = { ...state, isActive: true, remainingDays: hb.remaining_days, lastHeartbeat: Date.now() }
        callback?.(cachedState)
      }
    } catch (e) {
      console.error('[Auth] 心跳失败:', e)
    }
  }

  // 立即执行一次
  tick()
  
  // 每5分钟执行一次
  heartbeatTimer = setInterval(tick, 5 * 60 * 1000)
}

/**
 * 停止心跳
 */
export function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
}

/**
 * 清除本地授权信息
 */
export function clearLicense(): void {
  Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key))
  cachedState = null
}

/**
 * 检查是否需要激活
 */
export async function checkNeedActivation(): Promise<boolean> {
  const state = await getAuthState()
  if (!state.isActive) return true
  if (state.remainingDays <= 3) return true  // 剩余3天以内也提示续费
  return false
}

export { CLOUD_AUTH_URL, STORAGE_KEYS }
