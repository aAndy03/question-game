import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

const CUE_PACK_DIR = fileURLToPath(new URL('../../packages/design-stage/audio', import.meta.url))

/**
 * Publishes the cue pack (`packages/design-stage/audio/*.wav`) under
 * `audio/` next to Stage — `/stage/audio/<file>` from the dev server (and so
 * through Studio's `/stage` proxy) and `dist/stage/audio/<file>` in the
 * bundle, which is where `paths_get.cuePack` points the operator.
 *
 * A plugin rather than `publicDir`: the files live in the design-system
 * package, not under this app, and a symlink into `public/` is not something
 * Windows can be relied on to keep. Only audio files are copied, so the
 * folder's README and manifest never ship.
 */
function cuePack(): Plugin {
  const files = () =>
    existsSync(CUE_PACK_DIR) ? readdirSync(CUE_PACK_DIR).filter((f) => /\.(wav|mp3|ogg)$/i.test(f)) : []
  const mime = (file: string) =>
    file.endsWith('.mp3') ? 'audio/mpeg' : file.endsWith('.ogg') ? 'audio/ogg' : 'audio/wav'

  return {
    name: 'questiongame:cue-pack',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // The base is still in the URL at this point; match it with or without
        // so the same handler answers a request that arrived through the proxy.
        const match = /^\/(?:stage\/)?audio\/([^/?#]+)/.exec(req.url ?? '')
        if (!match) return next()
        const file = basename(decodeURIComponent(match[1]!))
        const path = join(CUE_PACK_DIR, file)
        if (!files().includes(file) || !existsSync(path)) {
          res.statusCode = 404
          res.end()
          return
        }
        res.setHeader('Content-Type', mime(file))
        res.setHeader('Content-Length', statSync(path).size)
        res.setHeader('Cache-Control', 'no-cache')
        createReadStream(path).pipe(res)
      })
    },
    generateBundle() {
      for (const file of files()) {
        this.emitFile({ type: 'asset', fileName: `audio/${file}`, source: readFileSync(join(CUE_PACK_DIR, file)) })
      }
    },
  }
}

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
  plugins: [react(), tailwindcss(), cuePack()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: { port: 5180, strictPort: true },
})
