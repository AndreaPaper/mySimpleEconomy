import { useEffect, useState } from 'react'
import { checkpointsApi, profileApi } from '../api/endpoints'
import type { BalanceCheckpoint } from '../api/types'
import { useAuth } from '../context/AuthContext'
import { ProfilePageSkeleton } from '../components/Skeleton'
import { AVATAR_OPTIONS, getAvatarIcon } from '../constants/avatars'

const currency = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })
const dateFormatter = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  return dateFormatter.format(new Date(year, month - 1, day))
}

export default function ProfilePage() {
  const { setNickname: setGlobalNickname, setAvatarKey: setGlobalAvatarKey } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [email, setEmail] = useState('')
  const [nickname, setNickname] = useState('')
  const [defaultSalaryAmount, setDefaultSalaryAmount] = useState('')
  const [salaryDay, setSalaryDay] = useState('')
  const [avatarKey, setAvatarKey] = useState<string | null>(null)

  const today = new Date().toISOString().slice(0, 10)
  const [checkpoints, setCheckpoints] = useState<BalanceCheckpoint[]>([])
  const [checkpointDate, setCheckpointDate] = useState(today)
  const [checkpointBalance, setCheckpointBalance] = useState('')
  const [checkpointSaving, setCheckpointSaving] = useState(false)
  const [checkpointError, setCheckpointError] = useState<string | null>(null)
  const [checkpointSaved, setCheckpointSaved] = useState(false)

  const reloadCheckpoints = () => checkpointsApi.list().then(setCheckpoints)

  useEffect(() => {
    Promise.all([
      profileApi.get().then((profile) => {
        setEmail(profile.email)
        setNickname(profile.nickname ?? '')
        setDefaultSalaryAmount(profile.defaultSalaryAmount != null ? String(profile.defaultSalaryAmount) : '')
        setSalaryDay(profile.salaryDay != null ? String(profile.salaryDay) : '')
        setAvatarKey(profile.avatarKey)
      }),
      reloadCheckpoints(),
    ]).finally(() => setLoading(false))
  }, [])

  const latestCheckpoint = checkpoints[0] ?? null

  const handleCheckpointSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setCheckpointError(null)
    setCheckpointSaved(false)
    setCheckpointSaving(true)
    try {
      await checkpointsApi.upsert({ checkpointDate, balance: Number(checkpointBalance) })
      await reloadCheckpoints()
      setCheckpointBalance('')
      setCheckpointSaved(true)
    } catch {
      setCheckpointError('Salvataggio non riuscito. Controlla i valori inseriti.')
    } finally {
      setCheckpointSaving(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaved(false)
    setSaving(true)
    try {
      const profile = await profileApi.update({
        nickname: nickname.trim() || null,
        defaultSalaryAmount: defaultSalaryAmount ? Number(defaultSalaryAmount) : null,
        salaryDay: salaryDay ? Number(salaryDay) : null,
        avatarKey,
      })
      setNickname(profile.nickname ?? '')
      setDefaultSalaryAmount(profile.defaultSalaryAmount != null ? String(profile.defaultSalaryAmount) : '')
      setSalaryDay(profile.salaryDay != null ? String(profile.salaryDay) : '')
      setAvatarKey(profile.avatarKey)
      setGlobalNickname(profile.nickname)
      setGlobalAvatarKey(profile.avatarKey)
      setSaved(true)
    } catch {
      setError('Salvataggio non riuscito. Controlla i valori inseriti.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <ProfilePageSkeleton />

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-lg font-semibold">Profilo</h1>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-black p-6">
        <div>
          <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">Email</p>
          <p className="text-sm">{email}</p>
        </div>

        <div>
          <span className="mb-2 block text-sm text-slate-600 dark:text-slate-300">Avatar</span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setAvatarKey(null)}
              className={`flex h-11 w-11 items-center justify-center rounded-full border-2 ${
                avatarKey === null
                  ? 'border-brand-700 bg-brand-100 dark:bg-brand-900'
                  : 'border-slate-300 dark:border-slate-700'
              }`}
              aria-label="Nessun avatar (icona di default)"
              title="Default"
            >
              {(() => {
                const DefaultIcon = getAvatarIcon(null)
                return <DefaultIcon className="h-6 w-6 text-slate-500 dark:text-slate-400" />
              })()}
            </button>
            {AVATAR_OPTIONS.map(({ key, label, Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setAvatarKey(key)}
                className={`flex h-11 w-11 items-center justify-center rounded-full border-2 ${
                  avatarKey === key
                    ? 'border-brand-700 bg-brand-100 dark:bg-brand-900'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
                aria-label={label}
                title={label}
              >
                <Icon className="h-6 w-6 text-slate-600 dark:text-slate-300" />
              </button>
            ))}
          </div>
        </div>

        <label className="block text-sm">
          <span className="mb-1 block text-slate-600 dark:text-slate-300">Nickname</span>
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={100}
            placeholder="Come vuoi essere chiamato"
            className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-black px-3 py-2 text-sm text-slate-900 dark:text-white"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-slate-600 dark:text-slate-300">Stipendio di default</span>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={defaultSalaryAmount}
            onChange={(e) => setDefaultSalaryAmount(e.target.value)}
            placeholder="Es. 1800.00"
            className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-black px-3 py-2 text-sm text-slate-900 dark:text-white"
          />
          <span className="mt-1 block text-xs text-slate-400 dark:text-slate-500">Quanto ti entra di base ogni mese.</span>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-slate-600 dark:text-slate-300">Giorno di arrivo dello stipendio</span>
          <input
            type="number"
            min="1"
            max="31"
            step="1"
            value={salaryDay}
            onChange={(e) => setSalaryDay(e.target.value)}
            placeholder="Es. 27"
            className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-black px-3 py-2 text-sm text-slate-900 dark:text-white"
          />
          <span className="mt-1 block text-xs text-slate-400 dark:text-slate-500">
            Giorno del mese (1-31) in cui ricevi lo stipendio. Se compili sia questo campo che l'importo, ogni mese
            viene aggiunta in automatico la transazione dello stipendio (visibile e modificabile in "Ricorrenti").
          </span>
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {saved && !error && <p className="text-sm text-emerald-600">Profilo salvato.</p>}

        <button
          type="submit"
          disabled={saving}
          className="rounded bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-900 disabled:opacity-50"
        >
          {saving ? 'Salvataggio in corso...' : 'Salva'}
        </button>
      </form>

      <form
        onSubmit={handleCheckpointSubmit}
        className="space-y-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-black p-6"
      >
        <div>
          <h2 className="text-sm font-medium text-slate-900 dark:text-white">Saldo</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {latestCheckpoint
              ? `Ultimo saldo registrato: ${currency.format(latestCheckpoint.balance)} al ${formatDate(latestCheckpoint.checkpointDate)}.`
              : 'Nessun saldo registrato ancora: la Dashboard parte da 0€ finché non ne inserisci uno.'}
          </p>
        </div>

        <div className="flex gap-2">
          <label className="flex-1 text-sm">
            <span className="mb-1 block text-slate-600 dark:text-slate-300">Data</span>
            <input
              type="date"
              value={checkpointDate}
              onChange={(e) => setCheckpointDate(e.target.value)}
              className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-black px-3 py-2 text-sm text-slate-900 dark:text-white"
            />
          </label>
          <label className="flex-1 text-sm">
            <span className="mb-1 block text-slate-600 dark:text-slate-300">Saldo a quella data</span>
            <input
              type="number"
              step="0.01"
              required
              value={checkpointBalance}
              onChange={(e) => setCheckpointBalance(e.target.value)}
              placeholder="Es. 1500.00"
              className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-black px-3 py-2 text-sm text-slate-900 dark:text-white"
            />
          </label>
        </div>
        <span className="block text-xs text-slate-400 dark:text-slate-500">
          Se inserisci un saldo per una data già registrata, la sovrascrive.
        </span>

        {checkpointError && <p className="text-sm text-red-600">{checkpointError}</p>}
        {checkpointSaved && !checkpointError && <p className="text-sm text-emerald-600">Saldo salvato.</p>}

        <button
          type="submit"
          disabled={checkpointSaving}
          className="rounded bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-900 disabled:opacity-50"
        >
          {checkpointSaving ? 'Salvataggio in corso...' : 'Salva saldo'}
        </button>
      </form>
    </div>
  )
}
