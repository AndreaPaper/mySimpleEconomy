import { useEffect, useState } from 'react'
import { transactionsApi } from '../api/endpoints'
import type { Transaction } from '../api/types'

const currency = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    transactionsApi.list().then(setTransactions).finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="text-slate-500">Caricamento...</p>

  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold">Transazioni</h1>
      {transactions.length === 0 ? (
        <p className="text-slate-500">Nessuna transazione ancora.</p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded border border-slate-200 bg-white">
          {transactions.map((t) => (
            <li key={t.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="font-medium">{t.description || t.categoryName}</p>
                <p className="text-sm text-slate-500">
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
}
