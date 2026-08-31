import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Clock, Pencil } from 'lucide-react'
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

// Quota proposta alla prima attivazione.
const DEFAULT_SAVINGS_PERCENT = '15'

// I campi che la barra di salvataggio manda insieme: servono sia a comporre la
// richiesta sia a capire se qualcosa è cambiato rispetto a com'era al
// caricamento, senza tenere un flag "dirty" da aggiornare a ogni onChange.
interface ProfileFields {
  nickname: string
  defaultSalaryAmount: string
  salaryDay: string
  avatarKey: string | null
  savingsEnabled: boolean
  savingsPercent: string
}

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-brand-300 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-brand-700 focus:ring-[3px] focus:ring-brand-200/20 dark:border-slate-700 dark:bg-black dark:text-white'
const cardClass = 'rounded-[18px] border border-slate-200 bg-brand-300 p-5 dark:border-slate-800 dark:bg-black'
const fieldLabelClass = 'mb-1.5 block text-[12.5px] font-medium text-slate-600 dark:text-slate-300'

export default function ProfilePage() {
  const {
    setNickname: setGlobalNickname,
    setAvatarKey: setGlobalAvatarKey,
    setSalaryDay: setGlobalSalaryDay,
    setSavings: setGlobalSavings,
    logout,
  } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [email, setEmail] = useState('')
  const [nickname, setNickname] = useState('')
  const [defaultSalaryAmount, setDefaultSalaryAmount] = useState('')
  const [salaryDay, setSalaryDay] = useState('')
  const [avatarKey, setAvatarKey] = useState<string | null>(null)
  const [savingsEnabled, setSavingsEnabled] = useState(false)
  const [savingsPercent, setSavingsPercent] = useState(DEFAULT_SAVINGS_PERCENT)
  // Com'erano i campi all'ultimo salvataggio riuscito: la barra confronta con
  // questo invece di fidarsi di un flag, così annullare una modifica a mano
  // riporta davvero lo stato a "Tutto salvato".
  const [savedSnapshot, setSavedSnapshot] = useState<ProfileFields | null>(null)

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
        const fields: ProfileFields = {
          nickname: profile.nickname ?? '',
          defaultSalaryAmount: profile.defaultSalaryAmount != null ? String(profile.defaultSalaryAmount) : '',
          salaryDay: profile.salaryDay != null ? String(profile.salaryDay) : '',
          avatarKey: profile.avatarKey,
          savingsEnabled: profile.savingsEnabled,
          savingsPercent: profile.savingsPercent != null ? String(profile.savingsPercent) : DEFAULT_SAVINGS_PERCENT,
        }
        setEmail(profile.email)
        setNickname(fields.nickname)
        setDefaultSalaryAmount(fields.defaultSalaryAmount)
        setSalaryDay(fields.salaryDay)
        setAvatarKey(fields.avatarKey)
        setSavingsEnabled(fields.savingsEnabled)
        setSavingsPercent(fields.savingsPercent)
        setSavedSnapshot(fields)
      }),
      reloadCheckpoints(),
    ]).finally(() => setLoading(false))
  }, [])

  const latestCheckpoint = checkpoints[0] ?? null

  const currentFields: ProfileFields = {
    nickname,
    defaultSalaryAmount,
    salaryDay,
    avatarKey,
    savingsEnabled,
    savingsPercent,
  }
  const dirty = savedSnapshot !== null && JSON.stringify(currentFields) !== JSON.stringify(savedSnapshot)

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

  // Un solo salvataggio per identità, stipendio e risparmio: prima erano due
  // gestori distinti che mandavano esattamente lo stesso corpo, perché
  // l'endpoint sostituisce il profilo intero e ometterne una parte l'avrebbe
  // azzerata. Il saldo resta a parte: è un altro endpoint.
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
        savingsEnabled,
        savingsPercent: Number(savingsPercent),
      })
      const fields: ProfileFields = {
        nickname: profile.nickname ?? '',
        defaultSalaryAmount: profile.defaultSalaryAmount != null ? String(profile.defaultSalaryAmount) : '',
        salaryDay: profile.salaryDay != null ? String(profile.salaryDay) : '',
        avatarKey: profile.avatarKey,
        savingsEnabled: profile.savingsEnabled,
        savingsPercent: profile.savingsPercent != null ? String(profile.savingsPercent) : DEFAULT_SAVINGS_PERCENT,
      }
      setNickname(fields.nickname)
      setDefaultSalaryAmount(fields.defaultSalaryAmount)
      setSalaryDay(fields.salaryDay)
      setAvatarKey(fields.avatarKey)
      setSavingsEnabled(fields.savingsEnabled)
      setSavingsPercent(fields.savingsPercent)
      setSavedSnapshot(fields)
      setGlobalNickname(profile.nickname)
      setGlobalAvatarKey(profile.avatarKey)
      // salaryDay definisce i confini del periodo in Dashboard e lo stipendio
      // entra nel calcolo del budget: senza ripropagarli la Dashboard
      // resterebbe indietro fino al refresh successivo.
      setGlobalSalaryDay(profile.salaryDay)
      setGlobalSavings({
        enabled: profile.savingsEnabled,
        savingsPercent: profile.savingsPercent,
        defaultSalaryAmount: profile.defaultSalaryAmount,
        salaryCategoryId: profile.salaryCategoryId,
      })
      setSaved(true)
    } catch {
      setError('Salvataggio non riuscito. Controlla i valori inseriti.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <ProfilePageSkeleton />

  const HeroAvatar = getAvatarIcon(avatarKey)
  const salaryNumber = Number(defaultSalaryAmount)
  const percentNumber = Number(savingsPercent)
  const monthlySetAside =
    defaultSalaryAmount && salaryNumber > 0 ? (salaryNumber * percentNumber) / 100 : null

  const statusLabel = saving
    ? 'Salvataggio in corso…'
    : error
      ? 'Salvataggio non riuscito'
      : dirty
        ? 'Modifiche non salvate'
        : 'Tutto salvato'

  return (
    <div className="mx-auto max-w-[1100px]">
      {/* Fascia identità: avatar, saluto e i tre numeri che si guardano più
          spesso, senza doverli cercare nei campi sotto. */}
      <div className="mb-[18px] flex flex-col gap-5 rounded-[20px] border border-[#D7EBF8] bg-gradient-to-r from-[#EAF7FF] to-[#F3FBF6] px-6 py-[22px] lg:flex-row lg:items-center dark:border-slate-800 dark:from-zinc-900 dark:to-zinc-900">
        <div className="relative shrink-0">
          <span className="flex h-[82px] w-[82px] items-center justify-center rounded-full border-[3px] border-brand-700 bg-white dark:bg-black">
            <HeroAvatar className="h-9 w-9 text-brand-700" />
          </span>
          {/* Il badge non apre un selettore a parte: porta il fuoco sulla
              griglia degli avatar, che è già lì sotto. */}
          <button
            type="button"
            onClick={() => document.getElementById('avatar-grid')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
            aria-label="Cambia avatar"
            title="Cambia avatar"
            className="absolute bottom-0 right-0 flex h-[26px] w-[26px] items-center justify-center rounded-full border-2 border-white bg-brand-700 text-white dark:border-black"
          >
            <Pencil className="h-3 w-3" />
          </button>
        </div>

        <div className="min-w-0">
          <p className="truncate text-2xl font-semibold leading-tight text-slate-900 dark:text-white">
            {nickname ? `Ciao, ${nickname}` : 'Ciao!'}
          </p>
          <p className="mt-1 truncate text-[13.5px] text-slate-500 dark:text-slate-400">{email}</p>
        </div>

        <div className="flex flex-wrap items-center gap-x-[22px] gap-y-3 lg:ml-auto lg:justify-end lg:text-right">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Stipendio</p>
            <p className="text-lg font-semibold text-slate-900 dark:text-white">
              {defaultSalaryAmount && salaryNumber > 0 ? currency.format(salaryNumber) : '—'}
            </p>
          </div>
          <span className="hidden h-8 w-px bg-[#D7EBF8] sm:block dark:bg-slate-800" />
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Arriva il</p>
            <p className="text-lg font-semibold text-slate-900 dark:text-white">
              {salaryDay ? `${salaryDay} del mese` : '—'}
            </p>
          </div>
          <span className="hidden h-8 w-px bg-[#D7EBF8] sm:block dark:bg-slate-800" />
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Risparmio</p>
            <p
              className={`text-lg font-semibold ${
                savingsEnabled ? 'text-[#2FA36B]' : 'text-slate-400 dark:text-slate-500'
              }`}
            >
              {savingsEnabled ? `${savingsPercent}% attivo` : 'non attivo'}
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          {/* Colonna sinistra */}
          <div className="flex flex-col gap-4">
            <div className={cardClass}>
              <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Come ti chiamiamo</h2>
              <p className="mt-1 text-[12.5px] text-slate-500 dark:text-slate-400">
                Il nome che vedi nel saluto della Dashboard.
              </p>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                maxLength={100}
                placeholder="Come vuoi essere chiamato"
                aria-label="Nickname"
                className={`mt-3 ${inputClass}`}
              />

              <p id="avatar-grid" className="mb-2.5 mt-4 text-[13px] font-semibold text-slate-700 dark:text-slate-300">
                Scegli un avatar
              </p>
              <div className="grid grid-cols-6 gap-2.5">
                {/* L'opzione "nessun avatar" ha il bordo tratteggiato: è
                    un'assenza, non una scelta come le altre. */}
                <button
                  type="button"
                  onClick={() => setAvatarKey(null)}
                  aria-label="Nessun avatar (icona di default)"
                  aria-pressed={avatarKey === null}
                  title="Default"
                  className={`flex aspect-square items-center justify-center rounded-full border-2 border-dashed transition hover:border-brand-700 ${
                    avatarKey === null
                      ? 'border-brand-700 bg-[#EAF7FF] dark:bg-brand-900/40'
                      : 'border-slate-300 bg-brand-300 dark:border-slate-700 dark:bg-black'
                  }`}
                >
                  {(() => {
                    const DefaultIcon = getAvatarIcon(null)
                    return (
                      <DefaultIcon
                        className={`h-6 w-6 ${avatarKey === null ? 'text-[#1C8ADB]' : 'text-slate-400 dark:text-slate-500'}`}
                      />
                    )
                  })()}
                </button>
                {AVATAR_OPTIONS.map(({ key, label, Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setAvatarKey(key)}
                    aria-label={label}
                    aria-pressed={avatarKey === key}
                    title={label}
                    className={`flex aspect-square items-center justify-center rounded-full border-2 transition hover:border-brand-700 ${
                      avatarKey === key
                        ? 'border-brand-700 bg-[#EAF7FF] dark:bg-brand-900/40'
                        : 'border-slate-200 bg-brand-300 dark:border-slate-700 dark:bg-black'
                    }`}
                  >
                    <Icon
                      className={`h-6 w-6 ${avatarKey === key ? 'text-[#1C8ADB]' : 'text-slate-400 dark:text-slate-500'}`}
                    />
                  </button>
                ))}
              </div>
            </div>

            <div className={cardClass}>
              <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Il tuo stipendio</h2>
              <p className="mt-1 text-[12.5px] leading-relaxed text-slate-500 dark:text-slate-400">
                Se compili importo e giorno, ogni mese la transazione dello stipendio entra da sola: la trovi in{' '}
                <Link to="/ricorrenti" className="font-semibold text-[#1C8ADB] hover:underline">
                  Ricorrenti
                </Link>
                .
              </p>
              <div className="mt-3.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className={fieldLabelClass}>Importo di base</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={defaultSalaryAmount}
                    onChange={(e) => setDefaultSalaryAmount(e.target.value)}
                    placeholder="Es. 1800.00"
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <span className={fieldLabelClass}>Giorno del mese</span>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    step="1"
                    value={salaryDay}
                    onChange={(e) => setSalaryDay(e.target.value)}
                    placeholder="Es. 27"
                    className={inputClass}
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Colonna destra */}
          <div className="flex flex-col gap-4">
            <div className="rounded-[18px] border border-[#C9E9D8] bg-[#ecfdf5] p-5 dark:border-emerald-900 dark:bg-emerald-950/30">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Modalità risparmio</h2>
                  <p className="mt-1 max-w-[300px] text-[12.5px] leading-relaxed text-slate-600 dark:text-slate-300">
                    Mettiamo da parte una quota delle entrate del periodo e in Dashboard ti diciamo quanto puoi ancora
                    spendere restando in linea.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={savingsEnabled}
                  aria-label="Attiva la modalità risparmio"
                  onClick={() => setSavingsEnabled((on) => !on)}
                  className={`relative h-[26px] w-[46px] shrink-0 rounded-full transition-colors ${
                    savingsEnabled ? 'bg-[#2FA36B]' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`absolute top-[3px] h-5 w-5 rounded-full bg-white shadow transition-all ${
                      savingsEnabled ? 'left-[23px]' : 'left-[3px]'
                    }`}
                  />
                </button>
              </div>

              {savingsEnabled && (
                <div className="mt-4 flex flex-col gap-3.5 rounded-[14px] bg-brand-300 px-4 py-3.5 sm:flex-row sm:items-center dark:bg-black">
                  <div className="shrink-0">
                    <p className="text-xs text-slate-500 dark:text-slate-400">Quota da mettere da parte</p>
                    <p className="text-[26px] font-bold leading-tight text-slate-900 dark:text-white">
                      {savingsPercent || 0} %
                    </p>
                  </div>
                  <div className="min-w-0 flex-1">
                    {/* Cursore e campo numerico sullo stesso valore: il primo
                        per regolare a occhio, il secondo per scrivere una cifra
                        esatta e per chi naviga da tastiera. */}
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={savingsPercent}
                        onChange={(e) => setSavingsPercent(e.target.value)}
                        aria-label="Quota da mettere da parte"
                        className="h-2 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-slate-200 accent-[#2FA36B] dark:bg-slate-700"
                      />
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        required
                        value={savingsPercent}
                        onChange={(e) => setSavingsPercent(e.target.value)}
                        aria-label="Quota in percentuale"
                        className="w-16 shrink-0 rounded-lg border border-slate-300 bg-brand-300 px-2 py-1 text-center text-sm text-slate-900 dark:border-slate-700 dark:bg-black dark:text-white"
                      />
                    </div>
                    {monthlySetAside !== null && (
                      <p className="mt-2 text-[11.5px] text-slate-500 dark:text-slate-400">
                        Su {currency.format(salaryNumber)} di entrate sono circa{' '}
                        <strong className="text-slate-900 dark:text-white">{currency.format(monthlySetAside)}</strong> al
                        mese.
                      </p>
                    )}
                  </div>
                </div>
              )}

              <p className="mt-3.5 text-[11.5px] leading-relaxed text-slate-600 dark:text-slate-300">
                È una percentuale, non un importo fisso: si adatta quando le entrate cambiano. Lo storico è in{' '}
                <Link to="/risparmio" className="font-semibold text-[#1C8ADB] hover:underline">
                  Risparmio
                </Link>
                .
              </p>
            </div>

            {/* Il saldo tiene il suo bottone: passa da un endpoint diverso
                (POST /checkpoints) e registra un punto nel tempo, non modifica
                un'impostazione — accorparlo alla barra confonderebbe le due cose. */}
            <div className={cardClass}>
              <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Saldo di riferimento</h2>
              <p className="mt-1 text-[12.5px] leading-relaxed text-slate-500 dark:text-slate-400">
                Scrivi il saldo come lo leggi <em>adesso</em> sul conto: da qui in avanti lo aggiorniamo noi a ogni
                transazione.
              </p>

              <div className="mt-3.5 flex items-center gap-2.5 rounded-[14px] bg-[#EAF7FF] px-3.5 py-3 dark:bg-brand-900/30">
                <Clock className="h-4 w-4 shrink-0 text-[#1C8ADB]" />
                <p className="text-[12.5px] text-slate-900 dark:text-slate-200">
                  {latestCheckpoint ? (
                    <>
                      Ultimo registrato:{' '}
                      <strong>{currency.format(latestCheckpoint.balance)}</strong> al{' '}
                      {formatDate(latestCheckpoint.checkpointDate)}
                    </>
                  ) : (
                    'Nessun saldo registrato: la Dashboard parte da 0 € finché non ne inserisci uno.'
                  )}
                </p>
              </div>

              <div className="mt-3.5 flex flex-col gap-3 sm:flex-row sm:items-end">
                <label className="block flex-1">
                  <span className={fieldLabelClass}>Data</span>
                  <input
                    type="date"
                    value={checkpointDate}
                    onChange={(e) => setCheckpointDate(e.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className="block flex-1">
                  <span className={fieldLabelClass}>Saldo ora</span>
                  <input
                    type="number"
                    step="0.01"
                    value={checkpointBalance}
                    onChange={(e) => setCheckpointBalance(e.target.value)}
                    placeholder="Es. 1500,00"
                    className={inputClass}
                  />
                </label>
                {/* Non è type="submit": annidare due form non è valido, e questa
                    card vive dentro quello del profilo. */}
                <button
                  type="button"
                  onClick={handleCheckpointSubmit}
                  disabled={checkpointSaving || !checkpointBalance}
                  className="shrink-0 rounded-full bg-[#0B2A45] px-[18px] py-3 text-[13px] font-bold text-white disabled:opacity-50 dark:bg-brand-700"
                >
                  {checkpointSaving ? 'Salvataggio…' : 'Registra'}
                </button>
              </div>

              <p className="mt-2.5 text-[11.5px] leading-relaxed text-slate-400 dark:text-slate-500">
                Quello che hai già registrato oggi è compreso e non viene sottratto due volte. Un saldo su una data già
                registrata la sovrascrive.
              </p>

              {checkpointError && <p className="mt-2 text-[13px] text-red-600">{checkpointError}</p>}
              {checkpointSaved && !checkpointError && (
                <p className="mt-2 text-[13px] text-emerald-600">Saldo registrato.</p>
              )}
            </div>
          </div>
        </div>

        {/* Barra di salvataggio: dice sempre a che punto sei, così non serve
            cercare un riscontro dopo aver premuto Salva. */}
        <div className="mt-[18px] flex flex-wrap items-center gap-3 rounded-[100px] border border-slate-200 bg-brand-300 py-3 pl-5 pr-4 dark:border-slate-800 dark:bg-black">
          <span className="flex min-w-0 items-center gap-2 text-[12.5px] font-medium text-slate-500 dark:text-slate-400">
            {!dirty && !saving && !error && <Check className="h-[15px] w-[15px] shrink-0 text-[#2FA36B]" />}
            <span className={error ? 'text-red-600' : undefined}>{statusLabel}</span>
          </span>
          <div className="ml-auto flex items-center gap-2.5">
            <button
              type="button"
              onClick={logout}
              className="rounded-full border border-slate-300 bg-brand-300 px-[17px] py-2.5 text-[13px] font-semibold text-slate-600 hover:bg-brand-100 dark:border-slate-700 dark:bg-black dark:text-slate-300 dark:hover:bg-zinc-900"
            >
              Esci dall'account
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-full bg-brand-700 px-5 py-2.5 text-[13px] font-bold text-white hover:bg-brand-900 disabled:opacity-50"
            >
              Salva modifiche
            </button>
          </div>
        </div>

        {error && <p className="mt-2 text-[13px] text-red-600">{error}</p>}
        {saved && !error && !dirty && <p className="mt-2 text-[13px] text-emerald-600">Profilo salvato.</p>}
      </form>
    </div>
  )
}
