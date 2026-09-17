/**
 * What a release bundle may not contain (P12.3). Pure: `scan` takes file
 * names and contents; `scripts/release-check.ts` walks `dist/`.
 *
 * - **Nothing loaded from the network.** The app is offline-first; a script,
 *   stylesheet, image or fetch pointed at `http(s)://` is a show that breaks
 *   the day the venue has no Wi-Fi.
 * - **No dev server.** `localhost:5180/5181` means a dev URL leaked.
 * - **No dev diagnostics.** A `perf_report` call site means the
 *   `import.meta.env.DEV` gate did not fold (P12.1).
 * - **No fake host.** `__QG_FAKE_HOST__` is `fake.ts`'s marker; seeing it
 *   means the in-memory host shipped.
 */

export interface Finding {
  readonly file: string
  readonly rule: string
  readonly excerpt: string
}

interface Rule {
  readonly name: string
  readonly ext: readonly string[] | null
  readonly pattern: RegExp
}

const RULES: readonly Rule[] = [
  { name: 'external resource', ext: ['.html'], pattern: /<(?:script|link|img|iframe|audio|video|source)\b[^>]*\b(?:src|href)\s*=\s*["']?https?:\/\//gi },
  { name: 'external url()', ext: ['.css', '.js'], pattern: /url\(\s*["']?https?:\/\//gi },
  { name: 'external @import', ext: ['.css'], pattern: /@import\s+(?:url\()?\s*["']?https?:\/\//gi },
  { name: 'external fetch', ext: ['.js'], pattern: /\bfetch\(\s*["'`]https?:\/\//g },
  { name: 'external import()', ext: ['.js'], pattern: /\bimport\(\s*["'`]https?:\/\//g },
  { name: 'dev server', ext: null, pattern: /localhost:518[01]/g },
  { name: 'perf_report call', ext: ['.js'], pattern: /\(\s*["'`]perf_report["'`]/g },
  { name: 'fake host', ext: ['.js'], pattern: /__QG_FAKE_HOST__/g },
]

function extOf(file: string): string {
  const i = file.lastIndexOf('.')
  return i < 0 ? '' : file.slice(i).toLowerCase()
}

export function scan(files: readonly { name: string; text: string }[]): Finding[] {
  const out: Finding[] = []
  for (const { name, text } of files) {
    const ext = extOf(name)
    for (const rule of RULES) {
      if (rule.ext && !rule.ext.includes(ext)) continue
      for (const match of text.matchAll(rule.pattern)) {
        const at = match.index ?? 0
        out.push({ file: name, rule: rule.name, excerpt: text.slice(Math.max(0, at - 30), at + 60).replace(/\s+/g, ' ') })
      }
    }
  }
  return out
}
