import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import UpdatePrompt, { UPDATE_CHECK_INTERVAL_MS } from './UpdatePrompt'

// L'avviso di versione nuova. Il service worker vero in jsdom non c'è: si finge
// l'hook di vite-plugin-pwa, tenendo però uno stato vero per needRefresh, così
// "Più tardi" chiude davvero l'avviso invece di chiamare solo una spia.

const updateServiceWorker = vi.fn()
let versioneNuova = false
let opzioni: { onRegisteredSW?: (url: string, r: ServiceWorkerRegistration | undefined) => void } = {}

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: (options: typeof opzioni) => {
    opzioni = options
    const needRefresh = useState(versioneNuova)
    return { needRefresh, offlineReady: useState(false), updateServiceWorker }
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  versioneNuova = false
  opzioni = {}
})

afterEach(() => {
  vi.useRealTimers()
})

describe("l'avviso di versione nuova", () => {
  it('senza una versione nuova non compare', () => {
    render(<UpdatePrompt />)

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  /**
   * "Aggiorna" chiede al service worker in attesa di prendere il controllo e
   * ricarica la pagina: è il `true` di updateServiceWorker. Senza, il service
   * worker nuovo si attiverebbe ma la pagina resterebbe quella vecchia.
   */
  it('con una versione nuova la propone, e Aggiorna ci passa ricaricando', async () => {
    versioneNuova = true
    render(<UpdatePrompt />)

    expect(screen.getByText("È disponibile una nuova versione dell'app.")).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Aggiorna' }))

    expect(updateServiceWorker).toHaveBeenCalledWith(true)
  })

  it('Più tardi chiude l avviso senza aggiornare', async () => {
    versioneNuova = true
    render(<UpdatePrompt />)

    await userEvent.click(screen.getByRole('button', { name: 'Più tardi' }))

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(updateServiceWorker).not.toHaveBeenCalled()
  })
})

describe('il controllo delle versioni nuove', () => {
  /**
   * Una PWA aperta sul telefono resta aperta per giorni, e il browser cerca un
   * service worker nuovo solo quando si naviga: senza questi due controlli la
   * versione nuova arriverebbe solo chiudendo l'app del tutto.
   */
  it('ogni ora e al ritorno nell app chiede se c è una versione nuova', () => {
    vi.useFakeTimers()
    const registrazione = { update: vi.fn().mockResolvedValue(undefined) } as unknown as ServiceWorkerRegistration
    render(<UpdatePrompt />)

    act(() => opzioni.onRegisteredSW?.('/sw.js', registrazione))
    expect(registrazione.update).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS))
    expect(registrazione.update).toHaveBeenCalledTimes(1)

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(registrazione.update).toHaveBeenCalledTimes(2)
  })

  // Il browser può non dare una registrazione (service worker non supportato):
  // allora non c'è niente da controllare, e niente deve rompersi.
  it('senza registrazione non programma niente', () => {
    vi.useFakeTimers()
    render(<UpdatePrompt />)

    expect(() => act(() => opzioni.onRegisteredSW?.('/sw.js', undefined))).not.toThrow()
    expect(vi.getTimerCount()).toBe(0)
  })
})
