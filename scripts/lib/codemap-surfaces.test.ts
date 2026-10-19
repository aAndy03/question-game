import { describe, expect, it } from 'vitest'
import { readContract, type RustMap } from './codemap'
import {
  buildSurfaces,
  cssProperties,
  flattenJson,
  labelMatches,
  readCommandCalls,
  readE2eSpec,
  readListens,
  readQueryFlags,
  readSeeds,
  readStageCopy,
  readWorkflowJobs,
} from './codemap-surfaces'

const src = (path: string, text: string) => ({ path, text })

describe('stage readers', () => {
  it('finds the host commands, events and query flags a webview uses, and not tests', () => {
    const files = [
      src('apps/stage/src/host.ts', `await call('stage_ready', {}); void call('overlay_ack_complete'); listen<X>('play-state', f); new URLSearchParams(window.location.search).has('mirror')`),
      src('apps/stage/src/perf.ts', `postCommand('perf_report', {}); const q = new URLSearchParams(s); q.get('fixture'); other.get('nope')`),
      src('apps/stage/src/host.test.ts', `call('only_in_a_test')`),
    ]
    expect(readCommandCalls(files, ['call', 'postCommand'])).toEqual({
      overlay_ack_complete: ['apps/stage/src/host.ts'],
      perf_report: ['apps/stage/src/perf.ts'],
      stage_ready: ['apps/stage/src/host.ts'],
    })
    expect(readListens(files)).toEqual({ 'play-state': ['apps/stage/src/host.ts'] })
    expect(readQueryFlags(files)).toEqual({ mirror: ['apps/stage/src/host.ts'] })
  })

  it('reads the copy keys, languages and the title overrides resolveCopy routes', () => {
    const copy = readStageCopy(
      src(
        'apps/stage/src/copy/tables.ts',
        `export interface StageCopy { readonly b: string; readonly a: string; readonly screenTitle: Record<string, string> }
         export const COPY_TABLES = { en: X, ro: Y }
         export function resolveCopy(o) { const titles = { teamOrder: teamOrderTitle, scoreboard: scoreboardTitle } }`,
      ),
    )
    expect(copy).toEqual({ keys: ['a', 'b', 'screenTitle'], languages: ['en', 'ro'], titleKeys: ['scoreboardTitle', 'teamOrderTitle'] })
  })
})

describe('cssProperties', () => {
  it('lists definitions and not uses, with a hash of each value', () => {
    const css = `/* --commented: 1; */ :root { --ink: #000; --gap: 8px; } .x { color: var(--ink); } @media (x) { :root { --ink: #fff; } }`
    const props = cssProperties(css)
    expect(Object.keys(props)).toEqual(['--gap', '--ink'])
    expect(cssProperties(':root { --ink: #000; }')['--ink']).not.toBe(props['--ink'])
    expect(cssProperties(css)).toEqual(props)
  })
})

describe('config and windows', () => {
  it('flattens JSON to paths and hashes long strings', () => {
    const flat = flattenJson({ identifier: 'a.b', bundle: { targets: ['nsis'], windows: { nsis: { installMode: 'x' } } }, long: 'x'.repeat(200), list: [{ a: 1 }] })
    expect(flat.identifier).toBe('a.b')
    expect(flat['bundle.targets']).toEqual(['nsis'])
    expect(flat['bundle.windows.nsis.installMode']).toBe('x')
    expect(String(flat.long)).toMatch(/#[0-9a-f]{8}$/)
    expect(String(flat.list)).toMatch(/^#[0-9a-f]{8}$/)
  })

  it('matches window labels the way Tauri globs them', () => {
    expect(labelMatches('stage-*', 'stage-2')).toBe(true)
    expect(labelMatches('stage-*', 'stage')).toBe(false)
    expect(labelMatches('stage', 'stage')).toBe(true)
    expect(labelMatches('main', 'stats')).toBe(false)
  })
})

describe('workflow and e2e readers', () => {
  it('reads jobs, runs-on, needs and one-line run steps', () => {
    const jobs = readWorkflowJobs(
      [
        'name: Release',
        'jobs:',
        '  test:',
        '    name: Test',
        '    runs-on: windows-latest',
        '    steps:',
        '      - run: npm ci',
        '      - run: |',
        '          multi line',
        '  build:',
        '    needs: [test, e2e]',
        '    runs-on: ${{ matrix.os }}',
        'other:',
        '  ignored:',
      ].join('\n'),
    )
    expect(Object.keys(jobs)).toEqual(['test', 'build'])
    expect(jobs.test).toEqual({ name: 'Test', runsOn: 'windows-latest', needs: [], runs: ['npm ci'] })
    expect(jobs.build!.needs).toEqual(['test', 'e2e'])
  })

  it('reads describe and it titles and the SEEDS table', () => {
    const spec = readE2eSpec(src('e2e/specs/a.e2e.ts', `describe('a show', () => { it('loads', async () => {}); it('ends', () => {}) })`))
    expect(spec.titles).toEqual(['a show > loads', 'a show > ends'])
    const seeds = readSeeds(src('e2e/support/folders.ts', `const SEEDS = { 'a.e2e.ts': null, 'b.e2e.ts': ['--x'] }`))
    expect(seeds).toEqual({ 'a.e2e.ts': 'null', 'b.e2e.ts': "['--x']" })
  })
})

describe('buildSurfaces mismatches', () => {
  const rust: RustMap = {
    commands: [],
    guard: { labels: {}, stageCommands: ['stage_ready'], statsCommands: [] },
    handlers: [],
    events: [],
    plugins: [],
    hostApi: [],
    appApi: [],
    stageContractVersion: '8',
    settingsKeys: [],
    gameAffectingKeys: [],
    settingsStructs: [],
    migrations: [],
    metaKeys: [],
    identity: { DEV: 'org.q.app' },
    windows: [
      { label: 'main', url: 'a' },
      { label: 'orphan', url: 'b' },
      { label: 'mirror_label()', url: 'c' },
    ],
    cargo: { members: [], crates: [] },
  }
  const contract = readContract([
    src('packages/contract/src/commands.ts', `export const STAGE_EVENTS = ['play-state'] as const`),
    src('packages/contract/src/text.ts', `export const TEXT_KEYS = ['idleEyebrow', 'missingKey'] as const`),
    src('packages/contract/src/play-state.ts', `export const STAGE_LANGUAGES: readonly string[] = ['en', 'fr']`),
  ])

  it('reports drift between the pieces', () => {
    const { mismatches } = buildSurfaces(
      {
        stageFiles: [src('apps/stage/src/h.ts', `call('perf_report'); listen('play-tick', f)`)],
        stageCopyFile: src('apps/stage/src/copy/tables.ts', `export interface StageCopy { idleEyebrow: string } export const COPY_TABLES = { en: X, ro: Y }`),
        textFiles: [],
        packages: [],
        capabilities: [src('c/operator.json', JSON.stringify({ identifier: 'operator', windows: ['main', 'stage-*'], permissions: [] }))],
        configs: [src('crates/app/tauri.x.conf.json', JSON.stringify({ identifier: 'org.q.other' }))],
        rootPackageJson: '{}',
        workflows: [],
        e2eSpecs: [src('e2e/specs/new.e2e.ts', `describe('x', () => {})`)],
        foldersFile: src('e2e/support/folders.ts', `const SEEDS = { 'gone.e2e.ts': [] }`),
        fixtureNames: ['idle', 'extra'],
        fixtureIndex: JSON.stringify({ fixtures: ['idle', 'ghost'] }),
      },
      rust,
      contract,
    )
    expect([...mismatches].sort()).toEqual(
      [
        "config crates/app/tauri.x.conf.json: identifier org.q.other is not one of identity.rs's constants",
        'e2e SEEDS entry gone.e2e.ts: no such spec file',
        'e2e spec new.e2e.ts: missing from SEEDS in e2e/support/folders.ts',
        'fixture extra: file exists, not listed in fixtures/index.json',
        'fixture ghost: listed in fixtures/index.json, no file',
        'language ro: has a copy table, not in contract STAGE_LANGUAGES',
        'language fr: in contract STAGE_LANGUAGES, no copy table in COPY_TABLES',
        'stage calls perf_report (apps/stage/src/h.ts): not in guard.rs STAGE_COMMANDS',
        'stage event play-state: in contract STAGE_EVENTS, Stage never listens to it',
        'stage listens to play-tick (apps/stage/src/h.ts): not in contract STAGE_EVENTS',
        'text key missingKey: in contract TEXT_KEYS, not a StageCopy key or a title override in resolveCopy',
        'window label orphan: matches no capability (it would get no core permissions)',
      ].sort(),
    )
  })
})
