import { Capacitor, registerPlugin } from '@capacitor/core'

/**
 * Le fasce di sistema di Android (barra di stato con ora e batteria, barra dei gesti)
 * con il colore dello sfondo dell'app, e icone scure su sfondo chiaro, chiare su sfondo
 * scuro. Lo fa SystemBarsPlugin (android/.../SystemBarsPlugin.java): da Android 15 le
 * fasce sono lo sfondo della finestra, che il plugin ufficiale della barra di stato non
 * tocca, e nel tema scuro restavano bianche.
 *
 * Riceve il colore che ThemeColorSync legge dal CSS ("rgb(r, g, b)"). Fuori da Android
 * non fa niente: nel browser ci pensa il meta theme-color.
 */
interface SystemBarsPlugin {
  setColors(options: { color: string; light: boolean }): Promise<void>
}

const SystemBars = registerPlugin<SystemBarsPlugin>('SystemBars')

export async function syncStatusBar(cssColor: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  const rgb = parseRgb(cssColor)
  if (!rgb) return
  await SystemBars.setColors({ color: toHex(rgb), light: isLight(rgb) })
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
