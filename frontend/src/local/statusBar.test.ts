import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isLight, parseRgb, syncStatusBar } from './statusBar'

const calls = vi.hoisted(() => [] as { color: string; light: boolean }[])

vi.mock('@capacitor/core', async (original) => ({
  ...(await original<typeof import('@capacitor/core')>()),
  Capacitor: { isNativePlatform: () => true },
  registerPlugin: () => ({ setColors: async (options: { color: string; light: boolean }) => void calls.push(options) }),
}))

describe('barra di stato', () => {
  beforeEach(() => {
    calls.length = 0
  })

  it('legge il colore del CSS', () => {
    expect(parseRgb('rgb(240, 247, 255)')).toEqual([240, 247, 255])
    expect(parseRgb('rgba(0, 0, 0, 1)')).toEqual([0, 0, 0])
    expect(parseRgb('transparent')).toBeNull()
  })

  // Le icone devono leggersi: scure sullo sfondo chiaro del tema chiaro, chiare sul nero.
  it('icone scure su sfondo chiaro, chiare su sfondo scuro', () => {
    expect(isLight([240, 247, 255])).toBe(true)
    expect(isLight([0, 0, 0])).toBe(false)
    expect(isLight([30, 41, 59])).toBe(false)
  })

  // Nel test end-to-end del 13/11, con il tema scuro le fasce restavano bianche: il
  // colore va a tutte e due le fasce, insieme allo stile delle icone.
  it('passa a Android il colore dello sfondo e lo stile delle icone, per ogni tema', async () => {
    await syncStatusBar('rgb(11, 22, 32)')
    await syncStatusBar('rgb(245, 250, 255)')

    expect(calls).toEqual([
      { color: '#0b1620', light: false },
      { color: '#f5faff', light: true },
    ])
  })
})
