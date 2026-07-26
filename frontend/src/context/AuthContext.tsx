import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { authApi, profileApi } from '../api/endpoints'

interface AuthContextValue {
  token: string | null
  email: string | null
  nickname: string | null
  setNickname: (nickname: string | null) => void
  avatarKey: string | null
  setAvatarKey: (avatarKey: string | null) => void
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'))
  const [email, setEmail] = useState<string | null>(localStorage.getItem('email'))
  const [nickname, setNickname] = useState<string | null>(null)
  const [avatarKey, setAvatarKey] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    profileApi
      .get()
      .then((profile) => {
        setNickname(profile.nickname)
        setAvatarKey(profile.avatarKey)
      })
      .catch(() => {})
  }, [token])

  const persist = (nextToken: string, nextEmail: string) => {
    localStorage.setItem('token', nextToken)
    localStorage.setItem('email', nextEmail)
    setToken(nextToken)
    setEmail(nextEmail)
  }

  const login = async (loginEmail: string, password: string) => {
    const result = await authApi.login(loginEmail, password)
    persist(result.token, result.email)
    window.dispatchEvent(new Event('auth:login-success'))
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
    setNickname(null)
    setAvatarKey(null)
  }

  return (
    <AuthContext.Provider
      value={{ token, email, nickname, setNickname, avatarKey, setAvatarKey, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
