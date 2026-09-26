/**
 * Dashboard — 主面板入口（纯布局调度组件，业务逻辑收敛于 useDashboardLogic）
 * 布局：Sidebar | TopHeader + 3/9 列 Bento Grid (QuickPanel / MetricBadges / ViewportCard)
 */
import Sidebar from '../../common/Sidebar'
import SettingsPanel from '../settings/SettingsPanel'
import TopHeader from './components/TopHeader'
import MetricBadges from './components/MetricBadges'
import QuickPanel from './components/QuickPanel'
import ViewportCard from './components/ViewportCard'
import { useDashboardLogic, type ActiveTab } from './hooks/useDashboardLogic'

export default function Dashboard() {
  const s = useDashboardLogic()

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--bg-deep)] text-[var(--text-main)] font-sans select-none antialiased">
      {/* 1. 左侧边栏（纯导航，引擎状态由 QuickPanel + MetricBadges 承载） */}
      <Sidebar
        activeTab={s.activeTab}
        onTabChange={(tab) => s.setActiveTab(tab as ActiveTab)}
        messageCount={s.messages.length}
        historyCount={s.history.length}
      />

      {/* 2. 右侧主工作区 */}
      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        <TopHeader
          platform={s.platform}
          onPlatformChange={s.setPlatform}
          roomId={s.roomId}
          onRoomIdChange={s.setRoomId}
          platformActive={s.platformActive}
          isConnecting={s.isConnecting}
          onConnectToggle={s.handleToggleConnection}
          supportedLangs={s.supportedLangs}
          srcLang={s.srcLang}
          tgtLang={s.tgtLang}
          langSwitching={s.langSwitching}
          onSetLanguage={s.handleSetLanguage}
          onSwapLanguage={s.handleSwapLanguage}
          isPinned={s.isPinned}
          onTogglePin={s.handleTogglePin}
          onMinimize={s.handleMinimize}
          onClose={s.handleClose}
        />

        <main className="flex-1 px-6 pb-6 pt-2 overflow-hidden min-h-0">
          {/* 设置 / 关于全屏卡片 */}
          {(s.activeTab === 'audio' || s.activeTab === 'settings' || s.activeTab === 'about') && (
            <div className="h-full bg-white/10 rounded-2xl border border-white/10 shadow-2xs overflow-y-auto p-5">
              <SettingsPanel activeSection={s.activeTab} />
            </div>
          )}

          {/* 3+9 列 Bento 主视图 */}
          {(s.activeTab === 'danmaku' || s.activeTab === 'subtitle') && (
            <div className="h-full grid grid-cols-12 gap-4">
              <QuickPanel
                backendReady={s.backendReady}
                backendFailed={s.backendFailed}
                wsStatus={s.wsStatus}
                messageCount={s.messages.length}
                onCopyMachineCode={s.handleCopyMachineCode}
                onClearMessages={s.clearMessages}
                onOpenAudioSettings={() => s.setActiveTab('audio')}
              />

              <div className="col-span-9 flex flex-col gap-3 min-h-0">
                <MetricBadges
                  backendReady={s.backendReady}
                  backendFailed={s.backendFailed}
                  backendPort={s.backendPort}
                  wsStatus={s.wsStatus}
                  historyCount={s.history.length}
                  ttsEnabled={s.ttsEnabled}
                />
                <ViewportCard
                  activeTab={s.activeTab}
                  messages={s.messages}
                  transcription={s.transcription}
                  history={s.history}
                  isRecording={s.isRecording}
                  wsStatus={s.wsStatus}
                  ttsEnabled={s.ttsEnabled}
                  spectrumData={s.spectrumData}
                  onStartRecording={s.startRecording}
                  onStopRecording={s.stopRecording}
                  onToggleTTS={s.toggleTTSEnabled}
                />
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
