import axios from 'axios'

// In dev, Vite's proxy forwards /api to localhost:8080 (see vite.config.ts). In
// production there is no proxy, so the deployed frontend needs the real backend
// URL baked in at build time via VITE_API_BASE_URL.
const baseURL = import.meta.env.VITE_API_BASE_URL ?? '/api'

const client = axios.create({ baseURL })

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
    }
    return Promise.reject(error)
  },
)

export default client
