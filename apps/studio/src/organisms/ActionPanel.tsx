import { useEffect, useState } from 'react'
import { Button, MeaningChip, Separator, Text, TransportButton } from '@/atoms'
import { ConfirmDialog, EmptyState, RevealControls, RingRow, TimerCluster, type RingRowVariant } from '@/molecules'
import { CONTROL, HOTKEYS, RING, SESSION, TRANSPORT } from '@/copy'
import { useHostCommand } from '@/host/commands'
import { isPlayOpen, usePlayState } from '@/host/playState'
import { ringEntries } from '@/host/ring'

export interface ActionPanelProps {
  density: 'comfortable' | 'compact' | 'dense'
}

/**
 * Transport · timer · the session (reveal, lock, outcome) · give token ·
 * undo/redo · restart/abandon. Every button is one `run(...)`; the Viewer and
 * the chords call the same function (05_STUDIO_DESIGN.md §10.4).
 *
 * Armed states are component state and reset on unmount; nothing here is
 * remembered.
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
  const entries = ringEntries(play)
  const compact = density !== 'comfortable'

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
        <TransportButton icon="restart" label={TRANSPORT.restart} onPress={() => setConfirm('restart-same')} isDisabled={ended} disabledReason={waitReason} />
        <TransportButton icon="abandon" label={TRANSPORT.abandon} state="rest" onPress={() => setConfirm('abandon')} isDisabled={!open} disabledReason={waitReason ?? notOpen} />
      </div>

      <Separator />

      {/* session */}
      {session ? (
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
          </div>
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
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <Text variant="studio-label" tone="muted">
            {SESSION.noSession}
          </Text>
          {open ? (
            <Text variant="studio-caption" tone="muted">
              {SESSION.chooseDomainHint}
            </Text>
          ) : null}
        </div>
      )}

      <Separator />

      {/* give token */}
      {play.operator.showGiveToken ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Text variant="studio-caption" tone="muted">
              {SESSION.giveToken}
            </Text>
            {play.operator.consecutiveCorrect > 0 ? (
              <Text variant="studio-caption" tone="accent">
                {SESSION.streak(play.operator.consecutiveCorrect)}
              </Text>
            ) : null}
          </div>
          <ol className="flex flex-col gap-1" aria-label={RING.title}>
            {entries.map((e) => {
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
                      armed === e.team.id ? (
                        <Text variant="studio-caption" tone="danger">
                          {SESSION.revealAndPass}
                        </Text>
                      ) : null
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
