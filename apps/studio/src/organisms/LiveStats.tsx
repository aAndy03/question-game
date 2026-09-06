import { leaderboard } from '@questiongame/contract'
import { Button, Text } from '@/atoms'
import { EmptyState, StatCard, StatsChart, StatsTable } from '@/molecules'
import { STATS } from '@/copy/stats'
import { usePlayState } from '@/host/playState'
import { useStats } from '@/host/queries'
import type { StatsQuery } from '@/host/types'

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
 * Two sources, each used for what it owns: the tiles that need no arithmetic
 * come straight off `play-state` (scores, questions left, round), and the
 * per-team and per-domain tables are `stats_query` scoped to this Play. The
 * refresh key is `operator.eventCount`, the Timeline's trick (§10.3): the
 * numbers move when the log grows, not when the countdown ticks.
 *
 * A rehearsal is included here — one team is what the operator is looking at
 * — while All data excludes it by default.
 */
export function LiveStats({ onGoToControl }: LiveStatsProps) {
  const play = usePlayState()
  const playId = play?.playId ?? null
  const eventCount = play?.operator.eventCount ?? null

  const base: StatsQuery = {
    filter: { playIds: playId ? [playId] : [], includeRehearsal: true },
    metrics: ['turns', 'correct', 'accuracy', 'points'],
  }
  const byTeam = useStats({ ...base, groupBy: 'team' }, eventCount, playId !== null)
  const byDomain = useStats({ ...base, groupBy: 'domain' }, eventCount, playId !== null)

  if (!play || playId === null) {
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

  const questionsLeft = play.domains.reduce((total, domain) => total + domain.remaining, 0)
  const totals = byTeam.data?.totals
  const accuracy = totals?.values[2] ?? null
  // The contract already ranks the roster; Statistics does not re-sort it.
  const leader = leaderboard(play)[0] ?? null

  return (
    <div className="flex flex-col gap-4" data-live-stats>
      {play.operator.isRehearsal ? (
        <Text variant="studio-caption" tone="warning">
          {STATS.live.rehearsal}
        </Text>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <StatCard label={STATS.live.score} value={leader?.score ?? 0} animate />
        <StatCard label={STATS.live.turnsTaken} value={totals?.turns ?? 0} animate />
        <StatCard label={STATS.live.accuracy} value={accuracy === null ? STATS.table.none : `${Math.round(accuracy * 100)}%`} />
        <StatCard label={STATS.live.questionsLeft} value={questionsLeft} />
        <StatCard label={STATS.live.round} value={play.ring.roundIndex} />
      </div>

      {byTeam.data ? (
        <div className="flex flex-col gap-2">
          <Text variant="studio-heading">{STATS.live.leaderboard}</Text>
          <StatsTable result={byTeam.data} markedKey={leader?.id ?? null} />
        </div>
      ) : null}

      {byDomain.data ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Text variant="studio-heading">{STATS.live.byDomain}</Text>
            <StatsTable result={byDomain.data} hideTotals />
          </div>
          <StatsChart result={byTeam.data ?? byDomain.data} metricIndex={3} />
        </div>
      ) : null}
    </div>
  )
}
