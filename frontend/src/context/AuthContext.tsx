import { createContext, useContext, useState, type ReactNode } from 'react'
import { authApi } from '../api/endpoints'

interface AuthContextValue {
  token: string | null
  email: string | null
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'))
  const [email, setEmail] = useState<string | null>(localStorage.getItem('email'))

  const persist = (nextToken: string, nextEmail: string) => {
    localStorage.setItem('token', nextToken)
    localStorage.setItem('email', nextEmail)
    setToken(nextToken)
    setEmail(nextEmail)
  }

  const login = async (loginEmail: string, password: string) => {
    const result = await authApi.login(loginEmail, password)
    persist(result.token, result.email)
  }

  const register = async (registerEmail: string, password: string) => {
    const result = await authApi.register(registerEmail, password)
    persist(result.token, result.email)
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('email')
    setToken(null)
    setEmail(null)
  }

  return (
    <AuthContext.Provider value={{ token, email, login, register, logout }}>{children}</AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
