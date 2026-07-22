import { useEffect } from 'react'
import { useHashRoute } from './hooks/useHashRoute'
import Dashboard from './components/Dashboard'
import SubtitleOverlay from './components/SubtitleOverlay'
import OBSWindow from './components/OBSWindow'
import './styles/global.css'

export default function App() {
  const { route } = useHashRoute()

  // 根据路由选择渲染的组件
  switch (route) {
    case '/overlay':
      return <SubtitleOverlay />
    case '/obs':
      return <OBSWindow />
    default:
      return <Dashboard />
  }
}
