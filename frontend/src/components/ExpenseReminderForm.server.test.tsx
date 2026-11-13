import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ExpenseReminderForm from './ExpenseReminderForm'
import type { Category } from '../api/types'

const categorie = [{ id: 'cat-casa', name: 'Casa', type: 'EXPENSE', color: null, icon: null, parentId: null } as Category]

vi.mock('../local/mode', () => ({ isLocalMode: false }))

describe('il form dei promemoria nella web app', () => {
  it('parla di email', () => {
    render(<ExpenseReminderForm categories={categorie} onSubmit={vi.fn()} onCancel={vi.fn()} />)

    expect(screen.getByText(/non riceverai email per questo promemoria/)).toBeInTheDocument()
  })
})
