import { describe, expect, it } from 'vitest'
import { buildMap, firstSentence, flow, readContract, readStudioCalls, render, scalar, summariseMigrations, toYaml, type RustMap } from './codemap'

describe('scalar', () => {
  it.each(['play_load', 'play-state', 'crates/app/src/lib.rs', 'scoring.mode'])('leaves %s plain', (s) => expect(scalar(s)).toBe(s))

  it.each([
    ['true', '"true"'],
    ['null', '"null"'],
    ['12', '"12"'],
    ['a: b', '"a: b"'],
    ['', '""'],
    ['say "hi"', '"say \\"hi\\""'],
    ['questiongame_host::flags', '"questiongame_host::flags"'],
    ['- dash', '"- dash"'],
  ])('quotes %j', (input, quoted) => expect(scalar(input)).toBe(quoted))
})

describe('toYaml', () => {
  it('sorts keys below the top level and keeps the section order at the top', () => {
    const yaml = toYaml({ zeta: { b: 1, a: 2 }, alpha: { z: true, x: null } })
    expect(yaml).toBe('zeta:\n  a: 2\n  b: 1\nalpha:\n  x: null\n  z: true\n')
  })

  it('writes short scalar lists inline and long ones as blocks', () => {
    const long = Array.from({ length: 30 }, (_, i) => `item_${i}`)
    const yaml = toYaml({ short: ['a', 'b'], long })
    expect(yaml).toContain('short: [a, b]')
    expect(yaml).toContain('long:\n  - item_0\n')
  })

  it('writes a flow record on one line and drops undefined fields', () => {
    expect(toYaml({ k: flow({ kind: 'fn', doc: undefined, sig: 'fn a(x: u8)' }) })).toBe('k: {kind: fn, sig: "fn a(x: u8)"}\n')
  })

  it('writes a list of maps with the first key on the dash line', () => {
    expect(toYaml({ xs: [{ a: 1, b: 2 }] })).toBe('xs:\n  - a: 1\n    b: 2\n')
  })

  it('is stable: the same value renders the same text', () => {
    const value = { b: { d: [1, 2], c: 'x' }, a: [] }
    expect(toYaml(value)).toBe(toYaml(value))
  })
})

describe('firstSentence', () => {
  it('cuts at the first sentence end', () => expect(firstSentence('Put it in.  And then more.')).toBe('Put it in.'))
  it('does not cut a section number', () => expect(firstSentence('§12.6. Operator-facing. More.')).toBe('§12.6. Operator-facing.'))
  it('keeps text with no sentence end', () => expect(firstSentence('no end here')).toBe('no end here'))
})

describe('summariseMigrations', () => {
  const steps = [
    `
    -- a comment; with a semicolon
    CREATE TABLE teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      PRIMARY KEY (id, name)
    );
    CREATE INDEX teams_by_name ON teams(name);
    `,
    `ALTER TABLE teams ADD COLUMN origin TEXT NOT NULL DEFAULT 'operator';`,
    `UPDATE teams SET name = 'x';`,
  ]

  it('reads tables, columns, indexes, added columns and everything else', () => {
    const [one, two, three] = summariseMigrations(steps)
    expect(one!.version).toBe(1)
    expect(one!.creates).toEqual({ teams: ['id TEXT PRIMARY KEY', 'name TEXT NOT NULL'] })
    expect(one!.indexes).toEqual(['teams_by_name ON teams(name)'])
    expect(two!.adds).toEqual(["teams: origin TEXT NOT NULL DEFAULT 'operator'"])
    expect(three!.other).toEqual(["UPDATE teams SET name = 'x'"])
  })
})

describe('readContract', () => {
  const files = [
    {
      path: 'packages/contract/src/commands.ts',
      text: `
        export const COMMAND_GROUPS = {
          /** Catalog. */
          catalog: ['catalog_list', /** note */ 'catalog_get'],
          match: ['play_load'],
        } as const
        export const EVENTS = ['play-state', 'notice'] as const
        export const STAGE_EVENTS = ['play-state'] as const
        export const STAGE_COMMANDS = ['stage_ready'] as const
      `,
    },
    {
      path: 'packages/contract/src/play-state.ts',
      text: `
        /** The version. Second sentence. */
        export const CONTRACT_VERSION = 8
        /** A tick. */
        export interface PlayTick { readonly playId: string; remainingMs?: number | null }
        export type Mode = 'a' | 'b'
        export function f(x: number): string { return String(x) }
        const hidden = 1
      `,
    },
  ]

  it('reads the command and event lists and the version', () => {
    const c = readContract(files)
    expect(c.commandGroups).toEqual({ catalog: ['catalog_list', 'catalog_get'], match: ['play_load'] })
    expect(c.events).toEqual(['play-state', 'notice'])
    expect(c.stageEvents).toEqual(['play-state'])
    expect(c.stageCommands).toEqual(['stage_ready'])
    expect(c.version).toBe(8)
  })

  it('lists exported names with a kind, a signature and the first doc sentence', () => {
    const items = readContract(files).files['packages/contract/src/play-state.ts']!
    expect(Object.keys(items).sort()).toEqual(['CONTRACT_VERSION', 'Mode', 'PlayTick', 'f'])
    expect(items.CONTRACT_VERSION).toEqual({ kind: 'const', sig: '= 8', doc: 'The version.' })
    expect(items.PlayTick).toEqual({ kind: 'interface', sig: '{ playId, remainingMs? }', doc: 'A tick.' })
    expect(items.Mode!.sig).toBe("'a' | 'b'")
    expect(items.f!.sig).toBe('(x: number): string')
  })
})

describe('readStudioCalls', () => {
  const src = (path: string, text: string) => ({ path, text })

  it('finds run, run.ok and command with a literal, and not tests', () => {
    const calls = readStudioCalls([
      src('apps/studio/src/a.tsx', `run('play_load', {}); run.ok("pause"); run<Recipe>('recipe_get')`),
      src('apps/studio/src/b.ts', `command<X>('get_state'); command(name)`),
      src('apps/studio/src/c.test.tsx', `run('only_in_a_test')`),
      src('apps/studio/src/test/setup.ts', `run('also_a_test')`),
      src('apps/studio/src/d.ts', `fake.invoke('not_a_call')`),
    ])
    expect(calls.byCommand).toEqual({
      get_state: ['apps/studio/src/b.ts'],
      pause: ['apps/studio/src/a.tsx'],
      play_load: ['apps/studio/src/a.tsx'],
      recipe_get: ['apps/studio/src/a.tsx'],
    })
    expect(calls.dynamic).toEqual(['apps/studio/src/b.ts'])
  })
})

describe('buildMap', () => {
  const rust: RustMap = {
    commands: [
      { name: 'play_load', file: 'crates/app/src/commands/play.rs', params: [{ name: 'recipe_id', type: 'RecipeId' }], returns: 'AppResult<()>', doc: 'Load.', asyncCommand: true },
      { name: 'stage_ready', file: 'crates/app/src/commands/presentation.rs', params: [], returns: 'AppResult<()>', doc: null, asyncCommand: true },
      { name: 'client_log', file: 'crates/app/src/commands/flags.rs', params: [], returns: 'AppResult<()>', doc: null, asyncCommand: true },
    ],
    guard: { labels: { MAIN: 'main' }, stageCommands: ['stage_ready', 'client_log'], statsCommands: ['client_log'] },
    handlers: ['play_load', 'stage_ready', 'client_log'],
    events: [{ function: 'play_state', target: 'stage_labels()', event: 'play-state', payload: 'stage_state()' }],
    plugins: [],
    hostApi: [],
    appApi: [],
    stageContractVersion: '8',
    settingsKeys: [],
    gameAffectingKeys: [],
    settingsStructs: [],
    migrations: [],
    metaKeys: [],
  }
  const contract = readContract([
    {
      path: 'packages/contract/src/commands.ts',
      text: `export const COMMAND_GROUPS = { a: ['play_load', 'stage_ready', 'gone'] } as const
             export const EVENTS = ['play-state', 'never'] as const
             export const STAGE_EVENTS = ['play-state'] as const
             export const STAGE_COMMANDS = ['stage_ready'] as const`,
    },
    { path: 'packages/contract/src/play-state.ts', text: 'export const CONTRACT_VERSION = 7' },
  ])
  const map = buildMap(rust, contract, { byCommand: { nope: ['apps/studio/src/x.ts'] }, dynamic: [] })

  it('says who may call each command', () => {
    const commands = map.commands as Record<string, { callers: string[] }>
    expect(commands.play_load!.callers).toEqual(['main'])
    expect(commands.stage_ready!.callers).toEqual(['main', 'stage'])
    expect(commands.client_log!.callers).toEqual(['main', 'stage', 'stats'])
  })

  it('lists every mismatch, sorted', () => {
    expect(map.mismatches).toEqual([
      'CONTRACT_VERSION: Rust 8, TypeScript 7',
      'command client_log: in Rust, not in COMMAND_GROUPS',
      'command gone: in COMMAND_GROUPS, no #[tauri::command]',
      'event never: in contract EVENTS, never emitted in emit.rs',
      'stage command client_log: guard.rs STAGE_COMMANDS allows it, contract STAGE_COMMANDS does not',
      'studio call nope: no such command in Rust (apps/studio/src/x.ts)',
    ])
  })

  it('renders the same text twice, with the header and no line numbers', () => {
    const a = render(map)
    expect(a).toBe(render(map))
    expect(a.startsWith('# codemap.yaml — Generated by `npm run map` — do not edit by hand.')).toBe(true)
    expect(a).not.toMatch(/:\d+:\d+/)
    expect(Object.keys(map)).toEqual(['commands', 'events', 'contract', 'settings', 'storage', 'host_api', 'studio_calls', 'app_crate', 'mismatches'])
  })
})
