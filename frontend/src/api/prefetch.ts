import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { queries } from './queries'
import { useAuth } from '../context/AuthContext'
import { useIsMobile } from '../hooks/useIsMobile'
import {
  defaultRangeEnd,
  forecastWindow,
  historyWindow,
  initialRangeStart,
  savingsWindow,
  UPCOMING_REMINDER_MONTHS,
} from '../utils/dataWindows'

// I dati di una pagina, chiesti prima di arrivarci.
//
// Il menu chiama prefetchRoute al passaggio del mouse, al focus e al tocco su
// un link: la richiesta parte mentre il dito o il cursore sono ancora sopra, e
// spesso quando la pagina monta i dati ci sono già. prefetchQuery rispetta
// staleTime: se i dati in cache sono ancora freschi non parte nulla, quindi
// passare cento volte sopra lo stesso link non fa cento richieste.
//
// Ogni rotta chiede le stesse query, con gli stessi parametri, della sua
// pagina. È il punto che non deve divergere: una chiave diversa di un solo
// giorno riempirebbe una voce di cache che la pagina non legge mai. Per questo
// gli intervalli di Dashboard e Risparmio si calcolano con le stesse funzioni
// che usano le pagine (utils/dataWindows.ts).

interface RouteContext {
  salaryDay: number | null
  isMobile: boolean
}

// Le transazioni si aprono senza filtri: stessa forma dell'oggetto che la
// pagina costruisce, così la chiave è identica.
const NO_FILTERS = { categoryId: undefined, from: undefined, to: undefined }

export function prefetchRoute(queryClient: QueryClient, path: string, { salaryDay, isMobile }: RouteContext): void {
  const today = new Date()

  switch (path) {
    case '/': {
      const history = historyWindow(initialRangeStart(isMobile), today, salaryDay)
      void queryClient.prefetchQuery(queries.forecast(forecastWindow(defaultRangeEnd(), today).months))
      void queryClient.prefetchQuery(queries.transactionsInRange(history.from, history.to))
      void queryClient.prefetchQuery(queries.checkpoints())
      void queryClient.prefetchQuery(queries.recentTransactions())
      void queryClient.prefetchQuery(queries.recurring())
      void queryClient.prefetchQuery(queries.upcomingReminders(UPCOMING_REMINDER_MONTHS))
      void queryClient.prefetchQuery(queries.categories())
      return
    }
    case '/transazioni':
      void queryClient.prefetchInfiniteQuery(queries.transactionsPaged(NO_FILTERS))
      void queryClient.prefetchQuery(queries.categories())
      return
    case '/categorie':
      void queryClient.prefetchQuery(queries.categories())
      void queryClient.prefetchQuery(queries.archivedCategories())
      return
    case '/ricorrenti':
      void queryClient.prefetchQuery(queries.recurring())
      void queryClient.prefetchQuery(queries.categories())
      return
    case '/debiti':
      void queryClient.prefetchQuery(queries.debts())
      void queryClient.prefetchQuery(queries.categories())
      return
    case '/promemoria':
      void queryClient.prefetchQuery(queries.reminders())
      void queryClient.prefetchQuery(queries.categories())
      return
    case '/risparmio': {
      const { from, to } = savingsWindow(today, salaryDay)
      void queryClient.prefetchQuery(queries.transactionsInRange(from, to))
      return
    }
    case '/profilo':
      void queryClient.prefetchQuery(queries.profile())
      void queryClient.prefetchQuery(queries.checkpoints())
      return
    default:
      // Sezioni, Impostazioni, Importa: niente da precaricare, o solo le
      // categorie, che il guscio ha già in cache.
      return
  }
}

/**
 * I tre gestori da mettere su un link verso `path`. Il tocco anticipa di poco
 * la navigazione su telefono, ma è spesso il tempo che basta a far partire la
 * richiesta; il mouse su desktop anticipa molto di più.
 */
export function usePrefetchRoute() {
  const queryClient = useQueryClient()
  const { salaryDay } = useAuth()
  const isMobile = useIsMobile()
  return (path: string) => {
    const go = () => prefetchRoute(queryClient, path, { salaryDay, isMobile })
    return { onMouseEnter: go, onFocus: go, onTouchStart: go }
  }
}
