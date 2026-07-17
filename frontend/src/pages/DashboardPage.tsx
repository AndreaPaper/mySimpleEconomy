import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { checkpointsApi, forecastApi, recurringApi, remindersApi, transactionsApi } from '../api/endpoints'
import { getCategoryIcon } from '../constants/icons'
import type {
  BalanceCheckpoint,
  CategoryAmount,
  ForecastResponse,
  RecurringTransaction,
  Transaction,
  UpcomingRemindersResponse,
} from '../api/types'

const currency = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })
const monthLabelFormatter = new Intl.DateTimeFormat('it-IT', { month: 'short', year: '2-digit' })
const monthLabelFullFormatter = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' })

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
  const [forecast, setForecast] = useState<ForecastResponse | null>(null)
  const [checkpoints, setCheckpoints] = useState<BalanceCheckpoint[]>([])
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([])
  const [historicalTransactions, setHistoricalTransactions] = useState<Transaction[]>([])
  const [recurring, setRecurring] = useState<RecurringTransaction[]>([])
  const [upcomingReminders, setUpcomingReminders] = useState<UpcomingRemindersResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [monthCursor, setMonthCursor] = useState(0)

  useEffect(() => {
    const today = new Date()
    // Finestra ampia (2 anni) per lo storico: copre praticamente qualsiasi
    // utente senza dover sapere in anticipo da quando ha dati reali.
    const historyStart = new Date(today.getFullYear() - 2, today.getMonth(), 1)
    const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0)
    const iso = (d: Date) => d.toISOString().slice(0, 10)

    Promise.all([
      forecastApi.get(4),
      checkpointsApi.list(),
      transactionsApi.list(),
      transactionsApi.list({ from: iso(historyStart), to: iso(lastMonthEnd) }),
      recurringApi.list(),
      remindersApi.upcoming(6),
    ])
      .then(([forecastRes, checkpointsRes, recentRes, historicalRes, recurringRes, remindersRes]) => {
        setForecast(forecastRes)
        setCheckpoints(checkpointsRes)
        setRecentTransactions(recentRes)
        setHistoricalTransactions(historicalRes)
        setRecurring(recurringRes)
        setUpcomingReminders(remindersRes)
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="text-slate-500 dark:text-slate-400">Caricamento...</p>

  const latestCheckpoint = checkpoints[0] ?? null
  const currentMonth = forecast?.months[0] ?? null
  const futureMonths = forecast?.months.slice(1, 4) ?? []
  const currentBalance = latestCheckpoint?.balance ?? forecast?.startingBalance ?? 0

  const netByMonth = new Map<string, number>()
  for (const t of historicalTransactions) {
    const key = monthKey(t.occurredOn)
    const signed = t.type === 'INCOME' ? t.amount : -t.amount
    netByMonth.set(key, (netByMonth.get(key) ?? 0) + signed)
  }
  const historicalKeys = Array.from(netByMonth.keys()).sort()
  const totalHistoricalNet = historicalKeys.reduce((sum, k) => sum + (netByMonth.get(k) ?? 0), 0)

  let running = currentBalance - totalHistoricalNet
  const historicalPoints: ChartPoint[] = historicalKeys.map((key) => {
    running += netByMonth.get(key) ?? 0
    return { label: monthLabel(key), actual: running, projected: null }
  })

  const chartData: ChartPoint[] = [
    ...historicalPoints,
    { label: 'Ora', actual: currentBalance, projected: currentBalance },
    ...futureMonths.map((m) => ({ label: monthLabel(m.yearMonth), actual: null, projected: m.runningBalance })),
  ]

  const upcomingExpenses = recurring
    .filter((r) => r.active && r.categoryType === 'EXPENSE')
    .sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate))
    .slice(0, 5)

  // Mesi sfogliabili nella card "Spese per categoria": solo mesi con spesa
  // effettiva, cioè i mesi storici (aggregati qui dalle transazioni reali) e
  // il mese corrente (già effettivo, non proiettato, nel forecast). I mesi
  // futuri sono proiezioni statistiche, non spese avvenute, quindi non
  // vengono mostrati in questa card.
  const currentForecastMonth = forecast?.months[0] ?? null
  const breakdownMonthKeys = currentForecastMonth
    ? [...historicalKeys, currentForecastMonth.yearMonth]
    : historicalKeys
  const breakdownByMonth = new Map<string, CategoryAmount[]>()
  for (const key of historicalKeys) {
    breakdownByMonth.set(
      key,
      buildCategoryBreakdown(historicalTransactions.filter((t) => monthKey(t.occurredOn) === key)),
    )
  }
  if (currentForecastMonth) {
    breakdownByMonth.set(
      currentForecastMonth.yearMonth,
      currentForecastMonth.categoryBreakdown.filter((c) => c.type === 'EXPENSE').sort((a, b) => b.amount - a.amount),
    )
  }
  const currentMonthBreakdownIndex = historicalKeys.length
  const selectedBreakdownIndex = Math.min(
    Math.max(currentMonthBreakdownIndex + monthCursor, 0),
    breakdownMonthKeys.length - 1,
  )
  const selectedBreakdownMonthKey = breakdownMonthKeys[selectedBreakdownIndex]
  const categoryBreakdown = selectedBreakdownMonthKey ? breakdownByMonth.get(selectedBreakdownMonthKey) ?? [] : []
  const maxCategoryAmount = categoryBreakdown[0]?.amount ?? 0
  const canGoPrevMonth = selectedBreakdownIndex > 0
  const canGoNextMonth = selectedBreakdownIndex < breakdownMonthKeys.length - 1

  return (
    <div className="space-y-6">
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

      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-black p-4">
        <p className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-300">Andamento saldo</p>
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-black p-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">Entrate (mese corrente)</p>
          <p className="text-xl font-semibold text-emerald-600">
            {currentMonth ? currency.format(currentMonth.projectedIncome) : '-'}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-black p-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">Uscite (mese corrente)</p>
          <p className="text-xl font-semibold text-red-600">
            {currentMonth ? currency.format(currentMonth.projectedExpense) : '-'}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-black p-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">Saldo netto (mese corrente)</p>
          <p className="text-xl font-semibold">{currentMonth ? currency.format(currentMonth.netBalance) : '-'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-black p-4">
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
                      <span className="shrink-0 font-medium">{currency.format(c.amount)}</span>
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
                    <span className="text-sm font-medium">{monthLabelFull(m.yearMonth)}</span>
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600 dark:text-slate-300">
                      {m.occurrences.length}
                    </span>
                  </div>
                  {m.occurrences.length === 0 ? (
                    <p className="text-xs text-slate-400 dark:text-slate-500">Nessuna scadenza</p>
                  ) : (
                    <ul className="space-y-1">
                      {m.occurrences.map((o, i) => (
                        <li key={i} className="text-xs text-slate-600 dark:text-slate-300">
                          {o.date.slice(8, 10)} · {o.name}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-black p-4">
        <p className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-300">Prossime scadenze ricorrenti</p>
        {upcomingExpenses.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">Nessuna spesa ricorrente in scadenza.</p>
        ) : (
          <ul className="space-y-2">
            {upcomingExpenses.map((r) => (
              <li key={r.id} className="flex items-center justify-between text-sm">
                <span>
                  {r.name} <span className="text-slate-400 dark:text-slate-500">· {r.nextDueDate}</span>
                </span>
                <span className="font-medium">{currency.format(r.defaultAmount)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

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
    </div>
  )
}
