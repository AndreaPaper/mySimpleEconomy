// Palette colori fissa per le categorie (nessun color picker libero, per mantenere
// leggibili i grafici di riepilogo).
//
// Sono pastello, non tinte piene: il colore della categoria si vede quasi sempre
// come pastiglia tonda dietro un'icona, e diciannove pieni al 500 uno accanto
// all'altro fanno più rumore che informazione. Il prezzo del pastello è che il
// glifo bianco ci sparisce sopra: vedi categoryInk.
export const CATEGORY_COLORS = [
  '#F5A3A3',
  '#F8C39A',
  '#F8D6A0',
  '#F1E29C',
  '#CFE49E',
  '#A9DFB4',
  '#9FDCC4',
  '#9FD8D3',
  '#A0D8E6',
  '#A6CFEA',
  '#AFC6F0',
  '#B6BAEE',
  '#C3B4F0',
  '#CFB2ED',
  '#E2B0EA',
  '#F0AFCB',
  '#F4AEB9',
  '#C0CAD6',
  '#CCC6BF',
]

// Per ogni pastello, i due toni derivati della stessa tinta:
//
// - `data` è il tono medio per barre e fette di grafico. Il pastello lì non
//   basta: due categorie vicine si distinguono poco fra loro e poco dal fondo
//   della card, e le barre per categoria sono uno dei punti per cui si apre la
//   Dashboard.
// - `ink` è il glifo dell'icona sulla pastiglia, al posto del bianco di prima.
//
// Ricavati con la stessa ricetta per tutti e diciannove — stessa tinta, `data`
// un gradino sotto in luminosità, `ink` portato a fondo scala — e verificati:
// ogni `ink` sta fra 3,6:1 e 7:1 sul proprio pastello, sopra il 3:1 che le
// icone richiedono.
const CATEGORY_TONES: Record<string, { data: string; ink: string }> = {
  '#F5A3A3': { data: '#E66565', ink: '#8A0F0F' },
  '#F8C39A': { data: '#E8975A', ink: '#9A4E14' },
  '#F8D6A0': { data: '#ECB660', ink: '#8A5A0F' },
  '#F1E29C': { data: '#E0C961', ink: '#867213' },
  '#CFE49E': { data: '#AECB6A', ink: '#5E7821' },
  '#A9DFB4': { data: '#63BE85', ink: '#1F6B39' },
  '#9FDCC4': { data: '#6FBFA0', ink: '#297054' },
  '#9FD8D3': { data: '#71B9B3', ink: '#2A6F69' },
  '#A0D8E6': { data: '#6BBACE', ink: '#206779' },
  '#A6CFEA': { data: '#6FA8D6', ink: '#1B5378' },
  '#AFC6F0': { data: '#759ADD', ink: '#183D81' },
  '#B6BAEE': { data: '#7F85D9', ink: '#1D247C' },
  '#C3B4F0': { data: '#937BDD', ink: '#331A7F' },
  '#CFB2ED': { data: '#A97FD9', ink: '#4A2670' },
  '#E2B0EA': { data: '#C77BD3', ink: '#6D2079' },
  '#F0AFCB': { data: '#DD75A2', ink: '#811845' },
  '#F4AEB9': { data: '#E47183', ink: '#871225' },
  '#C0CAD6': { data: '#8EA3BB', ink: '#2A496F' },
  '#CCC6BF': { data: '#B7A187', ink: '#6F4F2A' },
}

// Colore di riserva per le categorie senza colore (create prima che ci fosse,
// o arrivate da un import).
export const FALLBACK_CATEGORY_COLOR = '#C0CAD6'

function normalize(color: string): string {
  return color.trim().toUpperCase()
}

// Luminanza relativa secondo WCAG: serve a decidere il glifo per i colori che
// non stanno in tabella, senza doverli elencare.
function luminance(hex: string): number {
  const value = normalize(hex).replace('#', '')
  if (value.length !== 6) return 0
  const channels = [0, 2, 4].map((i) => {
    const c = parseInt(value.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

const INK_DARK = '#1F2937'
const INK_LIGHT = '#FFFFFF'

function contrast(a: number, b: number): number {
  const [hi, lo] = a > b ? [a, b] : [b, a]
  return (hi + 0.05) / (lo + 0.05)
}

// Scuro o chiaro, quello dei due che si legge meglio sopra `background`. Per le
// scritte sopra una tinta qualsiasi — le percentuali dentro le fette del
// grafico, dove il bianco fisso faceva 1,65:1 sul giallo.
//
// Si confrontano i due contrasti invece di guardare se la tinta supera una
// soglia di luminosità: i toni medi stanno quasi tutti attorno alla soglia, e
// da lì una scelta secca sbaglia proprio dove conta.
export function readableOn(background: string): string {
  const bg = luminance(background)
  return contrast(luminance(INK_DARK), bg) >= contrast(luminance(INK_LIGHT), bg) ? INK_DARK : INK_LIGHT
}

// Colore del glifo dell'icona sulla pastiglia della categoria.
//
// Fuori tabella si decide dalla luminosità del fondo invece che arrendersi al
// bianco: le categorie salvate prima di questa palette hanno ancora i colori
// pieni, e restano tali finché non si esegue la conversione in
// backend/db/migrazione-colori-pastello.sql. Nel frattempo le due generazioni
// convivono, e ognuna prende il glifo che si legge sul proprio fondo.
export function categoryInk(color?: string | null): string {
  if (!color) return '#FFFFFF'
  const tone = CATEGORY_TONES[normalize(color)]
  if (tone) return tone.ink
  return readableOn(color)
}

// Colore per barre e fette di grafico. Fuori tabella resta il colore stesso:
// i pieni di prima lì funzionavano già.
export function categoryData(color?: string | null): string {
  if (!color) return FALLBACK_CATEGORY_COLOR
  return CATEGORY_TONES[normalize(color)]?.data ?? color
}
