import { useRef } from 'react'
import { leaderboard, type PlayStateForMain } from '@questiongame/contract'
import { Button, Text } from '@/atoms'
import { EmptyState, SERIES_TOKENS, StatCard, StatsChart, StatsTable, formatMetric } from '@/molecules'
import { AwardLedger } from './AwardLedger'
import { STATS } from '@/copy/stats'
import { usePlayState } from '@/host/playState'
import { useStats } from '@/host/queries'
import type { StatsMetric, StatsQuery, StatsResult, StatsRow } from '@/host/types'

/**
 * How many turns of the ledger to fetch. A show is a few dozen turns, and the
 * operator reads the recent ones; the count is capped so a long Play cannot
 * make every Live refresh carry a hundred breakdowns.
 */
const LEDGER_ROWS = 60

/**
 * The leaderboard's columns. Points first, so the bar the table draws is the
 * score the ranking is by; the fastest lock is a tile's, and each team's.
 */
const TEAM_METRICS: readonly StatsMetric[] = ['points', 'turns', 'correct', 'accuracy', 'fastest_lock_ms']
/** The three verdicts the by-domain chart stacks, which it finds by name. */
const DOMAIN_METRICS: readonly StatsMetric[] = ['turns', 'correct', 'partial', 'incorrect']
/** By difficulty, the chart draws the first column: what each band paid. */
const DIFFICULTY_METRICS: readonly StatsMetric[] = ['points', 'turns', 'accuracy']

export interface LiveStatsProps {
  /**
   * Pressed by the empty state. The page owns navigation — and the Statistics
   * window has none, so it passes nothing and the empty state says its piece
   * without offering a door that leads nowhere.
   */
  onGoToControl?: (() => void) | undefined
}

/**
 * Live statistics (§11.K, 05_STUDIO_DESIGN.md §13.2) — the Play on the desk,
 * and nothing it can change.
 *
 * Two sources, each used for what it owns: what the scoreboard shows comes
 * straight off `play-state` (scores, ranks, colours, questions left, round,
 * who holds the token), and what needs the log is `stats_query` scoped to
 * this Play — by team (with the award ledger), by domain and by difficulty.
 * The refresh key is `operator.eventCount`, the Timeline's trick (§10.3): the
 * numbers move when the log grows, not when the countdown ticks — and the
 * two are drawn as one pair about the same log (`useAgreeingPair`), never
 * the new Play beside the last count's answer.
 *
 * P20, a picture first: five tiles that say what they mean, the leaderboard
 * ranked as the scoreboard ranks it, three charts — the score race, verdicts
 * by domain, points by difficulty — and the ledger last.
 *
 * A rehearsal is included here — one team is what the operator is looking at
 * — while All data excludes it by default.
 */
export function LiveStats({ onGoToControl }: LiveStatsProps) {
  const current = usePlayState()
  const playId = current?.playId ?? null
  const eventCount = current?.operator.eventCount ?? null

  const filter: StatsQuery['filter'] = { playIds: playId ? [playId] : [], includeRehearsal: true }
  const isOpen = playId !== null
  const byTeam = useStats({ filter, groupBy: 'team', metrics: TEAM_METRICS, detail: LEDGER_ROWS }, eventCount, isOpen)
  const byDomain = useStats({ filter, groupBy: 'domain', metrics: DOMAIN_METRICS }, eventCount, isOpen)
  const byDifficulty = useStats({ filter, groupBy: 'difficulty', metrics: DIFFICULTY_METRICS }, eventCount, isOpen)
  const pair = useAgreeingPair(current, byTeam.data, byTeam.isPlaceholderData, byTeam.isError)

  if (!pair || playId === null) {
    return (
      <EmptyState
        kind="empty"
        what={STATS.empty.what}
        detail={STATS.live.noPlayHint}
        {...(onGoToControl
          ? {
              action: (
                <Button variant="secondary" icon="control" onPress={onGoToControl}>
                  {STATS.live.goToControl}
                </Button>
              ),
            }
          : {})}
      />
    )
  }

  // Everything below draws from one pair — the Play and the by-team answer
  // about the same log — so the tiles, the leaderboard and the race agree.
  const { play, team } = pair
  const ranks = Object.fromEntries(play.teams.map((t) => [t.id, t.rank]))
  const colors = teamColours(play.teams)
  const scores = Object.fromEntries(play.teams.map((t) => [t.id, t.score]))
  const ring = inRingOrder(play).map((t) => ({ id: t.id, name: t.name }))

  return (
    <div className="flex flex-col gap-6" data-live-stats>
      {play.operator.isRehearsal ? (
        <Text variant="studio-caption" tone="warning">
          {STATS.live.rehearsal}
        </Text>
      ) : null}

      <Tiles play={play} team={team} />

      {team ? (
        <div className="flex flex-col gap-2">
          <Text variant="studio-heading">{STATS.live.leaderboard}</Text>
          {/* The tiles carry the totals; a ranking has no Total row. */}
          <StatsTable result={ranked(play, team)} markedKey={play.ring.currentTeamId} ranks={ranks} colors={colors} bars hideTotals />
        </div>
      ) : null}

      {team ? <StatsChart kind="race" result={team} turns={team.turns} totals={scores} teams={ring} colors={colors} /> : null}
      {/* Side by side once the column fits two charts, not once the window does: the sidebar takes its share. */}
      <div className="@container/live-charts">
        <div className="grid grid-cols-1 gap-4 @[48rem]/live-charts:grid-cols-2">
          {byDomain.data ? <StatsChart kind="verdicts" result={byDomain.data} title={STATS.live.byDomain} /> : null}
          {byDifficulty.data ? <StatsChart kind="bands" result={byDifficulty.data} title={STATS.live.byDifficulty} /> : null}
        </div>
      </div>

      {/*
        What was awarded per turn, and why (P11.12). It rides on the by-team
        query's `detail` rather than asking again: §13.1 is one command and one
        document, and the ledger is a detail level of the same question.
      */}
      <AwardLedger turns={team?.turns ?? []} />
    </div>
  )
}

/**
 * The five tiles. Each is named by what it means and says whose, or of what,
 * under its number; a figure the log cannot give yet is an em dash, never a
 * zero, and a meter is drawn only over a figure there is.
 */
function Tiles({ play, team }: { play: PlayStateForMain; team: StatsResult | undefined }) {
  // The scoreboard's order and its ranks: the host ranked them, and ties share one.
  const leader = leaderboard(play)[0] ?? null
  const tied = leader ? play.teams.filter((t) => t.rank === leader.rank).length : 0
  // Asked is what the log resolved — a team keeps the token through a run of
  // correct answers, so tokens received are not questions — and left is the
  // board's unconsumed rest, which still counts a question on the desk.
  const left = play.domains.reduce((total, domain) => total + domain.remaining, 0)
  const asked = team?.turnCount ?? null
  const accuracy = totalOf(team, 'accuracy')
  const holder = play.teams.find((t) => t.id === play.ring.currentTeamId) ?? null

  return (
    <div className="@container/live-tiles">
      <div className="grid grid-cols-2 gap-3 @[30rem]/live-tiles:grid-cols-3 @[44rem]/live-tiles:grid-cols-5">
        <StatCard
          label={STATS.live.leading}
          value={leader ? leader.score : STATS.table.none}
          animate={leader !== null}
          detail={leader ? (tied > 1 ? STATS.live.tied(tied) : leader.name) : null}
        />
        <StatCard
          label={STATS.live.questions}
          value={asked === null ? STATS.table.none : STATS.live.questionsAsked(asked, asked + left)}
          detail={STATS.live.questionsLeftDetail(left)}
          meter={asked === null ? null : { value: asked, max: asked + left }}
        />
        <StatCard
          label={STATS.live.accuracy}
          value={formatMetric(accuracy, 'accuracy')}
          meter={accuracy === null ? null : { value: Math.round(accuracy * 100), max: 100 }}
        />
        <StatCard label={STATS.live.round} value={play.ring.roundIndex} detail={holder ? STATS.live.holder(holder.name) : null} />
        <StatCard label={STATS.live.fastestLock} value={formatMetric(totalOf(team, 'fastest_lock_ms'), 'fastest_lock_ms')} />
      </div>
    </div>
  )
}

/** A total by metric name, so the columns may be asked for in any order. */
function totalOf(result: StatsResult | undefined, metric: StatsMetric): number | null {
  const index = result ? result.metrics.indexOf(metric) : -1
  return index < 0 ? null : (result?.totals.values[index] ?? null)
}

/** What Live draws from: a Play, and the by-team answer about the same log (or none yet). */
interface Pair {
  play: PlayStateForMain
  team: StatsResult | undefined
}

/**
 * The Play and the by-team answer **about the same log** (P20 review).
 *
 * `play-state` is fresh the moment a reveal lands; the answer to `stats_query`
 * for the new event count is one IPC behind it, and until it comes TanStack
 * keeps the previous count's answer on screen as placeholder data. Drawn
 * together, the race would end at the new scores over the old ledger, the
 * leaderboard rank by the new scores with the old points, and *Questions* add
 * the old count to the new rest. So the last pair that agreed is remembered —
 * an answer that is not placeholder data is the answer for this count, and it
 * is paired with the Play it was asked for — and while the next answer is on
 * its way, that pair is what is drawn. It moves to the next pair in one render.
 *
 * Another Play's pair is never held (a Restart, a new Play: the new one draws
 * on its own until its first answer), and neither is one past a failed query:
 * holding is for an answer *on its way*. A failure forgets the pair, because
 * TanStack's placeholder is the last answer that *had* data — on the count
 * after a failure it offers the one from before it again, and holding that
 * would bring back a pair Live had already let go.
 */
function useAgreeingPair(
  play: PlayStateForMain | null,
  answer: StatsResult | undefined,
  isPlaceholder: boolean,
  failed: boolean,
): Pair | null {
  const last = useRef<Pair | null>(null)
  if (!play) {
    last.current = null
    return null
  }
  if (answer && !isPlaceholder) {
    // This count's own answer — after a failed refetch too, which keeps it.
    last.current = { play, team: answer }
    return last.current
  }
  if (failed) {
    // No answer for this count, and none to wait for: forget the last pair,
    // so the next count's placeholder (the answer before this one) is not held.
    last.current = null
    return { play, team: undefined }
  }
  const held = last.current
  if (isPlaceholder && held && held.play.playId === play.playId) return held
  return { play, team: undefined }
}

/**
 * A whole `var(--name)` — the rule the team editor, the team detail and the
 * team preview use for a Stage theme colour. Studio cannot paint a Stage token
 * (the lint boundary keeps Stage's tokens out), so one stands for no colour
 * here unless it is a state token with a Studio meaning (`STATE_IN_STUDIO`).
 */
const TOKEN = /^var\(\s*(--[\w-]+)\s*\)$/

/**
 * Stage's state tokens (`design-stage/tokens/colors.css`), each as the Studio
 * token of the same meaning — the pairs `stage.css` writes the other way when
 * it themes HeroUI for Stage. The shipped Demo's Red is `--state-incorrect`
 * and its Blue `--state-info` (`catalog/seed.rs`), so Live draws them red and
 * blue, as Stage does, rather than in whichever fallback came next.
 */
const STATE_IN_STUDIO: Readonly<Record<string, string>> = {
  '--state-incorrect': 'var(--danger)',
  '--state-correct': 'var(--success)',
  '--state-info': 'var(--accent)',
  '--state-leader': 'var(--warning)',
  '--state-accent': 'var(--warning)',
}

/**
 * A team's own colour as Studio paints it — `mapped` when it is a Stage state
 * token read as its Studio counterpart — or `null` when Studio has none for it.
 */
function ownColour(color: string): { colour: string; mapped: boolean } | null {
  const written = color.trim()
  if (written === '') return null
  const token = TOKEN.exec(written)?.[1]
  if (!token) return { colour: written, mapped: false }
  const studio = STATE_IN_STUDIO[token]
  return studio ? { colour: studio, mapped: true } : null
}

/**
 * Each team's colour as Studio paints it. A colour the operator wrote is the
 * team's, always. A Stage state token is its Studio counterpart — unless an
 * earlier team already shows that colour: Stage's leader gold and accent
 * yellow are both Studio's one warning. That one, and any other — a Stage
 * token with no Studio meaning, or none — takes the first of the chart's
 * series colours (`SERIES_TOKENS`) that **no other team already shows**,
 * compared as painted, so a fallback never repeats a team's own blue; only
 * when every one is taken are they reused, in order. The roster is fixed for a
 * Play, so a team keeps its colour from one reveal to the next, and the
 * leaderboard swatch and the race line are the same colour.
 */
function teamColours(teams: PlayStateForMain['teams']): Record<string, string> {
  const paint = painter()
  const own = teams.map((t) => ownColour(t.color))
  // What the operator wrote is shown first, whatever comes before it on the roster.
  const shown = new Set(own.flatMap((mine) => (mine && !mine.mapped ? [paint(mine.colour)] : [])))
  let reused = 0
  return Object.fromEntries(
    teams.map((t, i) => {
      const mine = own[i]
      if (mine && !mine.mapped) return [t.id, mine.colour]
      if (mine && !shown.has(paint(mine.colour))) {
        shown.add(paint(mine.colour))
        return [t.id, mine.colour]
      }
      const free = SERIES_TOKENS.find((token) => !shown.has(paint(token)))
      const colour = free ?? SERIES_TOKENS[reused++ % SERIES_TOKENS.length]!
      shown.add(paint(colour))
      return [t.id, colour]
    }),
  )
}

/**
 * A colour as the page paints it, in one spelling, so two teams' colours are
 * compared by what is on screen rather than how each was written: a whole
 * `var(--name)` read off the root, then written through a style, which spells
 * `#2563eb` and `rgb(37, 99, 235)` the same. A token the theme does not set
 * (jsdom, outside the Studio scope) stays as written, so two unset tokens are
 * still two colours.
 */
function painter(): (colour: string) => string {
  if (typeof document === 'undefined') return (colour) => colour.trim()
  const root = getComputedStyle(document.documentElement)
  const probe = document.createElement('span').style
  return (colour) => {
    const written = colour.trim()
    const token = TOKEN.exec(written)?.[1]
    const value = token ? root.getPropertyValue(token).trim() : written
    if (value === '') return written
    probe.color = ''
    probe.color = value
    return probe.color || value
  }
}

/**
 * The by-team answer in the scoreboard's order: every team of the Play, the
 * host's row for it where there is one and a row of em dashes where the log
 * has nothing yet. A row the Play does not know is kept, after them.
 */
function ranked(play: PlayStateForMain, result: StatsResult): StatsResult {
  const byKey = new Map(result.rows.map((row) => [row.key, row]))
  const blank = result.metrics.map(() => null)
  const rows: StatsRow[] = leaderboard(play).map((team) => byKey.get(team.id) ?? { key: team.id, label: team.name, values: blank, turns: 0, plays: 0 })
  const placed = new Set(rows.map((row) => row.key))
  return { ...result, rows: [...rows, ...result.rows.filter((row) => !placed.has(row.key))] }
}

/** The teams as the ring plays them: the race's lines, in the order the Play seats them. */
function inRingOrder(play: PlayStateForMain): PlayStateForMain['teams'] {
  const seat = (id: string) => {
    const at = play.ring.order.indexOf(id)
    return at < 0 ? play.ring.order.length : at
  }
  return [...play.teams].sort((a, b) => seat(a.id) - seat(b.id))
}
