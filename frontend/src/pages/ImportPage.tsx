import { Link } from 'react-router-dom'
import ImportPanel from '../components/ImportPanel'

// L'importazione vive dentro la scheda "Importa" delle impostazioni. Questa
// pagina resta come indirizzo a sé: era già raggiungibile così, e un
// collegamento salvato non deve smettere di funzionare.
export default function ImportPage() {
  return (
    // Stessa larghezza delle impostazioni: il pannello non si vincola da sé,
    // così riempie la scheda "Importa" invece di restarci stretto dentro, e il
    // limite lo mette chi lo ospita.
    <div className="max-w-3xl space-y-6">
      <div>
        <Link to="/impostazioni" className="text-sm text-brand-700 hover:underline">
          ← Impostazioni
        </Link>
        <h1 className="text-lg font-semibold">Importa da Excel</h1>
      </div>

      <ImportPanel />
    </div>
  )
}
