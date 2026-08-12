import React, { Component, ErrorInfo, ReactNode } from 'react'
import './styles/global.css'
import Dashboard from './components/Dashboard'
import i18n from './i18n'
import { I18nextProvider } from 'react-i18next'

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
        <div style={{ padding: 24, color: '#f87171', background: '#09090b', height: '100vh', fontFamily: 'sans-serif' }}>
          <h2>⚠️ 界面加载异常</h2>
          <p style={{ color: '#a1a1aa' }}>软件捕获到一个运行时错误，建议刷新或检查后端服务：</p>
          <pre style={{ background: '#18181b', padding: 12, borderRadius: 8, color: '#fca5a5', overflow: 'auto' }}>
            {this.state.error?.toString()}
          </pre>
          <button 
            onClick={() => window.location.reload()} 
            style={{ marginTop: 12, padding: '8px 16px', background: '#27272a', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
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
        <Dashboard />
      </ErrorBoundary>
    </I18nextProvider>
  )
}