import type { Category } from '../api/types'

const STORAGE_KEY = 'categories_cache'

export function cacheCategories(categories: Category[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(categories))
}

export function loadCachedCategories(): Category[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    // Stessa guardia di getQueue, e per lo stesso motivo: un JSON valido che non
    // è un elenco passava di qui intatto e faceva poi esplodere i .map() a
    // valle. Qui la posta è più bassa — la copia si riscrive alla prima
    // risposta del backend — ma un'app che non si apre offline è comunque
    // peggio di una che si apre senza categorie in memoria.
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}
