import { Link, NavLink, Outlet } from 'react-router-dom'
import { LogOut, Settings } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import bankIcon from '../assets/mySimpleEconomyIcon.png'
import BottomNav from './BottomNav'

const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/transazioni', label: 'Transazioni' },
  { to: '/categorie', label: 'Categorie' },
  { to: '/ricorrenti', label: 'Ricorrenti' },
  { to: '/promemoria', label: 'Promemoria' },
]

export default function Layout() {
  const { email, nickname, logout } = useAuth()

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-100 via-green-50 to-white text-slate-900 dark:from-green-950 dark:via-black dark:to-black dark:text-white">
      <aside className="fixed inset-y-0 left-0 hidden w-56 flex-col overflow-y-auto border-r border-slate-200 bg-gradient-to-t from-green-400 via-green-100 to-white dark:border-slate-800 dark:from-green-600 dark:via-green-950 dark:to-black md:flex">
        <div className="flex items-center gap-2 px-4 py-4 font-semibold dark:text-white">
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
                `rounded px-3 py-2 ${
                  isActive
                    ? 'bg-green-50 font-medium text-green-600 dark:bg-black dark:text-green-400'
                    : 'text-slate-600 hover:bg-green-500/80 hover:text-white dark:text-slate-200'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto flex items-center gap-2 border-t border-slate-200 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-200">
          <Link
            to="/profilo"
            className="block flex-1 truncate rounded-lg border border-transparent px-3 py-2 text-center font-bold hover:border-green-500 hover:text-slate-900 hover:shadow-sm dark:hover:text-white"
          >
            {nickname || email}
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
      <BottomNav nickname={nickname} email={email} onLogout={logout} />
    </div>
  )
}
