import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  // Both webviews build into one `frontendDist` (`crates/app/tauri.conf.json`),
  // a directory each, and load from a relative base so `dist/studio/index.html`
  // finds its own assets.
  base: './',
  build: { outDir: '../../dist/studio', emptyOutDir: true },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: { port: 5181, strictPort: true },
})
