/**
 * `npm run dev:studio` has no Rust behind it. With `?fake` on the URL — dev
 * builds only — the in-memory fake host is installed with a small demo
 * library, so the shell can be worked on in a plain browser the way Stage's
 * fixture strip lets screens be worked on. It is unreachable inside the app:
 * a real host is detected first and wins.
 *
 * The library here is "Season opener" — richer than the shipped Demo, and
 * `origin: 'operator'` so it reads as the operator's own work. The Demo itself
 * is one `catalog_seed_demo` away (`host/fake/seed.ts`), which is how the
 * Games empty state and Settings ▸ Library ▸ Restore Demo are exercised.
 *
 * `?fake&firstrun` seeds no operators and no active operator, so the
 * first-run flow (§12.1) can be walked in a browser too.
 *
 * `?fake&displays=N` (1–7) connects that many displays instead of the default
 * two (`demoMonitors`), so Settings ▸ Monitors and the status bar's displays
 * can be worked on the way a rig with a projector, a prompter and a recorder
 * would show them.
 */

import { FIXTURES, type Command, type FixtureName, type MonitorInfo, type PlayStateForMain } from '@questiongame/contract'
import { createFakeHost, DEFAULT_GAME_SETTINGS, FAKE_MONITORS, type FakeHost } from './fake'
import { hasTauri, setHostTransport, type HostTransport } from './host'
import type { CatalogItem, Recipe, StatsDimension, StatsMetric, StatsResult, StatsRow } from './types'

export function installDevFakeIfAsked(): FakeHost | null {
  if (!import.meta.env.DEV || hasTauri()) return null
  if (typeof window === 'undefined' || !new URLSearchParams(window.location.search).has('fake')) return null
  const params = new URLSearchParams(window.location.search)
  const displays = params.get('displays')
  const fake = createFakeHost(displays ? { monitors: demoMonitors(Number(displays)) } : {})
  const firstRun = params.has('firstrun')
  // `&channel=beta` plays questiongame Beta: the chip, and the welcome on an empty library.
  if (params.get('channel') === 'beta') fake.channel = 'beta'
  // A fresh library, or `&unnamed`, is in a workspace with no name yet (Beta 2.0):
  // Studio asks for it before anything else.
  if (firstRun || params.has('unnamed')) fake.workspaces = fake.workspaces.map((w) => ({ ...w, name: null }))
  // A Beta first launch is a truly empty library: that is when its welcome shows.
  if (!(firstRun && fake.channel === 'beta')) {
    fake.seed(
      firstRun ? demoLibrary().filter((row) => row.kind !== 'operator') : demoLibrary(),
      [demoRecipe()],
    )
  }
  if (!firstRun) void fake.invoke('settings_set_global', { setting: { key: 'active_operator_id', value: 'op-andy' } })
  // `&play=<fixture>` also hands Control a Play to draw. The fixture is Stage's
  // half; the operator half is synthesised here and nowhere else.
  const fixture = params.get('play')
  if (fixture && fixture in FIXTURES) fake.playState = demoPlay(fixture as FixtureName)
  // Statistics reads a fold the fake does not do (§13.1); a canned answer is
  // what lets the tab be worked on in a browser, the way `play=` does Control.
  // One per dimension (P20), since Live alone asks three at once; the team
  // answer stands in for the dimensions the demo does not cut.
  fake.stats = demoStats()
  fake.statsBy = Object.fromEntries(DEMO_STATS_DIMENSIONS.map((by) => [by, demoStats(by)]))
  // `&slow=<ms>` answers every command a task later, the way the real IPC
  // does — a round trip through Rust is never a microtask. A page that only
  // stays healthy because the fake answers before the next render can be
  // caught this way: the archived-teams loop of 2026-09-08 never reproduced
  // against an instant fake, because the render loop it was let microtasks
  // through and starved tasks.
  const slow = Number(params.get('slow') ?? 0)
  setHostTransport(slow > 0 ? delayed(fake, slow) : fake)
  return fake
}

/** A display as `monitors_list` reports it: logical `size`, physical mode, and where the OS put it. */
const display = (key: string, name: string, friendlyName: string | null, [x, y]: readonly [number, number], [w, h]: readonly [number, number], scaleFactor: number, alsoOn: readonly string[] = []): MonitorInfo => ({
  key,
  name,
  primary: false,
  position: [x, y],
  size: [Math.round(w / scaleFactor), Math.round(h / scaleFactor)],
  physicalSize: [w, h],
  scaleFactor,
  friendlyName,
  alsoOn,
})

/**
 * `n` connected displays (1–7) for `?fake&displays=N`: the default two first
 * (so keys stay `primary` and `tv@1920x1080`), then an ultrawide (21:9), a
 * portrait prompter, a 4:3 projector, a capture output Windows is duplicating
 * onto a recorder, and a 4K panel at 200%. Positions are the OS's arrangement
 * in logical pixels, so the Monitors map draws them where they stand.
 */
export function demoMonitors(n: number): MonitorInfo[] {
  const extra: MonitorInfo[] = [
    display('dell@3440x1440', '\\\\.\\DISPLAY3', 'DELL U3423WE', [3200, -180], [3440, 1440], 1),
    display('prompter@1080x1920', '\\\\.\\DISPLAY4', 'Prompter', [-864, -460], [1080, 1920], 1.25),
    display('projector@1024x768', '\\\\.\\DISPLAY5', 'Epson EB-X49', [448, 1080], [1024, 768], 1),
    display('capture@1920x1080', '\\\\.\\DISPLAY6', 'ATEM Mini', [1920, 1080], [1920, 1080], 1.5, ['NINJA V']),
    display('lg@3840x2160', '\\\\.\\DISPLAY7', 'LG 27UK850', [6640, -180], [3840, 2160], 2),
  ]
  const count = Number.isFinite(n) ? Math.min(7, Math.max(1, Math.round(n))) : 2
  return [...FAKE_MONITORS, ...extra].slice(0, count)
}

function delayed(fake: FakeHost, ms: number): HostTransport {
  return {
    invoke: <T,>(name: Command, args?: Record<string, unknown>) =>
      new Promise<T>((ok, no) => {
        setTimeout(() => fake.invoke<T>(name, args).then(ok, no), ms)
      }),
    listen: (name, handler) => fake.listen(name, handler),
  }
}

export function demoPlay(name: FixtureName): PlayStateForMain {
  const stage = FIXTURES[name]
  const holder = stage.ring.currentTeamId
  const served = stage.teams.filter((t) => t.turnsTaken >= stage.ring.roundIndex).map((t) => t.id)
  const legal = stage.teams.filter((t) => t.active && t.id !== holder && !served.includes(t.id)).map((t) => t.id)
  return {
    ...stage,
    operator: {
      recipeId: 'recipe-demo',
      legalTokenTargets: legal,
      defaultNextTeamId: legal[0] ?? null,
      consecutiveCorrect: 0,
      isRehearsal: stage.teams.length === 1,
      canUndo: stage.questionsIssued > 0,
      canRedo: false,
      eventCount: 3 + stage.questionsIssued * 4,
      showGiveToken: true,
      overrideAfterLock: 'refuse_until_reveal',
      disabled: [],
    },
  }
}

const t0 = Date.now() - 86_400_000 * 12

export function demoLibrary(): CatalogItem[] {
  const stamps = (days: number) => ({ createdAt: t0 + days * 86_400_000, updatedAt: t0 + days * 86_400_000 * 1.5, archivedAt: null })
  const q = (id: string, stem: string, difficulty: number, options: [string, boolean][], days: number): CatalogItem => ({
    kind: 'question',
    item: {
      id,
      origin: 'operator',
      stem,
      mediaAssetId: null,
      options: options.map(([text, correct], i) => ({ id: `${id}-${i}`, text, correct })),
      difficulty,
      explanation: null,
      ...stamps(days),
    },
  })
  return [
    { kind: 'team', item: { id: 'team-alpha', origin: 'operator', name: 'Alpha', shortCode: 'ALPHA', color: '#2563eb', logoAssetId: null, notes: 'Returning champions', playCount: 3, lastPlayAt: t0 + 86_400_000 * 9, ...stamps(1) } },
    { kind: 'team', item: { id: 'team-bravo', origin: 'operator', name: 'Bravo', shortCode: 'BRAVO', color: '#16a34a', logoAssetId: null, notes: null, playCount: 1, lastPlayAt: t0 + 86_400_000 * 9, ...stamps(2) } },
    { kind: 'team', item: { id: 'team-charlie', origin: 'operator', name: 'Charlie', shortCode: 'CHARL', color: '#dc2626', logoAssetId: null, notes: null, playCount: 0, lastPlayAt: null, ...stamps(3) } },
    { kind: 'team', item: { id: 'team-delta', origin: 'operator', name: 'Delta', shortCode: 'DELTA', color: '#d97706', logoAssetId: null, notes: 'New this season', playCount: 0, lastPlayAt: null, ...stamps(4) } },
    { kind: 'domain', item: { id: 'dom-history', origin: 'operator', name: 'History', code: 'HIS_204', description: 'From antiquity to 1990.', questions: [{ questionId: 'q-h1', sortKey: 1 }, { questionId: 'q-h2', sortKey: 2 }, { questionId: 'q-h3', sortKey: 3 }, { questionId: 'q-h4', sortKey: 4 }], ...stamps(1) } },
    { kind: 'domain', item: { id: 'dom-tech', origin: 'operator', name: 'Technology', code: 'TEC_881', description: null, questions: [{ questionId: 'q-t1', sortKey: 1 }, { questionId: 'q-t2', sortKey: 2 }], ...stamps(2) } },
    { kind: 'domain', item: { id: 'dom-sport', origin: 'operator', name: 'Sport', code: 'SPO_117', description: null, questions: [{ questionId: 'q-s1', sortKey: 1 }], ...stamps(3) } },
    q('q-h1', 'Which empire built the road network that reached Britain?', 20, [['Roman', true], ['Ottoman', false], ['Persian', false], ['Mongol', false]], 1),
    q('q-h2', 'In which year did the Berlin Wall fall?', 45, [['1987', false], ['1989', true], ['1991', false]], 2),
    q('q-h3', 'Which two of these were signatories of the Treaty of Westphalia?', 80, [['France', true], ['Sweden', true], ['Portugal', false], ['Russia', false]], 3),
    // P11.13: a second difficulty-20 history question, so `?fake` shows the
    // rule — `q-h1` is on the board and this one greys out behind it.
    q('q-h4', 'Which city was the capital of the Byzantine empire?', 20, [['Constantinople', true], ['Rome', false], ['Athens', false]], 3),
    q('q-t1', 'What does the L in HTML stand for?', 15, [['Language', true], ['Layout', false], ['Link', false]], 4),
    q('q-t2', 'Which of these is not a sorting algorithm?', 60, [['Quicksort', false], ['Heapsort', false], ['Dijkstra', true], ['Mergesort', false]], 5),
    q('q-s1', 'How many players are on a water polo team in the water?', 35, [['6', false], ['7', true], ['8', false]], 6),
    { kind: 'operator', item: { id: 'op-andy', displayName: 'Andy M.', pinHash: null, lastActiveAt: t0 + 86_400_000 * 11, playsRun: 4, ...stamps(0) } },
    { kind: 'operator', item: { id: 'op-guest', displayName: 'Guest operator', pinHash: 'fake:1234', lastActiveAt: null, playsRun: 0, ...stamps(6) } },
  ]
}

export function demoRecipe(): Recipe {
  return {
    id: 'recipe-demo',
    origin: 'operator',
    name: 'Season opener',
    folder: 'Season 3',
    tags: ['demo', 'four teams'],
    teams: ['team-alpha', 'team-bravo', 'team-charlie', 'team-delta'],
    board: [
      { domainId: 'dom-history', questionIds: ['q-h1', 'q-h2', 'q-h3'] },
      { domainId: 'dom-tech', questionIds: ['q-t1', 'q-t2'] },
    ],
    settings: DEFAULT_GAME_SETTINGS,
    layout: {},
    overlays: { teams: {}, domains: {}, questions: { 'q-h3': { difficulty: 70 } } },
    rev: 4,
    createdAt: t0,
    updatedAt: t0 + 86_400_000 * 10,
    archivedAt: null,
  }
}

/**
 * The dimensions the demo cuts its season by (P20). Question and workspace
 * are not among them: they read the team answer, as every dimension did
 * before.
 */
export const DEMO_STATS_DIMENSIONS = ['team', 'domain', 'difficulty', 'day', 'operator', 'recipe', 'play'] as const satisfies readonly StatsDimension[]

/**
 * Every column, in the host's order. The fake reads a query's own list out of
 * these by name, so Live and All data each get the columns they ask for.
 */
const DEMO_METRICS: readonly StatsMetric[] = ['turns', 'correct', 'incorrect', 'partial', 'accuracy', 'points', 'bonus', 'avg_points', 'avg_lock_ms', 'fastest_lock_ms', 'plays']

/**
 * One row's tallies. Every column follows from them the way the host's
 * `Group::row` derives it; every turn in the demo was locked on a clock, so
 * the mean lock is `lockMs / turns`.
 */
type Tally = readonly [turns: number, correct: number, partial: number, points: number, bonus: number, lockMs: number, fastestLockMs: number, plays: number]

/** The first Play of the season, run before any operator was set up: its turns are *No operator*'s. */
const BEFORE_OPERATORS: Tally = [21, 11, 2, 380, 10, 226_800, 3_300, 1]

/** The season: four Plays of Season opener, each on its own UTC day — the host's `day_of`. */
const seasonPlay = (n: number, days: number, tally: Tally) => ({ id: `play-demo-${n}`, day: new Date(t0 + days * 86_400_000).toISOString().slice(0, 10), tally })
const DEMO_PLAYS = [
  seasonPlay(1, 3, BEFORE_OPERATORS),
  seasonPlay(2, 6, [23, 13, 2, 430, 20, 234_600, 2_800, 1]),
  seasonPlay(3, 9, [22, 12, 1, 420, 20, 213_400, 4_100, 1]),
  seasonPlay(4, 11, [24, 14, 3, 500, 20, 225_000, 2_100, 1]),
]

/**
 * A plausible `stats_query` answer for `?fake`: four teams, one season, cut
 * by `by`. Every cut adds up to the same 90 turns and 1730 points, so a
 * number read on one table agrees with the next.
 *
 * The rows are in the host's order (`crates/host/src/stats.rs`): days run
 * chronologically and difficulty bands ascend (`"20"` is 11–20); every other
 * dimension is the first column descending, the label breaking ties. Labels
 * are what the host's `relabel` leaves: a team, domain, game or operator by
 * its catalog name, a turn with no operator as `""` *No operator*, a Play as
 * `{game} · {date}`.
 */
export function demoStats(by: (typeof DEMO_STATS_DIMENSIONS)[number] = 'team'): StatsResult {
  const game = demoRecipe().name
  const rows = (): Array<[key: string, label: string, tally: Tally]> => {
    switch (by) {
      case 'team':
        return [
          ['team-alpha', 'Alpha', [24, 18, 2, 620, 40, 196_800, 2_100, 4]],
          ['team-bravo', 'Bravo', [23, 14, 2, 480, 20, 216_200, 3_300, 4]],
          ['team-charlie', 'Charlie', [22, 11, 3, 390, 10, 222_200, 2_800, 4]],
          ['team-delta', 'Delta', [21, 7, 1, 240, 0, 264_600, 4_100, 3]],
        ]
      case 'domain':
        return [
          ['dom-history', 'History', [40, 24, 4, 820, 30, 360_000, 2_100, 4]],
          ['dom-tech', 'Technology', [30, 17, 3, 600, 30, 330_000, 2_800, 4]],
          ['dom-sport', 'Sport', [20, 9, 1, 310, 10, 209_800, 3_300, 2]],
        ]
      case 'difficulty':
        return [
          ['20', '11–20', [30, 22, 1, 400, 20, 210_000, 2_100, 4]],
          ['40', '31–40', [12, 7, 1, 230, 10, 114_000, 3_300, 2]],
          ['50', '41–50', [18, 10, 2, 430, 20, 189_000, 2_800, 4]],
          ['60', '51–60', [16, 7, 1, 400, 10, 192_000, 4_100, 4]],
          ['70', '61–70', [14, 4, 3, 270, 10, 194_800, 5_200, 4]],
        ]
      case 'day':
        return DEMO_PLAYS.map((play) => [play.day, play.day, play.tally])
      case 'play':
        return DEMO_PLAYS.map((play) => [play.id, `${game} · ${play.day}`, play.tally])
      case 'operator':
        return [
          ['op-andy', 'Andy M.', [69, 39, 6, 1_350, 60, 673_000, 2_100, 3]],
          ['', 'No operator', BEFORE_OPERATORS],
        ]
      case 'recipe':
        return [['recipe-demo', game, [90, 50, 8, 1_730, 70, 899_800, 2_100, 4]]]
    }
  }
  const tallies = rows()
  const ordinal = by === 'day' || by === 'difficulty'
  const ordered = ordinal ? tallies : [...tallies].sort(([, a, x], [, b, y]) => y[0] - x[0] || (a < b ? -1 : a > b ? 1 : 0))
  // The totals are the rows added up, so the two cannot disagree; the Plays
  // behind them are distinct Plays, not a sum of each row's.
  const sum = (i: number) => tallies.reduce((n, [, , tally]) => n + (tally[i] ?? 0), 0)
  const total: Tally = [sum(0), sum(1), sum(2), sum(3), sum(4), sum(5), Math.min(...tallies.map(([, , tally]) => tally[6])), DEMO_PLAYS.length]
  return {
    groupBy: by,
    metrics: DEMO_METRICS,
    rows: ordered.map(([key, label, tally]) => demoRow(key, label, tally)),
    totals: demoRow('', '', total),
    playCount: DEMO_PLAYS.length,
    turnCount: total[0],
  }
}

function demoRow(key: string, label: string, [turns, correct, partial, points, bonus, lockMs, fastestLockMs, plays]: Tally): StatsRow {
  const value: Record<StatsMetric, number | null> = {
    turns,
    correct,
    incorrect: turns - correct - partial,
    partial,
    accuracy: turns > 0 ? correct / turns : null,
    points,
    bonus,
    avg_points: turns > 0 ? points / turns : null,
    avg_lock_ms: turns > 0 ? lockMs / turns : null,
    fastest_lock_ms: turns > 0 ? fastestLockMs : null,
    plays,
  }
  return { key, label, values: DEMO_METRICS.map((metric) => value[metric]), turns, plays }
}
