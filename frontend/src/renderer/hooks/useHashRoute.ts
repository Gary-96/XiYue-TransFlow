/**
 * Hash 路由 Hook — 支持 #/overlay 和 #/obs 子窗口
 */
import { useState, useEffect } from 'react'

export function useHashRoute() {
  const getRoute = () => {
    const hash = window.location.hash
    if (hash.startsWith('#/overlay')) return '/overlay'
    if (hash.startsWith('#/obs')) return '/obs'
    return '/'
  }

  const [route, setRoute] = useState(getRoute())

  useEffect(() => {
    const handler = () => setRoute(getRoute())
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  }, [])

  return { route }
}
