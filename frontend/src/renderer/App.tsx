import React, { Component, ErrorInfo, ReactNode } from 'react'
import Dashboard from './features/dashboard'
import i18n from './i18n'
import { I18nextProvider } from 'react-i18next'
import { ToastContainer } from './ui'
import ErrorBoundary from './common/ErrorBoundary'

// 🛡️ 错误边界组件已迁移至 common/ErrorBoundary.tsx

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
