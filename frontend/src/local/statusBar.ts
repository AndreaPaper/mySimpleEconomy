import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'

/**
 * La barra di stato di Android (ora, batteria) con il colore dello sfondo dell'app, e
 * icone scure su sfondo chiaro, chiare su sfondo scuro. Senza, Android la lasciava con
 * le icone bianche anche sul tema chiaro, e l'ora quasi non si leggeva.
 *
 * Riceve il colore che ThemeColorSync legge dal CSS ("rgb(r, g, b)"). Fuori da Android
 * non fa niente: nel browser ci pensa il meta theme-color.
 */
export async function syncStatusBar(cssColor: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  const rgb = parseRgb(cssColor)
  if (!rgb) return
  await StatusBar.setStyle({ style: isLight(rgb) ? Style.Light : Style.Dark })
  await StatusBar.setBackgroundColor({ color: toHex(rgb) })
}

export function parseRgb(css: string): [number, number, number] | null {
  const match = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(css)
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null
}

/** Chiaro secondo la luminanza percepita: sopra metà, le icone vanno scure. */
export function isLight([r, g, b]: [number, number, number]): boolean {
  return 0.299 * r + 0.587 * g + 0.114 * b > 128
}

const toHex = (rgb: number[]) => '#' + rgb.map((c) => c.toString(16).padStart(2, '0')).join('')
