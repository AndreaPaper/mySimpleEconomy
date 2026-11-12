import { describe, expect, it } from 'vitest'
import { categoriesApi, checkpointsApi, dataCleanupApi, profileApi, transactionsApi } from '../../api/endpoints'
import { onDay, plusDays, today } from '../dates'
import { apiError, withFreshLocalBackend } from '../testing'

// Parità della fase 1: gli scenari dei test d'integrazione Java (CategoryApiTest,
// CategoryTreeApiTest, TransactionApiTest, BalanceCheckpointApiTest,
// ProfileSalaryApiTest, DataCleanupSmokeTest), contro il backend locale e attraverso
// le stesse funzioni di endpoints.ts che usano le pagine. Mancano solo i casi
// "isolamento fra utenti": sul telefono c'è un utente solo.

const backend = withFreshLocalBackend()

const expenseCategory = (name = 'Spesa') => categoriesApi.create({ name, type: 'EXPENSE' })

describe('categorie', () => {
  it('crea, modifica ed elenca', async () => {
    const created = await categoriesApi.create({ name: 'Casa', type: 'EXPENSE', color: '#3B82F6', icon: 'Home' })
    await categoriesApi.update(created.id, { name: 'Casa e affitto', color: '#22C55E', icon: 'Home' })

    expect(await categoriesApi.list()).toEqual([
      { id: created.id, name: 'Casa e affitto', type: 'EXPENSE', color: '#22C55E', icon: 'Home', parentId: null, archived: false },
    ])
  })

  it('rifiuta un nome vuoto e un colore malformato', async () => {
    expect((await apiError(categoriesApi.create({ name: ' ', type: 'EXPENSE' }))).status).toBe(400)
    expect(await apiError(categoriesApi.create({ name: 'Casa', type: 'EXPENSE', color: 'rosso' }))).toEqual({
      status: 400,
      message: 'Il colore deve essere in formato esadecimale, es. #3B82F6',
    })
  })

  // Anche con le maiuscole diverse e le lettere accentate.
  it('un nome già usato viene rifiutato, e in modifica il proprio no', async () => {
    const svago = await categoriesApi.create({ name: 'Città', type: 'EXPENSE' })

    expect(await apiError(categoriesApi.create({ name: 'CITTÀ', type: 'EXPENSE' }))).toEqual({
      status: 409,
      message: 'Esiste già una categoria con questo nome',
    })
    await expect(categoriesApi.update(svago.id, { name: 'città' })).resolves.toMatchObject({ name: 'città' })
  })

  it('i predefiniti si creano una volta: rigenerarli non duplica quelli presenti', async () => {
    await categoriesApi.create({ name: 'Casa', type: 'EXPENSE' })

    const created = await categoriesApi.generateDefaults()

    expect(created).toHaveLength(13)
    expect(await categoriesApi.generateDefaults()).toEqual([])
    expect(await categoriesApi.list()).toHaveLength(14)
  })

  it('la gerarchia è a un livello e con lo stesso tipo', async () => {
    const padre = await expenseCategory('Alimentari')
    const figlio = await categoriesApi.create({ name: 'Supermercato', type: 'EXPENSE', parentId: padre.id })
    const entrata = await categoriesApi.create({ name: 'Bonus', type: 'INCOME' })

    expect(await apiError(categoriesApi.create({ name: 'Frutta', type: 'EXPENSE', parentId: figlio.id }))).toEqual({
      status: 400,
      message: 'Una sottocategoria non può contenere altre sottocategorie',
    })
    expect((await apiError(categoriesApi.update(padre.id, { name: 'Alimentari', parentId: entrata.id }))).status).toBe(400)
    expect(await apiError(categoriesApi.update(padre.id, { name: 'Alimentari', parentId: padre.id }))).toEqual({
      status: 400,
      message: 'Una categoria non può essere sottocategoria di se stessa',
    })
    expect(await apiError(categoriesApi.create({ name: 'Premi', type: 'INCOME', parentId: padre.id }))).toEqual({
      status: 400,
      message: 'La sottocategoria deve essere dello stesso tipo della categoria padre',
    })
    expect((await apiError(categoriesApi.create({ name: 'X', type: 'EXPENSE', parentId: 'inesistente' }))).status).toBe(404)
  })

  it('archiviare un padre archivia i figli; riattivare un figlio risveglia il padre ma non i fratelli', async () => {
    const padre = await expenseCategory('Alimentari')
    const figlio = await categoriesApi.create({ name: 'Supermercato', type: 'EXPENSE', parentId: padre.id })
    const fratello = await categoriesApi.create({ name: 'Mercato', type: 'EXPENSE', parentId: padre.id })

    await categoriesApi.archive(padre.id)
    expect(await categoriesApi.list()).toEqual([])

    await categoriesApi.unarchive(figlio.id)
    expect((await categoriesApi.list()).map((c) => c.name).sort()).toEqual(['Alimentari', 'Supermercato'])
    expect((await categoriesApi.listArchived()).map((c) => c.id)).toEqual([fratello.id])
  })

  it('si elimina solo se non è usata', async () => {
    const libera = await expenseCategory('Libera')
    const usata = await expenseCategory('Usata')
    await transactionsApi.create({ categoryId: usata.id, amount: 10, type: 'EXPENSE', occurredOn: '2026-03-01' })

    await categoriesApi.delete(libera.id)
    expect((await apiError(categoriesApi.delete(usata.id))).status).toBe(409)
    expect((await categoriesApi.list()).map((c) => c.name)).toEqual(['Usata'])
    expect((await apiError(categoriesApi.delete('inesistente'))).status).toBe(404)
  })
})

describe('transazioni', () => {
  it('crea, modifica e cancella, con i dati della categoria e gli importi in euro', async () => {
    const casa = await categoriesApi.create({ name: 'Casa', type: 'EXPENSE', color: '#F59E0B', icon: 'Home' })
    const t = await transactionsApi.create({
      categoryId: casa.id,
      amount: 10.35,
      type: 'EXPENSE',
      occurredOn: '2026-03-02',
      description: 'Coop',
    })

    expect(t).toMatchObject({
      categoryId: casa.id,
      categoryName: 'Casa',
      categoryIcon: 'Home',
      categoryColor: '#F59E0B',
      amount: 10.35,
      type: 'EXPENSE',
      occurredOn: '2026-03-02',
      description: 'Coop',
      recurringTransactionId: null,
    })

    await transactionsApi.update(t.id, { categoryId: casa.id, amount: 0.1, type: 'EXPENSE', occurredOn: '2026-03-03' })
    expect((await transactionsApi.list()).content[0]).toMatchObject({ amount: 0.1, occurredOn: '2026-03-03' })

    await transactionsApi.delete(t.id)
    expect((await transactionsApi.list()).content).toEqual([])
    expect((await apiError(transactionsApi.delete(t.id))).status).toBe(404)
  })

  it('rifiuta i dati non validi', async () => {
    const casa = await expenseCategory()
    expect(
      await apiError(transactionsApi.create({ categoryId: casa.id, amount: 0, type: 'EXPENSE', occurredOn: '2026-03-02' })),
    ).toEqual({ status: 400, message: "L'importo deve essere maggiore di zero" })
    expect(
      (await apiError(transactionsApi.create({ categoryId: casa.id, amount: 5, type: 'EXPENSE', occurredOn: '2026-02-30' })))
        .status,
    ).toBe(400)
    expect(
      (await apiError(transactionsApi.create({ categoryId: 'nessuna', amount: 5, type: 'EXPENSE', occurredOn: '2026-03-02' })))
        .status,
    ).toBe(404)
  })

  it('con un intervallo di date restituisce tutto il periodo, il più recente per primo', async () => {
    const casa = await expenseCategory()
    for (const d of ['2026-01-31', '2026-02-01', '2026-02-15', '2026-02-28', '2026-03-01']) {
      await transactionsApi.create({ categoryId: casa.id, amount: 1, type: 'EXPENSE', occurredOn: d })
    }

    const page = await transactionsApi.list({ from: '2026-02-01', to: '2026-02-28' })

    expect(page.hasNext).toBe(false)
    expect(page.content.map((t) => t.occurredOn)).toEqual(['2026-02-28', '2026-02-15', '2026-02-01'])
  })

  it('filtra per categoria', async () => {
    const casa = await expenseCategory('Casa')
    const auto = await expenseCategory('Auto')
    await transactionsApi.create({ categoryId: casa.id, amount: 1, type: 'EXPENSE', occurredOn: '2026-03-01' })
    await transactionsApi.create({ categoryId: auto.id, amount: 2, type: 'EXPENSE', occurredOn: '2026-03-01' })

    expect((await transactionsApi.list({ categoryId: auto.id })).content.map((t) => t.amount)).toEqual([2])
  })

  it('le pagine dicono se ne segue un altra, e la dimensione ha dei limiti', async () => {
    const casa = await expenseCategory()
    for (let i = 1; i <= 5; i++) {
      await transactionsApi.create({ categoryId: casa.id, amount: i, type: 'EXPENSE', occurredOn: `2026-03-0${i}` })
    }

    const prima = await transactionsApi.list({ page: 0, size: 2 })
    const ultima = await transactionsApi.list({ page: 2, size: 2 })

    expect(prima.content.map((t) => t.amount)).toEqual([5, 4])
    expect(prima.hasNext).toBe(true)
    expect(ultima.content.map((t) => t.amount)).toEqual([1])
    expect(ultima.hasNext).toBe(false)
    expect((await apiError(transactionsApi.list({ size: 101 }))).status).toBe(400)
  })
})

describe('saldi di riferimento', () => {
  it('salvare due volte la stessa data sovrascrive, e l elenco parte dal più recente', async () => {
    await checkpointsApi.upsert({ checkpointDate: '2026-03-01', balance: 1000 })
    await checkpointsApi.upsert({ checkpointDate: '2026-04-01', balance: 1500.55 })
    await checkpointsApi.upsert({ checkpointDate: '2026-03-01', balance: 1200 })

    expect((await checkpointsApi.list()).map(({ checkpointDate, balance }) => ({ checkpointDate, balance }))).toEqual([
      { checkpointDate: '2026-04-01', balance: 1500.55 },
      { checkpointDate: '2026-03-01', balance: 1200 },
    ])
  })
})

describe('profilo e regola dello stipendio', () => {
  const salaryRules = () =>
    backend().db.all<{ default_amount: number; active: number; start_date: string; next_due_date: string }>(
      'SELECT * FROM recurring_transactions',
    )

  it('il profilo vuoto si legge, con il segnaposto al posto dell email', async () => {
    expect(await profileApi.get()).toEqual({
      email: 'Su questo telefono',
      nickname: null,
      defaultSalaryAmount: null,
      salaryDay: null,
      avatarKey: null,
      savingsEnabled: false,
      savingsPercent: null,
      salaryCategoryId: null,
    })
  })

  it('impostare lo stipendio crea la regola, nella categoria Stipendio', async () => {
    const profile = await profileApi.update({ nickname: 'Giulia', defaultSalaryAmount: 2000, salaryDay: 27 })

    expect(salaryRules()).toHaveLength(1)
    expect(salaryRules()[0].default_amount).toBe(200000)
    expect((await categoriesApi.list()).find((c) => c.id === profile.salaryCategoryId)?.name).toBe('Stipendio')
  })

  it('il giorno di accredito diventa il giorno della regola, anche cambiandolo', async () => {
    await profileApi.update({ defaultSalaryAmount: 1800, salaryDay: 27 })
    expect(salaryRules()[0].start_date.slice(8)).toBe('27')

    await profileApi.update({ defaultSalaryAmount: 1800, salaryDay: 31 })
    expect(salaryRules()[0].start_date.slice(8)).toBe('31')
  })

  it('cambiare solo il soprannome non ricrea la regola', async () => {
    await profileApi.update({ nickname: 'Giulia', defaultSalaryAmount: 2000, salaryDay: 27 })
    await profileApi.update({ nickname: 'Giulia B.', defaultSalaryAmount: 2000, salaryDay: 27 })

    expect(salaryRules()).toHaveLength(1)
    expect((await profileApi.get()).nickname).toBe('Giulia B.')
  })

  /**
   * Il motivo per cui la regola si risincronizza solo quando cambiano stipendio o
   * giorno: una regola spenta apposta in Ricorrenti non deve riaccendersi salvando il
   * profilo per cambiare il soprannome.
   */
  it('salvare solo il soprannome non riaccende una regola spenta', async () => {
    await profileApi.update({ nickname: 'Giulia', defaultSalaryAmount: 2000, salaryDay: 27 })
    backend().db.run('UPDATE recurring_transactions SET active = 0')

    await profileApi.update({ nickname: 'Giulia B.', defaultSalaryAmount: 2000, salaryDay: 27 })

    expect(salaryRules()[0].active).toBe(0)
  })

  it('svuotare lo stipendio disattiva la regola invece di cancellarla', async () => {
    await profileApi.update({ defaultSalaryAmount: 2000, salaryDay: 27 })
    await profileApi.update({})

    expect(salaryRules()).toHaveLength(1)
    expect(salaryRules()[0].active).toBe(0)
  })

  it('una seconda modifica non rigenera lo stipendio dello stesso mese', async () => {
    await profileApi.update({ defaultSalaryAmount: 2000, salaryDay: 1 })
    const dopoLaPrima = (await transactionsApi.list()).content.length

    await profileApi.update({ defaultSalaryAmount: 2500, salaryDay: 1 })

    expect((await transactionsApi.list()).content).toHaveLength(dopoLaPrima)
    expect(salaryRules()[0].default_amount).toBe(250000)
    expect(salaryRules()[0].next_due_date >= today()).toBe(true)
  })

  /**
   * Alla prima attivazione lo stipendio di questo mese si genera subito, anche se il
   * giorno è passato: con l'accredito il 1° c'è già una transazione, del giorno 1.
   */
  it('alla prima attivazione genera subito lo stipendio del mese', async () => {
    await profileApi.update({ defaultSalaryAmount: 2000, salaryDay: 1 })

    expect((await transactionsApi.list()).content).toEqual([
      expect.objectContaining({ amount: 2000, type: 'INCOME', occurredOn: onDay(today(), 1), description: 'Stipendio' }),
    ])
  })

  it('il 31 su una regola già attiva cade sull ultimo giorno esistente del mese', async () => {
    await profileApi.update({ defaultSalaryAmount: 2000, salaryDay: 15 })
    await profileApi.update({ defaultSalaryAmount: 2000, salaryDay: 31 })

    const prossima = salaryRules()[0].next_due_date
    expect(prossima >= today()).toBe(true)
    expect(plusDays(prossima, 1).slice(8)).toBe('01')
  })

  it('rifiuta risparmio senza percentuale, avatar sconosciuti, giorni e stipendi fuori misura', async () => {
    expect(await apiError(profileApi.update({ savingsEnabled: true }))).toEqual({
      status: 400,
      message: 'Con la sezione risparmio attiva serve la percentuale da mettere da parte',
    })
    expect((await apiError(profileApi.update({ avatarKey: 'drago' }))).status).toBe(400)
    expect((await apiError(profileApi.update({ salaryDay: 32 }))).status).toBe(400)
    expect((await apiError(profileApi.update({ defaultSalaryAmount: 0 }))).status).toBe(400)
    await expect(profileApi.update({ avatarKey: 'cat', savingsEnabled: true, savingsPercent: 15 })).resolves.toMatchObject({
      avatarKey: 'cat',
      savingsEnabled: true,
      savingsPercent: 15,
    })
  })
})

describe('pulizia dati', () => {
  it('per intervallo toglie solo transazioni e saldi del periodo', async () => {
    const casa = await expenseCategory()
    await transactionsApi.create({ categoryId: casa.id, amount: 1, type: 'EXPENSE', occurredOn: '2026-01-15' })
    await transactionsApi.create({ categoryId: casa.id, amount: 2, type: 'EXPENSE', occurredOn: '2026-03-15' })
    await checkpointsApi.upsert({ checkpointDate: '2026-01-01', balance: 100 })

    const result = await dataCleanupApi.cleanup({ from: '2026-01-01', to: '2026-01-31' })

    expect(result).toEqual({
      transactionsDeleted: 1,
      recurringTransactionsDeleted: 0,
      balanceCheckpointsDeleted: 1,
      expenseRemindersDeleted: 0,
    })
    expect((await transactionsApi.list()).content.map((t) => t.occurredOn)).toEqual(['2026-03-15'])
  })

  it('senza intervallo toglie tutto tranne le categorie, e scollega lo stipendio', async () => {
    await profileApi.update({ defaultSalaryAmount: 2000, salaryDay: 1 })
    await checkpointsApi.upsert({ checkpointDate: '2026-01-01', balance: 100 })

    const result = await dataCleanupApi.cleanup()

    expect(result).toMatchObject({ transactionsDeleted: 1, recurringTransactionsDeleted: 1, balanceCheckpointsDeleted: 1 })
    expect((await categoriesApi.list()).map((c) => c.name)).toEqual(['Stipendio'])
    expect((await profileApi.get()).salaryCategoryId).toBeNull()
  })
})
