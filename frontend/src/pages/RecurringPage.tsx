import { useEffect, useState } from 'react'
import { recurringApi } from '../api/endpoints'
import type { RecurringTransaction } from '../api/types'

const currency = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })

export default function RecurringPage() {
  const [items, setItems] = useState<RecurringTransaction[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    recurringApi.list().then(setItems).finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="text-slate-500">Caricamento...</p>

  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold">Transazioni ricorrenti</h1>
      {items.length === 0 ? (
        <p className="text-slate-500">Nessuna regola ricorrente ancora.</p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded border border-slate-200 bg-white">
          {items.map((r) => (
            <li key={r.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="font-medium">
                  {r.name} {!r.active && <span className="text-xs text-slate-400">(disattivata)</span>}
                </p>
                <p className="text-sm text-slate-500">
                  {r.categoryName} · ogni {r.intervalValue} {r.intervalUnit.toLowerCase()} · prossima: {r.nextDueDate}
                </p>
              </div>
              <span className={r.categoryType === 'INCOME' ? 'text-emerald-600' : 'text-red-600'}>
                {currency.format(r.defaultAmount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
