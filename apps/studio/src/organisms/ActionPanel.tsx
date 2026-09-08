import { useEffect, useState } from 'react'
import { Button, MeaningChip, Separator, Text, TransportButton } from '@/atoms'
import { ConfirmDialog, EmptyState, RevealControls, RingRow, TimerCluster, type RingRowVariant } from '@/molecules'
import { CONTROL, HOTKEYS, PHASE, RING, RING_ROLE, SESSION, TRANSPORT } from '@/copy'
import { useHostCommand } from '@/host/commands'
import { isPlayOpen, usePlayState } from '@/host/playState'
import { ringEntries, ringRole } from '@/host/ring'
import { canChooseDomain, controlPhase, isSessionLive, nextLeaderboardRank } from '@/host/session'

export interface ActionPanelProps {
  density: 'comfortable' | 'compact' | 'dense'
}

/**
 * Transport, then **one phase block**, then the token — in that order, always.
 *
 * The phase (`host/session.ts`) decides which single block is drawn: the
 * question and its reveals, the domains for the next question, the hand-over,
 * or the final standings. Within a block a control that is momentarily illegal
 * stays visible and disabled with its reason (§4.2); *across* blocks the panel
 * hides, because a control for another phase is not a disabled control — it is
 * one the host would refuse, and a panel full of those is what left the
 * operator with nothing to press twice on 2026-09-07.
 *
 * Every button is one `run(...)`; the Viewer and the chords call the same
 * function (05_STUDIO_DESIGN.md §10.4). Armed states are component state and
 * reset on unmount; nothing here is remembered.
 */
export function ActionPanel({ density }: ActionPanelProps) {
  const play = usePlayState()
  const run = useHostCommand()
  const [armed, setArmed] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<'restart-same' | 'restart-different' | 'abandon' | null>(null)
  const [pending, setPending] = useState(false)

  // An armed override disarms itself when the state moves on.
  useEffect(() => setArmed(null), [play?.ring.currentTeamId, play?.session?.outcome])

  if (!play) return <EmptyState kind="empty" what={CONTROL.panels.action.toLowerCase()} detail={CONTROL.noRecipeBody} compact />

  const open = isPlayOpen(play)
  const ended = play.status === 'completed' || play.status === 'abandoned'
  const busy = play.overlay.busy
  const waitReason = busy ? TRANSPORT.waitOverlay : null
  const notOpen = !open ? (ended ? TRANSPORT.ended : TRANSPORT.notStarted) : null
  const session = play.session
  const timer = session?.timer ?? null
  const locked = session?.lockedOptionIds !== null && session?.lockedOptionIds !== undefined
  const resolved = session?.outcome !== null && session?.outcome !== undefined
  // A question that is issued and **not resolved** — the host's own rule. The
  // projection keeps a resolved session, so `session !== null` is not it.
  const sessionLive = isSessionLive(play)
  const canChoose = canChooseDomain(play)
  const phase = controlPhase(play)
  const nextRank = nextLeaderboardRank(play)
  const entries = ringEntries(play)
  const compact = density !== 'comfortable'
  // The hand-over is drawn while the Play can still take one. On a completed
  // or abandoned Play `give_token` is refused, so the rows would be dead.
  const showRing = open && play.operator.showGiveToken && entries.length > 0

  const giveToken = (teamId: string, name: string) => {
    if (session && !resolved) {
      // §2.6 path 2: reveal is required; `allow` offers Reveal & pass, armed.
      if (play.operator.overrideAfterLock === 'refuse_until_reveal') return
      if (armed !== teamId) {
        setArmed(teamId)
        return
      }
      setArmed(null)
      void run('reveal_and_pass', { teamId })
      return
    }
    void name
    void run('give_token', { teamId })
  }

  const doConfirm = async () => {
    setPending(true)
    if (confirm === 'abandon') await run('abandon')
    if (confirm === 'restart-same') await run('restart', { newPlayId: `play-${Date.now()}`, sameQuestions: true })
    if (confirm === 'restart-different') await run('restart', { newPlayId: `play-${Date.now()}`, sameQuestions: false })
    setPending(false)
    setConfirm(null)
  }

  return (
    <div className="flex flex-col gap-4" data-action-panel>
      {/* transport */}
      <div className="flex flex-wrap items-center gap-2">
        {play.status === 'loaded' ? (
          <TransportButton icon="play" label={TRANSPORT.start} state="active" withLabel onPress={() => void run('play_start')} />
        ) : play.status === 'playing' ? (
          <TransportButton icon="pause" label={TRANSPORT.pause} withLabel={!compact} onPress={() => void run('pause')} />
        ) : play.status === 'paused' ? (
          <TransportButton icon="play" label={TRANSPORT.resume} state="active" withLabel={!compact} onPress={() => void run('resume')} />
        ) : null}
        <TransportButton icon="undo" label={TRANSPORT.undo} onPress={() => void run('undo_turn')} isDisabled={!play.operator.canUndo} disabledReason={waitReason} kbd={HOTKEYS.defaults['undo_turn']} />
        <TransportButton icon="redo" label={TRANSPORT.redo} onPress={() => void run('redo_turn')} isDisabled={!play.operator.canRedo} disabledReason={waitReason} kbd={HOTKEYS.defaults['redo_turn']} />
        <div className="flex-1" />
        {/* A completed Play may be restarted — the board is empty and playing
          * it again is the obvious next act (`MatchService::restart`). Only an
          * abandoned or already-restarted record refuses. */}
        <TransportButton icon="restart" label={TRANSPORT.restart} onPress={() => setConfirm('restart-same')} isDisabled={!open && play.status !== 'completed'} disabledReason={waitReason ?? (play.status === 'abandoned' ? TRANSPORT.ended : null)} />
        <TransportButton icon="abandon" label={TRANSPORT.abandon} state="rest" onPress={() => setConfirm('abandon')} isDisabled={!open} disabledReason={waitReason ?? notOpen} />
      </div>

      <Separator />

      {/* the phase block: the question, while there is one */}
      {session && (phase === 'question' || phase === 'resolved') ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <Text variant="studio-label" truncate={compact}>
                {session.stem}
              </Text>
              <div className="flex flex-wrap items-center gap-1.5">
                <MeaningChip meaning={session.answerMode}>{SESSION.answersMode[session.answerMode]}</MeaningChip>
                <Text variant="studio-caption" tone="muted">
                  {SESSION.difficulty(session.difficulty)}
                </Text>
                {resolved && session.outcome ? (
                  <MeaningChip meaning={session.outcome.verdict === 'correct' ? 'easy' : session.outcome.verdict === 'incorrect' ? 'hard' : 'medium'}>
                    {`${SESSION.verdict[session.outcome.verdict]} ${SESSION.points(session.outcome.pointsAwarded)}`}
                  </MeaningChip>
                ) : null}
              </div>
            </div>
            {phase === 'question' ? (
            <TimerCluster
              durationMs={timer?.durationMs ?? null}
              remainingMs={timer?.remainingMs ?? 0}
              running={timer?.running ?? false}
              frozen={locked || resolved}
              expiredOpen={timer?.expiredOpen ?? false}
              disabledReason={notOpen}
              kbd={HOTKEYS.defaults['start_timer']}
              onStart={() => void run('start_timer')}
              onPause={() => void run('pause_timer')}
            />
            ) : null}
          </div>
          {/* Spent once the outcome is up: the reveals, the clock and the
            * options all belong to the question that is still being played.
            * After it resolves the header keeps the verdict and the next
            * block takes over — a disabled row of finished controls is what
            * made the panel look stuck. */}
          {phase === 'question' ? (
          <RevealControls
            stemRevealed={session.reveals.stem}
            optionsRevealed={session.reveals.optionIds.length}
            optionsTotal={session.options.length}
            outcomeRevealed={session.reveals.outcome}
            locked={locked}
            autoStem={play.revealModes.question === 'auto'}
            autoAnswers={play.revealModes.answers === 'auto'}
            disabledReason={notOpen}
            kbd={{ stem: HOTKEYS.defaults['reveal_stem'], option: HOTKEYS.defaults['reveal_next_option'], lock: HOTKEYS.defaults['lock_selection'], outcome: HOTKEYS.defaults['reveal_outcome'] }}
            onRevealStem={() => void run('reveal_stem')}
            onRevealOption={() => void run('reveal_next_option')}
            onLock={() => void run('lock_selection')}
            onRevealOutcome={() => void run('reveal_outcome')}
          />
          ) : null}
          {phase === 'question' ? (
          <div className="flex flex-wrap gap-1.5" aria-label={SESSION.selection}>
            {session.options.map((o, i) => {
              const selected = session.selectedOptionIds.includes(o.id)
              const isCorrect = session.outcome?.correctOptionIds.includes(o.id)
              return (
                <Button
                  key={o.id}
                  size="sm"
                  variant={selected ? 'primary' : 'outline'}
                  onPress={() =>
                    void run('set_selection', {
                      optionIds: session.answerMode === 'multiple' ? (selected ? session.selectedOptionIds.filter((id) => id !== o.id) : [...session.selectedOptionIds, o.id]) : [o.id],
                    })
                  }
                  isDisabled={locked}
                  disabledReason={locked ? SESSION.lockHint : null}
                  className={isCorrect === true ? 'ring-2 ring-[var(--success)]' : isCorrect === false && selected ? 'ring-2 ring-[var(--danger)]' : ''}
                >
                  {`${String.fromCharCode(65 + i)}${compact ? '' : ` · ${o.text}`}`}
                </Button>
              )
            })}
          </div>
          ) : null}
        </div>
      ) : (
        <PhaseNote
          title={phase === 'ready' ? PHASE.ready.title : phase === 'handover' ? PHASE.handover.title : phase === 'standings' ? PHASE.standings.title : phase === 'ended' ? PHASE.ended.title : SESSION.noSession}
          hint={phase === 'ready' ? PHASE.ready.hint : phase === 'handover' ? PHASE.handover.hint : phase === 'standings' ? PHASE.standings.hint : phase === 'ended' ? PHASE.ended.hint : open ? SESSION.chooseDomainHint : null}
        />
      )}

      {/* the final standings — the only thing left once the board is empty.
        * `reveal_leaderboard_rank` is Play state, so it is legal whatever
        * screen is up; the operator still needs one press to put the screen
        * where the audience can see it, and that is the second button. */}
      {phase === 'standings' ? (
        <div className="flex flex-col gap-2" data-standings>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              variant="primary"
              icon="eye"
              isDisabled={nextRank === null}
              disabledReason={nextRank === null ? SESSION.leaderboardDone : null}
              onPress={() => nextRank !== null && void run('reveal_leaderboard_rank', { rank: nextRank })}
            >
              {SESSION.leaderboardNext}
            </Button>
            {play.currentScreen === 'finalLeaderboard' ? (
              <Text variant="studio-caption" tone="muted">
                {PHASE.onLeaderboard}
              </Text>
            ) : (
              <Button size="sm" variant="outline" onPress={() => void run('show_screen', { screen: 'finalLeaderboard' })}>
                {PHASE.showLeaderboard}
              </Button>
            )}
          </div>
          <Text variant="studio-caption" tone="muted" tabular>
            {SESSION.placesRevealed(play.leaderboardRevealedRanks.length, new Set(play.teams.map((t) => t.rank)).size)}
          </Text>
        </div>
      ) : null}

      {/* next question — `choose_domain` from any screen (§5.2).
        * The operator is not obliged to be standing on ChooseDomain to move
        * the game on: a correct answer leaves the token where it is, and the
        * usual next act is another question in the same domain. Before this
        * existed the only door was a domain card in the Viewer, so an operator
        * who resolved a question anywhere else had no way forward at all. */}
      {phase === 'resolved' ? (
        <div className="flex flex-col gap-2" data-next-question>
          <div className="flex items-center justify-between gap-2">
            <Text variant="studio-caption" tone="muted">
              {SESSION.nextQuestion}
            </Text>
            {sessionLive ? (
              <Text variant="studio-caption" tone="muted">
                {SESSION.revealFirstToContinue}
              </Text>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {play.domains.map((d) => {
              const reason = d.exhausted ? SESSION.exhausted : sessionLive ? SESSION.revealFirstToContinue : play.ring.currentTeamId === null ? SESSION.noTargets : null
              return (
                <Button
                  key={d.id}
                  size="sm"
                  variant="outline"
                  isDisabled={d.exhausted || !canChoose}
                  disabledReason={reason}
                  onPress={() => void run('choose_domain', { domainId: d.id })}
                >
                  {`${d.name}${d.nextDifficulty === null || compact ? '' : ` · ${SESSION.domainDifficulty(d.nextDifficulty)}`}`}
                </Button>
              )
            })}
          </div>
        </div>
      ) : null}

      <Separator />

      {/* give token */}
      {showRing ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Text variant="studio-caption" tone={phase === 'handover' ? 'default' : 'muted'}>
              {phase === 'handover' ? SESSION.giveTokenNow : SESSION.giveToken}
            </Text>
            {play.operator.consecutiveCorrect > 0 ? (
              <Text variant="studio-caption" tone="accent">
                {SESSION.streak(play.operator.consecutiveCorrect)}
              </Text>
            ) : null}
          </div>
          <ol className="flex flex-col gap-1" aria-label={RING.title}>
            {entries.map((e) => {
              const role = ringRole(play, e)
              const blocked = session !== null && !resolved && play.operator.overrideAfterLock === 'refuse_until_reveal'
              const variant: RingRowVariant = play.operator.isRehearsal
                ? 'rehearsal-solo'
                : e.phase === 'current'
                  ? 'current'
                  : e.phase === 'history'
                    ? 'history'
                    : armed === e.team.id
                      ? 'override-armed'
                      : blocked && e.isLegalTarget
                        ? 'override-blocked'
                        : e.isLegalTarget && e.team.id === play.operator.defaultNextTeamId
                          ? 'overlooked'
                          : 'future'
              return (
                <li key={e.team.id}>
                  <RingRow
                    mark={{ color: e.team.color, shortCode: e.team.shortCode, name: e.team.name, logoUrl: e.team.logoUrl }}
                    name={e.team.name}
                    score={e.team.score}
                    turns={e.team.turnsTaken}
                    variant={variant}
                    position={e.index + 1}
                    density={density === 'dense' ? 'compact' : density}
                    onPress={e.isLegalTarget && open && !blocked ? () => giveToken(e.team.id, e.team.name) : undefined}
                    trailing={
                      // What this row *is*, in the operator's own words: the
                      // team the ring serves next reads differently from one a
                      // hand-over would jump to, and a row that cannot be
                      // pressed says why (`ringRole`).
                      armed === e.team.id ? (
                        <Text variant="studio-caption" tone="danger">
                          {SESSION.revealAndPass}
                        </Text>
                      ) : (
                        <Text variant="studio-caption" tone={role === 'next' ? 'accent' : 'muted'}>
                          {RING_ROLE[role]}
                        </Text>
                      )
                    }
                  />
                </li>
              )
            })}
          </ol>
        </div>
      ) : null}

      <ConfirmDialog
        isOpen={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === 'abandon' ? TRANSPORT.abandonTitle : TRANSPORT.restartTitle}
        body={
          confirm === 'abandon' ? (
            TRANSPORT.abandonBody
          ) : (
            <div className="flex flex-col gap-3">
              <Text variant="studio-body" tone="muted">
                {TRANSPORT.restartBody}
              </Text>
              <div className="flex gap-2">
                <Button size="sm" variant={confirm === 'restart-same' ? 'primary' : 'outline'} onPress={() => setConfirm('restart-same')}>
                  {TRANSPORT.restartSame}
                </Button>
                <Button size="sm" variant={confirm === 'restart-different' ? 'primary' : 'outline'} onPress={() => setConfirm('restart-different')}>
                  {TRANSPORT.restartDifferent}
                </Button>
              </div>
            </div>
          )
        }
        severity="danger"
        confirmLabel={confirm === 'abandon' ? TRANSPORT.abandon : TRANSPORT.restart}
        arm
        isPending={pending}
        onConfirm={doConfirm}
      />
    </div>
  )
}

/** One line of "where the operator stands", when there is no question to draw. */
function PhaseNote({ title, hint }: { title: string; hint: string | null }) {
  return (
    <div className="flex flex-col gap-1" data-phase-note>
      <Text variant="studio-label" tone="muted">
        {title}
      </Text>
      {hint ? (
        <Text variant="studio-caption" tone="muted">
          {hint}
        </Text>
      ) : null}
    </div>
  )
}
