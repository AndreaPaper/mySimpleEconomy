import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import CategoryForm from './CategoryForm'
import DebtForm from './DebtForm'
import ExpenseReminderForm from './ExpenseReminderForm'
import RecurringTransactionForm from './RecurringTransactionForm'
import type { Category } from '../api/types'

// Gli altri quattro form. Come TransactionForm stavano a zero perché nessun test
// di pagina apre una modale. Non serve MSW né contesti: l'I/O passa da props.
//
// Ognuno ha una regola non ovvia, ed è quella che si prova: le coercizioni
// vuoto→null, la data forzata alla creazione, l'auto-riempimento una volta sola,
// e quali categorie possono fare da padre.

const categoria = (over: Partial<Category> = {}): Category => ({
  id: 'c-1',
  name: 'Alimentari',
  type: 'EXPENSE',
  color: '#F6C9C0',
  icon: null,
  parentId: null,
  archived: false,
  ...over,
})

const USCITE = [
  categoria({ id: 'c-usc1', name: 'Alimentari' }),
  categoria({ id: 'c-usc2', name: 'Casa' }),
]

const salva = () => screen.getByRole('button', { name: 'Salva' })

// ------------------------------------------------------------------
// ExpenseReminderForm
// ------------------------------------------------------------------

describe('ExpenseReminderForm', () => {
  function monta(props: Partial<React.ComponentProps<typeof ExpenseReminderForm>> = {}) {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(
      <ExpenseReminderForm categories={USCITE} onSubmit={onSubmit} onCancel={vi.fn()} {...props} />,
    )
    return { onSubmit }
  }

  /**
   * Le tre coercizioni vuoto→null sono l'unico comportamento vero del file, ed erano tutte
   * scoperte. Un campo lasciato vuoto deve uscire {@code null}: mandare {@code 0} come prezzo
   * stimato farebbe comparire una spesa da zero euro nelle prossime scadenze, e {@code 0} come
   * preavviso significherebbe "avvisami il giorno stesso" invece di "non avvisarmi".
   */
  it('i campi facoltativi lasciati vuoti escono come null, non come zero', async () => {
    const utente = userEvent.setup()
    const { onSubmit } = monta()

    await utente.type(screen.getByLabelText('Nome'), 'Bollo auto')
    await utente.click(salva())

    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      amount: null,
      endDate: null,
      notifyDaysBefore: null,
    })
  })

  it('i campi facoltativi valorizzati escono come numeri', async () => {
    const utente = userEvent.setup()
    const { onSubmit } = monta()

    await utente.type(screen.getByLabelText('Nome'), 'Bollo auto')
    await utente.type(screen.getByLabelText('Prezzo stimato (opzionale)'), '120')
    await utente.type(screen.getByLabelText('Avvisami quanti giorni prima (opzionale)'), '3')
    await utente.click(salva())

    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ amount: 120, notifyDaysBefore: 3 })
  })

  // Un promemoria è una spesa: senza categorie di uscita non c'è niente da compilare, e il
  // form lo dice invece di mostrare un menu vuoto.
  it('senza categorie di uscita invita a crearne una', () => {
    monta({ categories: [categoria({ id: 'c-ent', type: 'INCOME' })] })

    expect(screen.getByText(/Crea prima almeno una categoria di uscita/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Salva' })).not.toBeInTheDocument()
  })
})

// ------------------------------------------------------------------
// RecurringTransactionForm
// ------------------------------------------------------------------

describe('RecurringTransactionForm', () => {
  function monta(props: Partial<React.ComponentProps<typeof RecurringTransactionForm>> = {}) {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(
      <RecurringTransactionForm categories={USCITE} onSubmit={onSubmit} onCancel={vi.fn()} {...props} />,
    )
    return { onSubmit }
  }

  /**
   * La regola meno ovvia del file: <strong>in creazione la prossima scadenza è forzata alla
   * data di inizio</strong>, e il campo non si vede nemmeno. Ha senso — una regola nuova parte
   * da quando dice di partire — ma è una decisione invisibile leggendo il form, e cambiarla
   * sposterebbe silenziosamente quando la prima occorrenza viene generata.
   */
  it('in creazione la prossima scadenza è la data di inizio', async () => {
    const utente = userEvent.setup()
    const { onSubmit } = monta()

    await utente.type(screen.getByLabelText('Nome'), 'Affitto')
    await utente.type(screen.getByLabelText('Importo'), '500')
    const inizio = screen.getByLabelText('Data di inizio')
    await utente.clear(inizio)
    await utente.type(inizio, '2026-05-10')
    await utente.click(salva())

    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    const dati = onSubmit.mock.calls[0][0]
    expect(dati.startDate).toBe('2026-05-10')
    expect(dati.nextDueDate).toBe('2026-05-10')
  })

  it('in creazione il campo della prossima scadenza non si mostra', () => {
    monta()

    expect(screen.queryByLabelText(/Prossima scadenza/i)).not.toBeInTheDocument()
  })

  it('senza alcuna categoria invita a crearne una', () => {
    monta({ categories: [] })

    expect(screen.queryByRole('button', { name: 'Salva' })).not.toBeInTheDocument()
  })
})

// ------------------------------------------------------------------
// DebtForm
// ------------------------------------------------------------------

describe('DebtForm', () => {
  function monta(props: Partial<React.ComponentProps<typeof DebtForm>> = {}) {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<DebtForm categories={USCITE} onSubmit={onSubmit} onCancel={vi.fn()} {...props} />)
    return { onSubmit }
  }

  const compilaBase = async (utente: ReturnType<typeof userEvent.setup>) => {
    await utente.type(screen.getByLabelText('Nome'), 'Prestito auto')
    await utente.type(screen.getByLabelText('Importo totale'), '5000')
  }

  /**
   * L'auto-riempimento della data, <strong>solo la prima volta</strong> che l'importo diventa
   * non vuoto. È scritto così perché una data già scelta a mano non va sovrascritta a ogni
   * tasto premuto sull'importo: si perderebbe la scelta dell'utente mentre sta ancora
   * scrivendo.
   */
  it('la data di riferimento si propone da sé alla prima cifra del già pagato', async () => {
    const utente = userEvent.setup()
    monta()

    await utente.type(screen.getByLabelText(/Già pagato prima di iniziare/), '1')

    const data = screen.getByLabelText('Già pagato fino al') as HTMLInputElement
    expect(data.value).toBe(new Date().toISOString().slice(0, 10))
  })

  it('una data scelta a mano non viene sovrascritta continuando a scrivere l importo', async () => {
    const utente = userEvent.setup()
    monta()

    await utente.type(screen.getByLabelText(/Già pagato prima di iniziare/), '1')
    const data = screen.getByLabelText('Già pagato fino al')
    await utente.clear(data)
    await utente.type(data, '2026-01-31')
    // Si continua a scrivere l'importo: la data deve restare quella scelta.
    await utente.type(screen.getByLabelText(/Già pagato prima di iniziare/), '000')

    expect((data as HTMLInputElement).value).toBe('2026-01-31')
  })

  /**
   * La difesa vera contro un già pagato senza data è il campo stesso: è obbligatorio, e il
   * browser non lascia inviare il form. Il controllo incrociato dentro handleSubmit è una
   * cintura in più che dal form non si riesce a raggiungere — resta per chi un domani togliesse
   * l'attributo, e per questo non lo si prova simulando qualcosa che l'utente non può fare.
   */
  it('la data del già pagato è obbligatoria quando il campo compare', async () => {
    const utente = userEvent.setup()
    const { onSubmit } = monta()
    await compilaBase(utente)

    await utente.type(screen.getByLabelText(/Già pagato prima di iniziare/), '1000')
    await utente.clear(screen.getByLabelText('Già pagato fino al'))
    await utente.click(salva())

    expect(screen.getByLabelText('Già pagato fino al')).toBeRequired()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  // Senza importo già pagato, anche la data se ne va: tenerla manderebbe al backend una
  // data di riferimento per un importo che non c'è.
  it('senza già pagato anche la data esce come null', async () => {
    const utente = userEvent.setup()
    const { onSubmit } = monta()
    await compilaBase(utente)

    await utente.click(salva())

    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      alreadyPaidAmount: null,
      alreadyPaidAsOf: null,
      monthlyPaymentAmount: null,
    })
  })

  it('il campo della data compare solo quando serve', async () => {
    const utente = userEvent.setup()
    monta()

    expect(screen.queryByLabelText('Già pagato fino al')).not.toBeInTheDocument()

    await utente.type(screen.getByLabelText(/Già pagato prima di iniziare/), '500')

    expect(screen.getByLabelText('Già pagato fino al')).toBeInTheDocument()
  })
})

// ------------------------------------------------------------------
// CategoryForm
// ------------------------------------------------------------------

describe('CategoryForm', () => {
  function monta(props: Partial<React.ComponentProps<typeof CategoryForm>> = {}) {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<CategoryForm categories={USCITE} onSubmit={onSubmit} onCancel={vi.fn()} {...props} />)
    return { onSubmit }
  }

  const apriPadri = async (utente: ReturnType<typeof userEvent.setup>) => {
    await utente.click(document.getElementById('parent')!)
    return screen.queryAllByRole('option').map((o) => o.textContent?.trim())
  }

  /**
   * Chi può fare da padre: stesso tipo, non già una sottocategoria, e non sé stessa.
   *
   * <p>Una categoria che ha <em>già</em> dei figli resta invece un padre valido — aggiungerle
   * un'altra sottocategoria non crea un terzo livello. Il commento nel sorgente diceva il
   * contrario; il filtro no, e ha ragione il filtro.
   */
  it('i padri ammessi sono le principali dello stesso tipo', async () => {
    const utente = userEvent.setup()
    monta({
      categories: [
        categoria({ id: 'p1', name: 'Casa' }),
        categoria({ id: 'f1', name: 'Bollette', parentId: 'p1' }),
        categoria({ id: 'e1', name: 'Stipendio', type: 'INCOME' }),
      ],
    })

    const opzioni = await apriPadri(utente)

    expect(opzioni).toContain('Casa')
    // Una sottocategoria non può fare da padre: sarebbe il terzo livello.
    expect(opzioni).not.toContain('Bollette')
    // E nemmeno una categoria di un altro tipo.
    expect(opzioni).not.toContain('Stipendio')
  })

  it('una categoria con figli resta un padre valido', async () => {
    const utente = userEvent.setup()
    monta({
      categories: [
        categoria({ id: 'p1', name: 'Casa' }),
        categoria({ id: 'f1', name: 'Bollette', parentId: 'p1' }),
      ],
    })

    expect(await apriPadri(utente)).toContain('Casa')
  })

  it('in modifica non si può scegliere sé stessa come padre', async () => {
    const utente = userEvent.setup()
    monta({
      categories: [categoria({ id: 'p1', name: 'Casa' }), categoria({ id: 'p2', name: 'Salute' })],
      initial: categoria({ id: 'p1', name: 'Casa' }),
    })

    const opzioni = await apriPadri(utente)

    expect(opzioni).not.toContain('Casa')
    expect(opzioni).toContain('Salute')
  })

  /**
   * Il padre deve avere lo stesso tipo: cambiando tipo, una scelta fatta prima non sarebbe
   * più valida e va azzerata. Altrimenti si salverebbe una sottocategoria di uscita sotto un
   * padre di entrata.
   */
  it('cambiare tipo azzera il padre scelto', async () => {
    const utente = userEvent.setup()
    const { onSubmit } = monta({
      categories: [categoria({ id: 'p1', name: 'Casa' }), categoria({ id: 'e1', name: 'Stipendio', type: 'INCOME' })],
    })

    await utente.click(document.getElementById('parent')!)
    await utente.click(screen.getByRole('option', { name: /Casa/ }))
    await utente.click(screen.getByRole('button', { name: 'Entrata' }))

    await utente.type(screen.getByLabelText('Nome'), 'Bonus')
    await utente.click(salva())

    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ type: 'INCOME', parentId: null })
  })

  // Una categoria che ha già figli non può diventare sottocategoria: sarebbe il terzo livello.
  // Al posto del menu compare la spiegazione.
  it('una categoria con figli non può diventare sottocategoria', () => {
    monta({
      categories: [categoria({ id: 'p1', name: 'Casa' }), categoria({ id: 'f1', name: 'Bollette', parentId: 'p1' })],
      initial: categoria({ id: 'p1', name: 'Casa' }),
    })

    expect(screen.getByText(/non può diventare a sua volta una sottocategoria/)).toBeInTheDocument()
    expect(document.getElementById('parent')).toBeNull()
  })

  // In modifica il tipo non è un interruttore disabilitato: sparisce del tutto e resta
  // scritto, perché cambiarlo invaliderebbe ogni transazione già collegata.
  it('in modifica il tipo non si può cambiare', () => {
    monta({ initial: categoria({ id: 'c-usc1', name: 'Alimentari' }) })

    expect(screen.getByText(/non modificabile/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Entrata' })).not.toBeInTheDocument()
  })
})
