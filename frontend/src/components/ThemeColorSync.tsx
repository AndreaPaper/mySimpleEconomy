import { useEffect, useRef } from 'react'

/**
 * Tiene la barra del browser (sul telefono: quella in cima, con ora e batteria)
 * dello stesso colore dello sfondo della pagina.
 *
 * Quel colore lo decide il meta theme-color, ed era fisso sul verde del tema
 * vecchio: con tema e palette scelti dall'utente stonava sempre. Invece di una
 * seconda tabella di colori da tenere allineata al CSS, si legge il colore vero:
 * un elemento nascosto con le stesse classi dello sfondo del Layout, che ogni
 * palette ridefinisce in index.css. Una palette nuova funziona così da sola.
 *
 * Si riallinea quando cambia la classe "dark" o data-palette sull'elemento html,
 * cioè quando lo cambiano ThemeContext e PaletteContext.
 */
export default function ThemeColorSync() {
  const probe = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const sync = () => {
      if (!probe.current) return
      const color = getComputedStyle(probe.current).backgroundColor
      // Trasparente vuol dire CSS non ancora caricato: meglio tenere il colore di
      // partenza di index.html che dipingere la barra di nero.
      if (!color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)') return
      // Tutti i meta, anche quelli con media (chiaro/scuro del telefono): il tema
      // scelto nell'app vale più di quello del sistema.
      document
        .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
        .forEach((meta) => meta.setAttribute('content', color))
    }

    sync()
    // Di nuovo a pagina caricata: se il CSS arriva dopo il primo tentativo, lo
    // sfondo era ancora trasparente e la barra è rimasta sul colore di partenza.
    window.addEventListener('load', sync)
    const observer = new MutationObserver(sync)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-palette'] })
    return () => {
      window.removeEventListener('load', sync)
      observer.disconnect()
    }
  }, [])

  return <div ref={probe} aria-hidden="true" className="hidden bg-brand-100 dark:bg-black" />
}
