/**
 * Third-party notices, and the licence audit they imply (P12.3).
 *
 * Pure: everything here takes data and returns data, so the rules are tested
 * without `cargo` or `npm`. `scripts/notices.ts` is the runner.
 *
 * The audit is an allowlist. A dependency under any other licence fails
 * `npm run build` until someone decides what to do about it — which is the
 * point: a GPL-3.0-or-later app may only ship what it can ship.
 */

/** SPDX ids a GPLv3 program may combine with and convey. */
export const ALLOWED: ReadonlySet<string> = new Set([
  'MIT',
  'MIT-0',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  'Zlib',
  '0BSD',
  'BSL-1.0',
  'Unicode-3.0',
  'Unicode-DFS-2016',
  'MPL-2.0',
  'CC0-1.0',
  'Unlicense',
  'OFL-1.1',
])

/**
 * Packages allowed despite their licence, and why. GSAP's Standard License is
 * not a free-software licence; the copyright holder's GPLv3 §7 additional
 * permission (README, About, the notices header) is what makes shipping it
 * possible.
 */
export const EXCEPTIONS: Readonly<Record<string, string>> = {
  gsap: 'GSAP Standard License; combined under the GPLv3 §7 additional permission',
  '@gsap/react': 'GSAP Standard License; combined under the GPLv3 §7 additional permission',
}

export const GPL_LINE =
  'questiongame is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version. It is distributed WITHOUT ANY WARRANTY; see LICENSE.txt.'

export const GSAP_PERMISSION =
  'Additional permission under GNU GPL version 3 section 7. If you modify this Program, or any covered work, by linking or combining it with GSAP (or a modified version of that library), containing parts covered by the terms of the GSAP Standard License, the licensors of this Program grant you additional permission to convey the resulting work.'

export interface Pkg {
  readonly ecosystem: 'cargo' | 'npm'
  readonly name: string
  readonly version: string
  readonly license: string | null
  /** The package's own folder, where its licence files are. */
  readonly dir: string | null
}

/**
 * Whether an SPDX expression is acceptable. `/` is the old cargo spelling of
 * OR; every AND term needs one OR alternative on the list; `WITH` exceptions
 * only ever add permissions, so they are dropped.
 */
export function licenceAllowed(expr: string | null | undefined): boolean {
  if (!expr) return false
  const normal = expr.replace(/\//g, ' OR ').replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!normal) return false
  return normal.split(' AND ').every((term) =>
    term
      .split(' OR ')
      .map((alt) => alt.replace(/ WITH .*$/, '').trim())
      .some((id) => ALLOWED.has(id)),
  )
}

/** The packages the audit refuses. */
export function audit(pkgs: readonly Pkg[]): Pkg[] {
  return pkgs.filter((p) => !(p.name in EXCEPTIONS) && !licenceAllowed(p.license))
}

interface CargoMetadata {
  readonly packages: readonly { id: string; name: string; version: string; license: string | null; manifest_path: string }[]
  readonly resolve: {
    readonly nodes: readonly {
      id: string
      deps: readonly { pkg: string; dep_kinds: readonly { kind: string | null }[] }[]
    }[]
  }
}

const isWorkspace = (name: string) => name === 'questiongame' || name.startsWith('questiongame-') || name.startsWith('@questiongame/')

/** Every crate `root` depends on at run time: normal edges only, workspace crates skipped. */
export function cargoPackages(metadata: CargoMetadata, root: string): Pkg[] {
  const byId = new Map(metadata.packages.map((p) => [p.id, p]))
  const nodes = new Map(metadata.resolve.nodes.map((n) => [n.id, n]))
  const start = metadata.packages.find((p) => p.name === root)
  if (!start) throw new Error(`cargo metadata has no package ${root}`)
  const seen = new Set<string>([start.id])
  const queue = [start.id]
  while (queue.length > 0) {
    const id = queue.shift()!
    for (const dep of nodes.get(id)?.deps ?? []) {
      if (!dep.dep_kinds.some((k) => k.kind === null)) continue
      if (seen.has(dep.pkg)) continue
      seen.add(dep.pkg)
      queue.push(dep.pkg)
    }
  }
  const out: Pkg[] = []
  for (const id of seen) {
    const p = byId.get(id)
    if (!p || isWorkspace(p.name)) continue
    out.push({ ecosystem: 'cargo', name: p.name, version: p.version, license: p.license, dir: dirname(p.manifest_path) })
  }
  return out.sort(byName)
}

interface NpmNode {
  readonly name?: string
  readonly version?: string
  readonly license?: string | { type?: string } | null
  readonly path?: string
}

/** `npm query .prod`, minus the workspace, one entry per name@version. */
export function npmPackages(nodes: readonly NpmNode[]): Pkg[] {
  const seen = new Map<string, Pkg>()
  for (const n of nodes) {
    if (!n.name || !n.version || isWorkspace(n.name)) continue
    const key = `${n.name}@${n.version}`
    if (seen.has(key)) continue
    const license = typeof n.license === 'string' ? n.license : (n.license?.type ?? null)
    seen.set(key, { ecosystem: 'npm', name: n.name, version: n.version, license, dir: n.path ?? null })
  }
  return [...seen.values()].sort(byName)
}

export interface Extra {
  readonly title: string
  readonly text: string
}

/**
 * The notices file: the app's own licence line and the GSAP permission, then
 * the extras (fonts), then every package grouped by identical licence text,
 * then the packages that ship no licence file, by their declared licence.
 */
export function render(pkgs: readonly Pkg[], readText: (pkg: Pkg) => string | null, extras: readonly Extra[] = []): string {
  const rule = '='.repeat(78)
  const out: string[] = [
    'questiongame — third-party notices',
    rule,
    '',
    GPL_LINE,
    '',
    GSAP_PERMISSION,
    '',
  ]
  for (const extra of extras) {
    out.push(rule, extra.title, rule, '', extra.text.trim(), '')
  }
  const groups = new Map<string, Pkg[]>()
  const bare: Pkg[] = []
  for (const pkg of pkgs) {
    const text = readText(pkg)?.trim()
    if (!text) {
      bare.push(pkg)
      continue
    }
    const list = groups.get(text) ?? []
    list.push(pkg)
    groups.set(text, list)
  }
  for (const [text, list] of groups) {
    out.push(rule)
    for (const p of list) out.push(`${p.name} ${p.version} (${p.ecosystem}, ${p.license ?? 'no licence declared'})`)
    out.push(rule, '', text, '')
  }
  if (bare.length > 0) {
    out.push(rule, 'Packages that ship no licence file, under their declared licence', rule, '')
    for (const p of bare) {
      const why = EXCEPTIONS[p.name]
      out.push(`${p.name} ${p.version} (${p.ecosystem}): ${p.license ?? 'no licence declared'}${why ? ` — ${why}` : ''}`)
    }
    out.push('')
  }
  return out.join('\n')
}

function dirname(path: string): string {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return i < 0 ? '.' : path.slice(0, i)
}

function byName(a: Pkg, b: Pkg): number {
  return a.name === b.name ? a.version.localeCompare(b.version) : a.name.localeCompare(b.name)
}
