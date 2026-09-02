import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronLeft, ChevronRight, PiggyBank, Plus, Wallet } from 'lucide-react'
import angryHusky from '../assets/husky/angry-husky.png'
import happyHusky from '../assets/husky/happy-husky.png'
import warningHusky from '../assets/husky/warning-husky.png'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  categoriesApi,
  checkpointsApi,
  forecastApi,
  recurringApi,
  remindersApi,
  transactionsApi,
} from '../api/endpoints'
import { getCategoryIcon } from '../constants/icons'
import { DashboardPageSkeleton } from '../components/Skeleton'
import Modal from '../components/Modal'
import TransactionForm from '../components/TransactionForm'
import MobileCategoryChart from '../components/MobileCategoryChart'
import { useAuth } from '../context/AuthContext'
import { useOfflineSync } from '../context/OfflineSyncContext'
import { useIsMobile } from '../hooks/useIsMobile'
import { cacheCategories, loadCachedCategories } from '../offline/categoriesCache'
import { periodKeyOf, periodRangeOf } from '../utils/period'
import { buildPeriodSavings, computeBudget } from '../utils/savings'
import type {
  BalanceCheckpoint,
  Category,
  CategoryAmount,
  CategoryAmountNode,
  ForecastResponse,
  RecurringTransaction,
  Transaction,
  UpcomingRemindersResponse,
} from '../api/types'

const currency = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })
const monthLabelFormatter = new Intl.DateTimeFormat('it-IT', { month: 'short', year: '2-digit' })
const monthLabelFullFormatter = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' })
const dayBadgeMonthFormatter = new Intl.DateTimeFormat('it-IT', { month: 'short' })
const fullDateFormatter = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })

interface ChartPoint {
  label: string
  actual: number | null
  projected: number | null
  /**
   * Periodo della card "Spese per categoria" a cui questo punto rimanda al
   * click. Il grafico ragiona per mese di calendario, la card per periodo
   * stipendio-to-stipendio: null sui mesi futuri, che non hanno spese
   * registrate da mostrare.
   */
  periodKey: string | null
}

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7)
}

function monthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number)
  return monthLabelFormatter.format(new Date(year, month - 1, 1))
}

function monthLabelFull(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number)
  return monthLabelFullFormatter.format(new Date(year, month - 1, 1))
}

function monthNameCapitalized(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number)
  const name = monthLabelFullFormatter.formatToParts(new Date(year, month - 1, 1)).find((p) => p.type === 'month')!.value
  return name.charAt(0).toUpperCase() + name.slice(1)
}

function defaultRangeStart(): string {
  return `${new Date().getFullYear()}-01-01`
}

// Le durate offerte dai chip del grafico su mobile, al posto dei due campi data.
const DEFAULT_MOBILE_RANGE_MONTHS = 6

const CHART_RANGES = [
  { label: '1M', months: 1 },
  { label: '3M', months: 3 },
  { label: '6M', months: 6 },
  { label: '1A', months: 12 },
]

function chartRangeStart(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - months)
  return d.toISOString().slice(0, 10)
}

function defaultRangeEnd(): string {
  const d = new Date()
  d.setMonth(d.getMonth() + 6)
  return d.toISOString().slice(0, 10)
}

function fullDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  return fullDateFormatter.format(new Date(year, month - 1, day))
}

function dayBadge(dateStr: string): { day: string; month: string } {
  const [year, month, day] = dateStr.split('-').map(Number)
  return {
    day: String(day).padStart(2, '0'),
    month: dayBadgeMonthFormatter.format(new Date(year, month - 1, day)).replace('.', '').toUpperCase(),
  }
}

// Aggrega le transazioni di spesa di un mese per categoria, per i mesi passati
// dove non abbiamo un forecast.categoryBreakdown già pronto dal backend.
//
// Le sottocategorie confluiscono nella riga del padre: `amount` della riga
// padre è il totale complessivo (sue spese dirette + tutti i figli), mentre
// `children` contiene il dettaglio da mostrare quando la riga viene espansa.
// Le spese registrate direttamente sul padre restano nel totale ma non
// generano una riga figlia. Se il padre non è tra le categorie note (es.
// archiviato, che `categoriesApi.list()` non restituisce) la riga resta al
// livello principale, cioè il comportamento precedente a questa feature.
function buildCategoryBreakdown(transactions: Transaction[], categories: Category[]): CategoryAmountNode[] {
  const byCategory = new Map<string, CategoryAmount>()
  for (const t of transactions) {
    if (t.type !== 'EXPENSE') continue
    const existing = byCategory.get(t.categoryId)
    if (existing) {
      byCategory.set(t.categoryId, { ...existing, amount: existing.amount + t.amount })
    } else {
      byCategory.set(t.categoryId, {
        categoryId: t.categoryId,
        categoryName: t.categoryName,
        categoryIcon: t.categoryIcon,
        categoryColor: t.categoryColor,
        type: 'EXPENSE',
        amount: t.amount,
      })
    }
  }

  const parentOf = new Map(categories.map((c) => [c.id, c.parentId]))
  const knownIds = new Set(categories.map((c) => c.id))
  const roots = new Map<string, CategoryAmountNode>()

  const rootFor = (row: CategoryAmount): CategoryAmountNode => {
    const existing = roots.get(row.categoryId)
    if (existing) return existing
    const created: CategoryAmountNode = { ...row, amount: 0, children: [] }
    roots.set(row.categoryId, created)
    return created
  }

  for (const row of byCategory.values()) {
    const parentId = parentOf.get(row.categoryId)
    if (parentId && knownIds.has(parentId)) {
      const parentCategory = categories.find((c) => c.id === parentId)!
      const parentRow = rootFor({
        categoryId: parentCategory.id,
        categoryName: parentCategory.name,
        categoryIcon: parentCategory.icon,
        categoryColor: parentCategory.color,
        type: 'EXPENSE',
        amount: 0,
      })
      parentRow.amount += row.amount
      parentRow.children.push(row)
    } else {
      rootFor(row).amount += row.amount
    }
  }

  const byAmountDesc = (a: CategoryAmount, b: CategoryAmount) => b.amount - a.amount
  return Array.from(roots.values())
    .map((node) => ({ ...node, children: node.children.sort(byAmountDesc) }))
    .sort(byAmountDesc)
}

export default function DashboardPage() {
  const { salaryDay, savings } = useAuth()
  const { isOnline, backendReachable, pendingCount, addOfflineTransaction } = useOfflineSync()
  const isMobile = useIsMobile()
  const [forecast, setForecast] = useState<ForecastResponse | null>(null)
  const [checkpoints, setCheckpoints] = useState<BalanceCheckpoint[]>([])
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([])
  const [historicalTransactions, setHistoricalTransactions] = useState<Transaction[]>([])
  const [recurring, setRecurring] = useState<RecurringTransaction[]>([])
  const [upcomingReminders, setUpcomingReminders] = useState<UpcomingRemindersResponse | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [monthCursor, setMonthCursor] = useState(0)
  // Categorie padre attualmente espanse nella card "Spese per categoria".
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  // Su mobile il grafico si comanda a chip di durata: partire dal primo
  // gennaio lascerebbe tutti e quattro spenti, come se non fosse selezionato
  // niente. Sei mesi è la durata che il grafico mostra meglio nello spazio che
  // ha. Sul desktop resta l'anno in corso, che è quello che i campi data
  // mostravano da sempre.
  const [rangeStart, setRangeStart] = useState(() =>
    isMobile ? chartRangeStart(DEFAULT_MOBILE_RANGE_MONTHS) : defaultRangeStart(),
  )
  const [rangeEnd, setRangeEnd] = useState(defaultRangeEnd())

  // Quale delle due card del carosello risparmio è in vista, per accendere il
  // pallino giusto. Si ricava dallo scorrimento invece di comandarlo, così il
  // dito e i pallini non possono raccontare due cose diverse.
  const savingsTrackRef = useRef<HTMLDivElement>(null)
  const [savingsIndex, setSavingsIndex] = useState(0)

  // La larghezza del badge di stato si misura invece di fissarla: dipende
  // dall'etichetta e dal font, e serve alla mascotte della card "Budget
  // disponibile" per condividerne il centro. L'osservatore la tiene aggiornata
  // da solo, sia quando cambia lo stato (le tre etichette non sono larghe
  // uguale) sia quando la card viene ridimensionata. Sta qui in cima e non
  // accanto alla card perché sotto c'è un return anticipato per il caricamento,
  // e gli hook non possono stargli dopo.
  const badgeRef = useRef<HTMLSpanElement>(null)
  const [badgeWidth, setBadgeWidth] = useState<number | null>(null)
  // Quale mascotte non si è caricata. Si tiene l'indirizzo e non un sì/no:
  // se lo stato del budget cambia e la nuova immagine c'è, torna a vedersi.
  const [brokenHusky, setBrokenHusky] = useState<string | null>(null)

  const today = new Date()
  // Quanti mesi di forecast servono per coprire rangeEnd, partendo dal mese
  // corrente (il forecast engine parte sempre da oggi, mai da rangeStart).
  const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1)
  const rangeEndDate = new Date(rangeEnd)
  const endMonthStart = new Date(rangeEndDate.getFullYear(), rangeEndDate.getMonth(), 1)
  const monthsDiff =
    (endMonthStart.getFullYear() - currentMonthStart.getFullYear()) * 12 +
    (endMonthStart.getMonth() - currentMonthStart.getMonth())
  const monthsParam = Math.min(24, Math.max(1, monthsDiff + 1))
  const startMonthKey = rangeStart.slice(0, 7)
  const endMonthKey = rangeEnd.slice(0, 7)

  const reload = () => {
    // Finestra ampia (2 anni) per lo storico di default: copre praticamente
    // qualsiasi utente senza dover sapere in anticipo da quando ha dati
    // reali, per la card "Spese per categoria" che permette di sfogliare
    // periodi passati indipendentemente dal range scelto per il grafico.
    // Si allarga oltre i 2 anni solo se l'utente sceglie un rangeStart
    // ancora più indietro per il grafico "Andamento saldo".
    const defaultHistoryStart = new Date(today.getFullYear() - 2, today.getMonth(), 1)
    const chartHistoryStart = new Date(rangeStart)
    const historyStart = chartHistoryStart < defaultHistoryStart ? chartHistoryStart : defaultHistoryStart
    const iso = (d: Date) => d.toISOString().slice(0, 10)
    const todayStr = iso(today)
    // Il limite superiore arriva fino alla fine del periodo personalizzato
    // corrente (stipendio-to-stipendio, o mese di calendario se non
    // configurato), non solo fino a oggi: così una spesa già registrata con
    // data futura ma ancora dentro il periodo corrente non viene esclusa.
    const currentPeriodEnd = periodRangeOf(periodKeyOf(todayStr, salaryDay), salaryDay).end

    // Promise.allSettled invece di Promise.all: un singolo fallimento (es.
    // promemoria o ricorrenti) non deve impedire l'aggiornamento del saldo
    // attuale e della previsione, che dipendono solo da forecastRes.
    return Promise.allSettled([
      forecastApi.get(monthsParam),
      checkpointsApi.list(),
      transactionsApi.list(),
      transactionsApi.list({ from: iso(historyStart), to: currentPeriodEnd }),
      recurringApi.list(),
      remindersApi.upcoming(6),
      categoriesApi
        .list()
        .then((cats) => {
          cacheCategories(cats)
          setCategories(cats)
        })
        .catch(() => setCategories(loadCachedCategories())),
    ]).then(([forecastRes, checkpointsRes, recentRes, historicalRes, recurringRes, remindersRes]) => {
      if (forecastRes.status === 'fulfilled') setForecast(forecastRes.value)
      else console.error('Aggiornamento previsione non riuscito', forecastRes.reason)

      if (checkpointsRes.status === 'fulfilled') setCheckpoints(checkpointsRes.value)
      else console.error('Aggiornamento saldi di partenza non riuscito', checkpointsRes.reason)

      if (recentRes.status === 'fulfilled') setRecentTransactions(recentRes.value.content)
      else console.error('Aggiornamento transazioni recenti non riuscito', recentRes.reason)

      if (historicalRes.status === 'fulfilled') setHistoricalTransactions(historicalRes.value.content)
      else console.error('Aggiornamento storico transazioni non riuscito', historicalRes.reason)

      if (recurringRes.status === 'fulfilled') setRecurring(recurringRes.value)
      else console.error('Aggiornamento ricorrenti non riuscito', recurringRes.reason)

      if (remindersRes.status === 'fulfilled') setUpcomingReminders(remindersRes.value)
      else console.error('Aggiornamento promemoria non riuscito', remindersRes.reason)
    })
  }

  useEffect(() => {
    reload().finally(() => setLoading(false))
  }, [salaryDay, rangeStart, rangeEnd])

  useEffect(() => {
    const badge = badgeRef.current
    if (!badge) return
    const measure = () => setBadgeWidth(badge.getBoundingClientRect().width)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(badge)
    return () => observer.disconnect()
  }, [loading, savings.enabled])

  // Una transazione aggiunta offline viene sincronizzata in background da
  // OfflineSyncContext: se l'utente resta sul Dashboard, senza questo
  // effetto il saldo attuale e la previsione non si aggiornerebbero mai
  // finché non si naviga altrove e si torna (che rimonta la pagina).
  const prevPendingCount = useRef(pendingCount)
  useEffect(() => {
    if (prevPendingCount.current > 0 && pendingCount === 0) {
      reload()
    }
    prevPendingCount.current = pendingCount
  }, [pendingCount])

  const closeQuickAdd = () => setQuickAddOpen(false)

  const handleQuickAdd = async (data: {
    categoryId: string
    amount: number
    type: string
    occurredOn: string
    description: string | null
  }) => {
    if (!isOnline || !backendReachable) {
      addOfflineTransaction({ ...data, type: data.type as 'INCOME' | 'EXPENSE' })
      closeQuickAdd()
      return
    }

    try {
      await transactionsApi.create(data)
    } catch (err) {
      if ((err as { response?: unknown }).response === undefined) {
        addOfflineTransaction({ ...data, type: data.type as 'INCOME' | 'EXPENSE' })
        closeQuickAdd()
        return
      }
      throw err
    }
    closeQuickAdd()
    await reload()
  }

  const handleCreateCategory = async (data: { name: string; type: 'INCOME' | 'EXPENSE'; color: string | null; icon: string | null }) => {
    const category = await categoriesApi.create(data)
    const updated = await categoriesApi.list()
    cacheCategories(updated)
    setCategories(updated)
    return category
  }

  if (loading) return <DashboardPageSkeleton />

  const latestCheckpoint = checkpoints[0] ?? null
  const currentMonth = forecast?.months[0] ?? null
  const futureMonths = monthsDiff >= 0 ? forecast?.months.slice(1, monthsParam) ?? [] : []
  const currentBalance = forecast?.currentBalance ?? latestCheckpoint?.balance ?? 0

  const todayStr = new Date().toISOString().slice(0, 10)
  const currentCalendarKey = todayStr.slice(0, 7)

  // Il grafico "Andamento saldo" resta a mese di calendario (fuori
  // dall'ambito del periodo personalizzato): esclude esplicitamente il mese
  // corrente, come faceva già prima che la finestra di fetch di
  // historicalTransactions si allargasse per includerlo.
  const netByMonth = new Map<string, number>()
  for (const t of historicalTransactions) {
    if (monthKey(t.occurredOn) >= currentCalendarKey) continue
    const key = monthKey(t.occurredOn)
    const signed = t.type === 'INCOME' ? t.amount : -t.amount
    netByMonth.set(key, (netByMonth.get(key) ?? 0) + signed)
  }
  const historicalKeys = Array.from(netByMonth.keys()).sort()
  const totalHistoricalNet = historicalKeys.reduce((sum, k) => sum + (netByMonth.get(k) ?? 0), 0)

  let running = currentBalance - totalHistoricalNet
  const historicalPoints: ChartPoint[] = historicalKeys
    .map((key) => {
      running += netByMonth.get(key) ?? 0
      return {
        key,
        label: monthLabel(key),
        actual: running,
        projected: null,
        // Il periodo che contiene la metà di questo mese di calendario: con
        // un accredito a inizio mese il periodo omonimo cadrebbe quasi tutto
        // nel mese precedente, quindi non basta riusare la stessa chiave.
        periodKey: periodKeyOf(`${key}-15`, salaryDay),
      }
    })
    .filter((p) => p.key >= startMonthKey && p.key <= endMonthKey)

  const chartData: ChartPoint[] = [
    ...historicalPoints,
    { label: 'Ora', actual: currentBalance, projected: currentBalance, periodKey: periodKeyOf(todayStr, salaryDay) },
    ...futureMonths.map((m) => ({
      label: monthLabel(m.yearMonth),
      actual: null,
      projected: m.runningBalance,
      periodKey: null,
    })),
  ]

  const upcomingExpenses = recurring
    .filter((r) => r.active && r.categoryType === 'EXPENSE')
    .sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate))
    .slice(0, 5)

  // Periodi sfogliabili nella card "Spese per categoria" e le card "mese
  // corrente": periodo personalizzato stipendio-to-stipendio (o mese di
  // calendario se salaryDay non è impostato), aggregati qui dalle
  // transazioni reali in modo uniforme per storico e periodo corrente - non
  // si usa più forecast.categoryBreakdown per il periodo corrente, perché
  // quello ragiona sempre per mese di calendario.
  const currentPeriodKey = periodKeyOf(todayStr, salaryDay)
  const periodKeysSet = new Set<string>()
  for (const t of historicalTransactions) {
    periodKeysSet.add(periodKeyOf(t.occurredOn, salaryDay))
  }
  periodKeysSet.add(currentPeriodKey) // compare anche senza transazioni
  const breakdownMonthKeys = Array.from(periodKeysSet).sort()

  const breakdownByMonth = new Map<string, CategoryAmountNode[]>()
  for (const key of breakdownMonthKeys) {
    breakdownByMonth.set(
      key,
      buildCategoryBreakdown(
        historicalTransactions.filter((t) => periodKeyOf(t.occurredOn, salaryDay) === key),
        categories,
      ),
    )
  }
  const currentMonthBreakdownIndex = breakdownMonthKeys.indexOf(currentPeriodKey)
  const selectedBreakdownIndex = Math.min(
    Math.max(currentMonthBreakdownIndex + monthCursor, 0),
    breakdownMonthKeys.length - 1,
  )
  const selectedBreakdownMonthKey = breakdownMonthKeys[selectedBreakdownIndex]
  const categoryBreakdown = selectedBreakdownMonthKey ? breakdownByMonth.get(selectedBreakdownMonthKey) ?? [] : []
  const maxCategoryAmount = categoryBreakdown[0]?.amount ?? 0
  const canGoPrevMonth = selectedBreakdownIndex > 0
  const canGoNextMonth = selectedBreakdownIndex < breakdownMonthKeys.length - 1

  // Cliccando un punto del grafico "Andamento saldo" si sposta la card "Spese
  // per categoria" su quel periodo. monthCursor è uno scostamento dal periodo
  // corrente, quindi si converte l'indice di destinazione in differenza.
  const selectPeriod = (periodKey: string | null | undefined) => {
    if (!periodKey) return
    const index = breakdownMonthKeys.indexOf(periodKey)
    if (index === -1) return
    setMonthCursor(index - currentMonthBreakdownIndex)
  }

  const handleChartClick = (state: { activeLabel?: string | number }) => {
    const label = state?.activeLabel
    if (label == null) return
    selectPeriod(chartData.find((p) => p.label === label)?.periodKey)
  }

  // Etichetta del punto attualmente mostrato dalla card categorie, per
  // evidenziarlo sul grafico.
  const selectedChartLabel = chartData.find((p) => p.periodKey === selectedBreakdownMonthKey)?.label

  const currentPeriodTransactions = historicalTransactions.filter(
    (t) => periodKeyOf(t.occurredOn, salaryDay) === currentPeriodKey,
  )
  const currentPeriodIncome = currentPeriodTransactions
    .filter((t) => t.type === 'INCOME')
    .reduce((sum, t) => sum + t.amount, 0)
  const currentPeriodExpense = currentPeriodTransactions
    .filter((t) => t.type === 'EXPENSE')
    .reduce((sum, t) => sum + t.amount, 0)
  const currentPeriodNet = currentPeriodIncome - currentPeriodExpense

  // Sezione risparmio: budget disponibile e risparmio del periodo, entrambi
  // ricavati dalle transazioni — non c'è nulla da accantonare a mano.
  const budget = computeBudget(
    currentPeriodTransactions,
    savings,
    periodRangeOf(currentPeriodKey, salaryDay),
    todayStr,
  )
  // Media del risparmio sui periodi conclusi, come termine di paragone per
  // capire se questo mese si sta andando meglio o peggio del solito.
  const closedPeriods = buildPeriodSavings(
    historicalTransactions,
    (d) => periodKeyOf(d, salaryDay),
    breakdownMonthKeys.filter((k) => k < currentPeriodKey),
  )
  const averageSaved =
    closedPeriods.length > 0 ? closedPeriods.reduce((s, p) => s + p.saved, 0) / closedPeriods.length : null

  // Progresso dell'anello: quanto si è risparmiato rispetto all'obiettivo del
  // periodo. Sempre verde, perché "accumulo" ha sempre semantica positiva.
  const savingsRingPct =
    budget.savingsTarget > 0 ? Math.min(Math.max(budget.saved / budget.savingsTarget, 0), 1) : 0

  // Su mobile i due KPI stanno affiancati in una card sola invece che impilati:
  // erano due schermate di altezza per due numeri, e il primo scroll partiva
  // già senza aver visto niente. Le due tinte restano e fanno da divisorio.
  const summaryCards = isMobile ? (
    <div className="flex overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
      <div className="flex-1 bg-kpi-a p-3">
        <p className="text-xs text-slate-500">Saldo attuale</p>
        <p className="text-lg font-semibold text-slate-900">{currency.format(currentBalance)}</p>
      </div>
      <div className="flex-1 bg-kpi-b p-3">
        <p className="text-xs text-slate-500">Previsto a fine mese</p>
        <p className="text-lg font-semibold text-slate-900">
          {currentMonth ? currency.format(currentMonth.runningBalance) : '-'}
        </p>
      </div>
    </div>
  ) : (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-kpi-a p-4">
        <p className="text-sm text-slate-500">Saldo attuale</p>
        <p className="text-2xl font-semibold text-slate-900">{currency.format(currentBalance)}</p>
      </div>
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-kpi-b p-4">
        <p className="text-sm text-slate-500">Saldo previsto a fine mese</p>
        <p className="text-2xl font-semibold text-slate-900">
          {currentMonth ? currency.format(currentMonth.runningBalance) : '-'}
        </p>
      </div>
    </div>
  )

  // Le due card della sezione risparmio, affiancate invece che alternate da un
  // toggle: l'anello verde con il salvadanaio è sempre e solo l'accumulo,
  // quello colorato con il portafoglio sempre e solo il consumo, così i due
  // significati opposti non possono essere scambiati.
  // La mascotte cambia espressione insieme al colore: chi guarda la card di
  // sfuggita capisce come sta andando il periodo prima ancora di leggere la
  // cifra, e lo stato non resta affidato al solo colore.
  // Tinte via token e non esadecimali: al buio la superficie deve scurirsi
  // insieme al testo, e la regola che decide quando farlo (tema scuro *e*
  // palette Canvas neutro) sta già scritta una volta sola in index.css.
  const BUDGET_TONES = {
    neutral: {
      bg: 'var(--color-budget-neutral-card)',
      ring: 'var(--color-budget-neutral-ring)',
      head: 'var(--color-budget-neutral-head)',
      label: 'In linea',
      husky: happyHusky,
      huskyAlt: 'Husky contento',
    },
    warning: {
      bg: 'var(--color-budget-warning-card)',
      ring: 'var(--color-budget-warning-ring)',
      head: 'var(--color-budget-warning-head)',
      label: 'Attenzione',
      husky: warningHusky,
      huskyAlt: 'Husky preoccupato',
    },
    danger: {
      bg: 'var(--color-budget-danger-card)',
      ring: 'var(--color-budget-danger-ring)',
      head: 'var(--color-budget-danger-head)',
      label: 'Sforato',
      husky: angryHusky,
      huskyAlt: 'Husky arrabbiato',
    },
  } as const
  const tone = BUDGET_TONES[budget.status]
  const RING = 276.46

  // Senza un giorno di accredito configurato il periodo è il mese di calendario
  // e parlare di "prossimo stipendio" sarebbe fuorviante.
  const periodEndLabel = salaryDay != null ? 'al prossimo stipendio' : 'alla fine del periodo'
  const daysLeftLabel =
    budget.daysLeft === 0
      ? salaryDay != null
        ? 'Domani arriva lo stipendio'
        : 'Ultimo giorno del periodo'
      : `${budget.daysLeft} ${budget.daysLeft === 1 ? 'giorno' : 'giorni'} ${periodEndLabel}`

  // Quota di budget ancora disponibile: l'anello si svuota man mano che si
  // spende, al contrario di quello del risparmio che si riempie.
  const budgetRingPct =
    budget.available > 0 ? Math.min(Math.max(budget.remaining / budget.available, 0), 1) : 0

  // Su mobile l'anello si stringe: a 104px su una card larga 291 restava
  // troppo poco all'importo, che è il numero per cui si guarda la card.
  const ringSize = isMobile ? 88 : 104

  const savingsRing = (pct: number, color: string, trackColor: string) => (
    <div className="relative shrink-0" style={{ height: ringSize, width: ringSize }}>
      <svg viewBox="0 0 104 104" width={ringSize} height={ringSize} className="-rotate-90">
        <circle cx="52" cy="52" r="44" fill="none" stroke={trackColor} strokeWidth="11" />
        <circle
          cx="52"
          cy="52"
          r="44"
          fill="none"
          stroke={color}
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={RING}
          strokeDashoffset={RING * (1 - pct)}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className="font-bold leading-none text-slate-900"
          style={{ fontSize: isMobile ? 18 : 22 }}
        >
          {Math.round(pct * 100)}%
        </span>
      </div>
    </div>
  )

  // Su mobile le due card perdono il bordo e si stringono: la tinta piena le
  // separa già dallo sfondo, e nel carosello un bordo per card faceva sembrare
  // il tutto una lista dentro una lista.
  const cardChrome = isMobile ? 'rounded-xl p-4' : 'rounded-lg border border-slate-200 p-[18px]'
  const cardHeader = isMobile ? 'mb-3 flex items-center justify-between gap-2' : 'mb-3.5 flex items-center justify-between gap-2'
  const cardBody = isMobile ? 'flex items-center gap-3.5' : 'flex items-center gap-4'
  const cardAmount = isMobile ? 'text-xl' : 'text-2xl'

  const savingsProgressCard = (
    <div className={cardChrome} style={{ backgroundColor: 'var(--color-save-card)' }}>
      <div className={cardHeader}>
        <Link
          to="/risparmio"
          className="flex items-center gap-1.5 text-[13px] font-bold hover:underline"
          style={{ color: 'var(--color-save-head)' }}
        >
          <PiggyBank className="h-[15px] w-[15px]" />
          Risparmio
        </Link>
        <span className="text-[11px] text-slate-500">
          {budget.daysLeft > 0 ? 'periodo in corso' : 'periodo concluso'}
        </span>
      </div>
      <div className={cardBody}>
        {savingsRing(savingsRingPct, 'var(--color-save-ring)', 'var(--color-save-ring-track)')}
        <div className="min-w-0">
          <p className="text-xs text-slate-600">Risparmiato in questo periodo</p>
          <p
            className={`${cardAmount} font-bold leading-tight ${budget.saved < 0 ? 'text-red-600' : 'text-slate-900'}`}
          >
            {currency.format(budget.saved)}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            {budget.savingsTarget > 0
              ? `su ${currency.format(budget.savingsTarget)} obiettivo del periodo`
              : 'Nessuna entrata ancora in questo periodo'}
          </p>
        </div>
      </div>
      <p className="mt-3 border-t pt-2.5 text-[11px] text-slate-600" style={{ borderColor: 'var(--color-save-divider)' }}>
        {averageSaved === null
          ? 'Si calcola da solo: è quello che resta tra entrate e uscite del periodo.'
          : `Media dei periodi precedenti: ${currency.format(averageSaved)}`}
      </p>
    </div>
  )

  const budgetCard = (
    <div className={cardChrome} style={{ backgroundColor: tone.bg }}>
      <div className={cardHeader}>
        <span className="flex items-center gap-1.5 text-[13px] font-bold" style={{ color: tone.head }}>
          <Wallet className="h-[15px] w-[15px]" />
          Budget disponibile
        </span>
        <span
          ref={badgeRef}
          className="rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide"
          style={{ color: tone.ring, backgroundColor: 'var(--color-budget-badge-bg)' }}
        >
          {tone.label.toUpperCase()}
        </span>
      </div>
      <div className={cardBody}>
        {savingsRing(budgetRingPct, tone.ring, 'var(--color-save-ring-track)')}
        {/* Niente min-w-0 qui: la colonna non deve poter scendere sotto la
            larghezza dell'importo, altrimenti in due colonne la cifra si
            taglia. Chi cede spazio è la mascotte accanto. */}
        <div>
          {/* A sforamento avvenuto il numero utile non è più "quanto resta" (è
              zero) ma di quanto si è ecceduto: l'effetto sul risparmio lo
              racconta già la card accanto, qui si direbbe due volte la stessa
              cosa. */}
          <p className="text-xs text-slate-600">
            {budget.status === 'danger' ? 'Hai superato il budget di' : 'Puoi ancora spendere'}
          </p>
          <p
            className={`${cardAmount} font-bold leading-tight`}
            style={budget.status === 'danger' ? { color: tone.ring } : undefined}
          >
            {currency.format(Math.abs(budget.remaining))}
          </p>
          <p className="mt-1 text-xs text-slate-600">{daysLeftLabel}</p>
        </div>
        {/* La mascotte occupa una fetta larga quanto il badge e ci sta centrata:
            così i due condividono lo stesso centro orizzontale invece di essere
            solo allineati a destra, che con etichette di larghezza diversa
            ("IN LINEA" 74px, "ATTENZIONE" 98px) li faceva sembrare storti.
            La fetta può restringersi, perché l'importo può arrivare a cinque
            cifre e non deve mai essere lui a cedere lo spazio. */}
        {/* Se l'immagine non arriva, sparisce invece di lasciare il segnaposto
            di immagine rotta col testo alternativo, che sta nella card peggio
            di niente. Capita col server di sviluppo offline, dove non c'è
            precache; in produzione le tre immagini sono nel service worker e
            offline si vedono. */}
        {/* Su mobile la mascotte non c'è: la card è larga 291px e fra anello,
            importo e giorni non le resta una fetta in cui si veda ancora
            qualcosa. A schermo intero torna, grande com'è sempre stata. */}
        {!isMobile && tone.husky !== brokenHusky && (
          <div
            className="ml-auto flex shrink justify-center self-center"
            style={{ width: badgeWidth ?? undefined }}
          >
            <img
              src={tone.husky}
              alt={tone.huskyAlt}
              onError={() => setBrokenHusky(tone.husky)}
              className="w-14 min-w-8 shrink sm:w-[72px]"
            />
          </div>
        )}
      </div>
    </div>
  )

  // Le card sono due e basta, quindi le posizioni utili sono due: tutto a
  // sinistra e tutto a destra. Contarle a passi di una larghezza darebbe per la
  // seconda un punto oltre la fine dello scorrimento, che è irraggiungibile.
  const savingsMaxScroll = () => {
    const track = savingsTrackRef.current
    return track ? track.scrollWidth - track.clientWidth : 0
  }

  const handleSavingsScroll = () => {
    const max = savingsMaxScroll()
    if (max <= 0) return
    setSavingsIndex(savingsTrackRef.current!.scrollLeft > max / 2 ? 1 : 0)
  }

  const goToSavingsCard = (index: number) => {
    savingsTrackRef.current?.scrollTo({
      left: index === 0 ? 0 : savingsMaxScroll(),
      behavior: 'smooth',
    })
  }

  // Su mobile le due card scorrono in orizzontale invece di impilarsi: la
  // seconda sporge di poco sul bordo, che è quello che fa capire che c'è e si
  // può trascinare. Lo scatto le allinea una alla volta.
  const savingsCards = isMobile ? (
    <div>
      {/* La barra di scorrimento sparisce: dice dove sei con un dettaglio che
          qui non serve, e su una fila di due card è più rumore che aiuto.
          A dirlo restano i pallini, che sono anche il modo di spostarsi
          senza trascinare. */}
      <div
        ref={savingsTrackRef}
        onScroll={handleSavingsScroll}
        style={{ scrollbarWidth: 'none' }}
        // scroll-px-4 e non solo px-4: senza, l'aggancio ignora il margine e
        // porta la card a filo dello schermo. L'ultima si aggancia a destra,
        // perché a sinistra il suo punto cadrebbe oltre la fine della corsa e
        // lo scatto la rimanderebbe indietro ogni volta.
        className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 [&::-webkit-scrollbar]:hidden"
      >
        <div className="w-[86%] shrink-0 snap-start">{budgetCard}</div>
        <div className="w-[86%] shrink-0 snap-end">{savingsProgressCard}</div>
      </div>
      <div className="mt-2 flex justify-center gap-1.5">
        {['Budget disponibile', 'Risparmio'].map((label, i) => (
          <button
            key={label}
            type="button"
            aria-label={label}
            aria-current={savingsIndex === i}
            onClick={() => goToSavingsCard(i)}
            // Il bersaglio del dito è 20px, il pallino visibile 6: un pallino
            // grande abbastanza da premere sarebbe un pallino troppo grande.
            className="flex h-5 w-5 items-center justify-center"
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                savingsIndex === i ? 'bg-brand-700' : 'bg-slate-300 dark:bg-slate-600'
              }`}
            />
          </button>
        ))}
      </div>
    </div>
  ) : (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {savingsProgressCard}
      {budgetCard}
    </div>
  )

  const balanceChartCard = (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-chart-card dark:bg-black p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Andamento saldo</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Clicca un mese per vederne le spese per categoria
          </p>
        </div>
        {/* Su mobile due campi data uno accanto all'altro non ci stanno, e
            comunque per guardare un andamento si sceglie una durata, non due
            date: qui bastano quattro scorciatoie. Il desktop tiene i campi,
            dove servono per ritagliare un periodo preciso. */}
        {isMobile ? (
          <div className="flex gap-1.5 text-xs">
            {CHART_RANGES.map((range) => {
              const active = rangeStart === chartRangeStart(range.months)
              return (
                <button
                  key={range.label}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setRangeStart(chartRangeStart(range.months))
                    setRangeEnd(defaultRangeEnd())
                  }}
                  className={`rounded-full px-2.5 py-1 font-medium ${
                    active
                      ? 'bg-brand-700 text-white'
                      : 'bg-bar-track dark:bg-zinc-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {range.label}
                </button>
              )
            })}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs">
            <input
              type="date"
              value={rangeStart}
              onChange={(e) => setRangeStart(e.target.value)}
              className="rounded border border-slate-200 dark:border-slate-700 bg-chart-card dark:bg-black px-2 py-1 text-slate-600 dark:text-slate-300"
              aria-label="Data inizio"
            />
            <span className="text-slate-400">→</span>
            <input
              type="date"
              value={rangeEnd}
              onChange={(e) => setRangeEnd(e.target.value)}
              className="rounded border border-slate-200 dark:border-slate-700 bg-chart-card dark:bg-black px-2 py-1 text-slate-600 dark:text-slate-300"
              aria-label="Data fine"
            />
          </div>
        )}
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={chartData} onClick={handleChartClick} style={{ cursor: 'pointer' }}>
          <defs>
            <linearGradient id="balanceAreaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-chart-grad-start)" />
              <stop offset="100%" stopColor="var(--color-chart-grad-end)" />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-chart-grid)" />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} width={70} />
          <Tooltip formatter={(value) => currency.format(Number(value))} />
          {/* Segna il mese le cui spese sono mostrate nella card sotto. */}
          {selectedChartLabel && (
            <ReferenceLine x={selectedChartLabel} stroke="var(--color-brand-700)" strokeDasharray="4 3" />
          )}
          <Area
            type="monotone"
            dataKey="actual"
            name="Storico"
            stroke="var(--color-brand-700)"
            strokeWidth={2}
            fill="url(#balanceAreaGradient)"
            connectNulls={false}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="projected"
            name="Previsto"
            stroke="var(--color-brand-700)"
            strokeWidth={2}
            strokeDasharray="5 5"
            connectNulls={false}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )

  // Le tre cifre del periodo su mobile diventano una striscia sola: come card
  // separate erano tre righe intere per tre numeri che si leggono insieme.
  const periodCards = isMobile ? (
    <div className="flex divide-x divide-slate-200 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800 bg-brand-300 dark:bg-black">
      <div className="flex-1 px-2 py-3 text-center">
        <p className="text-xs text-slate-500 dark:text-slate-400">Entrate</p>
        <p className="text-sm font-semibold text-emerald-600">{currency.format(currentPeriodIncome)}</p>
      </div>
      <div className="flex-1 px-2 py-3 text-center">
        <p className="text-xs text-slate-500 dark:text-slate-400">Uscite</p>
        <p className="text-sm font-semibold text-red-600">{currency.format(currentPeriodExpense)}</p>
      </div>
      <div className="flex-1 px-2 py-3 text-center">
        <p className="text-xs text-slate-500 dark:text-slate-400">Netto</p>
        <p className="text-sm font-semibold dark:text-white">{currency.format(currentPeriodNet)}</p>
      </div>
    </div>
  ) : (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-brand-300 dark:bg-black p-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">Entrate (mese corrente)</p>
        <p className="text-xl font-semibold text-emerald-600">{currency.format(currentPeriodIncome)}</p>
      </div>
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-brand-300 dark:bg-black p-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">Uscite (mese corrente)</p>
        <p className="text-xl font-semibold text-red-600">{currency.format(currentPeriodExpense)}</p>
      </div>
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-brand-300 dark:bg-black p-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">Saldo netto (mese corrente)</p>
        <p className="text-xl font-semibold">{currency.format(currentPeriodNet)}</p>
      </div>
    </div>
  )

  const categoryCard = (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-brand-300 dark:bg-black p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Spese per categoria</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMonthCursor((c) => c - 1)}
            disabled={!canGoPrevMonth}
            className="rounded p-1 text-slate-500 dark:text-slate-400 hover:bg-slate-100 hover:dark:bg-zinc-800 disabled:opacity-30"
            aria-label="Mese precedente"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[7.5rem] text-center text-xs font-medium text-slate-600 dark:text-slate-300">
            {selectedBreakdownMonthKey ? monthLabelFull(selectedBreakdownMonthKey) : '-'}
            {selectedBreakdownIndex === currentMonthBreakdownIndex ? ' · corrente' : ''}
          </span>
          <button
            type="button"
            onClick={() => setMonthCursor((c) => c + 1)}
            disabled={!canGoNextMonth}
            className="rounded p-1 text-slate-500 dark:text-slate-400 hover:bg-slate-100 hover:dark:bg-zinc-800 disabled:opacity-30"
            aria-label="Mese successivo"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      {categoryBreakdown.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-500">Nessuna spesa registrata in questo mese.</p>
      ) : isMobile ? (
        // Su mobile la lista del desktop chiedeva troppa altezza per dire poco:
        // il grafico porta le proporzioni e i chip fanno da legenda toccabile.
        <MobileCategoryChart breakdown={categoryBreakdown} currency={currency} />
      ) : (
        <ul className="space-y-3">
          {categoryBreakdown.map((c) => {
            const Icon = getCategoryIcon(c.categoryIcon)
            const widthPct = maxCategoryAmount > 0 ? (c.amount / maxCategoryAmount) * 100 : 0
            const hasChildren = c.children.length > 0
            const expanded = expandedCategories.has(c.categoryId)
            const toggle = () =>
              setExpandedCategories((prev) => {
                const next = new Set(prev)
                if (next.has(c.categoryId)) next.delete(c.categoryId)
                else next.add(c.categoryId)
                return next
              })

            const row = (
              <>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    {hasChildren &&
                      (expanded ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
                      ))}
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                      style={{ backgroundColor: c.categoryColor ?? '#94a3b8' }}
                    >
                      <Icon className="h-3.5 w-3.5 text-white" />
                    </span>
                    <span className="truncate">{c.categoryName}</span>
                  </span>
                  <span className="shrink-0 font-bold">{currency.format(c.amount)}</span>
                </div>
                <div className="h-2 rounded-full bg-bar-track dark:bg-zinc-800">
                  <div
                    className="h-2 rounded-full"
                    style={{ width: `${widthPct}%`, backgroundColor: c.categoryColor ?? '#94a3b8' }}
                  />
                </div>
              </>
            )

            return (
              <li key={c.categoryId} className="text-sm">
                {hasChildren ? (
                  <button
                    type="button"
                    onClick={toggle}
                    aria-expanded={expanded}
                    className="w-full text-left"
                    title={expanded ? 'Nascondi le sottocategorie' : 'Mostra le sottocategorie'}
                  >
                    {row}
                  </button>
                ) : (
                  row
                )}
                {hasChildren && expanded && (
                  <ul className="mt-2 space-y-2 pl-6">
                    {c.children.map((child) => {
                      const ChildIcon = getCategoryIcon(child.categoryIcon)
                      // Stessa scala del padre, così le barre restano confrontabili.
                      const childWidthPct = maxCategoryAmount > 0 ? (child.amount / maxCategoryAmount) * 100 : 0
                      return (
                        <li key={child.categoryId} className="text-xs">
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="shrink-0 text-slate-300 dark:text-slate-600">└</span>
                              <span
                                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                                style={{ backgroundColor: child.categoryColor ?? '#94a3b8' }}
                              >
                                <ChildIcon className="h-3 w-3 text-white" />
                              </span>
                              <span className="truncate">{child.categoryName}</span>
                            </span>
                            <span className="shrink-0 font-medium">{currency.format(child.amount)}</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-bar-track dark:bg-zinc-800">
                            <div
                              className="h-1.5 rounded-full"
                              style={{
                                width: `${childWidthPct}%`,
                                backgroundColor: child.categoryColor ?? '#94a3b8',
                              }}
                            />
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )

  // Su mobile le prossime tre scadenze in fila, senza il raggruppamento per
  // mese: quello serve a capire quali mesi saranno pesanti, che è una domanda
  // da scrivania. Qui interessa cosa scade adesso, e il resto sta dietro a un
  // link invece che dietro a uno scroll che non si vede di avere.
  const nextReminders = (upcomingReminders?.months ?? [])
    .flatMap((m) => m.occurrences)
    .slice(0, 3)

  const remindersCard = isMobile ? (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-brand-300 dark:bg-black p-4">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Prossime scadenze</p>
        <Link to="/promemoria" className="shrink-0 text-xs text-brand-700 hover:underline">
          Vedi tutte
        </Link>
      </div>
      {nextReminders.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-500">Nessun promemoria configurato.</p>
      ) : (
        <ul className="space-y-2.5">
          {nextReminders.map((o, i) => {
            const badge = dayBadge(o.date)
            return (
              <li key={i} className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg bg-slate-800 dark:bg-zinc-800 text-white">
                    <span className="text-xs font-bold leading-none">{badge.day}</span>
                    <span className="text-[9px] leading-none">{badge.month}</span>
                  </div>
                  {/* truncate e non scroll: un nome lungo si taglia, invece di
                      allargare la riga oltre il bordo della card. */}
                  <span className="truncate text-sm font-medium">{o.name}</span>
                </div>
                {o.amount != null && (
                  <span
                    className="shrink-0 text-sm font-medium text-slate-500 dark:text-slate-400"
                    title={o.estimated ? "Stima dall'ultima spesa della categoria" : undefined}
                  >
                    {o.estimated && '~'}
                    {currency.format(o.amount)}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  ) : (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-brand-300 dark:bg-black p-4">
      <p className="mb-1 text-sm font-medium text-slate-600 dark:text-slate-300">Spese fisse nei prossimi mesi</p>
      <p className="mb-2 text-xs text-slate-400 dark:text-slate-500">
        L'importo (~ se stimato dall'ultima spesa della categoria) aiuta a capire quali mesi saranno più pesanti.
      </p>
      {!upcomingReminders || upcomingReminders.months.every((m) => m.occurrences.length === 0) ? (
        <p className="text-sm text-slate-400 dark:text-slate-500">Nessun promemoria configurato.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {upcomingReminders.months.map((m) => (
            <div key={m.yearMonth} className="rounded border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-zinc-900 p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-medium">{monthNameCapitalized(m.yearMonth)}</span>
                <span className="text-xs text-slate-400 dark:text-slate-500">{m.yearMonth.slice(0, 4)}</span>
              </div>
              {m.occurrences.length === 0 ? (
                <p className="text-xs text-slate-400 dark:text-slate-500">Nessuna scadenza</p>
              ) : (
                <ul className="space-y-2">
                  {m.occurrences.map((o, i) => {
                    const badge = dayBadge(o.date)
                    return (
                      <li key={i} className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg bg-slate-800 dark:bg-zinc-800 text-white">
                            <span className="text-xs font-bold leading-none">{badge.day}</span>
                            <span className="text-[9px] leading-none">{badge.month}</span>
                          </div>
                          <span className="truncate text-sm font-medium">{o.name}</span>
                        </div>
                        {o.amount != null && (
                          <span
                            className="shrink-0 text-sm font-medium text-slate-500 dark:text-slate-400"
                            title={o.estimated ? 'Stima dall\'ultima spesa della categoria' : undefined}
                          >
                            {o.estimated && '~'}
                            {currency.format(o.amount)}
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const upcomingRecurringCard = (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-brand-300 dark:bg-black p-4">
      <p className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-300">Prossime scadenze ricorrenti</p>
      {upcomingExpenses.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-500">Nessuna spesa ricorrente in scadenza.</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {upcomingExpenses.map((r) => {
            const Icon = getCategoryIcon(r.categoryIcon)
            return (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: r.categoryColor ?? '#94a3b8' }}
                  >
                    <Icon className="h-4 w-4 text-white" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold capitalize">{r.name}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">{fullDate(r.nextDueDate)}</p>
                  </div>
                </div>
                <span className="shrink-0 text-sm font-medium">{currency.format(r.defaultAmount)}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )

  const recentTransactionsCard = (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-brand-300 dark:bg-black p-4">
      <p className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-300">Ultime transazioni</p>
      {recentTransactions.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-500">Nessuna transazione ancora.</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {recentTransactions.slice(0, 8).map((t) => (
            <li key={t.id} className="flex items-center justify-between py-2 text-sm">
              <div>
                <p>{t.description || t.categoryName}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  {t.occurredOn} · {t.categoryName}
                </p>
              </div>
              <span className={t.type === 'INCOME' ? 'text-emerald-600' : 'text-red-600'}>
                {t.type === 'INCOME' ? '+' : '-'}
                {currency.format(t.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )

  return (
    <div className="space-y-6">
      {isMobile ? (
        <>
          {summaryCards}
          {savings.enabled && savingsCards}
          {categoryCard}
          {periodCards}
          {balanceChartCard}
          {remindersCard}
          {upcomingRecurringCard}
        </>
      ) : (
        <>
          {summaryCards}
          {savings.enabled && savingsCards}
          {balanceChartCard}
          {periodCards}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {categoryCard}
            {remindersCard}
          </div>
          {upcomingRecurringCard}
          {recentTransactionsCard}
        </>
      )}

      <button
        type="button"
        onClick={() => setQuickAddOpen(true)}
        aria-label="Nuova transazione"
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+72px)] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-brand-700 text-white shadow-lg hover:bg-brand-900 md:hidden"
      >
        <Plus className="h-6 w-6" />
      </button>

      {quickAddOpen && (
        <Modal title="Nuova transazione" onClose={closeQuickAdd}>
          <TransactionForm
            categories={categories}
            onSubmit={handleQuickAdd}
            onCreateCategory={handleCreateCategory}
            onCancel={closeQuickAdd}
          />
        </Modal>
      )}
    </div>
  )
}
