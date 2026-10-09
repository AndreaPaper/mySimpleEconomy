import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BankImportFlow from './BankImportFlow'
import { bankImportApi, categoriesApi } from '../api/endpoints'
import type {
  BankCategoryMappingDto,
  BankImportPreviewResponse,
  BankImportRowPreview,
  Category,
} from '../api/types'
import { withQueryClient } from '../test/queryClient'

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
  categoriesApi: {
    create: vi.fn(),
  },
}))

const analyze = vi.mocked(bankImportApi.analyze)
const commit = vi.mocked(bankImportApi.commit)
const creaCategoria = vi.mocked(categoriesApi.create)

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
  matchedRecurringId: null,
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
  render(withQueryClient(<BankImportFlow categories={categorie} onCategoriesChanged={vi.fn()} />))

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
    expect(commit.mock.calls[0][0].rows[0].recurringTransactionId).toBeNull()
  })

  /**
   * La scadenza di una regola ricorrente: entra senza bisogno di spuntarla, e porta
   * con sé cosa sostituire. La transazione già generata dalla regola, se c'è, che il
   * backend riscrive; altrimenti la regola, che il backend fa passare alla scadenza
   * dopo. Perso uno dei due id, la riga entrerebbe come nuova accanto alla
   * transazione della regola: lo stipendio due volte.
   */
  it('la scadenza di una regola entra da sola e porta cosa sostituire', async () => {
    await analizza(
      anteprima({
        rows: [
          riga({ rowNumber: 1, outcome: 'SOSTITUISCE_RICORRENTE', matchedTransactionId: 'tx-generata' }),
          riga({ rowNumber: 2, outcome: 'SOSTITUISCE_RICORRENTE', matchedRecurringId: 'regola-stipendio' }),
        ],
        summary: { ...anteprima().summary, rowsInFile: 2, nuove: 0, daAggiornare: 2 },
      }),
    )

    await userEvent.click(await screen.findByRole('button', { name: /Importa 2 movimenti/i }))

    await waitFor(() => expect(commit).toHaveBeenCalled())
    const [riscritta, alPostoDellaRegola] = commit.mock.calls[0][0].rows
    expect(riscritta).toMatchObject({ updateTransactionId: 'tx-generata', recurringTransactionId: null })
    expect(alPostoDellaRegola).toMatchObject({ updateTransactionId: null, recurringTransactionId: 'regola-stipendio' })
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
    render(withQueryClient(<BankImportFlow categories={categorie} onCategoriesChanged={vi.fn()} />))

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, new File(['x'], 'estratto.xlsx'))
    await userEvent.click(screen.getByRole('button', { name: /Analizza/i }))

    expect(await screen.findByText('Non ho trovato la tabella dei movimenti.')).toBeInTheDocument()
  })

  it('senza messaggio dal backend ne mostra uno comprensibile', async () => {
    analyze.mockRejectedValue(new Error('boom'))
    render(withQueryClient(<BankImportFlow categories={categorie} onCategoriesChanged={vi.fn()} />))

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, new File(['x'], 'estratto.xlsx'))
    await userEvent.click(screen.getByRole('button', { name: /Analizza/i }))

    expect(await screen.findByText(/Analisi del file non riuscita/)).toBeInTheDocument()
  })
})

describe('la selezione di un intero gruppo', () => {
  /**
   * "Deseleziona tutte" su un gruppo di esiti: è il gesto con cui si scarta in
   * blocco, per esempio, tutte le righe sospette. Agisce su un gruppo solo — le
   * altre sezioni non si devono muovere, o si finirebbe per importare (o
   * scartare) righe che non si è nemmeno guardate.
   */
  it('spegne solo il gruppo su cui si preme', async () => {
    await analizza(
      anteprima({
        rows: [
          riga({ rowNumber: 1, description: 'Spesa nuova', outcome: 'NUOVA' }),
          riga({ rowNumber: 2, description: 'Forse doppia', outcome: 'SOSPETTO_MANUALE', selectedByDefault: false }),
          riga({ rowNumber: 3, description: 'Anche questa', outcome: 'SOSPETTO_MANUALE', selectedByDefault: false }),
        ],
        summary: { ...anteprima().summary, rowsInFile: 3, nuove: 1, sospettiManuali: 2 },
      }),
    )

    // Il gruppo dei sospetti parte tutto spento: si accende in blocco.
    const sezione = screen.getByText(/Da controllare — forse già inserite a mano/).closest('div') as HTMLElement
    await userEvent.click(within(sezione).getByRole('button', { name: 'Seleziona tutte' }))

    await userEvent.click(screen.getByRole('button', { name: /Importa/i }))
    await waitFor(() => expect(commit).toHaveBeenCalled())
    const inviato = commit.mock.calls[0][0]
    // Tutte e tre: la nuova era già spuntata, le due sospette lo sono diventate.
    expect(inviato.rows.map((r) => r.description).sort()).toEqual(['Anche questa', 'Forse doppia', 'Spesa nuova'])
  })
})

describe('le categorie create dalle categorie della banca', () => {
  /**
   * Il pulsante che crea in un colpo le categorie mancanti a partire da quelle
   * della banca. Va provato che le mappature tornate dal backend <em>sostituiscano</em>
   * quelle a schermo: sono loro a portare gli id nuovi, e senza la sostituzione
   * il passo successivo manderebbe al commit delle categorie che non esistono.
   */
  it('sostituisce le mappature con quelle tornate dal backend', async () => {
    const creaCategorie = vi.mocked(bankImportApi.createCategoriesFromBank)
    creaCategorie.mockResolvedValue([mappatura({ categoryId: 'cat-nuova' })])
    const avvisato = vi.fn()

    analyze.mockResolvedValue(
      anteprima({
        unmappedCategories: [mappatura({ categoryId: null })],
        summary: { ...anteprima().summary, categorieDaMappare: 1 },
      }),
    )
    render(withQueryClient(<BankImportFlow categories={categorie} onCategoriesChanged={avvisato} />))
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, new File(['x'], 'estratto.xlsx'))
    await userEvent.click(screen.getByRole('button', { name: /Analizza/i }))
    await waitFor(() => expect(analyze).toHaveBeenCalled())

    await userEvent.click(await screen.findByRole('button', { name: /Crea le categorie/i }))

    await waitFor(() => expect(creaCategorie).toHaveBeenCalled())
    // La pagina che ospita il flusso viene avvisata: deve ricaricare il proprio
    // elenco, altrimenti i selettori resterebbero senza le categorie appena create.
    expect(avvisato).toHaveBeenCalled()
  })

  it('se la creazione fallisce lo dice invece di restare muto', async () => {
    const creaCategorie = vi.mocked(bankImportApi.createCategoriesFromBank)
    creaCategorie.mockRejectedValue(new Error('boom'))

    analyze.mockResolvedValue(
      anteprima({
        unmappedCategories: [mappatura({ categoryId: null })],
        summary: { ...anteprima().summary, categorieDaMappare: 1 },
      }),
    )
    render(withQueryClient(<BankImportFlow categories={categorie} onCategoriesChanged={vi.fn()} />))
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, new File(['x'], 'estratto.xlsx'))
    await userEvent.click(screen.getByRole('button', { name: /Analizza/i }))
    await waitFor(() => expect(analyze).toHaveBeenCalled())

    await userEvent.click(await screen.findByRole('button', { name: /Crea le categorie/i }))

    expect(await screen.findByText(/Creazione delle categorie non riuscita/)).toBeInTheDocument()
  })
})

describe('le escluse che si decide di far entrare', () => {
  /**
   * Il difetto segnalato usando l'app. Una riga esclusa dalle regole si poteva
   * spuntare, ma non c'era dove sceglierle la categoria: il selettore per riga
   * della mappatura filtra via le escluse, e l'anteprima mostrava la categoria
   * solo come testo. Il pulsante Importa restava quindi bloccato su "movimenti
   * senza categoria", senza via d'uscita.
   */
  it('spuntata una esclusa senza categoria, la si può categorizzare e importare', async () => {
    const utente = userEvent.setup()
    await analizza(
      anteprima({
        rows: [
          riga({ rowNumber: 1, description: 'Spesa nuova', outcome: 'NUOVA' }),
          riga({
            rowNumber: 2,
            description: 'Prelievo contanti',
            outcome: 'ESCLUSA',
            categoryId: null,
            selectedByDefault: false,
          }),
        ],
        summary: { ...anteprima().summary, rowsInFile: 2, nuove: 1, escluse: 1 },
      }),
    )

    // Finché non è spuntata, niente selettore: non serve.
    expect(screen.queryByLabelText('Categoria per Prelievo contanti')).not.toBeInTheDocument()

    const riga2 = screen.getByText('Prelievo contanti').closest('li') as HTMLElement
    await utente.click(within(riga2).getByRole('checkbox'))

    // Spuntata senza categoria: il blocco c'è ancora, ma adesso ha una via d'uscita.
    const importa = screen.getByRole('button', { name: /Importa 2 movimenti/i })
    expect(importa).toBeDisabled()
    await utente.click(screen.getByLabelText('Categoria per Prelievo contanti'))
    await utente.click(screen.getByRole('option', { name: /Casa/ }))

    await waitFor(() => expect(importa).toBeEnabled())
    await utente.click(importa)

    await waitFor(() => expect(commit).toHaveBeenCalled())
    const inviate = commit.mock.calls[0][0].rows
    expect(inviate.find((r: { description: string }) => r.description === 'Prelievo contanti'))
      .toMatchObject({ categoryId: 'cat-casa' })
  })

  it('una riga che ha già la sua categoria non mostra il selettore', async () => {
    await analizza(anteprima())

    // La riga nuova arriva con la categoria della mappatura: niente da scegliere.
    expect(screen.queryByLabelText(/Categoria per/)).not.toBeInTheDocument()
  })
})

describe('la categoria della banca si può riportare a "nessuna"', () => {
  // Due movimenti nella stessa categoria della banca, che sono spese diverse.
  const dueMovimenti = () =>
    anteprima({
      rows: [
        riga({ rowNumber: 1, categoryId: null, description: 'Bonifico affitto' }),
        riga({ rowNumber: 2, categoryId: null, description: 'Bonifico psicologo', rawDetails: 'SEDUTA' }),
      ],
      unmappedCategories: [mappatura({ categoryId: null, rowCount: 2 })],
      summary: { ...anteprima().summary, rowsInFile: 2, nuove: 2, categorieDaMappare: 1 },
    })

  const scegli = async (grilletto: HTMLElement, voce: RegExp) => {
    await userEvent.click(grilletto)
    await userEvent.click(screen.getByRole('option', { name: voce }))
  }

  /**
   * Il caso segnalato. Scelta una categoria per la categoria della banca, non
   * c'era modo di toglierla: aprendo i movimenti per darne una a ciascuno,
   * quelli non toccati la ereditavano. "Nessuna categoria" la riporta al vuoto,
   * e allora si prosegue solo quando ogni movimento ha la sua.
   *
   * Il carico finale controlla anche il lato che non si vede: la corrispondenza
   * parte vuota, quindi il backend non la ricorda per gli import futuri.
   */
  it('tolta la categoria, ogni movimento prende la sua e niente eredita quella tolta', async () => {
    await analizza(dueMovimenti())

    const [grillettoBanca] = document.querySelectorAll<HTMLButtonElement>('[aria-haspopup="listbox"]')
    await scegli(grillettoBanca, /Salute/)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continua' })).toBeEnabled())

    await scegli(grillettoBanca, /Nessuna categoria/)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continua' })).toBeDisabled())

    await userEvent.click(screen.getByRole('button', { name: /Vedi i 2 movimenti/ }))
    const [, primo, secondo] = document.querySelectorAll<HTMLButtonElement>('[aria-haspopup="listbox"]')
    await scegli(primo, /Casa/)
    expect(screen.getByRole('button', { name: 'Continua' })).toBeDisabled()
    await scegli(secondo, /Salute/)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continua' })).toBeEnabled())

    await userEvent.click(screen.getByRole('button', { name: 'Continua' }))
    await userEvent.click(await screen.findByRole('button', { name: /Importa 2 movimenti/i }))

    await waitFor(() => expect(commit).toHaveBeenCalledTimes(1))
    const carico = commit.mock.calls[0][0]
    expect(carico.rows.map((r) => r.categoryId)).toEqual(['cat-casa', 'cat-salute'])
    expect(carico.mappings[0]).toMatchObject({ categoryId: null, doNotImport: false })
  })
})

describe('una categoria nuova creata dall import', () => {
  /**
   * Dal selettore della categoria della banca si crea una categoria, che viene
   * assegnata subito a chi l'ha chiesta: senza, bisognava uscire dall'import,
   * crearla in Categorie e ricominciare da capo.
   */
  it('si crea dal selettore e viene assegnata alla categoria della banca', async () => {
    const nuova = { id: 'cat-nuova', name: 'Psicologo', type: 'EXPENSE', color: '#A8C7E7', icon: null, parentId: null } as Category
    creaCategoria.mockResolvedValue(nuova)
    const onCategoriesChanged = vi.fn()
    analyze.mockResolvedValue(
      anteprima({
        rows: [riga({ categoryId: null })],
        unmappedCategories: [mappatura({ categoryId: null })],
        summary: { ...anteprima().summary, categorieDaMappare: 1 },
      }),
    )
    render(withQueryClient(<BankImportFlow categories={categorie} onCategoriesChanged={onCategoriesChanged} />))
    await userEvent.upload(document.querySelector('input[type="file"]') as HTMLInputElement, new File(['x'], 'e.xlsx'))
    await userEvent.click(screen.getByRole('button', { name: /Analizza/i }))

    await screen.findByRole('button', { name: 'Continua' })
    await userEvent.click(document.querySelector('[aria-haspopup="listbox"]') as HTMLButtonElement)
    await userEvent.click(screen.getByRole('button', { name: /Nuova categoria/ }))
    await userEvent.type(screen.getByLabelText('Nome'), 'Psicologo')
    await userEvent.click(screen.getByRole('button', { name: 'Salva' }))

    await waitFor(() => expect(creaCategoria).toHaveBeenCalledTimes(1))
    expect(creaCategoria.mock.calls[0][0]).toMatchObject({ name: 'Psicologo', type: 'EXPENSE' })
    expect(onCategoriesChanged).toHaveBeenCalled()
    // Assegnata subito, e visibile per nome: la lista del chiamante non è ancora
    // stata ricaricata, ma il selettore la conosce già.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continua' })).toBeEnabled())
    expect(screen.getByText('Psicologo')).toBeInTheDocument()
  })

  // Da una categoria di entrate il modulo parte già su "Entrata": scordarsi di
  // cambiarlo creerebbe una categoria di uscita che la riga non può usare.
  it('da una categoria di entrate la crea di entrata senza doverlo cambiare', async () => {
    creaCategoria.mockResolvedValue({ id: 'cat-bonus', name: 'Bonus', type: 'INCOME' } as Category)
    await analizza(
      anteprima({
        rows: [riga({ categoryId: null, type: 'INCOME', amount: 300, bankCategory: 'Accrediti' })],
        unmappedCategories: [mappatura({ categoryId: null, transactionType: 'INCOME', bankCategory: 'Accrediti' })],
        summary: { ...anteprima().summary, categorieDaMappare: 1 },
      }),
    )

    await screen.findByRole('button', { name: 'Continua' })
    await userEvent.click(document.querySelector('[aria-haspopup="listbox"]') as HTMLButtonElement)
    await userEvent.click(screen.getByRole('button', { name: /Nuova categoria/ }))
    await userEvent.type(screen.getByLabelText('Nome'), 'Bonus')
    await userEvent.click(screen.getByRole('button', { name: 'Salva' }))

    await waitFor(() => expect(creaCategoria).toHaveBeenCalledTimes(1))
    expect(creaCategoria.mock.calls[0][0]).toMatchObject({ name: 'Bonus', type: 'INCOME' })
  })
})
