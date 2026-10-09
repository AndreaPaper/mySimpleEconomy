import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import UpdatePrompt from './components/UpdatePrompt'

// Il service worker lo registra UpdatePrompt, che avvisa quando c'è una versione
// nuova. Sta accanto all'app e non dentro, così l'avviso compare anche nella
// pagina di accesso.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <UpdatePrompt />
  </StrictMode>,
)
