import axios from 'axios'

// In dev, Vite's proxy forwards /api to localhost:8080 (see vite.config.ts). In
// production there is no proxy, so the deployed frontend needs the real backend
// URL baked in at build time via VITE_API_BASE_URL.
const baseURL = import.meta.env.VITE_API_BASE_URL ?? '/api'

// 10s: se Render è "addormentato" (cold start fino a ~60s), non ha senso far
// aspettare l'utente per un minuto prima di poter usare l'app offline.
const client = axios.create({ baseURL, timeout: 10000 })

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('email')
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    } else if (error.response === undefined && navigator.onLine) {
      // Rete presente ma nessuna risposta (timeout o connessione rifiutata):
      // il backend, non la rete, è irraggiungibile — es. Render in cold start.
      window.dispatchEvent(new Event('backend:unreachable'))
    }
    return Promise.reject(error)
  },
)

export default client
