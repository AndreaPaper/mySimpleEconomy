import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Plus, Search } from 'lucide-react'
import { getCategoryIcon } from '../constants/icons'
import { flattenCategoryTree } from '../utils/categoryTree'
import type { Category } from '../api/types'

interface CategoryComboboxProps {
  // Già filtrate per tipo dal chiamante: qui dentro non si sa nulla di entrate
  // e uscite.
  categories: Category[]
  value: string
  onChange: (categoryId: string) => void
  onCreateNew: () => void
  id?: string
}

// Sfondo tenue ricavato dal colore della categoria: il colore pieno dietro un
// glifo dello stesso colore non si leggerebbe. Suffisso esadecimale invece dei
// canali separati perché il colore arriva già come stringa.
const SOFT_ALPHA = '22' // ~13%

// Categorie create prima delle icone, o importate, possono non avere colore.
const FALLBACK_COLOR = '#64748B'

export default function CategoryCombobox({ categories, value, onChange, onCreateNew, id }: CategoryComboboxProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)

  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const listboxId = `${useId()}-listbox`

  const entries = useMemo(() => flattenCategoryTree(categories), [categories])
  const byId = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])

  const parentNameOf = (category: Category) =>
    category.parentId ? (byId.get(category.parentId)?.name ?? '') : ''

  // Il confronto guarda anche il nome del padre: cercando "casa" devono
  // comparire pure le sue sottocategorie, che sono spesso proprio quello che
  // si sta cercando.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return entries
    return entries.filter((e) => {
      const parent = e.category.parentId ? (byId.get(e.category.parentId)?.name ?? '') : ''
      return e.category.name.toLowerCase().includes(q) || parent.toLowerCase().includes(q)
    })
  }, [entries, query, byId])

  const selected = value ? byId.get(value) : undefined

  // All'apertura la voce attiva è quella già scelta, non la prima: con una
  // ventina di categorie ripartire dall'inizio ogni volta obbliga a riscorrere
  // tutto per ritrovare il punto in cui si era.
  useEffect(() => {
    if (!open) return
    setQuery('')
    const index = entries.findIndex((e) => e.category.id === value)
    setActiveIndex(index >= 0 ? index : 0)
    inputRef.current?.focus()
  }, [open, value, entries])

  // Le frecce spostano la voce attiva anche oltre la parte visibile: senza
  // questo l'elenco resta fermo e si naviga alla cieca.
  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [open, activeIndex, filtered])

  // Escape intercettato in cattura sulla finestra: Modal ascolta lo stesso
  // tasto sulla stessa finestra ma in risalita, quindi senza fermarlo qui
  // chiudere il popover chiuderebbe anche il form, buttando via quel che si
  // stava scrivendo.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [open])

  // Chiusura al clic fuori, ristretta a questo componente: il clic fuori della
  // modale ha già le sue regole e non va toccato.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  const choose = (categoryId: string) => {
    onChange(categoryId)
    setOpen(false)
  }

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (filtered.length === 0) return
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((i) => (i + step + filtered.length) % filtered.length)
      return
    }
    if (e.key === 'Enter') {
      // Il combobox vive dentro un form: senza questo Invio lo invierebbe
      // invece di confermare la voce evidenziata.
      e.preventDefault()
      const entry = filtered[activeIndex]
      if (entry) choose(entry.category.id)
    }
  }

  const SelectedIcon = getCategoryIcon(selected?.icon)
  const selectedParent = selected ? parentNameOf(selected) : ''

  return (
    <div ref={wrapperRef} className="relative">
      <button
        id={id}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex w-full items-center gap-2.5 rounded-[10px] border bg-brand-300 px-3 py-[9px] text-left text-sm text-slate-900 focus:outline-none focus-visible:ring-3 focus-visible:ring-brand-700/15 dark:bg-black dark:text-white ${
          open ? 'border-brand-700' : 'border-slate-300 dark:border-slate-700'
        }`}
      >
        {selected ? (
          <>
            <span
              className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-md"
              style={{ backgroundColor: selected.color ?? FALLBACK_COLOR }}
            >
              <SelectedIcon className="h-[13px] w-[13px] text-white" />
            </span>
            <span className="min-w-0 flex-1 truncate">{selected.name}</span>
            {selectedParent && (
              <span className="hidden truncate text-[11px] text-slate-400 sm:block dark:text-slate-500">
                {selectedParent}
              </span>
            )}
          </>
        ) : (
          <span className="min-w-0 flex-1 truncate text-slate-400 dark:text-slate-500">Scegli una categoria</span>
        )}
        <ChevronDown className="h-4 w-4 flex-none text-slate-600 dark:text-slate-300" />
      </button>

      {open && (
        <div className="absolute inset-x-0 z-10 mt-1.5 overflow-hidden rounded-xl border border-slate-200 bg-brand-300 shadow-[0_18px_30px_-12px_rgba(11,42,69,0.28)] dark:border-slate-800 dark:bg-zinc-900">
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2.5 dark:border-slate-800">
            <Search className="h-3.5 w-3.5 flex-none text-slate-400 dark:text-slate-500" />
            {/* role="combobox" sull'input e non sul bottone che apre: è l'input
                a comandare l'elenco, ed è il solo che possa portare
                aria-activedescendant mentre si scrive. */}
            <input
              ref={inputRef}
              role="combobox"
              aria-expanded
              aria-controls={listboxId}
              aria-autocomplete="list"
              aria-activedescendant={
                filtered[activeIndex] ? `${listboxId}-${filtered[activeIndex].category.id}` : undefined
              }
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setActiveIndex(0)
              }}
              onKeyDown={handleInputKeyDown}
              placeholder="Cerca categoria…"
              className="min-w-0 flex-1 border-0 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-white dark:placeholder:text-slate-500"
            />
            <span className="flex-none text-[11px] text-slate-400 dark:text-slate-500">
              {filtered.length}/{entries.length}
            </span>
          </div>

          <div ref={listRef} id={listboxId} role="listbox" className="max-h-[244px] overflow-y-auto p-1.5">
            {filtered.map((entry, index) => {
              const { category, depth } = entry
              const Icon = getCategoryIcon(category.icon)
              const color = category.color ?? FALLBACK_COLOR
              const isSelected = category.id === value
              const isActive = index === activeIndex
              return (
                <button
                  key={category.id}
                  id={`${listboxId}-${category.id}`}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  data-active={isActive}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(category.id)}
                  className={`flex w-full items-center gap-2.5 rounded-lg text-left text-slate-900 dark:text-white ${
                    depth === 1
                      ? 'py-1.5 pl-[22px] pr-2.5 text-[13px] font-normal'
                      : 'px-2.5 py-[7px] text-[13.5px] font-bold'
                  } ${isSelected ? 'bg-brand-700/12' : isActive ? 'bg-brand-700/[0.06]' : ''}`}
                >
                  {/* La principale porta la tessera piena, la sottocategoria la
                      pastiglia tonda tenue: la gerarchia si vede dalla forma,
                      non dal solo rientro. */}
                  {depth === 1 ? (
                    <span
                      className="flex h-5 w-5 flex-none items-center justify-center rounded-full"
                      style={{ backgroundColor: `${color}${SOFT_ALPHA}` }}
                    >
                      <Icon className="h-3 w-3" style={{ color }} />
                    </span>
                  ) : (
                    <span
                      className="flex h-6 w-6 flex-none items-center justify-center rounded-[7px]"
                      style={{ backgroundColor: color }}
                    >
                      <Icon className="h-3.5 w-3.5 text-white" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate">{category.name}</span>
                  {isSelected && <Check className="h-3.5 w-3.5 flex-none text-brand-700" />}
                </button>
              )
            })}
            {filtered.length === 0 && (
              <p className="px-3 py-[22px] text-center text-[13px] text-slate-400 dark:text-slate-500">
                Nessuna categoria trovata
              </p>
            )}
          </div>

          <div className="border-t border-slate-100 p-2 dark:border-slate-800">
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                onCreateNew()
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-[7px] text-left text-[13px] font-bold text-brand-700 hover:bg-brand-700/[0.06]"
            >
              <Plus className="h-[15px] w-[15px] flex-none" />
              Nuova categoria
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
