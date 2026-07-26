import { useEffect, useState } from 'react'
import { profileApi } from '../api/endpoints'
import { useAuth } from '../context/AuthContext'
import { ProfilePageSkeleton } from '../components/Skeleton'
import { AVATAR_OPTIONS, getAvatarIcon } from '../constants/avatars'

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

  useEffect(() => {
    profileApi
      .get()
      .then((profile) => {
        setEmail(profile.email)
        setNickname(profile.nickname ?? '')
        setDefaultSalaryAmount(profile.defaultSalaryAmount != null ? String(profile.defaultSalaryAmount) : '')
        setSalaryDay(profile.salaryDay != null ? String(profile.salaryDay) : '')
        setAvatarKey(profile.avatarKey)
      })
      .finally(() => setLoading(false))
  }, [])

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
                  ? 'border-green-600 bg-green-50 dark:bg-green-950'
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
                    ? 'border-green-600 bg-green-50 dark:bg-green-950'
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
          <span className="mt-1 block text-xs text-slate-400 dark:text-slate-500">Giorno del mese (1-31) in cui ricevi lo stipendio.</span>
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {saved && !error && <p className="text-sm text-emerald-600">Profilo salvato.</p>}

        <button
          type="submit"
          disabled={saving}
          className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {saving ? 'Salvataggio in corso...' : 'Salva'}
        </button>
      </form>
    </div>
  )
}
