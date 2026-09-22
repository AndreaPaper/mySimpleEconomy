import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ImportPanel from './ImportPanel'
import { categoriesApi, excelImportApi } from '../api/endpoints'
import type { Category, ExcelImportPreviewResponse } from '../api/types'
import { withQueryClient } from '../test/queryClient'

// L'import del diario spese. Il punto delicato non e' l'analisi del file — quella
// sta nel backend, ed e' coperta li' — ma la scrittura *per indice su due elenchi
// paralleli*: uscite ricorrenti e transazioni singole hanno due funzioni gemelle
// che si assomigliano riga per riga, e la creazione al volo di una categoria
// duplica la stessa logica in due rami.
//
// Un errore di copia scriverebbe nell'elenco sbagliato, o sulla riga sbagliata:
// nessun errore a schermo, e la spesa finirebbe nella categoria di un'altra.
// Si vedrebbe solo dopo la conferma, con i dati gia' in archivio.

vi.mock('../api/endpoints', () => ({
  categoriesApi: { list: vi.fn(), create: vi.fn() },
  excelImportApi: { analyze: vi.fn(), commit: vi.fn() },
  bankImportApi: { analyze: vi.fn(), commit: vi.fn(), createCategoriesFromBank: vi.fn() },
}))

const analyze = vi.mocked(excelImportApi.analyze)
const commit = vi.mocked(excelImportApi.commit)

const categorie: Category[] = [
  { id: 'cat-casa', name: 'Casa', type: 'EXPENSE', color: '#A8C7E7', icon: null, parentId: null } as Category,
  { id: 'cat-salute', name: 'Salute', type: 'EXPENSE', color: '#C5E1C5', icon: null, parentId: null } as Category,
]

const anteprima = (overrides: Partial<ExcelImportPreviewResponse> = {}): ExcelImportPreviewResponse => ({
  newCategorySuggestions: [{ tempId: 'tmp-1', name: 'Psicologa', type: 'EXPENSE', color: '#D9C7E8' }],
  recurringTransactions: [
    { name: 'Affitto', amount: 500, startDate: '2026-03-01', occurrenceCount: 3, existingCategoryId: 'cat-casa', newCategoryTempId: null },
    { name: 'Netflix', amount: 12.99, startDate: '2026-03-01', occurrenceCount: 3, existingCategoryId: 'cat-casa', newCategoryTempId: null },
  ],
  oneOffTransactions: [
    { occurredOn: '2026-03-02', name: 'Ekom', amount: 42.5, needsCategory: false, existingCategoryId: 'cat-casa', newCategoryTempId: null },
    { occurredOn: '2026-03-03', name: 'Farmacia', amount: 12, needsCategory: false, existingCategoryId: 'cat-casa', newCategoryTempId: null },
  ],
  balanceCheckpoints: [],
  summary: {
    sheetsProcessed: 1,
    recurringDetected: 2,
    oneOffDetected: 2,
    categoriesToCreate: 1,
    itemsNeedingCategory: 0,
    checkpointsDetected: 0,
  },
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(categoriesApi.list).mockResolvedValue(categorie)
  commit.mockResolvedValue({
    categoriesCreated: 0,
    recurringTransactionsCreated: 0,
    transactionsCreated: 0,
    checkpointsCreated: 0,
  })
})

async function analizza(risposta = anteprima()) {
  analyze.mockResolvedValue(risposta)
  render(withQueryClient(<ImportPanel />))
  await waitFor(() => expect(categoriesApi.list).toHaveBeenCalled())

  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  await userEvent.upload(input, new File(['x'], 'diario.xlsx'))
  await userEvent.click(screen.getByRole('button', { name: /Analizza/i }))
  await waitFor(() => expect(analyze).toHaveBeenCalled())
}

/**
 * Il selettore di categoria della riga che contiene il nome indicato.
 *
 * Il nome non sta in un elemento suo: la riga lo scrive insieme a data e importo
 * dentro lo stesso span, quindi va cercato sul testo dell'intera voce di elenco.
 */
async function apriSelettoreDi(nome: string) {
  const righe = await screen.findAllByRole('listitem')
  const riga = righe.find((r) => r.textContent?.includes(nome))
  if (!riga) throw new Error(`Nessuna riga contiene "${nome}"`)
  await userEvent.click(within(riga).getByRole('button'))
  return riga
}

describe('la scelta della categoria per riga', () => {
  /**
   * Il caso che le due funzioni gemelle possono sbagliare: cambiare la seconda
   * voce di un elenco deve toccare <em>solo</em> quella. Scrivere sull'indice
   * sbagliato assegnerebbe la categoria a un'altra spesa, e nulla lo direbbe.
   */
  it('cambiarne una non tocca le altre righe dello stesso elenco', async () => {
    await analizza()

    await apriSelettoreDi('Farmacia')
    await userEvent.click(screen.getByRole('option', { name: /Salute/ }))
    await userEvent.click(screen.getByRole('button', { name: /Importa/i }))

    await waitFor(() => expect(commit).toHaveBeenCalled())
    const inviato = commit.mock.calls[0][0]
    expect(inviato.oneOffTransactions.map((t) => [t.name, t.existingCategoryId])).toEqual([
      ['Ekom', 'cat-casa'],
      ['Farmacia', 'cat-salute'],
    ])
  })

  /**
   * E la coppia di elenchi: cambiare una transazione singola non deve toccare
   * le ricorrenti. Sono due array paralleli con lo stesso indice, quindi la
   * confusione fra i due e' silenziosa e plausibile.
   */
  it('cambiare una spesa singola non tocca le ricorrenti', async () => {
    await analizza()

    await apriSelettoreDi('Ekom')
    await userEvent.click(screen.getByRole('option', { name: /Salute/ }))
    await userEvent.click(screen.getByRole('button', { name: /Importa/i }))

    await waitFor(() => expect(commit).toHaveBeenCalled())
    const inviato = commit.mock.calls[0][0]
    expect(inviato.recurringTransactions.every((r) => r.existingCategoryId === 'cat-casa')).toBe(true)
    expect(inviato.oneOffTransactions[0].existingCategoryId).toBe('cat-salute')
  })

  it('cambiare una ricorrente non tocca le spese singole', async () => {
    await analizza()

    await apriSelettoreDi('Netflix')
    await userEvent.click(screen.getByRole('option', { name: /Salute/ }))
    await userEvent.click(screen.getByRole('button', { name: /Importa/i }))

    await waitFor(() => expect(commit).toHaveBeenCalled())
    const inviato = commit.mock.calls[0][0]
    expect(inviato.recurringTransactions.map((r) => r.existingCategoryId)).toEqual(['cat-casa', 'cat-salute'])
    expect(inviato.oneOffTransactions.every((t) => t.existingCategoryId === 'cat-casa')).toBe(true)
  })

  /**
   * Scegliere una categoria proposta dall'analisi svuota l'id di quella
   * esistente: i due campi non possono valere insieme, e mandarli entrambi
   * lascerebbe al backend di decidere quale vince.
   */
  it('scegliere una categoria proposta svuota l id di quella esistente', async () => {
    await analizza()

    await apriSelettoreDi('Ekom')
    await userEvent.click(screen.getByRole('option', { name: /Psicologa/ }))
    await userEvent.click(screen.getByRole('button', { name: /Importa/i }))

    await waitFor(() => expect(commit).toHaveBeenCalled())
    expect(commit.mock.calls[0][0].oneOffTransactions[0]).toMatchObject({
      existingCategoryId: null,
      newCategoryTempId: 'tmp-1',
    })
  })
})

describe('il pulsante di conferma', () => {
  /**
   * Una spesa senza categoria non comparirebbe in nessun totale: finche' ce
   * n'e' una da assegnare, l'import non parte.
   */
  it('resta bloccato se una spesa singola e senza categoria', async () => {
    await analizza(
      anteprima({
        oneOffTransactions: [
          { occurredOn: '2026-03-02', name: 'Ekom', amount: 42.5, needsCategory: true, existingCategoryId: null, newCategoryTempId: null },
        ],
        summary: { ...anteprima().summary, oneOffDetected: 1, itemsNeedingCategory: 1 },
      }),
    )

    expect(await screen.findByRole('button', { name: /Importa/i })).toBeDisabled()
  })

  it('si sblocca appena la si assegna', async () => {
    await analizza(
      anteprima({
        oneOffTransactions: [
          { occurredOn: '2026-03-02', name: 'Ekom', amount: 42.5, needsCategory: true, existingCategoryId: null, newCategoryTempId: null },
        ],
        summary: { ...anteprima().summary, oneOffDetected: 1, itemsNeedingCategory: 1 },
      }),
    )

    await apriSelettoreDi('Ekom')
    await userEvent.click(screen.getByRole('option', { name: /Salute/ }))

    await waitFor(() => expect(screen.getByRole('button', { name: /Importa/i })).toBeEnabled())
  })
})

describe('l esito dell importazione', () => {
  /**
   * Cosa vede l'utente dopo aver premuto "Importa". È l'unico momento in cui
   * l'app dice quante cose sono davvero entrate in archivio: se i conteggi
   * fossero sbagliati o la schermata non comparisse, l'unico modo di sapere
   * com'è andata sarebbe andare a controllare a mano.
   */
  it('mostra quante cose sono entrate in archivio', async () => {
    commit.mockResolvedValue({
      categoriesCreated: 1,
      recurringTransactionsCreated: 2,
      transactionsCreated: 37,
      checkpointsCreated: 1,
    })
    await analizza()

    await userEvent.click(screen.getByRole('button', { name: /Importa/i }))

    expect(await screen.findByText('Importazione completata')).toBeInTheDocument()
    expect(screen.getByText(/Categorie create: 1/)).toBeInTheDocument()
    expect(screen.getByText(/Transazioni create.*37/)).toBeInTheDocument()
  })

  /**
   * "Importa un altro file" riporta allo stato iniziale. Senza il ripristino
   * completo si ripartirebbe con l'anteprima del file precedente ancora in
   * memoria, cioè si rischierebbe di importarlo due volte.
   */
  it('importa un altro file riporta alla scelta del file', async () => {
    await analizza()
    await userEvent.click(screen.getByRole('button', { name: /Importa/i }))
    await screen.findByText('Importazione completata')

    await userEvent.click(screen.getByRole('button', { name: /Importa un altro file/i }))

    expect(screen.queryByText('Importazione completata')).not.toBeInTheDocument()
    expect(document.querySelector('input[type="file"]')).toBeInTheDocument()
  })
})

describe('errori', () => {
  /**
   * Il commit è il punto in cui un fallimento costa di più: l'analisi è già
   * stata fatta, l'utente ha assegnato le categorie a mano, e un pulsante che
   * non dice nulla lascia credere che sia andata.
   */
  it('un commit fallito lo dice e non mostra l esito', async () => {
    commit.mockRejectedValue(new Error('boom'))
    await analizza()

    await userEvent.click(screen.getByRole('button', { name: /Importa/i }))

    expect(await screen.findByText(/Importazione non riuscita/)).toBeInTheDocument()
    expect(screen.queryByText('Importazione completata')).not.toBeInTheDocument()
  })

  it('un file non analizzabile lo dice invece di restare muto', async () => {
    analyze.mockRejectedValue(new Error('boom'))
    render(withQueryClient(<ImportPanel />))
    await waitFor(() => expect(categoriesApi.list).toHaveBeenCalled())

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, new File(['x'], 'diario.xlsx'))
    await userEvent.click(screen.getByRole('button', { name: /Analizza/i }))

    expect(await screen.findByText(/Analisi del file non riuscita/)).toBeInTheDocument()
  })
})
