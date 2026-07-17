import { useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Receipt,
  Tags,
  Bell,
  MoreHorizontal,
  Repeat,
  Upload,
  Settings,
  LogOut,
  type LucideIcon,
} from 'lucide-react'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

const primaryItems: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/transazioni', label: 'Transazioni', icon: Receipt },
  { to: '/categorie', label: 'Categorie', icon: Tags },
  { to: '/promemoria', label: 'Promemoria', icon: Bell },
]

const moreItems: NavItem[] = [
  { to: '/ricorrenti', label: 'Ricorrenti', icon: Repeat },
  { to: '/importa', label: 'Importa', icon: Upload },
  { to: '/impostazioni', label: 'Impostazioni', icon: Settings },
]

interface BottomNavProps {
  nickname: string | null
  email: string | null
  onLogout: () => void
}

export default function BottomNav({ nickname, email, onLogout }: BottomNavProps) {
  const [moreOpen, setMoreOpen] = useState(false)

  useEffect(() => {
    if (!moreOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [moreOpen])

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-black pb-[env(safe-area-inset-bottom)] md:hidden"
        aria-label="Navigazione principale"
      >
        {primaryItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-1 py-2 text-xs ${
                isActive ? 'text-green-600' : 'text-slate-500 dark:text-slate-400'
              }`
            }
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className="flex flex-1 flex-col items-center gap-1 py-2 text-xs text-slate-500 dark:text-slate-400"
        >
          <MoreHorizontal className="h-5 w-5" />
          Altro
        </button>
      </nav>

      {moreOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/40 md:hidden"
          onClick={() => setMoreOpen(false)}
        >
          <div
            className="w-full rounded-t-2xl bg-white dark:bg-black pb-[calc(env(safe-area-inset-bottom)+0.5rem)] shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-slate-300" />
            <div className="p-4">
              <Link
                to="/profilo"
                onClick={() => setMoreOpen(false)}
                className="mb-3 block truncate rounded-lg bg-slate-50 dark:bg-zinc-900 px-3 py-2 text-center font-medium shadow-sm"
              >
                {nickname || email}
              </Link>
              <div className="flex flex-col gap-1">
                {moreItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setMoreOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded px-3 py-3 text-sm ${
                        isActive ? 'bg-green-50 font-medium text-green-600' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 hover:dark:bg-zinc-800'
                      }`
                    }
                  >
                    <item.icon className="h-5 w-5" />
                    {item.label}
                  </NavLink>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setMoreOpen(false)
                    onLogout()
                  }}
                  className="flex items-center gap-3 rounded px-3 py-3 text-left text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 hover:dark:bg-zinc-800"
                >
                  <LogOut className="h-5 w-5" />
                  Esci
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
