import { useCallback, useEffect, useState } from 'react'
import type { Reference } from '../types.ts'
import { EMPTY_ROUTE, buildHash, parseHash, type Route } from './deepLink.ts'

/** Keeps React state in sync with window.location.hash. */
export function useHashRoute(): [Route, (ref: Reference | null, translationId: string) => void] {
  const [route, setRoute] = useState<Route>(() =>
    typeof window === 'undefined' ? EMPTY_ROUTE : parseHash(window.location.hash),
  )

  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  const navigate = useCallback((ref: Reference | null, translationId: string) => {
    const next = buildHash(ref, translationId)
    if (next === window.location.hash) return
    window.location.hash = next
  }, [])

  return [route, navigate]
}
