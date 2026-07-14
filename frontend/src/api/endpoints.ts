import client from './client'
import type {
  BalanceCheckpoint,
  Category,
  ForecastResponse,
  RecurringOverride,
  RecurringTransaction,
  Transaction,
} from './types'

export const authApi = {
  register: (email: string, password: string) =>
    client.post<{ token: string; email: string }>('/auth/register', { email, password }).then((r) => r.data),
  login: (email: string, password: string) =>
    client.post<{ token: string; email: string }>('/auth/login', { email, password }).then((r) => r.data),
}

export const categoriesApi = {
  list: () => client.get<Category[]>('/categories').then((r) => r.data),
  create: (data: { name: string; type: string; color?: string | null; icon?: string | null }) =>
    client.post<Category>('/categories', data).then((r) => r.data),
  update: (id: string, data: { name: string; color?: string | null; icon?: string | null }) =>
    client.put<Category>(`/categories/${id}`, data).then((r) => r.data),
  archive: (id: string) => client.post(`/categories/${id}/archive`),
}

export const transactionsApi = {
  list: (params?: { from?: string; to?: string; categoryId?: string }) =>
    client.get<Transaction[]>('/transactions', { params }).then((r) => r.data),
  create: (data: {
    categoryId: string
    amount: number
    type: string
    occurredOn: string
    description?: string | null
  }) => client.post<Transaction>('/transactions', data).then((r) => r.data),
  update: (
    id: string,
    data: { categoryId: string; amount: number; type: string; occurredOn: string; description?: string | null },
  ) => client.put<Transaction>(`/transactions/${id}`, data).then((r) => r.data),
  delete: (id: string) => client.delete(`/transactions/${id}`),
}

export const recurringApi = {
  list: () => client.get<RecurringTransaction[]>('/recurring-transactions').then((r) => r.data),
  create: (data: {
    categoryId: string
    name: string
    defaultAmount: number
    intervalUnit: string
    intervalValue: number
    startDate: string
    nextDueDate: string
    endDate?: string | null
  }) => client.post<RecurringTransaction>('/recurring-transactions', data).then((r) => r.data),
  update: (
    id: string,
    data: {
      categoryId: string
      name: string
      defaultAmount: number
      intervalUnit: string
      intervalValue: number
      startDate: string
      nextDueDate: string
      endDate?: string | null
    },
  ) => client.put<RecurringTransaction>(`/recurring-transactions/${id}`, data).then((r) => r.data),
  deactivate: (id: string) => client.post(`/recurring-transactions/${id}/deactivate`),
  reactivate: (id: string) => client.post(`/recurring-transactions/${id}/reactivate`),
  listOverrides: (id: string) =>
    client.get<RecurringOverride[]>(`/recurring-transactions/${id}/overrides`).then((r) => r.data),
  createOverride: (id: string, data: { occurrenceDate: string; overrideAmount: number; note?: string | null }) =>
    client.post<RecurringOverride>(`/recurring-transactions/${id}/overrides`, data).then((r) => r.data),
  deleteOverride: (id: string, overrideId: string) =>
    client.delete(`/recurring-transactions/${id}/overrides/${overrideId}`),
}

export const checkpointsApi = {
  list: () => client.get<BalanceCheckpoint[]>('/balance-checkpoints').then((r) => r.data),
  upsert: (data: { checkpointDate: string; balance: number }) =>
    client.post<BalanceCheckpoint>('/balance-checkpoints', data).then((r) => r.data),
}

export const forecastApi = {
  get: (months = 6) => client.get<ForecastResponse>('/forecast', { params: { months } }).then((r) => r.data),
}
