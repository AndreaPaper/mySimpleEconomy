import { useEffect, useState } from 'react'
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
import type {
  BalanceCheckpoint,
  ForecastResponse,
  RecurringTransaction,
  Transaction,
  UpcomingRemindersResponse,
} from '../api/types'

const currency = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })
const monthLabelFormatter = new Intl.DateTimeFormat('it-IT', { month: 'short', year: '2-digit' })

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

export default function DashboardPage() {
  const [forecast, setForecast] = useState<ForecastResponse | null>(null)
  const [checkpoints, setCheckpoints] = useState<BalanceCheckpoint[]>([])
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([])
  const [historicalTransactions, setHistoricalTransactions] = useState<Transaction[]>([])
  const [recurring, setRecurring] = useState<RecurringTransaction[]>([])
  const [upcomingReminders, setUpcomingReminders] = useState<UpcomingRemindersResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const today = new Date()
    const threeMonthsAgoStart = new Date(today.getFullYear(), today.getMonth() - 3, 1)
    const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0)
    const iso = (d: Date) => d.toISOString().slice(0, 10)

    Promise.all([
      forecastApi.get(4),
      checkpointsApi.list(),
      transactionsApi.list(),
      transactionsApi.list({ from: iso(threeMonthsAgoStart), to: iso(lastMonthEnd) }),
      recurringApi.list(),
      remindersApi.upcoming(4),
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

  if (loading) return <p className="text-slate-500">Caricamento...</p>

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

  const categoryBreakdown = (currentMonth?.categoryBreakdown ?? [])
    .filter((c) => c.type === 'EXPENSE')
    .sort((a, b) => b.amount - a.amount)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Saldo attuale{latestCheckpoint ? ` (${latestCheckpoint.checkpointDate})` : ''}</p>
          <p className="text-2xl font-semibold">{currency.format(currentBalance)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Saldo previsto a fine mese</p>
          <p className="text-2xl font-semibold">
            {currentMonth ? currency.format(currentMonth.runningBalance) : '-'}
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="mb-2 text-sm font-medium text-slate-600">Andamento saldo</p>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} width={70} />
            <Tooltip formatter={(value) => currency.format(Number(value))} />
            <Line type="monotone" dataKey="actual" name="Storico" stroke="#4f46e5" strokeWidth={2} connectNulls={false} dot={false} />
            <Line
              type="monotone"
              dataKey="projected"
              name="Previsto"
              stroke="#4f46e5"
              strokeWidth={2}
              strokeDasharray="5 5"
              connectNulls={false}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Entrate (mese corrente)</p>
          <p className="text-xl font-semibold text-emerald-600">
            {currentMonth ? currency.format(currentMonth.projectedIncome) : '-'}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Uscite (mese corrente)</p>
          <p className="text-xl font-semibold text-red-600">
            {currentMonth ? currency.format(currentMonth.projectedExpense) : '-'}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Saldo netto (mese corrente)</p>
          <p className="text-xl font-semibold">{currentMonth ? currency.format(currentMonth.netBalance) : '-'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="mb-2 text-sm font-medium text-slate-600">Spese per categoria (mese corrente)</p>
          {categoryBreakdown.length === 0 ? (
            <p className="text-sm text-slate-400">Nessuna spesa registrata questo mese.</p>
          ) : (
            <ul className="space-y-2">
              {categoryBreakdown.map((c) => (
                <li key={c.categoryId} className="flex items-center justify-between text-sm">
                  <span>{c.categoryName}</span>
                  <span className="font-medium">{currency.format(c.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="mb-2 text-sm font-medium text-slate-600">Prossime scadenze ricorrenti</p>
          {upcomingExpenses.length === 0 ? (
            <p className="text-sm text-slate-400">Nessuna spesa ricorrente in scadenza.</p>
          ) : (
            <ul className="space-y-2">
              {upcomingExpenses.map((r) => (
                <li key={r.id} className="flex items-center justify-between text-sm">
                  <span>
                    {r.name} <span className="text-slate-400">· {r.nextDueDate}</span>
                  </span>
                  <span className="font-medium">{currency.format(r.defaultAmount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="mb-1 text-sm font-medium text-slate-600">Spese fisse nei prossimi mesi</p>
        <p className="mb-2 text-xs text-slate-400">
          Promemoria senza importo: utile per capire quali mesi avranno più scadenze.
        </p>
        {!upcomingReminders || upcomingReminders.months.every((m) => m.occurrences.length === 0) ? (
          <p className="text-sm text-slate-400">Nessun promemoria configurato.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {upcomingReminders.months.map((m) => (
              <div key={m.yearMonth} className="rounded border border-slate-100 bg-slate-50 p-3">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm font-medium">{monthLabel(m.yearMonth)}</span>
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">
                    {m.occurrences.length}
                  </span>
                </div>
                {m.occurrences.length === 0 ? (
                  <p className="text-xs text-slate-400">Nessuna scadenza</p>
                ) : (
                  <ul className="space-y-1">
                    {m.occurrences.map((o, i) => (
                      <li key={i} className="text-xs text-slate-600">
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

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="mb-2 text-sm font-medium text-slate-600">Ultime transazioni</p>
        {recentTransactions.length === 0 ? (
          <p className="text-sm text-slate-400">Nessuna transazione ancora.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {recentTransactions.slice(0, 8).map((t) => (
              <li key={t.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <p>{t.description || t.categoryName}</p>
                  <p className="text-xs text-slate-400">
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
