import { useEffect } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, LogOut, Receipt, Repeat, Settings, Tags, Bell, WifiOff, type LucideIcon } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useOfflineSync } from '../context/OfflineSyncContext'
import { categoriesApi } from '../api/endpoints'
import { cacheCategories } from '../offline/categoriesCache'
import { getAvatarIcon } from '../constants/avatars'
import bankIcon from '../assets/mySimpleEconomyIcon.png'
import BottomNav from './BottomNav'

const navItems: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/transazioni', label: 'Transazioni', icon: Receipt },
  { to: '/categorie', label: 'Categorie', icon: Tags },
  { to: '/ricorrenti', label: 'Ricorrenti', icon: Repeat },
  { to: '/promemoria', label: 'Promemoria', icon: Bell },
]

export default function Layout() {
  const { email, nickname, avatarKey, logout } = useAuth()
  const AvatarIcon = getAvatarIcon(avatarKey)
  const { isOnline, backendReachable, pendingCount } = useOfflineSync()
  const showOfflineBadge = !isOnline || !backendReachable || pendingCount > 0
  const offlineBadgeLabel = !isOnline ? 'Offline' : !backendReachable ? 'Server non raggiungibile' : 'Sincronizzazione'

  // Tiene la cache delle categorie sempre aggiornata quando si è online, non
  // solo quando si visita la pagina Transazioni: così il form "Nuova
  // transazione" funziona offline anche se l'ultima pagina visitata online
  // era la Dashboard o un'altra sezione.
  useEffect(() => {
    if (!isOnline) return
    categoriesApi.list().then(cacheCategories).catch(() => {})
  }, [isOnline])

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-100 via-green-50 to-white text-slate-900 dark:from-green-950 dark:via-black dark:to-black dark:text-white">
      <aside className="fixed inset-y-0 left-0 hidden w-56 flex-col overflow-y-auto border-r border-slate-200 bg-gradient-to-t from-green-400 via-green-100 to-white dark:border-slate-800 dark:from-green-600 dark:via-green-950 dark:to-black md:flex">
        <div className="flex items-center gap-2 px-4 py-4 text-sm font-semibold dark:text-white">
          <img src={bankIcon} alt="" className="h-7 w-7 shrink-0" />
          MySimpleEconomy
        </div>
        <div className="border-t border-slate-200 dark:border-slate-800" />
        <nav className="flex flex-col gap-1 px-2 py-3 text-sm">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded px-3 py-2 ${
                  isActive
                    ? 'bg-green-50 font-medium text-green-600 dark:bg-black dark:text-green-400'
                    : 'text-slate-600 hover:bg-green-500/80 hover:text-white dark:text-slate-200'
                }`
              }
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        {showOfflineBadge && (
          <div className="mx-2 mb-1 flex items-center gap-1.5 rounded bg-amber-100 px-2 py-1.5 text-xs text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
            <WifiOff className="h-3.5 w-3.5 shrink-0" />
            {offlineBadgeLabel}
            {pendingCount > 0 && ` · ${pendingCount} in attesa`}
          </div>
        )}
        <div className="mt-auto flex items-center gap-2 border-t border-slate-200 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-200">
          <Link
            to="/profilo"
            className="flex min-w-0 flex-1 items-center gap-2 truncate rounded-lg border border-transparent px-3 py-2 font-bold hover:border-green-500 hover:text-slate-900 hover:shadow-sm dark:hover:text-white"
          >
            <AvatarIcon className="h-6 w-6 shrink-0 text-slate-500 dark:text-slate-400" />
            <span className="truncate">{nickname || email}</span>
          </Link>
          <NavLink
            to="/impostazioni"
            className={({ isActive }) =>
              `flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                isActive
                  ? 'bg-green-50 text-green-600 dark:bg-black dark:text-green-400'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-black'
              }`
            }
            aria-label="Impostazioni"
            title="Impostazioni"
          >
            <Settings className="h-5 w-5" />
          </NavLink>
          <button
            onClick={logout}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-black"
            type="button"
            aria-label="Esci"
            title="Esci"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </aside>
      <main className="px-4 pb-20 pt-6 md:ml-56 md:pb-6">
        <div className="mx-auto w-full max-w-5xl">
          <Outlet />
        </div>
      </main>
      <BottomNav nickname={nickname} email={email} avatarKey={avatarKey} onLogout={logout} />
    </div>
  )
}
