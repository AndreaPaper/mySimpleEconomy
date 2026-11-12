import type { LocalDatabase } from '../db/database'
import { newId, nowIso } from '../ids'
import { badRequest, conflict, notFound } from '../router'
import { bodyOf, optionalString, requiredEnum, requiredString, type Body } from '../validate'

// Porting di CategoryService (backend/.../service/CategoryService.java).

export type CategoryType = 'INCOME' | 'EXPENSE'

export interface CategoryRow {
  id: string
  name: string
  type: CategoryType
  color: string | null
  icon: string | null
  parent_id: string | null
  archived: number
  created_at: string
}

const DEFAULT_CATEGORIES: { name: string; type: CategoryType; color: string; icon: string }[] = [
  { name: 'Alimentari', type: 'EXPENSE', color: '#22C55E', icon: 'ShoppingCart' },
  { name: 'Casa', type: 'EXPENSE', color: '#F59E0B', icon: 'Home' },
  { name: 'Bollette', type: 'EXPENSE', color: '#EAB308', icon: 'Zap' },
  { name: 'Trasporti', type: 'EXPENSE', color: '#3B82F6', icon: 'Car' },
  { name: 'Salute', type: 'EXPENSE', color: '#EF4444', icon: 'HeartPulse' },
  { name: 'Ristoranti', type: 'EXPENSE', color: '#F97316', icon: 'UtensilsCrossed' },
  { name: 'Svago', type: 'EXPENSE', color: '#A855F7', icon: 'Gamepad2' },
  { name: 'Abbigliamento', type: 'EXPENSE', color: '#EC4899', icon: 'Shirt' },
  { name: 'Istruzione', type: 'EXPENSE', color: '#06B6D4', icon: 'GraduationCap' },
  { name: 'Altre spese', type: 'EXPENSE', color: '#64748B', icon: 'Package' },
  { name: 'Stipendio', type: 'INCOME', color: '#10B981', icon: 'Wallet' },
  { name: 'Regali', type: 'INCOME', color: '#D946EF', icon: 'Gift' },
  { name: 'Investimenti', type: 'INCOME', color: '#14B8A6', icon: 'TrendingUp' },
  { name: 'Altre entrate', type: 'INCOME', color: '#84CC16', icon: 'HandCoins' },
]

const COLOR = /^#[0-9A-Fa-f]{6}$/
// Come Postgres: l'ordine in cui le categorie sono state create.
const ORDER = 'ORDER BY created_at, rowid'

export function categoryResponse(row: CategoryRow) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    color: row.color,
    icon: row.icon,
    parentId: row.parent_id,
    archived: row.archived === 1,
  }
}

export function findCategory(db: LocalDatabase, id: string): CategoryRow {
  const row = db.get<CategoryRow>('SELECT * FROM categories WHERE id = :id', { id })
  if (!row) throw notFound('Categoria non trovata')
  return row
}

/** Come existsByUserIdAndNameIgnoreCase: ignora maiuscole anche sulle lettere accentate. */
export function findCategoryByName(db: LocalDatabase, name: string): CategoryRow | undefined {
  const wanted = name.toLocaleLowerCase('it')
  return db.all<CategoryRow>('SELECT * FROM categories').find((c) => c.name.toLocaleLowerCase('it') === wanted)
}

export function insertCategory(
  db: LocalDatabase,
  c: { name: string; type: CategoryType; color: string | null; icon: string | null; parentId: string | null },
): CategoryRow {
  const id = newId()
  db.run(
    `INSERT INTO categories (id, name, type, color, icon, parent_id, archived, created_at)
     VALUES (:id, :name, :type, :color, :icon, :parentId, 0, :now)`,
    { id, ...c, now: nowIso() },
  )
  return findCategory(db, id)
}

function color(body: Body): string | null {
  const value = optionalString(body, 'color')
  if (value !== null && !COLOR.test(value)) {
    throw badRequest('Il colore deve essere in formato esadecimale, es. #3B82F6')
  }
  return value
}

// Il padre deve esistere, avere lo stesso tipo e non essere a sua volta figlio: la
// gerarchia è a un solo livello.
function resolveParent(db: LocalDatabase, parentId: string | null, childType: CategoryType): string | null {
  if (parentId === null) return null
  const parent = findCategory(db, parentId)
  if (parent.type !== childType) {
    throw badRequest('La sottocategoria deve essere dello stesso tipo della categoria padre')
  }
  if (parent.parent_id !== null) {
    throw badRequest('Una sottocategoria non può contenere altre sottocategorie')
  }
  return parent.id
}

export function listCategories(db: LocalDatabase) {
  return db.all<CategoryRow>(`SELECT * FROM categories WHERE archived = 0 ${ORDER}`).map(categoryResponse)
}

export function listArchivedCategories(db: LocalDatabase) {
  return db.all<CategoryRow>(`SELECT * FROM categories WHERE archived = 1 ${ORDER}`).map(categoryResponse)
}

export function createCategory(db: LocalDatabase, raw: unknown) {
  const body = bodyOf(raw)
  const name = requiredString(body, 'name')
  const type = requiredEnum(body, 'type', ['INCOME', 'EXPENSE'] as const)
  if (findCategoryByName(db, name)) throw conflict('Esiste già una categoria con questo nome')
  return db.transaction(() =>
    categoryResponse(
      insertCategory(db, {
        name,
        type,
        color: color(body),
        icon: optionalString(body, 'icon'),
        parentId: resolveParent(db, optionalString(body, 'parentId'), type),
      }),
    ),
  )
}

export function updateCategory(db: LocalDatabase, id: string, raw: unknown) {
  const body = bodyOf(raw)
  const category = findCategory(db, id)
  const name = requiredString(body, 'name')
  const parentId = optionalString(body, 'parentId')

  if (category.name.toLocaleLowerCase('it') !== name.toLocaleLowerCase('it') && findCategoryByName(db, name)) {
    throw conflict('Esiste già una categoria con questo nome')
  }
  if (parentId !== null) {
    if (parentId === id) throw badRequest('Una categoria non può essere sottocategoria di se stessa')
    // Con dei figli, agganciarla a un padre creerebbe un terzo livello.
    if (db.get('SELECT 1 AS x FROM categories WHERE parent_id = :id', { id })) {
      throw badRequest(
        'Questa categoria ha già delle sottocategorie: non può diventare a sua volta una sottocategoria',
      )
    }
  }

  db.run('UPDATE categories SET name = :name, color = :color, icon = :icon, parent_id = :parent WHERE id = :id', {
    id,
    name,
    color: color(body),
    icon: optionalString(body, 'icon'),
    parent: resolveParent(db, parentId, category.type),
  })
  return categoryResponse(findCategory(db, id))
}

// Find-or-create per nome: salta le categorie già presenti invece di fallire.
export function generateDefaultCategories(db: LocalDatabase) {
  return db.transaction(() =>
    DEFAULT_CATEGORIES.filter((c) => !findCategoryByName(db, c.name)).map((c) =>
      categoryResponse(insertCategory(db, { ...c, parentId: null })),
    ),
  )
}

// Archiviando un padre si archiviano anche i figli: altrimenti ricomparirebbero in
// elenco come categorie principali, staccate dal contesto che li spiegava.
export function archiveCategory(db: LocalDatabase, id: string): void {
  findCategory(db, id)
  db.run('UPDATE categories SET archived = 1 WHERE id = :id OR parent_id = :id', { id })
}

// Al contrario dell'archiviazione risale al padre: una sottocategoria riattivata sotto
// un padre archiviato sarebbe irraggiungibile. I fratelli restano archiviati.
export function unarchiveCategory(db: LocalDatabase, id: string): void {
  const category = findCategory(db, id)
  db.transaction(() => {
    db.run('UPDATE categories SET archived = 0 WHERE id = :id', { id })
    if (category.parent_id) db.run('UPDATE categories SET archived = 0 WHERE id = :p', { p: category.parent_id })
  })
}

// Possibile solo se niente la usa più: le chiavi esterne verso categories sono tutte
// RESTRICT, e il vincolo dice di no.
export function deleteCategory(db: LocalDatabase, id: string): void {
  findCategory(db, id)
  try {
    db.run('DELETE FROM categories WHERE id = :id', { id })
  } catch (error) {
    if (String(error).includes('FOREIGN KEY')) {
      throw conflict(
        'Categoria in uso (sottocategorie, transazioni, ricorrenze, debiti o promemoria collegati): archiviala invece di eliminarla',
      )
    }
    throw error
  }
}
