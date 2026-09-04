/**
 * Writes the typed fixtures to `fixtures/*.json` for the Rust host.
 *
 * The TypeScript definitions in packages/contract are the source of truth; the
 * JSON is a generated artefact. At P6 the host must be able to reproduce each
 * file as a real `play-state` emission (roadmap P6 exit criteria).
 *
 * Run: npm run fixtures
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FIXTURES, FIXTURE_NAMES } from '../packages/contract/src/fixtures'

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures')
mkdirSync(outDir, { recursive: true })

for (const name of FIXTURE_NAMES) {
  writeFileSync(join(outDir, `${name}.json`), JSON.stringify(FIXTURES[name], null, 2) + '\n')
}

writeFileSync(
  join(outDir, 'index.json'),
  JSON.stringify({ fixtures: FIXTURE_NAMES }, null, 2) + '\n',
)

console.log(`wrote ${FIXTURE_NAMES.length} fixtures to fixtures/`)
