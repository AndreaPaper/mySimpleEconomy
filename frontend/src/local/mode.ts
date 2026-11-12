// La modalità dell'app, decisa quando la si costruisce.
//
// "server" è la web app di sempre: i dati stanno nel database dietro al backend
// Spring. "local" è l'app Android senza server: i dati stanno in un database
// SQLite sul telefono e la logica del backend gira qui dentro, in src/local.
//
// È una costante di build (VITE_DATA_MODE), non un'impostazione: le due
// modalità non si mescolano nella stessa installazione.
export const isLocalMode = import.meta.env.VITE_DATA_MODE === 'local'
