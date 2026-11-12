import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import UpdatePrompt from './components/UpdatePrompt'
import ThemeColorSync from './components/ThemeColorSync'
import { isLocalMode } from './local/mode'

// Il service worker lo registra UpdatePrompt, che avvisa quando c'è una versione
// nuova. Sta accanto all'app e non dentro, così l'avviso compare anche nella
// pagina di accesso. Non nell'app Android: lì le versioni nuove arrivano come APK, e
// un service worker terrebbe in cache i file della versione vecchia anche dopo
// l'aggiornamento.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    {!isLocalMode && <UpdatePrompt />}
    <ThemeColorSync />
  </StrictMode>,
)
