import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pickUpdate } from './appUpdate'

// Gli aggiornamenti dell'app per il telefono. Si finge di essere su Android, con la
// versione installata 270 e GitHub che risponde con le release scritte qui.

const native = vi.hoisted(() => ({
  build: '270',
  releases: [] as unknown[],
  installError: null as unknown,
  downloaded: [] as string[],
  installed: [] as string[],
}))

vi.mock('@capacitor/core', async (original) => ({
  ...(await original<typeof import('@capacitor/core')>()),
  Capacitor: { isNativePlatform: () => true },
  registerPlugin: () => ({
    install: async ({ path }: { path: string }) => {
      if (native.installError) throw native.installError
      native.installed.push(path)
    },
  }),
}))
vi.mock('@capacitor/app', () => ({
  App: {
    getInfo: async () => ({ build: native.build }),
    addListener: async () => ({ remove: () => {} }),
  },
}))
vi.mock('@capacitor/filesystem', () => ({
  Directory: { Cache: 'CACHE' },
  Filesystem: {
    downloadFile: async ({ url }: { url: string }) => {
      native.downloaded.push(url)
      return {}
    },
  },
}))

const release = (tag: string, extra: Record<string, unknown> = {}) => ({
  tag_name: tag,
  name: tag,
  body: 'Novità',
  draft: false,
  prerelease: false,
  assets: [{ name: 'myeconomy.apk', browser_download_url: `https://github.com/x/${tag}/myeconomy.apk` }],
  ...extra,
})

describe('quale aggiornamento proporre', () => {
  it('la versione più alta fra quelle per il telefono, se è più nuova di quella installata', () => {
    const update = pickUpdate([release('android-v271'), release('android-v275'), release('android-v273')], 270)

    expect(update).toEqual({
      versionCode: 275,
      versionName: '1.0.275',
      notes: 'Novità',
      downloadUrl: 'https://github.com/x/android-v275/myeconomy.apk',
    })
  })

  it('niente se la versione installata è già la più nuova, o più nuova ancora', () => {
    expect(pickUpdate([release('android-v270')], 270)).toBeNull()
    expect(pickUpdate([release('android-v269')], 270)).toBeNull()
  })

  // Una bozza o una pre-release non sono pronte; una release senza l'APK non si può
  // installare; un tag diverso non è dell'app per il telefono.
  it('ignora bozze, pre-release, release senza APK e tag di altro', () => {
    expect(
      pickUpdate(
        [
          release('android-v280', { draft: true }),
          release('android-v281', { prerelease: true }),
          release('android-v282', { assets: [{ name: 'altro.zip', browser_download_url: 'x' }] }),
          release('v2.0'),
          release('android-vabc'),
        ],
        270,
      ),
    ).toBeNull()
  })
})

describe("l'avviso nell'app", () => {
  beforeEach(() => {
    native.installError = null
    native.downloaded = []
    native.installed = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => native.releases })),
    )
  })

  const mount = async () => {
    const { default: AppUpdatePrompt } = await import('./AppUpdatePrompt')
    render(<AppUpdatePrompt />)
  }

  it('con una versione nuova la propone, e Aggiorna la scarica e la installa', async () => {
    native.releases = [release('android-v275')]
    await mount()

    expect(await screen.findByText("È disponibile la versione 1.0.275 dell'app.")).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Aggiorna' }))

    await waitFor(() => expect(native.installed).toEqual(['aggiornamento.apk']))
    expect(native.downloaded).toEqual(['https://github.com/x/android-v275/myeconomy.apk'])
  })

  it('senza versioni nuove non mostra niente', async () => {
    native.releases = [release('android-v270')]
    await mount()

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('senza rete non mostra niente e non si rompe', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))))
    await mount()

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('se manca il permesso di installare app, spiega cosa fare', async () => {
    native.releases = [release('android-v275')]
    native.installError = Object.assign(new Error('permesso'), { code: 'PERMISSION_NEEDED' })
    await mount()

    await userEvent.click(await screen.findByRole('button', { name: 'Aggiorna' }))

    expect(await screen.findByText(/consenti a MyEconomy di installare app/)).toBeInTheDocument()
  })

  it('Più tardi chiude l’avviso', async () => {
    native.releases = [release('android-v275')]
    await mount()

    await userEvent.click(await screen.findByRole('button', { name: 'Più tardi' }))

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
