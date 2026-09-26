import React, { Component, ErrorInfo, ReactNode } from 'react'
import Dashboard from './features/dashboard'
import i18n from './i18n'
import { I18nextProvider } from 'react-i18next'
import { ToastContainer } from './ui'

// 🛡️ 错误边界组件：专门防止子组件报错导致整个页面彻底黑屏
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('React 捕获到全局渲染崩溃:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, color: '#fb7185', background: '#06060f', height: '100vh', fontFamily: 'Inter, sans-serif' }}>
          <h2 style={{ color: 'rgba(255,255,255,0.92)', marginBottom: 12 }}>⚠️ 界面加载异常</h2>
          <p style={{ color: 'rgba(255,255,255,0.58)', marginBottom: 16 }}>软件捕获到一个运行时错误，建议刷新或检查后端服务：</p>
          <pre style={{ background: 'rgba(255,255,255,0.05)', padding: 12, borderRadius: 8, color: '#fb7185', overflow: 'auto', fontSize: 12, maxHeight: 200 }}>
            {this.state.error?.message || this.state.error?.toString() || '未知错误'}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: 12, padding: '8px 16px', background: 'linear-gradient(135deg,#3b82f6,#a855f7)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}
          >
            🔄 重新加载界面
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

export default function App() {
  return (
    <I18nextProvider i18n={i18n}>
      <ErrorBoundary>
        {/* 背景光晕层 — 蓝紫 aurora */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute -top-32 -left-32 w-[480px] h-[480px] rounded-full bg-blue-600/25 blur-[130px] animate-[aurora_16s_ease-in-out_infinite]" />
          <div className="absolute top-1/3 -right-24 w-[420px] h-[420px] rounded-full bg-purple-600/25 blur-[130px] animate-[aurora_20s_ease-in-out_infinite_reverse]" />
          <div className="absolute -bottom-32 left-1/3 w-[380px] h-[380px] rounded-full bg-indigo-500/20 blur-[120px] animate-[aurora_18s_ease-in-out_infinite]" />
        </div>

        <div className="relative z-10 h-full">
          <Dashboard />
        </div>
        <ToastContainer />
      </ErrorBoundary>
    </I18nextProvider>
  )
}
