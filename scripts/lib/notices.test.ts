import { describe, expect, it } from 'vitest'
import { audit, cargoPackages, licenceAllowed, npmPackages, render, type Pkg } from './notices'

const pkg = (name: string, license: string | null): Pkg => ({ ecosystem: 'npm', name, version: '1.0.0', license, dir: null })

describe('licenceAllowed', () => {
  it.each(['MIT', 'MIT/Apache-2.0', '(MIT OR Apache-2.0) AND Unicode-3.0', 'Apache-2.0 WITH LLVM-exception', 'MIT OR Apache-2.0 OR LGPL-2.1-or-later'])(
    'allows %s',
    (expr) => expect(licenceAllowed(expr)).toBe(true),
  )

  it.each(['GPL-2.0-only', 'MIT AND GPL-2.0-only', null, "Standard 'no charge' license: https://gsap.com/standard-license."])(
    'refuses %s',
    (expr) => expect(licenceAllowed(expr)).toBe(false),
  )
})

describe('audit', () => {
  it('excepts GSAP and refuses an unknown licence', () => {
    const refused = audit([pkg('gsap', 'Standard'), pkg('@gsap/react', 'SEE LICENSE'), pkg('left-pad', 'WTFPL'), pkg('react', 'MIT')])
    expect(refused.map((p) => p.name)).toEqual(['left-pad'])
  })
})

describe('cargoPackages', () => {
  it('walks normal edges only and skips the workspace', () => {
    const p = (id: string, license = 'MIT') => ({ id, name: id, version: '1.0.0', license, manifest_path: `/r/${id}/Cargo.toml` })
    const metadata = {
      packages: [p('questiongame-app'), p('questiongame-host'), p('serde'), p('proptest', 'GPL-2.0-only'), p('cc'), p('serde_derive')],
      resolve: {
        nodes: [
          {
            id: 'questiongame-app',
            deps: [
              { pkg: 'questiongame-host', dep_kinds: [{ kind: null }] },
              { pkg: 'proptest', dep_kinds: [{ kind: 'dev' }] },
              { pkg: 'cc', dep_kinds: [{ kind: 'build' }] },
            ],
          },
          { id: 'questiongame-host', deps: [{ pkg: 'serde', dep_kinds: [{ kind: null }] }] },
          { id: 'serde', deps: [{ pkg: 'serde_derive', dep_kinds: [{ kind: null }] }] },
        ],
      },
    }
    const names = cargoPackages(metadata, 'questiongame-app').map((x) => x.name)
    expect(names).toEqual(['serde', 'serde_derive'])
    expect(cargoPackages(metadata, 'questiongame-app')[0]?.dir).toBe('/r/serde')
  })
})

describe('npmPackages', () => {
  it('skips the workspace and dedupes', () => {
    const out = npmPackages([
      { name: 'questiongame', version: '1.0.1', license: 'GPL-3.0-or-later' },
      { name: '@questiongame/stage', version: '0.0.0', license: 'GPL-3.0-or-later' },
      { name: 'react', version: '19.0.0', license: 'MIT', path: '/n/react' },
      { name: 'react', version: '19.0.0', license: 'MIT', path: '/n/other/react' },
      { name: 'old', version: '1.0.0', license: { type: 'ISC' } },
    ])
    expect(out.map((p) => `${p.name}:${p.license}`)).toEqual(['old:ISC', 'react:MIT'])
  })
})

describe('render', () => {
  it('groups identical licence texts and lists packages without one', () => {
    const a = pkg('a', 'MIT')
    const b = pkg('b', 'MIT')
    const c = pkg('c', 'ISC')
    const gsap = pkg('gsap', 'Standard')
    const texts: Record<string, string> = { a: 'MIT text', b: 'MIT text', c: 'ISC text' }
    const out = render([a, b, c, gsap], (p) => texts[p.name] ?? null, [{ title: 'Fonts', text: 'OFL' }])
    expect(out).toContain('Additional permission under GNU GPL version 3 section 7')
    expect(out.match(/MIT text/g)?.length).toBe(1)
    expect(out).toMatch(/a 1\.0\.0 \(npm, MIT\)\nb 1\.0\.0 \(npm, MIT\)/)
    expect(out).toContain('Fonts')
    expect(out).toMatch(/gsap 1\.0\.0 \(npm\): Standard — GSAP Standard License/)
  })
})
