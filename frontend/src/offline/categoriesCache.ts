import type { Category } from '../api/types'

const STORAGE_KEY = 'categories_cache'

export function cacheCategories(categories: Category[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(categories))
}

export function loadCachedCategories(): Category[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}
