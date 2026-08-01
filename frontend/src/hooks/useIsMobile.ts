import { useEffect, useState } from 'react'

// Breakpoint mobile per il layout della Dashboard: allineato a `md` di
// Tailwind (min-width: 768px), lo stesso limite già usato altrove
// nell'app con `md:hidden` / `hidden md:flex` (Layout.tsx, BottomNav.tsx).
const MOBILE_QUERY = '(max-width: 767px)'

// matchMedia invece di un listener su `resize`: scatta solo quando si
// attraversa la soglia, non ad ogni pixel di ridimensionamento.
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches)

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY)
    const handleChange = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mql.addEventListener('change', handleChange)
    return () => mql.removeEventListener('change', handleChange)
  }, [])

  return isMobile
}
