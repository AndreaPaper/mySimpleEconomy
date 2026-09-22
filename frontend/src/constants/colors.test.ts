import { describe, expect, it } from 'vitest'
import { CATEGORY_COLORS, categoryData, categoryInk, readableOn } from './colors'

// I colori delle categorie. Il file dichiara un contratto nei propri commenti —
// "ogni ink sta fra 3,6:1 e 7:1 sul proprio pastello, sopra il 3:1 che le icone
// richiedono" — e finché resta un commento nessuno se ne accorge se smette di
// valere. Qui diventa un vincolo verificato.

function luminanza(hex: string): number {
  const valore = hex.replace('#', '')
  const canali = [0, 2, 4].map((i) => {
    const c = parseInt(valore.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * canali[0] + 0.7152 * canali[1] + 0.0722 * canali[2]
}

function contrasto(a: string, b: string): number {
  const [alto, basso] = [luminanza(a), luminanza(b)].sort((x, y) => y - x)
  return (alto + 0.05) / (basso + 0.05)
}

describe('la tavolozza', () => {
  it('ha diciannove colori, tutti esadecimali a sei cifre', () => {
    expect(CATEGORY_COLORS).toHaveLength(19)
    for (const colore of CATEGORY_COLORS) {
      expect(colore).toMatch(/^#[0-9A-F]{6}$/)
    }
  })

  it('non contiene doppioni', () => {
    expect(new Set(CATEGORY_COLORS).size).toBe(CATEGORY_COLORS.length)
  })
})

describe('categoryInk — il glifo sulla pastiglia', () => {
  // Il contratto dichiarato nel file. Il minimo per un'icona è 3:1 (WCAG, non
  // testo); il massimo tiene il glifo dentro la stessa famiglia di tinta invece
  // di farlo diventare nero.
  it.each(CATEGORY_COLORS)('su %s il glifo si legge (fra 3,5:1 e 7,5:1)', (pastello) => {
    const rapporto = contrasto(categoryInk(pastello), pastello)

    expect(rapporto).toBeGreaterThanOrEqual(3.5)
    expect(rapporto).toBeLessThanOrEqual(7.5)
  })

  it('funziona anche con l esadecimale scritto in minuscolo', () => {
    expect(categoryInk('#a6cfea')).toBe(categoryInk('#A6CFEA'))
  })

  // Le categorie salvate prima della migrazione al pastello hanno ancora i
  // colori pieni: il glifo deve restare leggibile anche su quelli, altrimenti
  // l'app si romperebbe per chiunque non abbia ancora eseguito la conversione.
  it('su un colore fuori tavolozza sceglie comunque il verso leggibile', () => {
    expect(contrasto(categoryInk('#EF4444'), '#EF4444')).toBeGreaterThanOrEqual(3)
    expect(contrasto(categoryInk('#0EA5E9'), '#0EA5E9')).toBeGreaterThanOrEqual(3)
    expect(contrasto(categoryInk('#F1E29C'), '#F1E29C')).toBeGreaterThanOrEqual(3)
  })

  it('senza colore ripiega sul bianco', () => {
    expect(categoryInk(null)).toBe('#FFFFFF')
    expect(categoryInk(undefined)).toBe('#FFFFFF')
  })
})

describe('categoryData — barre e fette di grafico', () => {
  // Il motivo per cui il tono medio esiste: due pastelli vicini si distinguono
  // poco fra loro e poco dal fondo della card.
  it.each(CATEGORY_COLORS)('su %s il tono medio è più scuro del pastello', (pastello) => {
    expect(luminanza(categoryData(pastello))).toBeLessThan(luminanza(pastello))
  })

  it('un colore fuori tavolozza resta sé stesso', () => {
    expect(categoryData('#EF4444')).toBe('#EF4444')
  })

  it('senza colore ripiega sul grigio della tavolozza', () => {
    expect(CATEGORY_COLORS).toContain(categoryData(null))
  })
})

describe('readableOn', () => {
  // La regola sceglie fra scuro e chiaro quello che contrasta di più, invece di
  // guardare una soglia di luminosità: i toni medi stanno quasi tutti attorno
  // alla soglia, e da lì una scelta secca sbagliava proprio dove contava (le
  // percentuali bianche dentro le fette del donut stavano a 2,6:1).
  it.each(CATEGORY_COLORS.map((c) => categoryData(c)))(
    'sul tono medio %s il testo raggiunge almeno 4,5:1',
    (fondo) => {
      expect(contrasto(readableOn(fondo), fondo)).toBeGreaterThanOrEqual(4.5)
    },
  )

  // Asserito sul comportamento e non sui due esadecimali: quali siano è una
  // scelta da ritoccare (lo scuro è già stato reso più scuro una volta, per
  // portare tre toni medi sopra il 4,5:1), il verso no.
  it('sul bianco sceglie lo scuro e sul nero il chiaro', () => {
    expect(contrasto(readableOn('#FFFFFF'), '#FFFFFF')).toBeGreaterThan(10)
    expect(contrasto(readableOn('#000000'), '#000000')).toBeGreaterThan(10)
    expect(luminanza(readableOn('#FFFFFF'))).toBeLessThan(luminanza(readableOn('#000000')))
  })
})
