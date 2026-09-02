import { useMemo, useState } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'
import type { PieLabelRenderProps } from 'recharts'
import type { CategoryAmount, CategoryAmountNode } from '../api/types'
import { categoryData, categoryInk, readableOn } from '../constants/colors'
import { getCategoryIcon } from '../constants/icons'

// Sotto questa quota una fetta è troppo sottile perché il donut resti leggibile:
// le minori confluiscono in "Altro", che resta selezionabile per vedere cosa
// contiene invece di sparire.
const MINOR_SHARE = 0.05

// Sotto questa quota non c'è spazio per scrivere il numero dentro la fetta.
const LABEL_MIN_SHARE = 0.08

const OTHER_ID = '__altro__'
const OTHER_COLOR = '#94a3b8'

interface MobileCategoryChartProps {
  breakdown: CategoryAmountNode[]
  currency: Intl.NumberFormat
}

interface Slice {
  categoryId: string
  categoryName: string
  categoryColor: string
  categoryIcon: string | null
  amount: number
  children: CategoryAmount[]
}

export default function MobileCategoryChart({ breakdown, currency }: MobileCategoryChartProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { slices, total } = useMemo(() => {
    const sum = breakdown.reduce((acc, c) => acc + c.amount, 0)
    const major: Slice[] = []
    const minor: CategoryAmountNode[] = []

    for (const c of breakdown) {
      const slice: Slice = {
        categoryId: c.categoryId,
        categoryName: c.categoryName,
        categoryColor: c.categoryColor ?? OTHER_COLOR,
        categoryIcon: c.categoryIcon,
        amount: c.amount,
        children: c.children,
      }
      if (sum > 0 && c.amount / sum < MINOR_SHARE) minor.push(c)
      else major.push(slice)
    }

    // Una sola categoria minore non guadagna niente a chiamarsi "Altro".
    if (minor.length === 1) {
      const only = minor[0]
      major.push({
        categoryId: only.categoryId,
        categoryName: only.categoryName,
        categoryColor: only.categoryColor ?? OTHER_COLOR,
        categoryIcon: only.categoryIcon,
        amount: only.amount,
        children: only.children,
      })
    } else if (minor.length > 1) {
      major.push({
        categoryId: OTHER_ID,
        categoryName: 'Altro',
        categoryColor: OTHER_COLOR,
        categoryIcon: null,
        amount: minor.reduce((acc, c) => acc + c.amount, 0),
        children: minor,
      })
    }

    return { slices: major, total: sum }
  }, [breakdown])

  if (slices.length === 0) return null

  // Senza selezione il centro mostra il totale: è il numero che serve più
  // spesso, e la card non parte con una categoria scelta a caso.
  const selected = slices.find((s) => s.categoryId === selectedId) ?? null
  const share = (amount: number) => (total > 0 ? amount / total : 0)
  const SelectedIcon = selected ? getCategoryIcon(selected.categoryIcon) : null

  return (
    <div>
      <div className="relative mx-auto h-[210px] w-full max-w-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="amount"
              nameKey="categoryName"
              cx="50%"
              cy="50%"
              innerRadius={58}
              outerRadius={95}
              paddingAngle={2}
              startAngle={90}
              endAngle={-270}
              isAnimationActive={false}
              labelLine={false}
              label={renderSliceLabel}
              onClick={(_, index) =>
                setSelectedId((current) =>
                  current === slices[index].categoryId ? null : slices[index].categoryId,
                )
              }
            >
              {slices.map((slice) => (
                <Cell
                  key={slice.categoryId}
                  fill={categoryData(slice.categoryColor)}
                  // La fetta scelta resta piena, le altre si attenuano: il
                  // colore da solo non basterebbe a dire quale hai toccato.
                  fillOpacity={selected && selected.categoryId !== slice.categoryId ? 0.35 : 1}
                  className="cursor-pointer outline-none"
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        {/* Il buco del donut porta il dettaglio: senza, la percentuale sulla
            fetta direbbe la proporzione ma non quanto hai speso. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {selected ? (
            <>
              <span
                className="mb-1 flex h-5 w-5 items-center justify-center rounded-full"
                style={{ backgroundColor: selected.categoryColor }}
              >
                {SelectedIcon && <SelectedIcon className="h-3 w-3" style={{ color: categoryInk(selected.categoryColor) }} />}
              </span>
              <span className="max-w-[110px] truncate text-xs font-bold text-slate-600 dark:text-slate-300">
                {selected.categoryName}
              </span>
              <span className="text-sm font-bold dark:text-white">{currency.format(selected.amount)}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {Math.round(share(selected.amount) * 100)}%
              </span>
            </>
          ) : (
            <>
              <span className="text-xs text-slate-500 dark:text-slate-400">Totale</span>
              <span className="text-sm font-bold dark:text-white">{currency.format(total)}</span>
            </>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {slices.map((slice) => {
          const active = selected?.categoryId === slice.categoryId
          return (
            <button
              key={slice.categoryId}
              type="button"
              aria-pressed={active}
              onClick={() => setSelectedId(active ? null : slice.categoryId)}
              className={`flex max-w-[150px] items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs ${
                active ? '' : 'bg-bar-track dark:bg-zinc-800 text-slate-600 dark:text-slate-300'
              }`}
              // Il chip scelto si tinge del pastello della categoria: lì il
              // testo bianco di prima sparirebbe, e vale la stessa regola del
              // glifo sulla pastiglia.
              style={
                active
                  ? { backgroundColor: slice.categoryColor, color: categoryInk(slice.categoryColor) }
                  : undefined
              }
            >
              {!active && (
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: slice.categoryColor }}
                />
              )}
              <span className="truncate">{slice.categoryName}</span>
            </button>
          )
        })}
      </div>

      {/* Le voci raccolte sotto la fetta scelta: è quello che la lista del
          desktop mostrerebbe espandendo la categoria, e senza questo su mobile
          "Altro" e le sottocategorie non sarebbero raggiungibili. */}
      {selected && selected.children.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-slate-200 dark:border-slate-800 pt-3 text-xs">
          {selected.children.map((child) => (
            <li key={child.categoryId} className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: child.categoryColor ?? OTHER_COLOR }}
                />
                <span className="truncate text-slate-600 dark:text-slate-300">{child.categoryName}</span>
              </span>
              <span className="shrink-0 font-medium dark:text-white">{currency.format(child.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// La percentuale scritta dentro la fetta, ma solo dove ci sta: sotto l'8% il
// numero uscirebbe dai bordi e finirebbe sopra quello della fetta accanto.
function renderSliceLabel(props: PieLabelRenderProps) {
  const percent = Number(props.percent ?? 0)
  if (percent < LABEL_MIN_SHARE) return null

  const cx = Number(props.cx ?? 0)
  const cy = Number(props.cy ?? 0)
  const innerRadius = Number(props.innerRadius ?? 0)
  const outerRadius = Number(props.outerRadius ?? 0)
  const midAngle = Number(props.midAngle ?? 0)

  const radians = Math.PI / 180
  const radius = innerRadius + (outerRadius - innerRadius) / 2
  const x = cx + radius * Math.cos(-midAngle * radians)
  const y = cy + radius * Math.sin(-midAngle * radians)

  // Il bianco fisso funzionava sulle tinte piene di prima; sui toni medi
  // chiari — il giallo su tutti — faceva 1,65:1. Lo decide la fetta.
  const sliceFill = typeof props.fill === 'string' ? props.fill : undefined

  return (
    <text
      x={x}
      y={y}
      fill={sliceFill ? readableOn(sliceFill) : '#ffffff'}
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={12}
      fontWeight={700}
    >
      {Math.round(percent * 100)}%
    </text>
  )
}
