import { infiniteQueryOptions, queryOptions, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  categoriesApi,
  checkpointsApi,
  debtsApi,
  forecastApi,
  profileApi,
  recurringApi,
  remindersApi,
  transactionsApi,
} from './endpoints'
import { cacheCategories, loadCachedCategories } from '../offline/categoriesCache'

// Le letture dal backend, ciascuna con la sua chiave di cache.
//
// Chiave e funzione stanno insieme, in un posto solo: le pagine le usano con
// useQuery e il menu le usa per il prefetch, e se le due copie di una chiave
// divergessero il prefetch riempirebbe una voce di cache che nessuno legge.

export const TRANSACTIONS_PAGE_SIZE = 30

export interface TransactionFilters {
  categoryId?: string
  from?: string
  to?: string
}

export const queries = {
  // Le categorie senza rete ripiegano sulla copia locale, come facevano prima
  // le otto pagine che le chiedevano ognuna per conto suo: senza, il modulo per
  // registrare una spesa offline resterebbe senza categorie da scegliere.
  categories: () =>
    queryOptions({
      queryKey: ['categories'],
      queryFn: async () => {
        try {
          const categories = await categoriesApi.list()
          cacheCategories(categories)
          return categories
        } catch {
          return loadCachedCategories()
        }
      },
    }),

  archivedCategories: () =>
    queryOptions({ queryKey: ['categories', 'archived'], queryFn: categoriesApi.listArchived }),

  debts: () => queryOptions({ queryKey: ['debts'], queryFn: debtsApi.list }),

  reminders: () => queryOptions({ queryKey: ['reminders'], queryFn: remindersApi.list }),

  upcomingReminders: (months: number) =>
    queryOptions({ queryKey: ['reminders', 'upcoming', months], queryFn: () => remindersApi.upcoming(months) }),

  recurring: () => queryOptions({ queryKey: ['recurring'], queryFn: recurringApi.list }),

  checkpoints: () => queryOptions({ queryKey: ['checkpoints'], queryFn: checkpointsApi.list }),

  profile: () => queryOptions({ queryKey: ['profile'], queryFn: profileApi.get }),

  forecast: (months: number) =>
    queryOptions({ queryKey: ['forecast', months], queryFn: () => forecastApi.get(months) }),

  // Le ultime transazioni, senza filtri: quelle della card in Dashboard.
  recentTransactions: () =>
    queryOptions({ queryKey: ['transactions', 'recent'], queryFn: () => transactionsApi.list() }),

  // Tutte le transazioni di un intervallo, non paginate (il backend con from/to
  // restituisce l'intervallo intero).
  transactionsInRange: (from: string, to: string) =>
    queryOptions({
      queryKey: ['transactions', 'range', from, to],
      queryFn: () => transactionsApi.list({ from, to }),
    }),

  // L'elenco della pagina Transazioni, a pagine da 30 e con i filtri nella
  // chiave. Una chiave per combinazione di filtri è anche ciò che impedisce a
  // una risposta arrivata in ritardo, di un filtro ormai cambiato, di
  // sovrascrivere quella del filtro attuale: finisce sotto la sua chiave.
  transactionsPaged: (filters: TransactionFilters) =>
    infiniteQueryOptions({
      queryKey: ['transactions', 'paged', filters],
      queryFn: ({ pageParam }) =>
        transactionsApi.list({ ...filters, page: pageParam, size: TRANSACTIONS_PAGE_SIZE }),
      initialPageParam: 0,
      getNextPageParam: (lastPage, _pages, lastPageParam) => (lastPage.hasNext ? lastPageParam + 1 : undefined),
    }),
}

/**
 * Dopo ogni scrittura si invalida tutta la cache, non solo le chiavi toccate.
 *
 * Una mappa "questa scrittura tocca queste chiavi" sarebbe fragile: una regola
 * ricorrente genera transazioni, lo stipendio modificato ne genera altre, una
 * transazione cambia previsione, dashboard e risparmio. Prima o poi dimentica
 * un caso, e il risultato è un dato vecchio mostrato come nuovo senza nessun
 * errore. Invalidare tutto è corretto per costruzione: si ricaricano subito le
 * query della pagina aperta, le altre alla prossima visita — mostrando comunque
 * subito i dati in cache.
 *
 * La promessa si risolve quando le query attive sono state ricaricate: chi fa
 * `await` vede i dati nuovi, come prima faceva `await reload()`.
 */
export function useInvalidateAll(): () => Promise<void> {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries()
}

/** Le categorie, dalla cache condivisa: le chiedevano otto componenti diversi. */
export function useCategories() {
  return useQuery(queries.categories())
}
