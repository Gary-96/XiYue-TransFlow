/**
 * 乐曼同传 — 错误边界组件
 * 防止子组件渲染错误导致整个应用黑屏
 */
import React, { Component, ErrorInfo, ReactNode } from 'react'
import './ErrorBoundary.css'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo })
    this.props.onError?.(error, errorInfo)
    console.error('[ErrorBoundary] 组件渲染错误:', error, errorInfo.componentStack)
  }

  handleReload = (): void => {
    window.location.reload()
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="error-boundary">
          <div className="error-boundary__content">
            <div className="error-boundary__icon">⚠️</div>
            <h2 className="error-boundary__title">界面加载异常</h2>
            <p className="error-boundary__description">
              软件捕获到一个运行时错误，建议刷新页面或检查后端服务状态。
            </p>
            <details className="error-boundary__details">
              <summary className="error-boundary__summary">查看错误详情</summary>
              <pre className="error-boundary__stack">
                {this.state.error?.message || this.state.error?.toString() || '未知错误'}
                {'\n'}
                {this.state.errorInfo?.componentStack}
              </pre>
            </details>
            <button
              className="error-boundary__button"
              onClick={this.handleReload}
            >
              🔄 重新加载界面
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
