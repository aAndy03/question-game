/**
 * `npm run release:route` (P13.0): the release workflow's first step. Reads
 * the run's ref, `package.json`'s version and the manual run's `channel`
 * input, and writes the route (`scripts/lib/release-route.ts`) to
 * `$GITHUB_OUTPUT` — or refuses, which fails the run before anything builds.
 */

import { appendFileSync, readFileSync } from 'node:fs'
import { route } from './lib/release-route'

const version = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version
const answer = route({
  ref: process.env.GITHUB_REF ?? '',
  refName: process.env.GITHUB_REF_NAME ?? '',
  version,
  ...(process.env.INPUT_CHANNEL ? { dispatchChannel: process.env.INPUT_CHANNEL } : {}),
})

if ('refused' in answer) {
  console.error(`release:route: ${answer.refused}`)
  process.exit(1)
}

const lines = [
  `channel=${answer.channel}`,
  `publish=${answer.publish}`,
  `prerelease=${answer.prerelease}`,
  `config_args=${answer.configArgs}`,
  `release_name=${answer.releaseName ?? ''}`,
]
console.log(lines.join('\n'))
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`)
