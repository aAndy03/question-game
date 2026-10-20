/**
 * Which product a release workflow run builds, and whether it publishes
 * (P13.0). The workflow triggers on any `v*` tag and asks this; a tag that is
 * neither a stable nor a beta version, or that does not name the version in
 * `package.json`, is refused here rather than built.
 *
 *   vX.Y.Z           questiongame, a normal release
 *   vX.Y.Z-beta.N    questiongame Beta, a GitHub pre-release
 *   Run workflow     either, by its `channel` input, built and never published
 */

export interface Route {
  readonly channel: 'stable' | 'beta'
  readonly publish: boolean
  readonly prerelease: boolean
  /** Added to `tauri build`'s arguments. */
  readonly configArgs: string
  /** The GitHub release's title; `null` when nothing is published. */
  readonly releaseName: string | null
}

export const BETA_CONFIG_ARGS = '--config crates/app/tauri.beta.conf.json'

const STABLE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const BETA = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-beta\.(0|[1-9]\d*)$/

function channelOf(version: string): Route['channel'] | null {
  if (STABLE.test(version)) return 'stable'
  if (BETA.test(version)) return 'beta'
  return null
}

export function route(input: {
  readonly ref: string
  readonly refName: string
  readonly version: string
  readonly dispatchChannel?: string
}): Route | { readonly refused: string } {
  if (!input.ref.startsWith('refs/tags/')) {
    const channel = input.dispatchChannel ?? 'stable'
    if (channel !== 'stable' && channel !== 'beta') return { refused: `channel \`${channel}\`: expected stable or beta` }
    return { channel, publish: false, prerelease: false, configArgs: channel === 'beta' ? BETA_CONFIG_ARGS : '', releaseName: null }
  }
  const tag = input.refName
  const channel = tag.startsWith('v') ? channelOf(tag.slice(1)) : null
  if (channel === null) return { refused: `tag ${tag} is neither vX.Y.Z (stable) nor vX.Y.Z-beta.N (beta)` }
  if (tag !== `v${input.version}`) return { refused: `tag ${tag} does not name the version being built (${input.version} in package.json)` }
  return channel === 'stable'
    ? { channel, publish: true, prerelease: false, configArgs: '', releaseName: `questiongame ${tag}` }
    : { channel, publish: true, prerelease: true, configArgs: BETA_CONFIG_ARGS, releaseName: `questiongame Beta ${tag}` }
}
