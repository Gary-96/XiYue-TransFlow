/**
 * BusinessDashboard — 乐曼同传运营看板 (Soybean Admin 风格)
 * 包含：欢迎语、核心指标卡、趋势图、平台分布、激活动态、到期预警
 */
import { useState } from 'react'

// ── 数据接口 ───────────────────────────────────────────────────────
interface StatCard {
  title: string
  value: string
  icon: string
  color: string
  bgColor: string
  trend?: string
  trendUp?: boolean
}

interface TrendData {
  time: string
  duration: number  // 同传时长(分钟)
  apiCalls: number  // API调用次数
}

interface PlatformData {
  name: string
  percent: number
  color: string
}

interface ActivationLog {
  id: number
  deviceCode: string
  cardType: string
  time: string
  status: 'success' | 'warning' | 'info'
}

interface ExpiryWarning {
  id: number
  deviceCode: string
  expireDate: string
  daysLeft: number
  status: 'urgent' | 'warning'
}

// ── Mock 数据 ──────────────────────────────────────────────────────
const STAT_CARDS: StatCard[] = [
  { title: '今日活跃设备', value: '28 台', icon: '💻', color: 'text-blue-700', bgColor: 'bg-blue-50 border-blue-200', trend: '+12%', trendUp: true },
  { title: '今日 Token 消耗', value: '1.28M 字符', icon: '⚡', color: 'text-purple-700', bgColor: 'bg-purple-50 border-purple-200', trend: '+8.5%', trendUp: true },
  { title: '今日充值金额', value: '￥1,280.00', icon: '💰', color: 'text-emerald-700', bgColor: 'bg-emerald-50 border-emerald-200', trend: '+¥320', trendUp: true },
  { title: '有效激活码存量', value: '156 张', icon: '🔑', color: 'text-amber-700', bgColor: 'bg-amber-50 border-amber-200', trend: '-5', trendUp: false },
]

const TREND_DATA: TrendData[] = [
  { time: '00:00', duration: 45, apiCalls: 120 },
  { time: '03:00', duration: 32, apiCalls: 85 },
  { time: '06:00', duration: 28, apiCalls: 75 },
  { time: '09:00', duration: 85, apiCalls: 245 },
  { time: '12:00', duration: 120, apiCalls: 380 },
  { time: '15:00', duration: 98, apiCalls: 310 },
  { time: '18:00', duration: 145, apiCalls: 420 },
  { time: '21:00', duration: 110, apiCalls: 340 },
]

const PLATFORM_DATA: PlatformData[] = [
  { name: '抖音直播', percent: 70, color: '#3b82f6' },
  { name: 'TikTok Live', percent: 30, color: '#8b5cf6' },
]

const ACTIVATION_LOGS: ActivationLog[] = [
  { id: 1, deviceCode: 'mac-8f3a2b', cardType: '30天月卡', time: '14:32:05', status: 'success' },
  { id: 2, deviceCode: 'mac-1c9d4e', cardType: '7天体验卡', time: '14:28:33', status: 'success' },
  { id: 3, deviceCode: 'mac-5a7b2f', cardType: '365年卡', time: '14:15:20', status: 'info' },
  { id: 4, deviceCode: 'mac-9e2c1a', cardType: '30天月卡', time: '13:58:12', status: 'success' },
  { id: 5, deviceCode: 'mac-3f8d5b', cardType: '7天体验卡', time: '13:42:08', status: 'warning' },
]

const EXPIRY_WARNINGS: ExpiryWarning[] = [
  { id: 1, deviceCode: 'mac-8f3a2b', expireDate: '2026-08-15', daysLeft: 2, status: 'urgent' },
  { id: 2, deviceCode: 'mac-1c9d4e', expireDate: '2026-08-18', daysLeft: 5, status: 'warning' },
  { id: 3, deviceCode: 'mac-5a7b2f', expireDate: '2026-08-20', daysLeft: 7, status: 'warning' },
  { id: 4, deviceCode: 'mac-9e2c1a', expireDate: '2026-08-22', daysLeft: 9, status: 'warning' },
]

// ── 饼图组件 (SVG) ─────────────────────────────────────────────────
function SimplePieChart({ data, size = 120 }: { data: PlatformData[]; size?: number }) {
  const total = data.reduce((s, d) => s + d.percent, 0)
  let currentAngle = 0
  const radius = size / 2 - 8
  
  const slices = data.map((d) => {
    const angle = (d.percent / total) * 360
    const startAngle = currentAngle
    const endAngle = currentAngle + angle
    currentAngle = endAngle
    
    const startRad = (startAngle - 90) * (Math.PI / 180)
    const endRad = (endAngle - 90) * (Math.PI / 180)
    
    const x1 = size / 2 + radius * Math.cos(startRad)
    const y1 = size / 2 + radius * Math.sin(startRad)
    const x2 = size / 2 + radius * Math.cos(endRad)
    const y2 = size / 2 + radius * Math.sin(endRad)
    
    const largeArc = angle > 180 ? 1 : 0
    const pathData = [
      `M ${size / 2} ${size / 2}`,
      `L ${x1} ${y1}`,
      `A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
      'Z'
    ].join(' ')
    
    return { pathData, color: d.color, name: d.name, percent: d.percent }
  })
  
  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} className="flex-shrink-0">
        {slices.map((s, i) => (
          <path key={i} d={s.pathData} fill={s.color} className="opacity-90 hover:opacity-100 transition-opacity" />
        ))}
        <circle cx={size / 2} cy={size / 2} r={radius * 0.55} fill="white" />
        <text x={size / 2} y={size / 2 - 4} textAnchor="middle" className="text-xs font-bold fill-slate-600">平台</text>
        <text x={size / 2} y={size / 2 + 10} textAnchor="middle" className="text-xs font-bold fill-slate-800">分布</text>
      </svg>
      <div className="flex flex-col gap-2">
        {slices.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-xs text-slate-600">{s.name}</span>
            <span className="text-xs font-bold text-slate-800">{s.percent}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 主组件 ─────────────────────────────────────────────────────────
export default function BusinessDashboard() {
  const [backendReady] = useState(false)
  
  const durationData = TREND_DATA.map(d => d.duration)
  const apiData = TREND_DATA.map(d => d.apiCalls)

  return (
    <div className="h-full w-full bg-slate-50 overflow-y-auto p-6 space-y-5">
      {/* ════════════════════════════════════════════════════
          顶部欢迎区
          ════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900 mb-1">
              尊贵的管理员，欢迎来到乐曼同传运营控制台！
            </h1>
            <p className="text-sm text-slate-500">
              实时监控同传服务状态、Token 消耗与激活码收益。
            </p>
          </div>
          <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border ${
            backendReady 
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
              : 'bg-slate-100 border-slate-200 text-slate-500'
          }`}>
            <span className={`w-2 h-2 rounded-full ${backendReady ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
            <span className="text-sm font-medium">{backendReady ? '引擎在线' : '引擎离线'}</span>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════
          核心指标卡
          ════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {STAT_CARDS.map((card, i) => (
          <div key={i} className={`${card.bgColor} border rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow`}>
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-xl shadow-sm">
                {card.icon}
              </div>
              {card.trend && (
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  card.trendUp 
                    ? 'bg-emerald-100 text-emerald-700' 
                    : 'bg-rose-100 text-rose-700'
                }`}>
                  {card.trend}
                </span>
              )}
            </div>
            <div className="text-[13px] text-slate-500 mb-1">{card.title}</div>
            <div className={`text-2xl font-bold ${card.color}`}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════
          中间图表区
          ════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* 左侧：24小时趋势折线图 */}
        <div className="xl:col-span-2 bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-slate-800">24小时同传趋势</h3>
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-slate-500">同传时长 (分钟)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-purple-500" />
                <span className="text-slate-500">API 调用次数</span>
              </div>
            </div>
          </div>
          
          {/* 折线图 */}
          <div className="relative h-48">
            <svg width="100%" height="100%" viewBox="0 0 800 200" preserveAspectRatio="none">
              {/* 网格线 */}
              {[0, 50, 100, 150, 200].map(y => (
                <line key={y} x1="0" y1={y} x2="800" y2={y} stroke="#f1f5f9" strokeWidth="1" />
              ))}
              
              {/* 同传时长折线 */}
              <polyline
                points={durationData.map((v, i) => {
                  const x = (i / (durationData.length - 1)) * 800
                  const y = 200 - (v / 200) * 180
                  return `${x},${y}`
                }).join(' ')}
                fill="none"
                stroke="#3b82f6"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              
              {/* API调用折线 */}
              <polyline
                points={apiData.map((v, i) => {
                  const x = (i / (apiData.length - 1)) * 800
                  const y = 200 - (v / 500) * 180
                  return `${x},${y}`
                }).join(' ')}
                fill="none"
                stroke="#8b5cf6"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              
              {/* X轴标签 */}
              {TREND_DATA.map((d, i) => (
                <text key={i} x={(i / (TREND_DATA.length - 1)) * 800} y="195" textAnchor="middle" className="text-[10px] fill-slate-400">
                  {d.time}
                </text>
              ))}
            </svg>
          </div>
        </div>

        {/* 右侧：平台使用分布饼图 */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
          <h3 className="text-base font-bold text-slate-800 mb-4">平台使用分布</h3>
          <div className="flex items-center justify-center py-4">
            <SimplePieChart data={PLATFORM_DATA} />
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">总使用次数</span>
              <span className="font-bold text-slate-800">2,847</span>
            </div>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════
          底部动态栏
          ════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* 左下角：最新卡密激活动态 */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-slate-800">最新卡密激活动态</h3>
            <span className="text-xs text-slate-400">最近 24 小时</span>
          </div>
          <div className="space-y-3">
            {ACTIVATION_LOGS.map((log) => (
              <div key={log.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${
                  log.status === 'success' ? 'bg-emerald-100' :
                  log.status === 'warning' ? 'bg-amber-100' : 'bg-blue-100'
                }`}>
                  {log.status === 'success' ? '✓' : log.status === 'warning' ? '⚠' : 'ℹ'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-slate-500">{log.deviceCode}</span>
                    <span className="text-xs font-bold text-slate-800">{log.cardType}</span>
                  </div>
                  <div className="text-[11px] text-slate-400">{log.time}</div>
                </div>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  log.status === 'success' ? 'bg-emerald-100 text-emerald-700' :
                  log.status === 'warning' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                }`}>
                  {log.status === 'success' ? '成功' : log.status === 'warning' ? '警告' : '信息'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 右下角：到期预警列表 */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-slate-800">到期预警列表</h3>
            <span className="text-xs text-rose-600 font-medium">需要关注</span>
          </div>
          <div className="space-y-3">
            {EXPIRY_WARNINGS.map((warn) => (
              <div key={warn.id} className={`flex items-center gap-3 p-3 rounded-xl border ${
                warn.status === 'urgent' 
                  ? 'bg-rose-50 border-rose-200' 
                  : 'bg-amber-50 border-amber-200'
              }`}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${
                  warn.status === 'urgent' ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'
                }`}>
                  ⏰
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-slate-600">{warn.deviceCode}</span>
                  </div>
                  <div className="text-[11px] text-slate-400">到期时间: {warn.expireDate}</div>
                </div>
                <div className="text-right">
                  <div className={`text-sm font-bold ${
                    warn.status === 'urgent' ? 'text-rose-600' : 'text-amber-600'
                  }`}>
                    {warn.daysLeft} 天
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {warn.status === 'urgent' ? '即将到期' : '即将到期'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
