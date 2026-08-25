import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Fixed port for the local Dream Analysis backend (server/index.ts). Not
// read from process.env.PORT here — that variable is also used to select
// Vite's own dev server port in some environments, and reusing the name
// for both would make this proxy target collide with Vite's own port.
const DREAM_ANALYSIS_BACKEND_PORT = 8787

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${DREAM_ANALYSIS_BACKEND_PORT}`,
        changeOrigin: true,
      },
    },
  },
})
