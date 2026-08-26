import { useEffect, useRef } from 'react'
import { FileSpreadsheet } from 'lucide-react'

interface FilePickerProps {
  file: File | null
  onChange: (file: File | null) => void
  accept?: string
}

// Riga compatta al posto del campo file del browser: icona, nome del file
// scelto e un pulsante. Il campo nativo resta, nascosto, perché è l'unico modo
// di aprire il dialogo di sistema — ma la sua resa cambia da browser a browser
// e non diceva quale file avessi scelto senza troncarlo a modo suo.
export default function FilePicker({ file, onChange, accept = '.xlsx' }: FilePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  // Quando chi ospita azzera la scelta (dopo un import, o con "Annulla") va
  // svuotato anche il campo nativo: altrimenti riscegliere lo stesso file non
  // emette alcun evento, e sembra che il click non abbia fatto niente.
  useEffect(() => {
    if (!file && inputRef.current) inputRef.current.value = ''
  }, [file])

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-brand-300 dark:bg-black px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand-100 dark:bg-zinc-900 text-slate-500 dark:text-slate-400">
          <FileSpreadsheet className="h-4 w-4" />
        </span>
        {/* truncate: i nomi degli estratti conto sono lunghi e la riga non deve
            allargarsi per colpa loro. */}
        <span className="truncate text-sm text-slate-600 dark:text-slate-300">
          {file ? file.name : 'Nessun file selezionato'}
        </span>
      </div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="shrink-0 rounded bg-brand-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-900"
      >
        Sfoglia
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        className="hidden"
      />
    </div>
  )
}
