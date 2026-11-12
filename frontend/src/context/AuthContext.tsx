import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { authApi, profileApi } from '../api/endpoints'
import { isLocalMode } from '../local/mode'

const LOCAL_TOKEN = 'locale'
const LOCAL_EMAIL = 'Su questo telefono'

// Impostazioni della sezione risparmio più i dati del profilo che servono a
// calcolare il budget disponibile (stipendio stimato e categoria dello
// stipendio, per capire se è già stato incassato nel periodo).
export interface SavingsSettings {
  enabled: boolean
  savingsPercent: number | null
  defaultSalaryAmount: number | null
  salaryCategoryId: string | null
}

const SAVINGS_DISABLED: SavingsSettings = {
  enabled: false,
  savingsPercent: null,
  defaultSalaryAmount: null,
  salaryCategoryId: null,
}

interface AuthContextValue {
  token: string | null
  email: string | null
  nickname: string | null
  setNickname: (nickname: string | null) => void
  avatarKey: string | null
  setAvatarKey: (avatarKey: string | null) => void
  salaryDay: number | null
  setSalaryDay: (salaryDay: number | null) => void
  savings: SavingsSettings
  setSavings: (savings: SavingsSettings) => void
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  // Nella modalità locale non c'è accesso: un solo utente, e il telefono è suo. Un
  // token fisso tiene in piedi le rotte protette senza toccarle.
  const [token, setToken] = useState<string | null>(isLocalMode ? LOCAL_TOKEN : localStorage.getItem('token'))
  const [email, setEmail] = useState<string | null>(isLocalMode ? LOCAL_EMAIL : localStorage.getItem('email'))
  const [nickname, setNickname] = useState<string | null>(null)
  const [avatarKey, setAvatarKey] = useState<string | null>(null)
  const [salaryDay, setSalaryDay] = useState<number | null>(null)
  const [savings, setSavings] = useState<SavingsSettings>(SAVINGS_DISABLED)

  useEffect(() => {
    if (!token) return
    profileApi
      .get()
      .then((profile) => {
        setNickname(profile.nickname)
        setAvatarKey(profile.avatarKey)
        setSalaryDay(profile.salaryDay)
        setSavings({
          enabled: profile.savingsEnabled,
          savingsPercent: profile.savingsPercent,
          defaultSalaryAmount: profile.defaultSalaryAmount,
          salaryCategoryId: profile.salaryCategoryId,
        })
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
    // Uscire non ha senso senza un account, e lascerebbe davanti alla pagina di
    // accesso, da cui in locale non si entra.
    if (isLocalMode) return
    // L'uscita è una navigazione interna, non ricarica la pagina: senza questa
    // riga la cache sopravviverebbe, e chi entra dopo sullo stesso telefono
    // vedrebbe per un attimo i conti di chi è uscito. (Il reindirizzamento su
    // 401 invece ricarica la pagina, e la cache se ne va da sé.)
    queryClient.clear()
    localStorage.removeItem('token')
    localStorage.removeItem('email')
    setToken(null)
    setEmail(null)
    setNickname(null)
    setAvatarKey(null)
    setSalaryDay(null)
    setSavings(SAVINGS_DISABLED)
  }

  return (
    <AuthContext.Provider
      value={{
        token,
        email,
        nickname,
        setNickname,
        avatarKey,
        setAvatarKey,
        salaryDay,
        setSalaryDay,
        savings,
        setSavings,
        login,
        register,
        logout,
      }}
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
