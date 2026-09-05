import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

/**
 * Stage is served under `/stage/` in **both** dev and the bundle — see
 * `apps/studio/vite.config.ts` for why the two paths have to match.
 *
 * Inside the app this server is reached through Studio's dev origin
 * (`http://localhost:5181/stage/`), so both webviews are local and the
 * `audience` capability's `URL: local` scope holds. Standalone it is
 * `http://localhost:5180/stage/`, where there is no host and Stage falls back
 * to the fixture strip.
 */
export default defineConfig({
  base: '/stage/',
  build: { outDir: '../../dist/stage', emptyOutDir: true },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: { port: 5180, strictPort: true },
})
