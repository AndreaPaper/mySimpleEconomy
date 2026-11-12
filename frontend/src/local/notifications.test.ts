import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LocalBackend } from './backend'
import { memoryStorage } from './db/database'
import { requestNotificationPermission } from './notifications'

// Sul telefono vero (emulatore Android 17) la richiesta del permesso delle notifiche
// non tornava mai, e il backend locale, che la aspettava all'apertura, lasciava l'app
// ferma sul caricamento. Qui si finge di essere su Android, con un plugin delle
// notifiche che fa esattamente quello.

const plugin = vi.hoisted(() => ({
  display: 'prompt' as string,
  requestPermissions: vi.fn(() => new Promise(() => {})),
  getPending: vi.fn(async () => ({ notifications: [] })),
  cancel: vi.fn(async () => {}),
  schedule: vi.fn(async () => {}),
}))

vi.mock('@capacitor/core', async (original) => ({
  ...(await original<typeof import('@capacitor/core')>()),
  Capacitor: { isNativePlatform: () => true },
}))

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    checkPermissions: async () => ({ display: plugin.display }),
    requestPermissions: plugin.requestPermissions,
    getPending: plugin.getPending,
    cancel: plugin.cancel,
    schedule: plugin.schedule,
  },
}))

const withTimeout = <T,>(promise: Promise<T>) =>
  Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('bloccato')), 2000))])

describe("le notifiche non bloccano l'apertura", () => {
  beforeEach(() => {
    plugin.display = 'prompt'
    plugin.requestPermissions.mockClear()
    plugin.schedule.mockClear()
  })

  it("senza permesso l'app si apre lo stesso, e il backend non lo chiede", async () => {
    const backend = await withTimeout(LocalBackend.open(memoryStorage, '2026-11-12'))

    expect(backend).toBeDefined()
    expect(plugin.requestPermissions).not.toHaveBeenCalled()
  })

  it("un errore del plugin delle notifiche non impedisce di aprire l'app", async () => {
    plugin.display = 'granted'
    plugin.getPending.mockRejectedValueOnce(new Error('plugin rotto'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(withTimeout(LocalBackend.open(memoryStorage, '2026-11-12'))).resolves.toBeDefined()
  })

  it('la richiesta del permesso si fa a parte, e solo se si può ancora chiedere', async () => {
    plugin.display = 'denied'
    expect(await requestNotificationPermission()).toBe(false)
    plugin.display = 'granted'
    expect(await requestNotificationPermission()).toBe(true)
    expect(plugin.requestPermissions).not.toHaveBeenCalled()

    plugin.display = 'prompt'
    plugin.requestPermissions.mockResolvedValueOnce({ display: 'granted' } as never)
    expect(await requestNotificationPermission()).toBe(true)
  })
})
