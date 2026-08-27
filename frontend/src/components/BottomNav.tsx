import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  LayoutGrid,
  Receipt,
  PiggyBank,
  WifiOff,
  type LucideIcon,
} from 'lucide-react'
import { useOfflineSync } from '../context/OfflineSyncContext'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

// Quattro voci invece di cinque: le tre che si aprono di continuo più la
// porta su tutto il resto. Prima le voci erano quattro fissate qui più un menu
// a scomparsa, e quale finisse in barra e quale nel menu era una scelta presa
// una volta per tutte da noi; ora la barra tiene solo quello che si usa ogni
// giorno e il resto sta in una pagina che si può guardare per intero.
// "Sezioni" chiude la fila: è la voce che non porta a una pagina sola ma a
// tutte le altre, e in fondo non si confonde con le tre che sono destinazioni.
const navItems: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/transazioni', label: 'Transazioni', icon: Receipt },
  { to: '/risparmio', label: 'Risparmio', icon: PiggyBank },
  { to: '/sezioni', label: 'Sezioni', icon: LayoutGrid },
]

// Le pagine che si raggiungono dalla griglia: mentre ci sei, la barra tiene
// acceso "Sezioni". Senza, sono tutte pagine in cui nessuna icona è accesa e
// non si capisce più da dove ci si è arrivati.
const SECTION_ROUTES = [
  '/categorie',
  '/ricorrenti',
  '/debiti',
  '/promemoria',
  '/impostazioni',
  '/profilo',
  '/importa',
]

export default function BottomNav() {
  const { pathname } = useLocation()
  const inSection = SECTION_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`))

  const { isOnline, backendReachable, pendingCount } = useOfflineSync()
  const showOfflineBadge = !isOnline || !backendReachable || pendingCount > 0
  const offlineBadgeLabel = !isOnline ? 'Offline' : !backendReachable ? 'Server non raggiungibile' : 'Sincronizzazione'

  return (
    <>
      {showOfflineBadge && (
        <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+56px)] z-40 flex items-center justify-center gap-1.5 bg-amber-100 py-1 text-xs text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 md:hidden">
          <WifiOff className="h-3.5 w-3.5 shrink-0" />
          {offlineBadgeLabel}
          {pendingCount > 0 && ` · ${pendingCount} in attesa`}
        </div>
      )}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-200 dark:border-slate-800 bg-brand-300 dark:bg-black pb-[env(safe-area-inset-bottom)] md:hidden"
        aria-label="Navigazione principale"
      >
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            aria-label={item.label}
            title={item.label}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center justify-center gap-1 py-2.5 ${
                isActive || (item.to === '/sezioni' && inSection)
                  ? 'text-brand-700'
                  : 'text-slate-500 dark:text-slate-400'
              }`
            }
          >
            <item.icon className="h-5 w-5" />
            {/* L'etichetta scritta ora che le voci sono quattro e lo spazio
                c'è: con la sola icona, "Sezioni" non si indovina. */}
            <span className="text-[9px] leading-none">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  )
}
