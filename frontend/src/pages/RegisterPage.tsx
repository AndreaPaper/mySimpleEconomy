import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import logo from '../assets/mySimpleEconomyIcon.png'

export default function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await register(email, password)
      navigate('/')
    } catch {
      setError('Impossibile completare la registrazione (email già in uso o password troppo corta)')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-brand-100 px-4 dark:bg-gradient-to-br dark:from-brand-900 dark:via-black dark:to-black">
      <img src={logo} alt="MySimpleEconomy" className="h-16 w-16" />
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 rounded-lg border border-slate-200 bg-brand-300 p-6 shadow-sm dark:border-slate-800 dark:bg-black">
        <h1 className="text-xl font-semibold dark:text-white">Crea il tuo account</h1>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div>
          <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300" htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-black dark:text-white"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-600 dark:text-slate-300" htmlFor="password">Password (min. 8 caratteri)</label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-black dark:text-white"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-900 disabled:opacity-50"
        >
          {loading ? 'Registrazione in corso...' : 'Registrati'}
        </button>
        <p className="text-center text-sm text-slate-600 dark:text-slate-300">
          Hai già un account? <Link to="/login" className="text-brand-700">Accedi</Link>
        </p>
      </form>
    </div>
  )
}
