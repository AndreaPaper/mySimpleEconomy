import { describe, expect, it } from 'vitest'
import { isLight, parseRgb } from './statusBar'

describe('barra di stato', () => {
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
})
