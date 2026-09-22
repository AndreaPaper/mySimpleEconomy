import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

interface PasswordInputProps {
  id: string
  value: string
  onChange: (value: string) => void
  required?: boolean
  minLength?: number
  autoFocus?: boolean
}

// Campo password con l'occhio per mostrarla in chiaro. Una password digitata a
// tentoni si sbaglia e non si sa dove: qui la si può rileggere prima di
// mandarla. Parte sempre nascosta, e ogni campo si ricorda il proprio stato:
// mostrarla è una scelta momentanea, non un'impostazione.
export default function PasswordInput({ id, value, onChange, required, minLength, autoFocus }: PasswordInputProps) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        required={required}
        minLength={minLength}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-slate-300 px-3 py-2 pr-10 text-sm dark:border-slate-700 dark:bg-black dark:text-white"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        // Senza etichetta il bottone è muto per un lettore di schermo: l'icona
        // da sola non dice cosa fa né in che stato si trova.
        aria-label={visible ? 'Nascondi la password' : 'Mostra la password'}
        aria-pressed={visible}
        className="absolute right-0 top-0 flex h-full items-center px-3 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}
