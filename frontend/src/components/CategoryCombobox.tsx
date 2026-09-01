import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Plus, Search, Tag } from 'lucide-react'
import { getCategoryIcon } from '../constants/icons'
import { flattenCategoryTree } from '../utils/categoryTree'
import type { Category } from '../api/types'

// Voce che vive nello stesso menu ma non è una categoria dell'utente:
// "Tutte le categorie" di un filtro, il "Non importare" della mappatura
// bancaria, le categorie che un import propone di creare. Stanno in cima,
// sopra l'albero.
export interface CategoryComboboxExtra {
  value: string
  label: string
  // Con un colore la voce prende la sua tessera, come una categoria vera;
  // senza, resta un'etichetta e basta.
  color?: string | null
  icon?: string | null
  hint?: string
}

interface CategoryComboboxProps {
  // Già filtrate dal chiamante (per tipo, per profondità): qui dentro non si
  // sa nulla di entrate, uscite o di chi può fare da padre.
  categories: Category[]
  value: string
  onChange: (value: string) => void
  // Senza, il piè di lista non compare: non ovunque si può creare al volo.
  onCreateNew?: () => void
  extraOptions?: CategoryComboboxExtra[]
  placeholder?: string
  // 'pill' è la forma compatta della barra filtri del desktop, dove il
  // selettore sta in riga con gli altri comandi invece che dentro un form.
  variant?: 'field' | 'pill'
  id?: string
  ariaLabel?: string
}

// Sfondo tenue ricavato dal colore della categoria: il colore pieno dietro un
// glifo dello stesso colore non si leggerebbe. Suffisso esadecimale invece dei
// canali separati perché il colore arriva già come stringa.
const SOFT_ALPHA = '22' // ~13%

// Categorie create prima delle icone, o importate, possono non avere colore.
const FALLBACK_COLOR = '#64748B'

type Row =
  | { kind: 'extra'; value: string; extra: CategoryComboboxExtra }
  | { kind: 'category'; value: string; category: Category; depth: 0 | 1 }

export default function CategoryCombobox({
  categories,
  value,
  onChange,
  onCreateNew,
  extraOptions,
  placeholder = 'Scegli una categoria',
  variant = 'field',
  id,
  ariaLabel,
}: CategoryComboboxProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  // Il popover vive in fondo al body, non accanto al trigger: certi elenchi
  // che lo ospitano scorrono (le righe di un import), e lì un figlio in
  // position:absolute verrebbe tagliato dal contenitore. In cambio la
  // posizione va calcolata a mano e riseguita a ogni scorrimento.
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null)

  const wrapperRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const listboxId = `${useId()}-listbox`

  const byId = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])

  const rows: Row[] = useMemo(
    () => [
      ...(extraOptions ?? []).map((extra) => ({ kind: 'extra' as const, value: extra.value, extra })),
      ...flattenCategoryTree(categories).map((e) => ({
        kind: 'category' as const,
        value: e.category.id,
        category: e.category,
        depth: e.depth,
      })),
    ],
    [categories, extraOptions],
  )

  // Il confronto guarda anche il nome del padre: cercando "casa" devono
  // comparire pure le sue sottocategorie, che sono spesso proprio quello che
  // si sta cercando.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) => {
      if (row.kind === 'extra') return row.extra.label.toLowerCase().includes(q)
      const parent = row.category.parentId ? (byId.get(row.category.parentId)?.name ?? '') : ''
      return row.category.name.toLowerCase().includes(q) || parent.toLowerCase().includes(q)
    })
  }, [rows, query, byId])

  const selectedRow = rows.find((r) => r.value === value)

  // All'apertura la voce attiva è quella già scelta, non la prima: con una
  // ventina di categorie ripartire dall'inizio ogni volta obbliga a riscorrere
  // tutto per ritrovare il punto in cui si era.
  useEffect(() => {
    if (!open) return
    setQuery('')
    const index = rows.findIndex((r) => r.value === value)
    setActiveIndex(index >= 0 ? index : 0)
    inputRef.current?.focus()
  }, [open, value, rows])

  // Calcolata prima della pittura, così il popover non compare in un punto per
  // poi saltare altrove sotto gli occhi di chi guarda. In cattura, perché a
  // scorrere può essere un contenitore interno e non la pagina.
  useLayoutEffect(() => {
    if (!open) return

    const update = () => {
      const trigger = wrapperRef.current?.getBoundingClientRect()
      if (!trigger) return

      const GAP = 6
      const MARGIN = 8
      const width = variant === 'pill' ? Math.max(260, trigger.width) : trigger.width
      const height = popoverRef.current?.offsetHeight ?? 320

      // Sopra il trigger solo se sotto non ci sta e sopra c'è più spazio:
      // altrimenti si aprirebbe verso l'alto anche quando basta scorrere.
      const spaceBelow = window.innerHeight - trigger.bottom - GAP
      const openUpward = height > spaceBelow && trigger.top - GAP > spaceBelow
      const top = openUpward ? Math.max(MARGIN, trigger.top - GAP - height) : trigger.bottom + GAP

      const left = Math.max(
        MARGIN,
        trigger.left + width > window.innerWidth - MARGIN ? trigger.right - width : trigger.left,
      )
      setPosition({ top, left, width })
    }

    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open, variant, filtered.length])

  // Le frecce spostano la voce attiva anche oltre la parte visibile: senza
  // questo l'elenco resta fermo e si naviga alla cieca.
  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [open, activeIndex, filtered])

  // Escape intercettato in cattura sulla finestra: Modal ascolta lo stesso
  // tasto sulla stessa finestra ma in risalita, quindi senza fermarlo qui
  // chiudere il popover chiuderebbe anche il form che lo contiene, buttando
  // via quel che si stava scrivendo.
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
      const target = e.target as Node
      // Il popover sta fuori dal wrapper (è in un portale): senza controllarlo
      // a parte, ogni clic al suo interno lo chiuderebbe.
      if (wrapperRef.current?.contains(target) || popoverRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  const choose = (rowValue: string) => {
    onChange(rowValue)
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
      const row = filtered[activeIndex]
      if (row) choose(row.value)
    }
  }

  const isPill = variant === 'pill'

  const renderTriggerContent = () => {
    if (!selectedRow) {
      return (
        <>
          {isPill && <Tag className="h-3.5 w-3.5 flex-none text-slate-500 dark:text-slate-400" />}
          <span className={`min-w-0 truncate ${isPill ? '' : 'flex-1'} text-slate-400 dark:text-slate-500`}>
            {placeholder}
          </span>
        </>
      )
    }
    if (selectedRow.kind === 'extra') {
      const { extra } = selectedRow
      const ExtraIcon = getCategoryIcon(extra.icon)
      return (
        <>
          {extra.color ? (
            <span
              className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-md"
              style={{ backgroundColor: extra.color }}
            >
              <ExtraIcon className="h-[13px] w-[13px] text-white" />
            </span>
          ) : (
            isPill && <Tag className="h-3.5 w-3.5 flex-none text-slate-500 dark:text-slate-400" />
          )}
          <span className={`min-w-0 truncate ${isPill ? '' : 'flex-1'}`}>{extra.label}</span>
        </>
      )
    }
    const { category } = selectedRow
    const Icon = getCategoryIcon(category.icon)
    const parentName = category.parentId ? (byId.get(category.parentId)?.name ?? '') : ''
    return (
      <>
        <span
          className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-md"
          style={{ backgroundColor: category.color ?? FALLBACK_COLOR }}
        >
          <Icon className="h-[13px] w-[13px] text-white" />
        </span>
        <span className={`min-w-0 truncate ${isPill ? '' : 'flex-1'}`}>{category.name}</span>
        {parentName && !isPill && (
          <span className="hidden truncate text-[11px] text-slate-400 sm:block dark:text-slate-500">{parentName}</span>
        )}
      </>
    )
  }

  return (
    <div ref={wrapperRef} className={`relative ${isPill ? 'inline-block shrink-0' : ''}`}>
      <button
        id={id}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={`flex items-center gap-2.5 border bg-brand-300 text-left text-sm text-slate-900 focus:outline-none focus-visible:ring-3 focus-visible:ring-brand-700/15 dark:bg-black dark:text-white ${
          isPill ? 'rounded-full px-3.5 py-2' : 'w-full rounded-[10px] px-3 py-[9px]'
        } ${open ? 'border-brand-700' : 'border-slate-300 dark:border-slate-700'}`}
      >
        {renderTriggerContent()}
        <ChevronDown className="h-4 w-4 flex-none text-slate-600 dark:text-slate-300" />
      </button>

      {open &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              top: position?.top ?? 0,
              left: position?.left ?? 0,
              width: position?.width,
              // Alla primissima passata la posizione non è ancora nota: si
              // misura il popover già montato, quindi lo si tiene invisibile
              // per quell'unico ciclo invece di mostrarlo nell'angolo.
              visibility: position ? 'visible' : 'hidden',
            }}
            className="fixed z-[60] overflow-hidden rounded-xl border border-slate-200 bg-brand-300 shadow-[0_18px_30px_-12px_rgba(11,42,69,0.28)] dark:border-slate-800 dark:bg-zinc-900"
          >
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
              aria-activedescendant={filtered[activeIndex] ? `${listboxId}-${filtered[activeIndex].value}` : undefined}
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
              {filtered.length}/{rows.length}
            </span>
          </div>

          <div ref={listRef} id={listboxId} role="listbox" className="max-h-[244px] overflow-y-auto p-1.5">
            {filtered.map((row, index) => {
              const isSelected = row.value === value
              const isActive = index === activeIndex
              const common = `flex w-full items-center gap-2.5 rounded-lg text-left text-slate-900 dark:text-white ${
                isSelected ? 'bg-brand-700/12' : isActive ? 'bg-brand-700/[0.06]' : ''
              }`

              if (row.kind === 'extra') {
                const { extra } = row
                const ExtraIcon = getCategoryIcon(extra.icon)
                return (
                  <button
                    key={`extra-${extra.value}`}
                    id={`${listboxId}-${extra.value}`}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    data-active={isActive}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => choose(extra.value)}
                    className={`${common} px-2.5 py-[7px] text-[13.5px] font-bold`}
                  >
                    {extra.color && (
                      <span
                        className="flex h-6 w-6 flex-none items-center justify-center rounded-[7px]"
                        style={{ backgroundColor: extra.color }}
                      >
                        <ExtraIcon className="h-3.5 w-3.5 text-white" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate">{extra.label}</span>
                    {extra.hint && (
                      <span className="flex-none text-[11px] font-normal text-slate-400 dark:text-slate-500">
                        {extra.hint}
                      </span>
                    )}
                    {isSelected && <Check className="h-3.5 w-3.5 flex-none text-brand-700" />}
                  </button>
                )
              }

              const { category, depth } = row
              const Icon = getCategoryIcon(category.icon)
              const color = category.color ?? FALLBACK_COLOR
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
                  className={`${common} ${
                    depth === 1
                      ? 'py-1.5 pl-[22px] pr-2.5 text-[13px] font-normal'
                      : 'px-2.5 py-[7px] text-[13.5px] font-bold'
                  }`}
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

          {onCreateNew && (
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
          )}
          </div>,
          document.body,
        )}
    </div>
  )
}
