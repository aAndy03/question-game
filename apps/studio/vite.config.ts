import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

/**
 * Studio is served under `/studio/` in **both** dev and the bundle.
 *
 * That is not cosmetic. Tauri's capability files scope permissions to
 * `URL: local`, and a webview pointed at an *external* URL — which
 * `http://localhost:5180` is, localhost or not — is remote, so every command
 * and even `event.listen` is denied. Keeping one path for dev and prod lets
 * `crates/app` open both windows with `WebviewUrl::App(...)`, which resolves
 * against `devUrl` in dev and `frontendDist` in the bundle, and is local in
 * both. There is no `is_dev()` branch anywhere as a result.
 *
 * This server is also the app's single dev origin: `/stage` proxies to the
 * Stage dev server so the two webviews share one origin. Stage still runs
 * standalone on 5180 for screen work (`npm run dev:stage`).
 */
export default defineConfig({
  base: '/studio/',
  build: { outDir: '../../dist/studio', emptyOutDir: true },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5181,
    strictPort: true,
    proxy: {
      // Stage serves under `/stage/` too, so nothing needs rewriting.
      // `ws` keeps its HMR socket working through the proxy.
      '/stage': { target: 'http://localhost:5180', ws: true },
    },
  },
})
