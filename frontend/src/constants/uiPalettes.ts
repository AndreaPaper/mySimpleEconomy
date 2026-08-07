export interface UiPalette {
  key: string
  label: string
  colors: { brand900: string; brand700: string; brand500: string; brand100: string }
}

// Palette dell'interfaccia (colore "brand" usato in tutta l'app tramite le
// custom property --color-brand-* in index.css). Non va confusa con
// CATEGORY_COLORS in constants/colors.ts, che è la palette delle categorie
// di spesa, indipendente da questa.
export const UI_PALETTES: UiPalette[] = [
  {
    key: 'colorhunt',
    label: 'Cielo pastello',
    colors: { brand900: '#C4F7CA', brand700: '#30AFFF', brand500: '#92EEFF', brand100: '#D8FFC5' },
  },
  {
    key: 'canvas',
    label: 'Canvas neutro',
    colors: { brand900: '#EEFBE7', brand700: '#30AFFF', brand500: '#FFFFFF', brand100: '#F5FAFF' },
  },
  {
    key: 'vividkpi',
    label: 'KPI a tinte piene',
    colors: { brand900: '#BBF1D2', brand700: '#FF8080', brand500: '#FFFFFF', brand100: '#FFF4EF' },
  },
  {
    key: 'classic',
    label: 'Blu notte (originale)',
    colors: { brand900: '#1B3C53', brand700: '#234C6A', brand500: '#456882', brand100: '#E3E3E3' },
  },
]

export const DEFAULT_PALETTE_KEY = 'canvas'
