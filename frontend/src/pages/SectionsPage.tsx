import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import {
  Bell,
  HandCoins,
  LogOut,
  PiggyBank,
  Receipt,
  Repeat,
  Settings,
  Tags,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

interface Tile {
  to: string
  label: string
  icon: LucideIcon
  // Tinta della piastrella, colore del quadratino e colore dell'etichetta.
  bg: string
  accent: string
  fg: string
}

interface Group {
  title: string
  tiles: Tile[]
}

// Transazioni e Risparmio stanno anche nella barra in basso: sono le due che
// si aprono più spesso e meritano un colpo solo. Restano comunque qui, perché
// chi arriva in questa pagina si aspetta l'elenco completo, non l'elenco meno
// le due che hanno già una scorciatoia.
const GROUPS: Group[] = [
  {
    title: 'Spese e conti',
    tiles: [
      { to: '/transazioni', label: 'Transazioni', icon: Receipt, bg: '#EAF7FF', accent: '#30AFFF', fg: '#1e40af' },
      { to: '/categorie', label: 'Categorie', icon: Tags, bg: '#f5f3ff', accent: '#A78BFA', fg: '#5b21b6' },
      { to: '/debiti', label: 'Debiti', icon: HandCoins, bg: '#fdf2f8', accent: '#FF6F91', fg: '#9d174d' },
      { to: '/ricorrenti', label: 'Ricorrenti', icon: Repeat, bg: '#ecfdf5', accent: '#4CD787', fg: '#166534' },
    ],
  },
  {
    title: 'Pianificazione',
    tiles: [
      { to: '/promemoria', label: 'Promemoria', icon: Bell, bg: '#fff7ed', accent: '#FFB84D', fg: '#9a3412' },
      { to: '/risparmio', label: 'Risparmio', icon: PiggyBank, bg: '#ecfdf5', accent: '#2FA36B', fg: '#166534' },
    ],
  },
  // Terzo gruppo che il mockup non ha: senza, impostazioni, profilo e uscita
  // non avrebbero più una strada su mobile, perché questa pagina prende il
  // posto del menu "Altro" che li conteneva.
  {
    title: 'Account',
    tiles: [
      { to: '/impostazioni', label: 'Impostazioni', icon: Settings, bg: '#f1f5f9', accent: '#64748b', fg: '#334155' },
      { to: '/profilo', label: 'Profilo', icon: UserRound, bg: '#f1f5f9', accent: '#64748b', fg: '#334155' },
    ],
  },
]

export default function SectionsPage() {
  const { logout } = useAuth()

  return (
    <div className="mx-auto max-w-md space-y-3.5">
      <h1 className="text-lg font-semibold dark:text-white">Sezioni</h1>

      {GROUPS.map((group) => (
        <div key={group.title}>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            {group.title}
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            {group.tiles.map((tile) => (
              <Link
                key={tile.to}
                to={tile.to}
                // La tinta passa da variabili e non dall'attributo style: così
                // il tema scuro può scavalcarla con una classe, cosa che uno
                // style inline non lascerebbe fare.
                style={{ '--tile-bg': tile.bg, '--tile-fg': tile.fg } as CSSProperties}
                className="flex flex-col gap-2 rounded-2xl bg-[var(--tile-bg)] p-3 text-xs font-bold text-[var(--tile-fg)] dark:bg-zinc-900 dark:text-slate-200"
              >
                {/* Il quadratino tiene il suo colore anche al buio: è quello
                    che distingue una piastrella dall'altra quando le tinte di
                    sfondo diventano tutte lo stesso grigio. */}
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-md"
                  style={{ backgroundColor: tile.accent }}
                >
                  <tile.icon className="h-3.5 w-3.5 text-white" />
                </span>
                {tile.label}
              </Link>
            ))}
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={logout}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 py-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300"
      >
        <LogOut className="h-4 w-4" />
        Esci
      </button>
    </div>
  )
}
