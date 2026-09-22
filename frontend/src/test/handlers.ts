import { HttpResponse, http, type HttpHandler } from 'msw'
import type {
  BalanceCheckpoint,
  Category,
  DataCleanupResult,
  Debt,
  ExpenseReminder,
  ForecastResponse,
  Profile,
  RecurringOverride,
  RecurringTransaction,
  Transaction,
  TransactionPage,
  UpcomingRemindersResponse,
} from '../api/types'

// I dati finti e la rete finta per i test che montano una pagina intera.
//
// Ogni endpoint che una pagina può chiamare ha qui un gestore che risponde
// "niente da mostrare". Serve a tenere acceso `onUnhandledRequest: 'error'`,
// che è ciò che impedisce a un test di passare mentre la pagina chiama un
// endpoint che nessuno aveva previsto — cioè il modo più facile di scrivere un
// test verde su codice rotto.
//
// Chi vuole dati veri li mette con `server.use(...)`: l'ultimo registrato vince,
// e `resetHandlers()` fra un test e l'altro rimette questi.

// Il client axios ha base `/api`, che in jsdom si risolve su
// http://localhost:3000: da cui il jolly iniziale.
const API = '*/api'

export const profiloVuoto: Profile = {
  email: 'utente@test.it',
  nickname: null,
  defaultSalaryAmount: null,
  salaryDay: null,
  avatarKey: null,
  savingsEnabled: false,
  savingsPercent: null,
  salaryCategoryId: null,
}

export const previsioneVuota: ForecastResponse = {
  startingBalanceDate: null,
  startingBalance: 0,
  currentBalance: 0,
  months: [],
}

export const paginaVuota: TransactionPage = { content: [], hasNext: false }

export const transazione = (over: Partial<Transaction> = {}): Transaction => ({
  id: 't-1',
  categoryId: 'c-1',
  categoryName: 'Alimentari',
  categoryIcon: null,
  categoryColor: '#F6C9C0',
  amount: 10,
  type: 'EXPENSE',
  occurredOn: '2026-03-02',
  description: null,
  recurringTransactionId: null,
  ...over,
})

export const categoria = (over: Partial<Category> = {}): Category => ({
  id: 'c-1',
  name: 'Alimentari',
  type: 'EXPENSE',
  color: '#F6C9C0',
  icon: null,
  parentId: null,
  archived: false,
  ...over,
})

export const ricorrente = (over: Partial<RecurringTransaction> = {}): RecurringTransaction => ({
  id: 'r-1',
  categoryId: 'c-1',
  categoryName: 'Casa',
  categoryType: 'EXPENSE',
  categoryIcon: 'home',
  categoryColor: '#A8C7E7',
  name: 'Affitto',
  defaultAmount: 500,
  intervalUnit: 'MONTH',
  intervalValue: 1,
  startDate: '2026-01-01',
  nextDueDate: '2026-04-01',
  endDate: null,
  active: true,
  ...over,
})

export const eccezione = (over: Partial<RecurringOverride> = {}): RecurringOverride => ({
  id: 'o-1',
  occurrenceDate: '2026-04-01',
  overrideAmount: 230,
  note: null,
  ...over,
})

export const promemoria = (over: Partial<ExpenseReminder> = {}): ExpenseReminder => ({
  id: 'p-1',
  categoryId: 'c-1',
  categoryName: 'Assicurazioni',
  categoryIcon: null,
  categoryColor: '#C5E1C5',
  name: 'Bollo auto',
  amount: 120,
  intervalUnit: 'YEAR',
  intervalValue: 1,
  startDate: '2026-01-01',
  nextDueDate: '2026-06-10',
  endDate: null,
  active: true,
  notifyDaysBefore: null,
  ...over,
})

export const debito = (over: Partial<Debt> = {}): Debt => ({
  id: 'd-1',
  categoryId: 'c-1',
  categoryName: 'Prestiti',
  categoryIcon: null,
  categoryColor: '#D9C7E8',
  name: 'Prestito auto',
  totalAmount: 6000,
  alreadyPaidAmount: 0,
  alreadyPaidAsOf: null,
  paidAmount: 1200,
  remainingAmount: 4800,
  monthlyPaymentAmount: 200,
  active: true,
  createdAt: '2026-01-01T00:00:00Z',
  ...over,
})

export const saldo = (over: Partial<BalanceCheckpoint> = {}): BalanceCheckpoint => ({
  id: 'bc-1',
  checkpointDate: '2026-03-01',
  balance: 1500,
  ...over,
})

/** Override del profilo: usato da `mountPage({ profile: ... })`. */
export const profileHandler = (over: Partial<Profile> = {}): HttpHandler =>
  http.get(`${API}/profile`, () => HttpResponse.json({ ...profiloVuoto, ...over }))

export const defaultHandlers: HttpHandler[] = [
  // --- sessione -----------------------------------------------------------
  http.post(`${API}/auth/login`, () => HttpResponse.json({ token: 'tok', email: 'utente@test.it' })),
  http.post(`${API}/auth/register`, () => HttpResponse.json({ token: 'tok', email: 'utente@test.it' })),
  profileHandler(),
  http.put(`${API}/profile`, async ({ request }) =>
    HttpResponse.json({ ...profiloVuoto, ...((await request.json()) as object) }),
  ),

  // --- dati ---------------------------------------------------------------
  http.get(`${API}/forecast`, () => HttpResponse.json(previsioneVuota)),

  http.get(`${API}/balance-checkpoints`, () => HttpResponse.json<BalanceCheckpoint[]>([])),
  http.post(`${API}/balance-checkpoints`, () => HttpResponse.json(saldo())),

  http.get(`${API}/transactions`, () => HttpResponse.json(paginaVuota)),
  http.post(`${API}/transactions`, () => HttpResponse.json(transazione(), { status: 201 })),
  http.put(`${API}/transactions/:id`, () => HttpResponse.json(transazione())),
  http.delete(`${API}/transactions/:id`, () => new HttpResponse(null, { status: 204 })),

  http.get(`${API}/recurring-transactions`, () => HttpResponse.json<RecurringTransaction[]>([])),
  http.post(`${API}/recurring-transactions`, () => HttpResponse.json(ricorrente(), { status: 201 })),
  http.put(`${API}/recurring-transactions/:id`, () => HttpResponse.json(ricorrente())),
  http.delete(`${API}/recurring-transactions/:id`, () => new HttpResponse(null, { status: 204 })),
  http.post(`${API}/recurring-transactions/:id/deactivate`, () => HttpResponse.json(ricorrente({ active: false }))),
  http.post(`${API}/recurring-transactions/:id/reactivate`, () => HttpResponse.json(ricorrente())),
  // Le eccezioni di importo su una singola occorrenza: OverridesPanel le chiama
  // da sé, e senza questi gestori `onUnhandledRequest: 'error'` farebbe fallire
  // qualunque test che monta quel pannello.
  http.get(`${API}/recurring-transactions/:id/overrides`, () => HttpResponse.json<RecurringOverride[]>([])),
  http.post(`${API}/recurring-transactions/:id/overrides`, () => HttpResponse.json(eccezione(), { status: 201 })),
  http.delete(`${API}/recurring-transactions/:id/overrides/:overrideId`, () => new HttpResponse(null, { status: 204 })),

  http.get(`${API}/expense-reminders`, () => HttpResponse.json<ExpenseReminder[]>([])),
  http.post(`${API}/expense-reminders`, () => HttpResponse.json(promemoria(), { status: 201 })),
  http.put(`${API}/expense-reminders/:id`, () => HttpResponse.json(promemoria())),
  http.post(`${API}/expense-reminders/:id/deactivate`, () => HttpResponse.json(promemoria({ active: false }))),
  http.post(`${API}/expense-reminders/:id/reactivate`, () => HttpResponse.json(promemoria())),
  http.get(`${API}/expense-reminders/upcoming`, () =>
    HttpResponse.json<UpcomingRemindersResponse>({ months: [] }),
  ),

  http.get(`${API}/categories`, () => HttpResponse.json<Category[]>([])),
  http.get(`${API}/categories/archived`, () => HttpResponse.json<Category[]>([])),
  http.post(`${API}/categories`, () => HttpResponse.json(categoria(), { status: 201 })),
  http.put(`${API}/categories/:id`, () => HttpResponse.json(categoria())),
  http.delete(`${API}/categories/:id`, () => new HttpResponse(null, { status: 204 })),
  http.post(`${API}/categories/:id/archive`, () => new HttpResponse(null, { status: 204 })),
  http.post(`${API}/categories/:id/unarchive`, () => new HttpResponse(null, { status: 204 })),
  http.post(`${API}/categories/generate-defaults`, () => HttpResponse.json<Category[]>([])),

  http.get(`${API}/debts`, () => HttpResponse.json<Debt[]>([])),
  http.post(`${API}/debts`, () => HttpResponse.json(debito(), { status: 201 })),
  http.put(`${API}/debts/:id`, () => HttpResponse.json(debito())),
  http.delete(`${API}/debts/:id`, () => new HttpResponse(null, { status: 204 })),

  http.get(`${API}/export/excel`, () => HttpResponse.arrayBuffer(new ArrayBuffer(8))),
  http.delete(`${API}/data-cleanup`, () =>
    HttpResponse.json<DataCleanupResult>({
      transactionsDeleted: 0,
      recurringTransactionsDeleted: 0,
      balanceCheckpointsDeleted: 0,
      expenseRemindersDeleted: 0,
    }),
  ),

  // --- solo per i test ----------------------------------------------------
  // Vedi server.ts: è la richiesta riuscita che spegne il fail-fast.
  http.get(`${API}/__risveglio__`, () => HttpResponse.json({})),
]
