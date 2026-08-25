import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import {
  HandCoins,
  LayoutDashboard,
  LogOut,
  PiggyBank,
  Receipt,
  Repeat,
  Settings,
  Tags,
  Bell,
  UserRound,
  WifiOff,
  type LucideIcon,
} from 'lucide-react'
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
  { to: '/debiti', label: 'Debiti', icon: HandCoins },
  { to: '/promemoria', label: 'Promemoria', icon: Bell },
  { to: '/risparmio', label: 'Risparmio', icon: PiggyBank },
]

export default function Layout() {
  const { email, nickname, avatarKey, logout } = useAuth()
  const AvatarIcon = getAvatarIcon(avatarKey)
  const { isOnline, backendReachable, pendingCount } = useOfflineSync()
  const showOfflineBadge = !isOnline || !backendReachable || pendingCount > 0
  const offlineBadgeLabel = !isOnline ? 'Offline' : !backendReachable ? 'Server non raggiungibile' : 'Sincronizzazione'
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const profileMenuRef = useRef<HTMLDivElement>(null)

  // Tiene la cache delle categorie sempre aggiornata quando si è online, non
  // solo quando si visita la pagina Transazioni: così il form "Nuova
  // transazione" funziona offline anche se l'ultima pagina visitata online
  // era la Dashboard o un'altra sezione.
  useEffect(() => {
    if (!isOnline) return
    categoriesApi.list().then(cacheCategories).catch(() => {})
  }, [isOnline])

  useEffect(() => {
    if (!profileMenuOpen) return
    const onClickOutside = (e: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false)
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setProfileMenuOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [profileMenuOpen])

  return (
    <div className="min-h-screen bg-brand-100 text-slate-900 dark:bg-black dark:text-white">
      <aside className="fixed inset-y-0 left-0 hidden w-56 flex-col overflow-y-auto border-r border-slate-200 bg-brand-500 dark:border-slate-800 dark:bg-black md:flex">
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
                    ? 'bg-brand-200 font-medium text-nav-active dark:bg-brand-900 dark:text-white'
                    : 'text-slate-600 hover:bg-brand-200 hover:text-nav-active dark:text-slate-200'
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
        <div
          ref={profileMenuRef}
          className="relative mt-auto border-t border-slate-200 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-200"
        >
          {profileMenuOpen && (
            <div className="profile-menu absolute inset-x-4 bottom-full mb-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-800 dark:bg-zinc-900">
              <Link
                to="/profilo"
                onClick={() => setProfileMenuOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-slate-600 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-black"
              >
                <UserRound className="h-4 w-4 shrink-0" />
                Profilo
              </Link>
              <Link
                to="/impostazioni"
                onClick={() => setProfileMenuOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-slate-600 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-black"
              >
                <Settings className="h-4 w-4 shrink-0" />
                Impostazioni
              </Link>
              <button
                type="button"
                onClick={() => {
                  setProfileMenuOpen(false)
                  logout()
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-600 hover:bg-red-50 dark:hover:bg-black"
              >
                <LogOut className="h-4 w-4 shrink-0" />
                Esci
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => setProfileMenuOpen((open) => !open)}
            aria-haspopup="true"
            aria-expanded={profileMenuOpen}
            className="flex w-full min-w-0 items-center gap-2 rounded-lg border border-transparent px-3 py-2 text-left font-bold hover:border-brand-700 hover:text-slate-900 hover:shadow-sm dark:hover:text-white"
          >
            <AvatarIcon className="h-6 w-6 shrink-0 text-slate-500 dark:text-slate-400" />
            <span className="min-w-0 break-words">{nickname || email}</span>
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
