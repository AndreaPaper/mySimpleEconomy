import { Link } from 'react-router-dom'
import ImportPanel from '../components/ImportPanel'

// L'importazione vive dentro la scheda "Importa" delle impostazioni. Questa
// pagina resta come indirizzo a sé: era già raggiungibile così, e un
// collegamento salvato non deve smettere di funzionare.
export default function ImportPage() {
  return (
    <div className="space-y-6">
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
