import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ExpenseReminderForm from './ExpenseReminderForm'
import type { Category } from '../api/types'

const categorie = [{ id: 'cat-casa', name: 'Casa', type: 'EXPENSE', color: null, icon: null, parentId: null } as Category]

// Sul telefono (modalità locale) l'avviso di un promemoria è una notifica Android: il
// form parlava di email anche lì (D13 del test end-to-end del 13/11/2026). La web app
// continua a mandare email, e lo dice il test in ExpenseReminderForm.server.test.tsx.
vi.mock('../local/mode', () => ({ isLocalMode: true }))

describe('il form dei promemoria sul telefono', () => {
  it('parla di notifiche, non di email', () => {
    render(<ExpenseReminderForm categories={categorie} onSubmit={vi.fn()} onCancel={vi.fn()} />)

    expect(screen.getByText(/non riceverai notifiche per questo promemoria/)).toBeInTheDocument()
    expect(screen.queryByText(/email/)).not.toBeInTheDocument()
  })
})
