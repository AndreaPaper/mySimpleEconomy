import type { ReactElement, ReactNode } from 'react'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { createQueryClient } from '../api/queryClient'

// Il QueryClient dei test.
//
// **Uno nuovo per ogni montaggio**, mai condiviso: un client riusato fra due
// test farebbe passare il secondo grazie ai dati in cache del primo, e l'esito
// dipenderebbe dall'ordine in cui girano. È la trappola principale di questa
// libreria nei test.
//
// Si usa la configurazione vera dell'app (createQueryClient), non una fatta
// apposta: staleTime e retry sono proprio ciò che alcuni test verificano, e una
// configurazione di comodo li renderebbe muti.
export function createTestQueryClient(): QueryClient {
  return createQueryClient()
}

export function QueryWrapper({ client, children }: { client: QueryClient; children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

/** Per i test che montano un componente con `render` invece che con mountPage. */
export function withQueryClient(ui: ReactElement, client: QueryClient = createTestQueryClient()): ReactElement {
  return <QueryWrapper client={client}>{ui}</QueryWrapper>
}
