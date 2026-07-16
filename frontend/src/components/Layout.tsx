import { Link, NavLink, Outlet } from 'react-router-dom'
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
  const { email, nickname, logout } = useAuth()

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <aside className="fixed inset-y-0 left-0 flex w-56 flex-col overflow-y-auto border-r border-slate-200 bg-white">
        <div className="flex items-center gap-2 px-4 py-4 font-semibold">
          <img src={bankIcon} alt="" className="h-7 w-7 shrink-0" />
          MySimpleEconomy
        </div>
        <div className="border-t border-slate-200" />
        <nav className="flex flex-col gap-1 px-2 py-3 text-sm">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `rounded px-3 py-2 ${
                  isActive ? 'bg-indigo-50 font-medium text-indigo-600' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
          <Link
            to="/profilo"
            className="block truncate rounded-lg bg-white px-3 py-2 text-center shadow-md hover:bg-slate-50 hover:text-slate-900"
          >
            {nickname || email}
          </Link>
          <button
            onClick={logout}
            className="mt-2 w-full rounded border border-slate-300 px-2 py-1 hover:bg-slate-100"
            type="button"
          >
            Esci
          </button>
        </div>
      </aside>
      <main className="ml-56 px-4 py-6">
        <div className="mx-auto w-full max-w-5xl">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
