import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { categoriesApi, checkpointsApi, forecastApi, recurringApi, remindersApi, transactionsApi } from '../api/endpoints'
import { getCategoryIcon } from '../constants/icons'
import { DashboardPageSkeleton } from '../components/Skeleton'
import Modal from '../components/Modal'
import TransactionForm from '../components/TransactionForm'
import { useAuth } from '../context/AuthContext'
import { useOfflineSync } from '../context/OfflineSyncContext'
import { useIsMobile } from '../hooks/useIsMobile'
import { cacheCategories, loadCachedCategories } from '../offline/categoriesCache'
import { periodKeyOf, periodRangeOf } from '../utils/period'
import type {
  BalanceCheckpoint,
  Category,
  CategoryAmount,
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
function buildCategoryBreakdown(transactions: Transaction[]): CategoryAmount[] {
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
  return Array.from(byCategory.values()).sort((a, b) => b.amount - a.amount)
}

export default function DashboardPage() {
  const { salaryDay } = useAuth()
  const { isOnline, backendReachable, addOfflineTransaction } = useOfflineSync()
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
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [rangeStart, setRangeStart] = useState(defaultRangeStart())
  const [rangeEnd, setRangeEnd] = useState(defaultRangeEnd())

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

    return Promise.all([
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
      setForecast(forecastRes)
      setCheckpoints(checkpointsRes)
      setRecentTransactions(recentRes.content)
      setHistoricalTransactions(historicalRes.content)
      setRecurring(recurringRes)
      setUpcomingReminders(remindersRes)
    })
  }

  useEffect(() => {
    reload().finally(() => setLoading(false))
  }, [salaryDay, rangeStart, rangeEnd])

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
    reload()
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
  const currentBalance = latestCheckpoint?.balance ?? forecast?.startingBalance ?? 0

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
      return { key, label: monthLabel(key), actual: running, projected: null }
    })
    .filter((p) => p.key >= startMonthKey && p.key <= endMonthKey)

  const chartData: ChartPoint[] = [
    ...historicalPoints,
    { label: 'Ora', actual: currentBalance, projected: currentBalance },
    ...futureMonths.map((m) => ({ label: monthLabel(m.yearMonth), actual: null, projected: m.runningBalance })),
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

  const breakdownByMonth = new Map<string, CategoryAmount[]>()
  for (const key of breakdownMonthKeys) {
    breakdownByMonth.set(
      key,
      buildCategoryBreakdown(historicalTransactions.filter((t) => periodKeyOf(t.occurredOn, salaryDay) === key)),
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

  const summaryCards = (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-black p-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">Saldo attuale{latestCheckpoint ? ` (${latestCheckpoint.checkpointDate})` : ''}</p>
        <p className="text-2xl font-semibold">{currency.format(currentBalance)}</p>
      </div>
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-black p-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">Saldo previsto a fine mese</p>
        <p className="text-2xl font-semibold">
          {currentMonth ? currency.format(currentMonth.runningBalance) : '-'}
        </p>
      </div>
    </div>
  )

  const balanceChartCard = (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-black p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Andamento saldo</p>
        <div className="flex items-center gap-2 text-xs">
          <input
            type="date"
            value={rangeStart}
            onChange={(e) => setRangeStart(e.target.value)}
            className="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-black px-2 py-1 text-slate-600 dark:text-slate-300"
            aria-label="Data inizio"
          />
          <span className="text-slate-400">→</span>
          <input
            type="date"
            value={rangeEnd}
            onChange={(e) => setRangeEnd(e.target.value)}
            className="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-black px-2 py-1 text-slate-600 dark:text-slate-300"
            aria-label="Data fine"
          />
        </div>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} width={70} />
          <Tooltip formatter={(value) => currency.format(Number(value))} />
          <Line type="monotone" dataKey="actual" name="Storico" stroke="#16a34a" strokeWidth={2} connectNulls={false} dot={false} />
          <Line
            type="monotone"
            dataKey="projected"
            name="Previsto"
            stroke="#16a34a"
            strokeWidth={2}
            strokeDasharray="5 5"
            connectNulls={false}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )

  const periodCards = (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-black p-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">Entrate (mese corrente)</p>
        <p className="text-xl font-semibold text-emerald-600">{currency.format(currentPeriodIncome)}</p>
      </div>
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-black p-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">Uscite (mese corrente)</p>
        <p className="text-xl font-semibold text-red-600">{currency.format(currentPeriodExpense)}</p>
      </div>
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-black p-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">Saldo netto (mese corrente)</p>
        <p className="text-xl font-semibold">{currency.format(currentPeriodNet)}</p>
      </div>
    </div>
  )

  const categoryCard = (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-black p-4">
      {isMobile && categoryBreakdown.length > 0 && (
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={categoryBreakdown}
              dataKey="amount"
              nameKey="categoryName"
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={2}
            >
              {categoryBreakdown.map((c) => (
                <Cell key={c.categoryId} fill={c.categoryColor ?? '#94a3b8'} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => currency.format(Number(value))} />
          </PieChart>
        </ResponsiveContainer>
      )}
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
      ) : (
        <ul className="space-y-3">
          {categoryBreakdown.map((c) => {
            const Icon = getCategoryIcon(c.categoryIcon)
            const widthPct = maxCategoryAmount > 0 ? (c.amount / maxCategoryAmount) * 100 : 0
            return (
              <li key={c.categoryId} className="text-sm">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
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
                <div className="h-2 rounded-full bg-slate-100 dark:bg-zinc-800">
                  <div
                    className="h-2 rounded-full"
                    style={{ width: `${widthPct}%`, backgroundColor: c.categoryColor ?? '#94a3b8' }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )

  const remindersCard = (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-black p-4">
      <p className="mb-1 text-sm font-medium text-slate-600 dark:text-slate-300">Spese fisse nei prossimi mesi</p>
      <p className="mb-2 text-xs text-slate-400 dark:text-slate-500">
        Promemoria senza importo: utile per capire quali mesi avranno più scadenze.
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
                          <span className="shrink-0 text-sm font-medium text-slate-500 dark:text-slate-400">
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
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-black p-4">
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
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-black p-4">
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
          {categoryCard}
          {periodCards}
          {balanceChartCard}
          {remindersCard}
          {upcomingRecurringCard}
        </>
      ) : (
        <>
          {summaryCards}
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
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+72px)] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-green-600 text-white shadow-lg hover:bg-green-700 md:hidden"
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
