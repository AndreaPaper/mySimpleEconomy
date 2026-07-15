import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import bankIcon from '../assets/mySimpleEconomyIcon.png'

const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/transazioni', label: 'Transazioni' },
  { to: '/categorie', label: 'Categorie' },
  { to: '/ricorrenti', label: 'Ricorrenti' },
  { to: '/promemoria', label: 'Promemoria' },
  { to: '/importa', label: 'Importa' },
  { to: '/impostazioni', label: 'Impostazioni' },
]

export default function Layout() {
  const { email, logout } = useAuth()

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3">
          <span className="flex items-center gap-2 font-semibold">
            <img src={bankIcon} alt="" className="h-7 w-7 shrink-0" />
            MySimpleEconomy
          </span>
          <nav className="flex flex-wrap justify-center gap-4 text-sm">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  isActive ? 'font-medium text-indigo-600' : 'text-slate-600 hover:text-slate-900'
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center justify-self-end gap-3 text-sm text-slate-600">
            <span>{email}</span>
            <button
              onClick={logout}
              className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-100"
              type="button"
            >
              Esci
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
