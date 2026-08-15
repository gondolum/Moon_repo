import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Fairy Stockfish WASM needs SharedArrayBuffer → COOP/COEP headers
function crossOriginIsolation() {
  return {
    name: 'cross-origin-isolation',
    configureServer(server: { middlewares: { use: (fn: (req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => void) => void } }) {
      server.middlewares.use((_req, res, next) => {
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
        // credentialless allows Lichess API + fonts while still enabling SharedArrayBuffer
        res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless')
        next()
      })
    },
    configurePreviewServer(server: { middlewares: { use: (fn: (req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => void) => void } }) {
      server.middlewares.use((_req, res, next) => {
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
        res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless')
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), crossOriginIsolation()],
  optimizeDeps: {
    exclude: ['fairy-stockfish-nnue.wasm'],
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
})
