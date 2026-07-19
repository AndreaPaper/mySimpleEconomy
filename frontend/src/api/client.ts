import axios from 'axios'

// Flag opzionale per richiesta: salta il fail-fast "backend irraggiungibile".
// Usato dal polling di OfflineSyncContext (che DEVE interrogare davvero il
// backend per capire quando torna su) e dal login (che deve aspettare).
declare module 'axios' {
  export interface AxiosRequestConfig {
    skipUnreachableCheck?: boolean
  }
}

// In dev, Vite's proxy forwards /api to localhost:8080 (see vite.config.ts). In
// production there is no proxy, so the deployed frontend needs the real backend
// URL baked in at build time via VITE_API_BASE_URL.
const baseURL = import.meta.env.VITE_API_BASE_URL ?? '/api'

// 10s: se Render è "addormentato" (cold start fino a ~60s), non ha senso far
// aspettare l'utente per un minuto prima di poter usare l'app offline.
const client = axios.create({ baseURL, timeout: 10000 })

// Una volta scoperto che il backend è giù, le chiamate successive falliscono
// subito invece di aspettare ognuna il proprio timeout: le pagine renderizzano
// immediatamente coi dati offline mentre il polling continua in background.
let backendUnreachable = false

client.interceptors.request.use((config) => {
  if (backendUnreachable && !config.skipUnreachableCheck) {
    // Stessa forma di un errore di rete axios (response === undefined), così
    // i chiamanti esistenti lo trattano come tale senza distinzioni.
    return Promise.reject(
      Object.assign(new Error('Backend non raggiungibile (fail-fast)'), {
        code: 'ERR_BACKEND_UNREACHABLE',
        config,
        response: undefined,
      }),
    )
  }
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

client.interceptors.response.use(
  (response) => {
    backendUnreachable = false
    return response
  },
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('email')
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    } else if (error.response === undefined && navigator.onLine && error.code !== 'ERR_BACKEND_UNREACHABLE') {
      // Rete presente ma nessuna risposta (timeout o connessione rifiutata):
      // il backend, non la rete, è irraggiungibile — es. Render in cold start.
      backendUnreachable = true
      window.dispatchEvent(new Event('backend:unreachable'))
    }
    return Promise.reject(error)
  },
)

export default client
