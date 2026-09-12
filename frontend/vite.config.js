import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The frontend always calls same-origin `/api/...` paths and never carries an
// environment-specific base URL — the server in front of it proxies them to
// FastAPI. `API_TARGET` exists so the Phase 4 gate can point a preview build at
// a backend it started itself on a free port, rather than trusting whatever is
// already answering on 8000.
const apiTarget = process.env.API_TARGET || 'http://127.0.0.1:8000'

const proxy = {
  '/api': {
    target: apiTarget,
    changeOrigin: true,
  },
}

// `preview` gets the proxy spelled out rather than inherited from `server`:
// the built bundle is what Phase 6 deploys and what the gate tests, so its API
// wiring should be visible here instead of resting on config fall-through.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy },
  preview: { port: 4173, proxy },
})
