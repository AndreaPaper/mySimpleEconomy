import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { transactionsApi } from '../api/endpoints'
import type { Transaction } from '../api/types'
import { ListPageSkeleton } from '../components/Skeleton'
import { useAuth } from '../context/AuthContext'
import { periodKeyOf, periodRangeOf } from '../utils/period'
import { buildPeriodSavings } from '../utils/savings'

const currency = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })
const monthLabelFormatter = new Intl.DateTimeFormat('it-IT', { month: 'short', year: '2-digit' })
const monthLabelFullFormatter = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' })

// Quanti periodi mostrare nello storico.
const PERIODS_SHOWN = 12

function labelOf(periodKey: string, formatter: Intl.DateTimeFormat): string {
  const [year, month] = periodKey.split('-').map(Number)
  return formatter.format(new Date(year, month - 1, 1))
}

export default function SavingsPage() {
  const { salaryDay, savings } = useAuth()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

  const todayStr = new Date().toISOString().slice(0, 10)
  const currentPeriodKey = periodKeyOf(todayStr, salaryDay)

  // Le ultime PERIODS_SHOWN chiavi di periodo fino a quella corrente inclusa.
  const periodKeys: string[] = []
  {
    const [y, m] = currentPeriodKey.split('-').map(Number)
    for (let i = PERIODS_SHOWN - 1; i >= 0; i--) {
      const d = new Date(y, m - 1 - i, 1)
      periodKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
  }

  useEffect(() => {
    // Si scarica l'intervallo coperto dai periodi mostrati: il primo giorno del
    // periodo più vecchio, l'ultimo di quello corrente.
    const from = periodRangeOf(periodKeys[0], salaryDay).start
    const to = periodRangeOf(currentPeriodKey, salaryDay).end
    transactionsApi
      .list({ from, to })
      .then((res) => setTransactions(res.content))
      .catch(() => setTransactions([]))
      .finally(() => setLoading(false))
  }, [salaryDay])

  if (loading) return <ListPageSkeleton />

  const allPeriods = buildPeriodSavings(transactions, (d) => periodKeyOf(d, salaryDay), periodKeys)
  // I periodi che precedono la prima transazione non sono mesi in cui non si è
  // risparmiato: sono mesi in cui l'app non era in uso. Contarli abbasserebbe
  // la media e riempirebbe il grafico di zeri fuorvianti.
  const firstActive = allPeriods.findIndex((p) => p.income !== 0 || p.expenses !== 0)
  const periods = firstActive === -1 ? allPeriods.slice(-1) : allPeriods.slice(firstActive)

  const current = periods[periods.length - 1]
  const closed = periods.slice(0, -1)

  const totalSaved = periods.reduce((sum, p) => sum + p.saved, 0)
  // Media sui soli periodi conclusi: quello in corso non è confrontabile,
  // perché è ancora a metà strada.
  const averageSaved = closed.length > 0 ? closed.reduce((sum, p) => sum + p.saved, 0) / closed.length : 0

  const targetPercent = savings.savingsPercent ?? 0
  const currentTarget = (current.income * targetPercent) / 100
  const currentRatio = currentTarget > 0 ? current.saved / currentTarget : null

  const round = (n: number) => Math.round(n * 100) / 100
  const chartData = periods.map((p) => ({
    label: labelOf(p.periodKey, monthLabelFormatter),
    saved: round(p.saved),
    income: round(p.income),
    expenses: round(p.expenses),
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Risparmio</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Si calcola da solo: per ogni periodo è quello che resta tra entrate e uscite registrate. Non c'è nulla da
          accantonare a mano.
          {!savings.enabled && (
            <>
              {' '}
              L'obiettivo di risparmio è disattivato: puoi impostarlo nel{' '}
              <Link to="/profilo" className="text-brand-700 hover:underline">
                Profilo
              </Link>
              .
            </>
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-brand-300 p-4 dark:border-slate-800 dark:bg-black">
          <p className="text-sm text-slate-500">Questo periodo</p>
          <p className={`text-2xl font-semibold ${current.saved < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
            {currency.format(current.saved)}
          </p>
          {currentRatio !== null && (
            <p className="mt-0.5 text-xs text-slate-500">
              {Math.round(currentRatio * 100)}% di {currency.format(currentTarget)} obiettivo
            </p>
          )}
        </div>
        <div className="rounded-lg border border-slate-200 bg-brand-300 p-4 dark:border-slate-800 dark:bg-black">
          <p className="text-sm text-slate-500">Media dei periodi conclusi</p>
          <p className="text-2xl font-semibold text-slate-900 dark:text-white">{currency.format(averageSaved)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-brand-300 p-4 dark:border-slate-800 dark:bg-black">
          <p className="text-sm text-slate-500">
            Totale {periods.length === 1 ? 'del periodo' : `degli ultimi ${periods.length} periodi`}
          </p>
          <p className={`text-2xl font-semibold ${totalSaved < 0 ? 'text-red-600' : 'text-slate-900 dark:text-white'}`}>
            {currency.format(totalSaved)}
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-brand-300 p-4 dark:border-slate-800 dark:bg-black">
        <p className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-300">
          Andamento · risparmio, entrate e uscite per periodo
        </p>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={chartData}>
            <defs>
              <linearGradient id="savingsArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2FA36B" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#2FA36B" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} width={70} />
            <Tooltip formatter={(value) => currency.format(Number(value))} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {/* Lo zero va reso esplicito: sotto questa linea si è intaccato il risparmio. */}
            <ReferenceLine y={0} stroke="#94a3b8" />
            {/* Entrate e uscite spiegano *perché* il risparmio si muove, ma
                restano linee sottili: il protagonista è l'area del risparmio. */}
            <Line type="monotone" dataKey="income" name="Entrate" stroke="#1C8ADB" strokeWidth={1.5} dot={false} />
            <Line type="monotone" dataKey="expenses" name="Uscite" stroke="#D6455B" strokeWidth={1.5} dot={false} />
            <Area
              type="monotone"
              dataKey="saved"
              name="Risparmiato"
              stroke="#2FA36B"
              strokeWidth={2.5}
              fill="url(#savingsArea)"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-lg border border-slate-200 bg-brand-300 p-4 dark:border-slate-800 dark:bg-black">
        <p className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-300">Dettaglio per periodo</p>
        <ul className="divide-y divide-slate-200 dark:divide-slate-800">
          {[...periods].reverse().map((p) => (
            <li key={p.periodKey} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="truncate">
                  {labelOf(p.periodKey, monthLabelFullFormatter)}
                  {p.periodKey === currentPeriodKey && (
                    <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">in corso</span>
                  )}
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  {currency.format(p.income)} entrate · {currency.format(p.expenses)} uscite
                </p>
              </div>
              <span className={`shrink-0 font-semibold ${p.saved < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {p.saved > 0 ? '+' : ''}
                {currency.format(p.saved)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
