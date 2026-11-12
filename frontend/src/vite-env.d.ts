/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  // "local" per l'app Android senza server (vedi src/local/mode.ts).
  readonly VITE_DATA_MODE?: "server" | "local"
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
