import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { TrendingDown, TrendingUp } from 'lucide-react'
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
import { useIsMobile } from '../hooks/useIsMobile'
import { periodKeyOf, periodRangeOf } from '../utils/period'
import { buildPeriodSavings } from '../utils/savings'

const currency = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })
// Senza simbolo: nelle righe del dettaglio l'euro comparirebbe quattro volte
// per riga, e la sottoriga è già la parte che si legge per ultima.
const plainAmount = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const monthLabelFormatter = new Intl.DateTimeFormat('it-IT', { month: 'short', year: '2-digit' })
const monthLabelFullFormatter = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' })

// Quanti periodi mostrare nello storico.
const PERIODS_SHOWN = 12

// Quante righe del dettaglio si vedono su telefono prima del pulsante: quattro
// riempiono lo schermo senza che la pagina diventi un elenco lungo dodici.
const MOBILE_PERIOD_ROWS = 4

// L'anello della card grande: raggio e spessore vengono dal mockup.
const RING_SIZE = 148
const RING_RADIUS = 62
const RING_LENGTH = 2 * Math.PI * RING_RADIUS

function labelOf(periodKey: string, formatter: Intl.DateTimeFormat): string {
  const [year, month] = periodKey.split('-').map(Number)
  return formatter.format(new Date(year, month - 1, 1))
}

export default function SavingsPage() {
  const { salaryDay, savings } = useAuth()
  const isMobile = useIsMobile()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [allPeriodsShown, setAllPeriodsShown] = useState(false)

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

  // L'anello si riempie fino all'obiettivo. Senza obiettivo impostato resta la
  // sola traccia: un anello pieno direbbe "fatto" di un traguardo che non c'è.
  const ringPct = currentRatio === null ? 0 : Math.min(Math.max(currentRatio, 0), 1)
  const savedColor = current.saved < 0 ? '#dc2626' : '#2FA36B'

  // Su telefono il numero del periodo prende una card sua, grande al centro, e
  // le altre due cifre scendono sotto affiancate: erano tre card impilate,
  // uguali fra loro, e la prima — l'unica che si guarda davvero — non si
  // distingueva dalle altre due.
  const summaryBlock = isMobile ? (
    <div className="space-y-3">
      <div className="flex flex-col items-center rounded-[20px] border border-slate-200 bg-brand-300 px-4 py-5 dark:border-slate-800 dark:bg-black">
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">Questo periodo</p>
        <div className="relative" style={{ width: RING_SIZE, height: RING_SIZE }}>
          <svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} className="-rotate-90">
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              fill="none"
              stroke="rgba(148,163,184,.25)"
              strokeWidth="12"
            />
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              fill="none"
              stroke={savedColor}
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={RING_LENGTH}
              strokeDashoffset={RING_LENGTH * (1 - ringPct)}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {/* 21px e non i 25 del mockup: lì l'importo di esempio è "312,40 €",
                mentre a quattro cifre il numero misura 117px contro i 112
                liberi dentro l'anello, e va a toccarlo. */}
            <span className="text-[21px] font-bold leading-tight" style={{ color: savedColor }}>
              {currency.format(current.saved)}
            </span>
            <span className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">risparmiati</span>
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
          {currentRatio !== null
            ? `${Math.round(currentRatio * 100)}% di ${currency.format(currentTarget)} obiettivo`
            : 'Nessun obiettivo impostato'}
        </p>
      </div>
      <div className="flex gap-2.5">
        <div className="flex-1 rounded-[14px] border border-slate-200 bg-brand-300 p-3 dark:border-slate-800 dark:bg-black">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">Media periodi</p>
          <p className="mt-0.5 text-[17px] font-semibold text-slate-900 dark:text-white">
            {currency.format(averageSaved)}
          </p>
        </div>
        <div className="flex-1 rounded-[14px] border border-slate-200 bg-brand-300 p-3 dark:border-slate-800 dark:bg-black">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {periods.length === 1 ? 'Totale periodo' : `Totale ${periods.length} periodi`}
          </p>
          <p
            className={`mt-0.5 text-[17px] font-semibold ${totalSaved < 0 ? 'text-red-600' : 'text-slate-900 dark:text-white'}`}
          >
            {currency.format(totalSaved)}
          </p>
        </div>
      </div>
    </div>
  ) : (
    // Tre card colorate invece di tre riquadri uguali: il colore dice a
    // colpo d'occhio che "Questo periodo" è il numero protagonista, "Media"
    // un confronto, "Totale" una somma — non serve leggere l'etichetta prima.
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className="rounded-2xl bg-emerald-50 p-4 dark:bg-emerald-950/30">
        <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Questo periodo</p>
        <p className={`mt-1.5 text-2xl font-bold ${current.saved < 0 ? 'text-red-600' : 'text-emerald-700 dark:text-emerald-400'}`}>
          {currency.format(current.saved)}
        </p>
        {currentRatio !== null && (
          <p className="mt-0.5 text-xs text-emerald-700/70 dark:text-emerald-400/70">
            {Math.round(currentRatio * 100)}% di {currency.format(currentTarget)} obiettivo
          </p>
        )}
      </div>
      {/* Tailwind non ha una tinta "sky-70": la scala salta da 50 a 100.
          Questo è un colore a metà strada scritto a mano, un filo più chiaro
          di sky-100 — lo sfondo pagina di default è #F5FAFF, troppo vicino a
          sky-50 (#F0F9FF) perché la card si vedesse. */}
      <div className="rounded-2xl bg-[#e8f5ff] p-4 dark:bg-sky-950/35">
        <p className="text-xs font-medium text-sky-700 dark:text-sky-400">Media periodi conclusi</p>
        <p className="mt-1.5 text-2xl font-bold text-slate-900 dark:text-white">{currency.format(averageSaved)}</p>
      </div>
      <div className="rounded-2xl bg-amber-50 p-4 dark:bg-amber-950/30">
        <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
          Totale {periods.length === 1 ? 'del periodo' : `degli ultimi ${periods.length} periodi`}
        </p>
        <p className={`mt-1.5 text-2xl font-bold ${totalSaved < 0 ? 'text-red-600' : 'text-slate-900 dark:text-white'}`}>
          {currency.format(totalSaved)}
        </p>
      </div>
    </div>
  )

  // Su telefono il grafico tiene il solo risparmio: entrate e uscite servono a
  // spiegare *perché* si muove, ma tre serie in 110px di altezza diventano un
  // groviglio, e il perché di ogni periodo sta scritto nelle righe più sotto.
  const chartCard = isMobile ? (
    <div className="rounded-2xl border border-slate-200 bg-brand-300 p-3.5 dark:border-slate-800 dark:bg-black">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Andamento</p>
        <span className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
          <span className="h-1.5 w-1.5 rounded-full bg-[#2FA36B]" />
          Risparmiato
        </span>
      </div>
      <ResponsiveContainer width="100%" height={110}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id="savingsAreaMobile" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2FA36B" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#2FA36B" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="label" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <Tooltip formatter={(value) => currency.format(Number(value))} />
          <ReferenceLine y={0} stroke="#94a3b8" />
          <Area
            type="monotone"
            dataKey="saved"
            name="Risparmiato"
            stroke="#2FA36B"
            strokeWidth={2}
            fill="url(#savingsAreaMobile)"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  ) : (
    <div className="rounded-2xl bg-brand-300 p-5 dark:bg-black">
      <p className="mb-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
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
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-chart-grid)" />
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
  )

  const newestFirst = [...periods].reverse()
  const visiblePeriods = isMobile && !allPeriodsShown ? newestFirst.slice(0, MOBILE_PERIOD_ROWS) : newestFirst

  // Su telefono il titolo esce dalla card e ogni riga prende una barra colorata
  // a sinistra: dice il segno del periodo prima ancora di leggere la cifra, e
  // rende la lista scorribile con l'occhio invece che riga per riga.
  const periodsBlock = isMobile ? (
    <div>
      <p className="mb-1.5 text-sm font-semibold text-slate-600 dark:text-slate-300">Dettaglio per periodo</p>
      <ul className="divide-y divide-slate-200 overflow-hidden rounded-[14px] border border-slate-200 bg-brand-300 dark:divide-slate-800 dark:border-slate-800 dark:bg-black">
        {visiblePeriods.map((p) => (
          <li key={p.periodKey} className="flex items-center gap-2.5 px-3.5 py-3">
            <span
              className="h-8 w-1 shrink-0 rounded-sm"
              style={{ backgroundColor: p.saved < 0 ? '#dc2626' : '#2FA36B' }}
            />
            <div className="min-w-0 flex-1">
              {/* capitalize sul solo mese: sull'intera riga toccherebbe anche
                  il marcatore, che diventerebbe "In Corso". */}
              <p className="truncate text-sm font-medium">
                <span className="capitalize">{labelOf(p.periodKey, monthLabelFullFormatter)}</span>
                {p.periodKey === currentPeriodKey && (
                  <span className="ml-1 text-[11px] font-normal text-slate-400 dark:text-slate-500">· in corso</span>
                )}
              </p>
              <p className="truncate text-[11px] text-slate-400 dark:text-slate-500">
                {plainAmount.format(p.income)} entrate · {plainAmount.format(p.expenses)} uscite
              </p>
            </div>
            <span
              className={`shrink-0 text-[15px] font-bold ${p.saved < 0 ? 'text-red-600' : 'text-emerald-600'}`}
            >
              {p.saved > 0 ? '+' : ''}
              {currency.format(p.saved)}
            </span>
          </li>
        ))}
      </ul>
      {!allPeriodsShown && newestFirst.length > MOBILE_PERIOD_ROWS && (
        <button
          type="button"
          onClick={() => setAllPeriodsShown(true)}
          className="mt-2.5 min-h-[44px] w-full rounded-xl border border-slate-200 bg-brand-300 text-sm font-semibold text-brand-700 dark:border-slate-800 dark:bg-black"
        >
          Mostra tutti i periodi
        </button>
      )}
    </div>
  ) : (
    <div className="rounded-2xl bg-brand-300 p-4 dark:bg-black">
      <p className="mb-1 px-2 text-sm font-semibold text-slate-600 dark:text-slate-300">Dettaglio per periodo</p>
      <ul>
        {newestFirst.map((p) => {
          const positive = p.saved >= 0
          return (
            <li
              key={p.periodKey}
              className="flex items-center gap-3 rounded-2xl px-2 py-2.5 text-sm hover:bg-brand-100 dark:hover:bg-zinc-900"
            >
              {/* La stessa icona su/giù che il grafico non può dare a colpo
                  d'occhio riga per riga: qui basta guardare il cerchio,
                  prima ancora di leggere la cifra. */}
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                  positive
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
                    : 'bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400'
                }`}
              >
                {positive ? <TrendingUp className="h-[18px] w-[18px]" /> : <TrendingDown className="h-[18px] w-[18px]" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  <span className="capitalize">{labelOf(p.periodKey, monthLabelFullFormatter)}</span>
                  {p.periodKey === currentPeriodKey && (
                    <span className="ml-2 text-xs font-normal text-slate-400 dark:text-slate-500">· in corso</span>
                  )}
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  {currency.format(p.income)} entrate · {currency.format(p.expenses)} uscite
                </p>
              </div>
              <span className={`shrink-0 font-bold ${positive ? 'text-emerald-600' : 'text-red-600'}`}>
                {positive ? '+' : ''}
                {currency.format(p.saved)}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )

  return (
    <div className={isMobile ? 'space-y-3.5' : 'space-y-6'}>
      <div>
        <h1 className={isMobile ? 'text-xl font-bold' : 'text-lg font-semibold'}>Risparmio</h1>
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

      {summaryBlock}

      {chartCard}

      {periodsBlock}
    </div>
  )
}
