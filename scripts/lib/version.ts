/**
 * Version arithmetic and the version files (P13.0), for `npm run
 * version:stable` / `version:beta` (`scripts/version.ts`). Pure: no git, no
 * file system — `scripts/lib/bump.ts` does those.
 *
 *   stable   X.Y.Z → patch | minor | major, on release/1.x only
 *   beta     X.Y.Z-beta.N → X.Y.Z-beta.(N+1), on main only
 *            X.Y.Z → A.B.C-beta.0 only with --start A.B.C (once, by hand)
 */

export type Line = 'stable' | 'beta'
export type Bump = 'patch' | 'minor' | 'major'
export type Refusal = { readonly refused: string }

const STABLE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const BETA = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-beta\.(0|[1-9]\d*)$/

/** Where each line is bumped. */
export const BRANCH: Readonly<Record<Line, string>> = { stable: 'release/1.x', beta: 'main' }

function core(version: string): [number, number, number] | null {
  const m = STABLE.exec(version)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

function greater(a: [number, number, number], b: [number, number, number]): boolean {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i]! > b[i]!
  return false
}

export function nextVersion(current: string, line: Line, opts: { readonly bump?: Bump; readonly start?: string }): string | Refusal {
  if (line === 'stable') {
    const bump = opts.bump ?? 'patch'
    if (bump !== 'patch' && bump !== 'minor' && bump !== 'major') return { refused: `\`${String(bump)}\` is not a bump: use patch, minor or major` }
    const c = core(current)
    if (c === null) return { refused: `${current} is not a stable version; version:stable bumps X.Y.Z on release/1.x` }
    const [x, y, z] = c
    return bump === 'major' ? `${x + 1}.0.0` : bump === 'minor' ? `${x}.${y + 1}.0` : `${x}.${y}.${z + 1}`
  }
  const beta = BETA.exec(current)
  if (opts.start !== undefined) {
    const from = core(current)
    const to = core(opts.start)
    if (beta !== null) return { refused: `${current} is already a beta; --start only moves a stable base to its first beta` }
    if (from === null) return { refused: `${current} is not a stable version to start a beta from` }
    if (to === null) return { refused: `--start ${opts.start} is not X.Y.Z` }
    if (!greater(to, from)) return { refused: `--start ${opts.start} must be newer than ${current}` }
    return `${opts.start}-beta.0`
  }
  if (beta !== null) return `${beta[1]}.${beta[2]}.${beta[3]}-beta.${Number(beta[4]) + 1}`
  if (core(current) !== null) {
    return { refused: `${current} is a stable base. Move main to its first beta once, by hand: npm run version:beta -- --start <X.Y.Z>` }
  }
  if (/-beta$/.test(current)) return { refused: `${current} has no beta number: expected X.Y.Z-beta.N` }
  if (/^\d+\.\d+\.\d+-/.test(current)) return { refused: `${current} is not a beta: only X.Y.Z-beta.N is bumped` }
  return { refused: `${current} is not a version` }
}

/** `null` when the bump may run, else why not. */
export function checkPreconditions(p: {
  readonly line: Line
  readonly branch: string
  readonly dirty: boolean
  readonly target: string
  readonly whatsNewVersions: readonly string[]
}): string | null {
  const want = BRANCH[p.line]
  if (p.branch !== want) return `version:${p.line} runs on ${want}, not ${p.branch}`
  if (p.dirty) return 'the working tree has uncommitted changes: commit or stash them first'
  const unpublished = /-beta\.0$/.test(p.target)
  if (!unpublished && !p.whatsNewVersions.includes(p.target)) {
    return `What's new has no notes for ${p.target} in every language: add them to apps/studio/src/copy/whatsNew.ts first`
  }
  return null
}

/** The `version = "…"` line inside `[workspace.package]`, and only that one. */
export function rewriteCargoVersion(source: string, version: string): string {
  const lines = source.split('\n')
  let inPackage = false
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i]!.trim()
    if (t.startsWith('[')) {
      inPackage = t === '[workspace.package]'
      continue
    }
    if (inPackage && /^version\s*=/.test(t)) {
      lines[i] = lines[i]!.replace(/"[^"]*"/, `"${version}"`)
      return lines.join('\n')
    }
  }
  throw new Error('Cargo.toml: no version line in [workspace.package]')
}

/** The top-level `"version": "…"` of a JSON file, formatting kept. */
export function rewriteJsonVersion(source: string, version: string): string {
  const m = /^(\s{0,2}"version"\s*:\s*)"[^"]*"/m.exec(source)
  if (m === null) throw new Error('no top-level "version" key')
  return source.slice(0, m.index) + `${m[1]}"${version}"` + source.slice(m.index + m[0].length)
}

/** `assert_eq!(version, "…");` in `crates/app/tests/bundle.rs`. */
export function rewriteBundleTest(source: string, version: string): string {
  const re = /(assert_eq!\(version, )"[^"]*"(\);)/
  if (!re.test(source)) throw new Error('crates/app/tests/bundle.rs: the expected-version assertion is gone')
  return source.replace(re, `$1"${version}"$2`)
}
