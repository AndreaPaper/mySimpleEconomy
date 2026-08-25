export interface UiPalette {
  key: string
  label: string
  colors: { brand900: string; brand700: string; brand500: string; brand100: string }
}

// Palette dell'interfaccia (colore "brand" usato in tutta l'app tramite le
// custom property --color-brand-* in index.css). Non va confusa con
// CATEGORY_COLORS in constants/colors.ts, che è la palette delle categorie
// di spesa, indipendente da questa.
// "Canvas neutro" è la predefinita: i suoi valori stanno nel blocco @theme di
// index.css, non in una regola html[data-palette], così valgono anche prima
// che PaletteContext scriva l'attributo.
export const UI_PALETTES: UiPalette[] = [
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
    key: 'brezza',
    label: 'Brezza marina',
    colors: { brand900: '#3674B5', brand700: '#578FCA', brand500: '#A1E3F9', brand100: '#D1F8EF' },
  },
  {
    key: 'lavanda',
    label: 'Lavanda vivace',
    colors: { brand900: '#8F87F1', brand700: '#C68EFD', brand500: '#E9A5F1', brand100: '#FED2E2' },
  },
]

export const DEFAULT_PALETTE_KEY = 'canvas'
