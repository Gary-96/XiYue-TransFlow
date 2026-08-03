import './styles/global.css'
import Dashboard from './components/Dashboard'
import i18n from './i18n'
import { I18nextProvider } from 'react-i18next'

export default function App() {
  return (
    <I18nextProvider i18n={i18n}>
      <Dashboard />
    </I18nextProvider>
  )
}
