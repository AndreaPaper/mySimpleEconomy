import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { DEFAULT_PALETTE_KEY, UI_PALETTES } from '../constants/uiPalettes'

interface PaletteContextValue {
  paletteKey: string
  setPaletteKey: (key: string) => void
}

const PaletteContext = createContext<PaletteContextValue | undefined>(undefined)

function getInitialPalette(): string {
  const stored = localStorage.getItem('palette')
  return stored && UI_PALETTES.some((p) => p.key === stored) ? stored : DEFAULT_PALETTE_KEY
}

export function PaletteProvider({ children }: { children: ReactNode }) {
  const [paletteKey, setPaletteKey] = useState<string>(getInitialPalette)

  useEffect(() => {
    document.documentElement.dataset.palette = paletteKey
    localStorage.setItem('palette', paletteKey)
  }, [paletteKey])

  return <PaletteContext.Provider value={{ paletteKey, setPaletteKey }}>{children}</PaletteContext.Provider>
}

export function usePalette() {
  const ctx = useContext(PaletteContext)
  if (!ctx) throw new Error('usePalette must be used within PaletteProvider')
  return ctx
}
