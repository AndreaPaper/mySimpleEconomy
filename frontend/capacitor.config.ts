import type { CapacitorConfig } from '@capacitor/cli'

// L'app Android: la stessa web app, costruita in modalità locale (npm run
// build:android) e impacchettata da Capacitor. I dati restano sul telefono.
const config: CapacitorConfig = {
  // L'identificativo dell'app per Android. Non va più cambiato dopo la prima
  // installazione: per Android un id diverso è un'altra app, e l'aggiornamento non
  // troverebbe i dati di quella vecchia.
  appId: 'it.mysimpleeconomy.locale',
  appName: 'MyEconomy',
  webDir: 'dist',
  android: {
    // Da Android 15 le app disegnano anche sotto la barra di stato e quella di
    // navigazione: senza margini l'ora e la batteria finiscono sopra la prima card.
    // 'auto' aggiunge i margini solo dove Android impone il disegno a tutto schermo.
    adjustMarginsForEdgeToEdge: 'auto',
  },
}

export default config
