import { useEffect, useRef, useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'

interface DateRangePickerProps {
  from: string
  to: string
  onApply: (from: string, to: string) => void
}

const WEEKDAYS = ['Lu', 'Ma', 'Me', 'Gi', 'Ve', 'Sa', 'Do']
const shortFmt = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' })
const shortFmtWithYear = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })

const pad = (n: number) => String(n).padStart(2, '0')
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parseIso = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)
const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0)
const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1)

function formatRangeLabel(from: string, to: string): string {
  if (!from && !to) return 'Tutte le date'
  if (from && to) {
    const df = parseIso(from)
    const dt = parseIso(to)
    const sameYear = df.getFullYear() === dt.getFullYear()
    return `${shortFmt.format(df)} – ${sameYear ? shortFmt.format(dt) : shortFmtWithYear.format(dt)}${
      sameYear ? ' ' + dt.getFullYear() : ''
    }`
  }
  if (from) return `Dal ${shortFmtWithYear.format(parseIso(from))}`
  return `Fino al ${shortFmtWithYear.format(parseIso(to))}`
}

type CellState = 'none' | 'start' | 'end' | 'in' | 'empty'

function buildMonthCells(monthDate: Date, draftFrom: string, draftTo: string) {
  const year = monthDate.getFullYear()
  const month = monthDate.getMonth()
  const first = new Date(year, month, 1)
  const daysInMonth = endOfMonth(monthDate).getDate()
  // getDay() è 0=domenica..6=sabato; la settimana qui parte da lunedì.
  const offset = (first.getDay() + 6) % 7
  const cells: { key: string; label: string; iso: string | null; state: CellState }[] = []
  for (let i = 0; i < 42; i++) {
    const day = i - offset + 1
    if (day < 1 || day > daysInMonth) {
      cells.push({ key: `${year}-${month}-e${i}`, label: '', iso: null, state: 'empty' })
      continue
    }
    const iso = `${year}-${pad(month + 1)}-${pad(day)}`
    let state: CellState = 'none'
    if (draftFrom && draftTo && iso > draftFrom && iso < draftTo) state = 'in'
    if (draftFrom && iso === draftFrom) state = 'start'
    if (draftTo && iso === draftTo) state = state === 'start' ? 'start' : 'end'
    cells.push({ key: iso, label: String(day), iso, state })
  }
  return cells
}

// Le stesse quattro scorciatoie del canvas, più "Personalizzato" che non
// calcola niente: si accende da solo quando l'intervallo scelto a mano non
// coincide con nessuna delle quattro.
function computePresets(today: Date) {
  const thisMonthStart = isoOf(startOfMonth(today))
  const thisMonthEnd = isoOf(endOfMonth(today))
  const lastMonth = addMonths(today, -1)
  const lastMonthStart = isoOf(startOfMonth(lastMonth))
  const lastMonthEnd = isoOf(endOfMonth(lastMonth))
  const last30Start = isoOf(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29))
  const last30End = isoOf(today)
  const yearStart = `${today.getFullYear()}-01-01`
  const yearEnd = `${today.getFullYear()}-12-31`
  return [
    { label: 'Questo mese', from: thisMonthStart, to: thisMonthEnd },
    { label: 'Mese scorso', from: lastMonthStart, to: lastMonthEnd },
    { label: 'Ultimi 30 giorni', from: last30Start, to: last30End },
    { label: "Quest'anno", from: yearStart, to: yearEnd },
  ]
}

export default function DateRangePicker({ from, to, onApply }: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const [draftFrom, setDraftFrom] = useState(from)
  const [draftTo, setDraftTo] = useState(to)
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(to ? parseIso(to) : new Date()))
  const panelRef = useRef<HTMLDivElement>(null)

  const openPicker = () => {
    setDraftFrom(from)
    setDraftTo(to)
    setViewMonth(startOfMonth(to ? parseIso(to) : new Date()))
    setOpen(true)
  }

  // Click fuori dal pannello: annulla, come premere il pulsante omonimo.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const handleDayClick = (iso: string) => {
    if (!draftFrom || (draftFrom && draftTo)) {
      setDraftFrom(iso)
      setDraftTo('')
    } else if (iso < draftFrom) {
      setDraftFrom(iso)
      setDraftTo('')
    } else {
      setDraftTo(iso)
    }
  }

  const presets = computePresets(new Date())
  const activePreset = presets.find((p) => p.from === draftFrom && p.to === draftTo)

  const apply = () => {
    onApply(draftFrom, draftTo)
    setOpen(false)
  }

  const months = [addMonths(viewMonth, -1), viewMonth]
  const monthLabelFmt = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' })

  const cellClass = (state: CellState) => {
    if (state === 'empty') return ''
    if (state === 'start' || state === 'end') return 'bg-brand-700 text-white font-bold'
    if (state === 'in') return 'bg-brand-200/40 text-slate-900 dark:text-white'
    return 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-zinc-800'
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPicker())}
        className={`flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm ${
          from || to
            ? 'border-brand-700 bg-brand-200/30 text-brand-700 font-semibold'
            : 'border-slate-300 bg-brand-300 text-slate-600 dark:border-slate-700 dark:bg-black dark:text-slate-300'
        }`}
      >
        <Calendar className="h-3.5 w-3.5 shrink-0" />
        {formatRangeLabel(from, to)}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute left-0 top-[calc(100%+6px)] z-40 flex w-[560px] gap-5 rounded-2xl border border-slate-200 bg-brand-300 p-4 shadow-xl dark:border-slate-800 dark:bg-black"
        >
          <div className="flex w-[150px] shrink-0 flex-col gap-1 border-r border-slate-100 pr-4 dark:border-slate-800">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  setDraftFrom(p.from)
                  setDraftTo(p.to)
                  setViewMonth(startOfMonth(parseIso(p.to)))
                }}
                className={`rounded-lg px-3 py-2 text-left text-[13.5px] ${
                  activePreset?.label === p.label
                    ? 'bg-brand-700 font-bold text-white'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-zinc-800'
                }`}
              >
                {p.label}
              </button>
            ))}
            {/* Non calcola niente: si accende da solo scegliendo due giorni
                dal calendario che non coincidono con nessuna scorciatoia. */}
            <span
              className={`rounded-lg px-3 py-2 text-left text-[13.5px] ${
                !activePreset ? 'bg-brand-700 font-bold text-white' : 'text-slate-400 dark:text-slate-500'
              }`}
            >
              Personalizzato
            </span>
          </div>

          <div className="flex-1">
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setViewMonth((m) => addMonths(m, -1))}
                aria-label="Mese precedente"
                className="flex h-7 w-7 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-zinc-800"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMonth((m) => addMonths(m, 1))}
                aria-label="Mese successivo"
                className="flex h-7 w-7 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-zinc-800"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="flex gap-4">
              {months.map((m) => (
                <div key={m.toISOString()} className="flex-1">
                  <p className="mb-1.5 text-center text-[13px] font-bold capitalize text-slate-900 dark:text-white">
                    {monthLabelFmt.format(m)}
                  </p>
                  <div className="mb-1 grid grid-cols-7 gap-0.5">
                    {WEEKDAYS.map((w) => (
                      <span key={w} className="text-center text-[10.5px] font-bold text-slate-400 dark:text-slate-500">
                        {w}
                      </span>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-0.5">
                    {buildMonthCells(m, draftFrom, draftTo).map((cell) =>
                      cell.iso ? (
                        <button
                          key={cell.key}
                          type="button"
                          onClick={() => handleDayClick(cell.iso!)}
                          className={`flex h-7 items-center justify-center rounded text-xs ${cellClass(cell.state)}`}
                        >
                          {cell.label}
                        </button>
                      ) : (
                        <span key={cell.key} />
                      ),
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg px-3.5 py-2 text-sm text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-zinc-800"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={apply}
                className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-bold text-white hover:bg-brand-900"
              >
                Applica
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
