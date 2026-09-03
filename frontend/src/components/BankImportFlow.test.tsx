import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BankImportFlow from './BankImportFlow'
import { bankImportApi } from '../api/endpoints'
import type {
  BankCategoryMappingDto,
  BankImportPreviewResponse,
  BankImportRowPreview,
  Category,
} from '../api/types'

// Il flusso dell'import bancario. La logica derivata — precedenze, selezione,
// completezza della mappatura — e' gia' coperta in utils/bankImportRows: qui si
// verificano le due cose che quel file non puo' sapere, cioe' che il carico
// mandato al commit sia quello giusto e che non si possa proseguire finche' le
// mappature non sono risolte.
//
// Il carico e' il punto delicato: e' l'unico momento in cui le scelte fatte a
// schermo diventano righe in archivio. Un campo perso li' non da' errore -
// produce una transazione sbagliata, o un duplicato.

vi.mock('../api/endpoints', () => ({
  bankImportApi: {
    analyze: vi.fn(),
    commit: vi.fn(),
    createCategoriesFromBank: vi.fn(),
  },
}))

const analyze = vi.mocked(bankImportApi.analyze)
const commit = vi.mocked(bankImportApi.commit)

const categorie: Category[] = [
  { id: 'cat-casa', name: 'Casa', type: 'EXPENSE', color: '#A8C7E7', icon: null, parentId: null } as Category,
  { id: 'cat-salute', name: 'Salute', type: 'EXPENSE', color: '#C5E1C5', icon: null, parentId: null } as Category,
]

const riga = (overrides: Partial<BankImportRowPreview> = {}): BankImportRowPreview => ({
  rowNumber: 1,
  occurredOn: '2026-03-02',
  description: 'Bonifico',
  rawOperation: 'Bonifico',
  rawDetails: 'PAGAMENTO SEDUTA',
  bankCategory: 'Bonifici in uscita',
  amount: -70,
  type: 'EXPENSE',
  provisional: false,
  outcome: 'NUOVA',
  categoryId: 'cat-salute',
  matchedTransactionId: null,
  conflictDescription: null,
  selectedByDefault: true,
  ...overrides,
})

const mappatura = (overrides: Partial<BankCategoryMappingDto> = {}): BankCategoryMappingDto => ({
  bankCategory: 'Bonifici in uscita',
  transactionType: 'EXPENSE',
  categoryId: 'cat-salute',
  doNotImport: false,
  rowCount: 1,
  sampleDescription: null,
  ...overrides,
})

const anteprima = (overrides: Partial<BankImportPreviewResponse> = {}): BankImportPreviewResponse => ({
  rows: [riga()],
  unmappedCategories: [],
  exclusions: [],
  suggestedExclusions: [],
  summary: {
    rowsInFile: 1,
    firstDate: '2026-03-02',
    lastDate: '2026-03-02',
    nuove: 1,
    giaImportate: 0,
    daAggiornare: 0,
    sospettiManuali: 0,
    sospettiRicorrenti: 0,
    escluse: 0,
    categorieDaMappare: 0,
  },
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  commit.mockResolvedValue({ imported: 1, updated: 0, skipped: 0 } as never)
})

/** Carica un file e attende l'anteprima. */
async function analizza(risposta: BankImportPreviewResponse) {
  analyze.mockResolvedValue(risposta)
  render(<BankImportFlow categories={categorie} onCategoriesChanged={vi.fn()} />)

  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  await userEvent.upload(input, new File(['x'], 'estratto.xlsx'))
  await userEvent.click(screen.getByRole('button', { name: /Analizza/i }))
  await waitFor(() => expect(analyze).toHaveBeenCalled())
}

describe('il carico mandato al commit', () => {
  it('porta le righe da importare con la categoria scelta', async () => {
    await analizza(anteprima())

    await userEvent.click(await screen.findByRole('button', { name: /Importa 1 movimenti/i }))

    await waitFor(() => expect(commit).toHaveBeenCalledTimes(1))
    const carico = commit.mock.calls[0][0]
    expect(carico.source).toBe('INTESA_SANPAOLO')
    expect(carico.rows).toHaveLength(1)
    expect(carico.rows[0]).toMatchObject({
      occurredOn: '2026-03-02',
      bankCategory: 'Bonifici in uscita',
      amount: -70,
      categoryId: 'cat-salute',
    })
  })

  /**
   * Il campo che distingue un aggiornamento da un doppione. Una riga
   * riconosciuta come la versione definitiva di un movimento gia' importato
   * come provvisorio porta il suo id: senza, il backend la inserirebbe come
   * nuova e l'utente si troverebbe la stessa spesa due volte.
   */
  it('una riga da aggiornare porta l id del movimento da sostituire', async () => {
    await analizza(
      anteprima({
        rows: [riga({ outcome: 'AGGIORNA_PROVVISORIA', matchedTransactionId: 'tx-esistente' })],
        summary: { ...anteprima().summary, nuove: 0, daAggiornare: 1 },
      }),
    )

    await userEvent.click(await screen.findByRole('button', { name: /Importa 1 movimenti/i }))

    await waitFor(() => expect(commit).toHaveBeenCalled())
    expect(commit.mock.calls[0][0].rows[0].updateTransactionId).toBe('tx-esistente')
  })

  // Una riga nuova non porta nessun id da sostituire: mandarne uno per sbaglio
  // farebbe riscrivere un movimento che non c'entra.
  it('una riga nuova non porta nessun id da sostituire', async () => {
    await analizza(anteprima())

    await userEvent.click(await screen.findByRole('button', { name: /Importa 1 movimenti/i }))

    await waitFor(() => expect(commit).toHaveBeenCalled())
    expect(commit.mock.calls[0][0].rows[0].updateTransactionId).toBeNull()
  })

  // Quello che l'utente ha tolto dalla selezione non deve entrare: e' il modo
  // piu' diretto di far entrare in archivio una spesa che non si voleva.
  it('le righe deselezionate restano fuori', async () => {
    await analizza(
      anteprima({
        rows: [riga({ rowNumber: 1 }), riga({ rowNumber: 2, description: 'Ekom' })],
        summary: { ...anteprima().summary, rowsInFile: 2, nuove: 2 },
      }),
    )

    // Si toglie la prima dalla selezione.
    const caselle = await screen.findAllByRole('checkbox')
    await userEvent.click(caselle[0])
    await userEvent.click(screen.getByRole('button', { name: /Importa 1 movimenti/i }))

    await waitFor(() => expect(commit).toHaveBeenCalled())
    expect(commit.mock.calls[0][0].rows).toHaveLength(1)
  })
})

describe('la mappatura da risolvere', () => {
  /**
   * Finche' una categoria della banca non ha una destinazione, proseguire
   * significherebbe importare movimenti senza categoria — cioe' spese che non
   * compaiono in nessun totale. Il pulsante resta quindi bloccato.
   */
  it('con una categoria della banca da mappare non si prosegue', async () => {
    await analizza(
      anteprima({
        rows: [riga({ categoryId: null })],
        unmappedCategories: [mappatura({ categoryId: null })],
        summary: { ...anteprima().summary, categorieDaMappare: 1 },
      }),
    )

    expect(await screen.findByRole('button', { name: 'Continua' })).toBeDisabled()
  })

  it('scegliendo la destinazione il pulsante si sblocca', async () => {
    await analizza(
      anteprima({
        rows: [riga({ categoryId: null })],
        unmappedCategories: [mappatura({ categoryId: null })],
        summary: { ...anteprima().summary, categorieDaMappare: 1 },
      }),
    )

    const grilletto = document.querySelector('[aria-haspopup="listbox"]') as HTMLButtonElement
    await userEvent.click(grilletto)
    await userEvent.click(screen.getByRole('option', { name: /Salute/ }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Continua' })).toBeEnabled())
  })

  // Senza categorie da mappare la schermata non compare affatto: si va dritti
  // all'anteprima.
  it('senza categorie da mappare si passa direttamente all anteprima', async () => {
    await analizza(anteprima())

    expect(await screen.findByRole('button', { name: /Importa 1 movimenti/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Continua' })).not.toBeInTheDocument()
  })
})

describe('errori', () => {
  // Il backend spiega cosa non va nel file (formato sbagliato, tabella non
  // trovata): il suo messaggio e' piu' utile di uno generico.
  it('mostra il messaggio del backend invece di uno generico', async () => {
    analyze.mockRejectedValue({
      response: { data: { message: 'Non ho trovato la tabella dei movimenti.' } },
    })
    render(<BankImportFlow categories={categorie} onCategoriesChanged={vi.fn()} />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, new File(['x'], 'estratto.xlsx'))
    await userEvent.click(screen.getByRole('button', { name: /Analizza/i }))

    expect(await screen.findByText('Non ho trovato la tabella dei movimenti.')).toBeInTheDocument()
  })

  it('senza messaggio dal backend ne mostra uno comprensibile', async () => {
    analyze.mockRejectedValue(new Error('boom'))
    render(<BankImportFlow categories={categorie} onCategoriesChanged={vi.fn()} />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, new File(['x'], 'estratto.xlsx'))
    await userEvent.click(screen.getByRole('button', { name: /Analizza/i }))

    expect(await screen.findByText(/Analisi del file non riuscita/)).toBeInTheDocument()
  })
})
