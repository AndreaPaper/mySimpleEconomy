/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,
      // public/manifest.webmanifest already exists and is linked from
      // index.html (from the PWA-installability work) — the plugin must
      // not generate or touch it.
      manifest: false,
      includeAssets: [
        'manifest.webmanifest',
        'icons/icon192.png',
        'icons/icon512.png',
        'icons/maskable512.png',
      ],
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  // I test stanno qui e non in un vitest.config a parte così ereditano plugin e
  // risoluzione dei moduli: senza, il modulo virtuale della PWA importato da
  // main.tsx non esisterebbe e andrebbe finto a mano.
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Escluso il resto perché per impostazione predefinita vitest guarda anche
    // dentro node_modules delle dipendenze.
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
