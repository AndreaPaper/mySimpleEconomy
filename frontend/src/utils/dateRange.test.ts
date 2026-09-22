import { describe, expect, it } from 'vitest'
import { buildMonthCells, computePresets, formatRangeLabel } from './dateRange'

// Il selettore di intervallo date. Le tre funzioni decidono cosa si legge sul
// pulsante e quali giorni risultano dentro la selezione: sbagliando, non si
// vede un errore ma un intervallo diverso da quello scelto — e le transazioni
// mostrate sono quelle sbagliate senza che nulla lo dica.

describe('formatRangeLabel', () => {
  it('senza date lo dice', () => {
    expect(formatRangeLabel('', '')).toBe('Tutte le date')
  })

  // L'anno si scrive una volta sola quando le due date lo condividono: ripeterlo
  // riempirebbe il pulsante senza aggiungere niente.
  it('con lo stesso anno lo scrive una volta sola in coda', () => {
    const etichetta = formatRangeLabel('2026-03-02', '2026-03-31')

    expect(etichetta).toContain('2026')
    expect(etichetta.match(/2026/g)).toHaveLength(1)
    expect(etichetta).toMatch(/^2 mar.* – 31 mar.* 2026$/)
  })

  /**
   * A cavallo di due anni l'anno viene dal formattatore della data di fine
   * invece che aggiunto in coda. Il risultato scritto è quasi identico —
   * "2 dic – 5 gen 2026" — ma vale la pena averlo fissato per quello che
   * <em>non</em> dice: l'anno di partenza non compare. Un intervallo dicembre
   * 2025 → gennaio 2026 si legge come se cominciasse nel 2026.
   */
  it('a cavallo di due anni mostra solo l anno di fine', () => {
    const etichetta = formatRangeLabel('2025-12-02', '2026-01-05')

    expect(etichetta).toContain('2026')
    expect(etichetta).not.toContain('2025')
    expect(etichetta.match(/\d{4}/g)).toHaveLength(1)
  })

  it('con una sola estremità lo dice a parole', () => {
    expect(formatRangeLabel('2026-03-02', '')).toMatch(/^Dal 2 mar.* 2026$/)
    expect(formatRangeLabel('', '2026-03-31')).toMatch(/^Fino al 31 mar.* 2026$/)
  })
})

describe('buildMonthCells', () => {
  const celle = (anno: number, mese: number, da = '', a = '') =>
    buildMonthCells(new Date(anno, mese - 1, 1), da, a)

  // Sei settimane sempre: una griglia di altezza fissa non fa saltare il
  // pannello quando si cambia mese.
  it('la griglia è sempre di 42 celle', () => {
    expect(celle(2026, 2)).toHaveLength(42)
    expect(celle(2026, 3)).toHaveLength(42)
  })

  /**
   * La settimana parte da lunedì, mentre {@code getDay()} conta da domenica: è
   * l'offset più facile da sbagliare di un giorno, e sbagliandolo l'intero mese
   * scivola di una colonna senza che nulla sembri rotto.
   */
  it('il primo giorno cade nella colonna del suo giorno della settimana', () => {
    // Il 1 marzo 2026 è una domenica: settima colonna, quindi sei celle vuote.
    const marzo = celle(2026, 3)
    expect(marzo.slice(0, 6).every((c) => c.state === 'empty')).toBe(true)
    expect(marzo[6].label).toBe('1')

    // Il 1 giugno 2026 è un lunedì: prima colonna, nessuna cella vuota davanti.
    expect(celle(2026, 6)[0].label).toBe('1')
  })

  it('i giorni fuori dal mese sono vuoti e non selezionabili', () => {
    const marzo = celle(2026, 3)

    expect(marzo.filter((c) => c.iso !== null)).toHaveLength(31)
    expect(marzo.every((c) => (c.iso === null) === (c.state === 'empty'))).toBe(true)
  })

  it('febbraio bisestile ha 29 giorni', () => {
    expect(celle(2024, 2).filter((c) => c.iso !== null)).toHaveLength(29)
    expect(celle(2026, 2).filter((c) => c.iso !== null)).toHaveLength(28)
  })

  it('marca inizio, interno e fine dell intervallo', () => {
    const marzo = celle(2026, 3, '2026-03-10', '2026-03-14')
    const stato = (giorno: string) => marzo.find((c) => c.iso === giorno)!.state

    expect(stato('2026-03-09')).toBe('none')
    expect(stato('2026-03-10')).toBe('start')
    expect(stato('2026-03-12')).toBe('in')
    expect(stato('2026-03-14')).toBe('end')
    expect(stato('2026-03-15')).toBe('none')
  })

  /**
   * Un intervallo di un giorno solo: la stessa cella è inizio e fine. Vince
   * l'inizio, altrimenti la selezione sembrerebbe partire da nulla.
   */
  it('con un intervallo di un giorno vince l inizio', () => {
    const marzo = celle(2026, 3, '2026-03-10', '2026-03-10')

    expect(marzo.find((c) => c.iso === '2026-03-10')!.state).toBe('start')
  })

  it('con una sola estremità scelta non marca nessun interno', () => {
    const marzo = celle(2026, 3, '2026-03-10', '')

    expect(marzo.find((c) => c.iso === '2026-03-10')!.state).toBe('start')
    expect(marzo.some((c) => c.state === 'in')).toBe(false)
  })
})

describe('computePresets', () => {
  // `today` è già un parametro: le scorciatoie si provano su una data fissa,
  // invece che sperare che la suite non giri il 31 del mese.
  const oggi = new Date(2026, 2, 15) // 15 marzo 2026

  it('propone i quattro intervalli abituali', () => {
    expect(computePresets(oggi).map((p) => p.label)).toEqual([
      'Questo mese',
      'Mese scorso',
      'Ultimi 30 giorni',
      "Quest'anno",
    ])
  })

  it('questo mese va dal primo all ultimo giorno', () => {
    const [questoMese] = computePresets(oggi)

    expect(questoMese.from).toBe('2026-03-01')
    expect(questoMese.to).toBe('2026-03-31')
  })

  // Il mese scorso deve prendere la sua lunghezza vera, non 30 giorni: da marzo
  // si torna a febbraio, che ne ha 28.
  it('il mese scorso prende la propria lunghezza', () => {
    const [, meseScorso] = computePresets(oggi)

    expect(meseScorso.from).toBe('2026-02-01')
    expect(meseScorso.to).toBe('2026-02-28')
  })

  // A gennaio "mese scorso" deve scavalcare l'anno.
  it('a gennaio il mese scorso è dicembre dell anno prima', () => {
    const [, meseScorso] = computePresets(new Date(2026, 0, 15))

    expect(meseScorso.from).toBe('2025-12-01')
    expect(meseScorso.to).toBe('2025-12-31')
  })

  // Trenta giorni compreso oggi, non trentuno: da qui il -29.
  it('gli ultimi 30 giorni comprendono oggi', () => {
    const [, , ultimi30] = computePresets(oggi)

    expect(ultimi30.from).toBe('2026-02-14')
    expect(ultimi30.to).toBe('2026-03-15')
  })

  it("quest'anno va da capodanno a san silvestro", () => {
    const [, , , anno] = computePresets(oggi)

    expect(anno.from).toBe('2026-01-01')
    expect(anno.to).toBe('2026-12-31')
  })
})
