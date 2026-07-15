import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function BankIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M6 22 30 6a3.5 3.5 0 0 1 4 0l24 16"
        fill="#e8ecf5"
        stroke="#000"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="21" cy="19" r="2.6" fill="#ffb3c1" />
      <circle cx="43" cy="19" r="2.6" fill="#ffb3c1" />
      <path d="M25 15.5c.9 1.4 2.4 1.4 3.3 0" stroke="#000" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M35.7 15.5c.9 1.4 2.4 1.4 3.3 0" stroke="#000" strokeWidth="2.4" strokeLinecap="round" />
      <rect x="10" y="24" width="8" height="24" rx="2.5" fill="#e8ecf5" stroke="#000" strokeWidth="3" />
      <rect x="46" y="24" width="8" height="24" rx="2.5" fill="#e8ecf5" stroke="#000" strokeWidth="3" />
      <rect x="6" y="50" width="52" height="8" rx="2.5" fill="#e8ecf5" stroke="#000" strokeWidth="3" />
      <circle cx="32" cy="42" r="12" fill="#ffd23f" stroke="#000" strokeWidth="3" />
      <path
        d="M32 35.5v13M35.2 38.2c0-1.5-1.4-2.7-3.2-2.7s-3.2 1.1-3.2 2.5c0 3.2 6.8 1.6 6.8 4.9 0 1.4-1.5 2.6-3.4 2.6s-3.4-1.1-3.4-2.6"
        stroke="#000"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

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
        <div className="mx-auto grid max-w-5xl grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3">
          <span className="flex items-center gap-2 font-semibold">
            <BankIcon className="h-7 w-7 shrink-0" />
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
