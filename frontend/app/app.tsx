import { WindowFrame } from './shell'
import Dashboard from './features/dashboard/Dashboard'
import './styles/app.css'

/**
 * App root. The main translation interface.
 */
export default function App() {
  return (
    <WindowFrame title="喜阅 TransFlow">
      <Dashboard />
    </WindowFrame>
  )
}
