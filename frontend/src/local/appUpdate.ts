import { App } from '@capacitor/app'
import { Capacitor, registerPlugin } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'

// Gli aggiornamenti dell'app per il telefono: ogni versione è una release di GitHub
// con il tag "android-v<numero di versione>" e l'APK allegato come "myeconomy.apk"
// (le pubblica scripts/publish-apk.ps1). L'app chiede l'elenco delle release, e se ce
// n'è una con un numero più alto del suo propone di installarla.
//
// La richiesta a GitHub non porta nessun dato di chi usa l'app: solo "dammi le release
// del repository". E un APK che non fosse firmato con la stessa chiave dell'app
// installata Android non lo installerebbe.

export const RELEASES_URL = 'https://api.github.com/repos/AndreaPaper/mySimpleEconomy/releases?per_page=30'
const TAG_PREFIX = 'android-v'
const ASSET_NAME = 'myeconomy.apk'
const DOWNLOAD_PATH = 'aggiornamento.apk'

export interface AppUpdate {
  versionCode: number
  versionName: string
  notes: string
  downloadUrl: string
}

interface GithubRelease {
  tag_name: string
  name: string | null
  body: string | null
  draft: boolean
  prerelease: boolean
  assets: { name: string; browser_download_url: string }[]
}

/**
 * La release più nuova per il telefono, se è più nuova della versione installata.
 * Le altre release del repository (se un giorno ce ne saranno), le bozze e quelle senza
 * l'APK non contano.
 */
export function pickUpdate(releases: GithubRelease[], installedVersionCode: number): AppUpdate | null {
  let best: AppUpdate | null = null
  for (const r of releases) {
    if (r.draft || r.prerelease || !r.tag_name.startsWith(TAG_PREFIX)) continue
    const versionCode = Number(r.tag_name.slice(TAG_PREFIX.length))
    const asset = r.assets.find((a) => a.name === ASSET_NAME)
    if (!Number.isInteger(versionCode) || !asset) continue
    if (versionCode <= installedVersionCode || (best && versionCode <= best.versionCode)) continue
    best = {
      versionCode,
      versionName: `1.0.${versionCode}`,
      notes: (r.body ?? '').trim(),
      downloadUrl: asset.browser_download_url,
    }
  }
  return best
}

/** C'è un aggiornamento? null anche fuori da Android e quando GitHub non risponde. */
export async function checkForUpdate(): Promise<AppUpdate | null> {
  if (!Capacitor.isNativePlatform()) return null
  try {
    const installed = Number((await App.getInfo()).build)
    const response = await fetch(RELEASES_URL, { headers: { Accept: 'application/vnd.github+json' } })
    if (!response.ok) return null
    return pickUpdate((await response.json()) as GithubRelease[], installed)
  } catch {
    // Senza rete, o GitHub giù: si riprova alla prossima apertura.
    return null
  }
}

interface ApkInstallerPlugin {
  install(options: { path: string }): Promise<void>
}

const ApkInstaller = registerPlugin<ApkInstallerPlugin>('ApkInstaller')

export class UpdatePermissionNeeded extends Error {}

/**
 * Scarica l'APK nella cache dell'app e apre la schermata di installazione di Android.
 * Se manca il permesso di installare app, Android ne apre la pagina e qui si lancia
 * UpdatePermissionNeeded: dopo averlo concesso, si riprova.
 */
export async function downloadAndInstall(update: AppUpdate): Promise<void> {
  await Filesystem.downloadFile({ url: update.downloadUrl, path: DOWNLOAD_PATH, directory: Directory.Cache })
  try {
    await ApkInstaller.install({ path: DOWNLOAD_PATH })
  } catch (error) {
    if ((error as { code?: string }).code === 'PERMISSION_NEEDED') throw new UpdatePermissionNeeded()
    throw error
  }
}
