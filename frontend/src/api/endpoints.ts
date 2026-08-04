import client from './client'
import type {
  BalanceCheckpoint,
  Category,
  DataCleanupResult,
  Debt,
  ExcelImportPreviewResponse,
  ExcelImportResult,
  ExpenseReminder,
  ForecastResponse,
  Profile,
  RecurringOverride,
  RecurringTransaction,
  Transaction,
  UpcomingRemindersResponse,
} from './types'

export const authApi = {
  // Senza login non c'è modalità offline che tenga: qui si aspetta davvero
  // che il backend risponda (anche se Render è in cold start), niente
  // timeout di 10s né fail-fast come per le altre chiamate.
  register: (email: string, password: string) =>
    client
      .post<{ token: string; email: string }>('/auth/register', { email, password }, { timeout: 0, skipUnreachableCheck: true })
      .then((r) => r.data),
  login: (email: string, password: string) =>
    client
      .post<{ token: string; email: string }>('/auth/login', { email, password }, { timeout: 0, skipUnreachableCheck: true })
      .then((r) => r.data),
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

export const excelExportApi = {
  download: (params?: { from?: string; to?: string; categoryId?: string }) =>
    client.get<Blob>('/export/excel', { params, responseType: 'blob' }).then((r) => r.data),
}

export const remindersApi = {
  list: () => client.get<ExpenseReminder[]>('/expense-reminders').then((r) => r.data),
  upcoming: (months = 3) =>
    client.get<UpcomingRemindersResponse>('/expense-reminders/upcoming', { params: { months } }).then((r) => r.data),
  create: (data: {
    categoryId: string
    name: string
    amount?: number | null
    intervalUnit: string
    intervalValue: number
    startDate: string
    nextDueDate: string
    endDate?: string | null
    notifyDaysBefore?: number | null
  }) => client.post<ExpenseReminder>('/expense-reminders', data).then((r) => r.data),
  update: (
    id: string,
    data: {
      categoryId: string
      name: string
      amount?: number | null
      intervalUnit: string
      intervalValue: number
      startDate: string
      nextDueDate: string
      endDate?: string | null
      notifyDaysBefore?: number | null
    },
  ) => client.put<ExpenseReminder>(`/expense-reminders/${id}`, data).then((r) => r.data),
  deactivate: (id: string) => client.post(`/expense-reminders/${id}/deactivate`),
  reactivate: (id: string) => client.post(`/expense-reminders/${id}/reactivate`),
}

export const debtsApi = {
  list: () => client.get<Debt[]>('/debts').then((r) => r.data),
  create: (data: {
    categoryId: string
    name: string
    totalAmount: number
    alreadyPaidAmount?: number | null
    alreadyPaidAsOf?: string | null
    monthlyPaymentAmount?: number | null
  }) => client.post<Debt>('/debts', data).then((r) => r.data),
  update: (
    id: string,
    data: {
      categoryId: string
      name: string
      totalAmount: number
      alreadyPaidAmount?: number | null
      monthlyPaymentAmount?: number | null
    },
  ) => client.put<Debt>(`/debts/${id}`, data).then((r) => r.data),
  delete: (id: string) => client.delete(`/debts/${id}`),
}

export const profileApi = {
  get: () => client.get<Profile>('/profile').then((r) => r.data),
  update: (data: {
    nickname?: string | null
    defaultSalaryAmount?: number | null
    salaryDay?: number | null
    avatarKey?: string | null
  }) => client.put<Profile>('/profile', data).then((r) => r.data),
}

export const dataCleanupApi = {
  cleanup: (params?: { from?: string; to?: string }) =>
    client.delete<DataCleanupResult>('/data-cleanup', { params }).then((r) => r.data),
}

export const excelImportApi = {
  analyze: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return client
      .post<ExcelImportPreviewResponse>('/import/excel/analyze', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data)
  },
  commit: (data: ExcelImportPreviewResponse) =>
    client.post<ExcelImportResult>('/import/excel/commit', data).then((r) => r.data),
}
