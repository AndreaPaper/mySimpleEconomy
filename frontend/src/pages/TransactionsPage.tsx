import { useEffect, useState } from 'react'
import { categoriesApi, excelExportApi, transactionsApi } from '../api/endpoints'
import type { Category, Transaction } from '../api/types'
import Modal from '../components/Modal'
import TransactionForm from '../components/TransactionForm'
import { getCategoryIcon } from '../constants/icons'

const currency = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [exporting, setExporting] = useState(false)

  const reloadTransactions = () => transactionsApi.list().then(setTransactions)

  useEffect(() => {
    Promise.all([reloadTransactions(), categoriesApi.list().then(setCategories)]).finally(() => setLoading(false))
  }, [])

  const openCreate = () => {
    setEditing(null)
    setModalMode('create')
  }

  const openEdit = (transaction: Transaction) => {
    setEditing(transaction)
    setModalMode('edit')
  }

  const closeModal = () => setModalMode(null)

  const handleSubmit = async (data: {
    categoryId: string
    amount: number
    type: string
    occurredOn: string
    description: string | null
  }) => {
    if (modalMode === 'edit' && editing) {
      await transactionsApi.update(editing.id, data)
    } else {
      await transactionsApi.create(data)
    }
    await reloadTransactions()
    closeModal()
  }

  const handleDelete = async (transaction: Transaction) => {
    if (!window.confirm('Eliminare questa transazione?')) return
    await transactionsApi.delete(transaction.id)
    await reloadTransactions()
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const blob = await excelExportApi.download()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'transazioni.xlsx'
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  if (loading) return <p className="text-slate-500">Caricamento...</p>

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Transazioni</h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="rounded border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
          >
            {exporting ? 'Esportazione...' : 'Esporta in Excel'}
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="rounded bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            Nuova transazione
          </button>
        </div>
      </div>

      {transactions.length === 0 ? (
        <p className="text-slate-500">Nessuna transazione ancora.</p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded border border-slate-200 bg-white">
          {transactions.map((t) => {
            const Icon = getCategoryIcon(t.categoryIcon)
            return (
            <li key={t.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: t.categoryColor ?? '#94a3b8' }}
                >
                  <Icon className="h-4 w-4 text-white" />
                </span>
                <div>
                  <p className="font-medium">{t.description || t.categoryName}</p>
                  <p className="text-sm text-slate-500">
                    {t.occurredOn} · {t.categoryName}
                    {t.recurringTransactionId && <span className="ml-1 text-xs text-slate-400">(ricorrente)</span>}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={t.type === 'INCOME' ? 'text-emerald-600' : 'text-red-600'}>
                  {t.type === 'INCOME' ? '+' : '-'}
                  {currency.format(t.amount)}
                </span>
                <button
                  type="button"
                  onClick={() => openEdit(t)}
                  className="-m-1 p-1 text-sm text-green-600 hover:underline"
                >
                  Modifica
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(t)}
                  className="-m-1 p-1 text-sm text-slate-500 hover:underline"
                >
                  Elimina
                </button>
              </div>
            </li>
            )
          })}
        </ul>
      )}

      {modalMode && (
        <Modal title={modalMode === 'edit' ? 'Modifica transazione' : 'Nuova transazione'} onClose={closeModal}>
          <TransactionForm categories={categories} initial={editing ?? undefined} onSubmit={handleSubmit} onCancel={closeModal} />
        </Modal>
      )}
    </div>
  )
}
