import { useState } from 'react'
import { Chip, Panel, SwitchField, Text } from '@/atoms'
import { EmptyState } from '@/molecules'
import { workingOf } from '@/molecules/AwardMatrix'
import { PREVIEW } from '@/copy/preview'
import type { TurnAward } from '@/host/types'

export interface AwardLedgerProps {
  turns: readonly TurnAward[]
}

/**
 * What was awarded per turn, and why (P11.12).
 *
 * One row per resolved turn, with every step of the formula as its own column
 * so the operator can scan a whole Play and see where the variance came from —
 * a base that jumped, a speed factor that did nothing, a share that halved it.
 * Clicking a row spells the same thing out in a sentence naming the settings
 * that produced it.
 *
 * **The TOTAL column is the recorded number**, `points + bonus` from the log —
 * what the scoreboard actually moved by. The working columns come from the
 * host's recomputation over the Play's *frozen* settings, so a rules edit today
 * cannot rewrite what a Play paid yesterday. The two agree (`demo_scenarios.rs`
 * replays whole Plays asserting it), and where they could not, the record wins.
 *
 * Statistics is a projector: nothing here can write. There is no command hook
 * in this file and a test greps for one.
 */
export function AwardLedger({ turns }: AwardLedgerProps) {
  // Component state, like Control's armed buttons: a scan preference is not
  // worth a store, and it resets when the operator leaves the view. Closed by
  // default (P20): the ledger is last on Live, and the total is what most
  // readers came for — the working is there when asked.
  const [working, setWorking] = useState(false)
  const [open, setOpen] = useState<string | null>(null)

  if (turns.length === 0) {
    return <EmptyState kind="empty" what={PREVIEW.ledger.empty} detail={PREVIEW.ledger.emptyHint} />
  }

  return (
    <div className="flex flex-col gap-2" data-award-ledger>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <Text variant="studio-heading">{PREVIEW.ledger.title}</Text>
          <Text variant="studio-caption" tone="muted">
            {PREVIEW.ledger.hint}
          </Text>
        </div>
        <SwitchField label={PREVIEW.ledger.showWorking} isSelected={working} onChange={setWorking} />
      </div>

      <Panel className="overflow-x-auto" flush>
        <table className="w-full border-collapse" aria-label={PREVIEW.ledger.title}>
          <thead>
            <tr className="border-b border-[var(--separator)]">
              {[PREVIEW.ledger.turn, PREVIEW.ledger.team, PREVIEW.ledger.domain, PREVIEW.ledger.question].map((head, i) => (
                <th key={head} scope="col" className={['p-2 text-left', i === 0 ? 'pl-3' : ''].join(' ')}>
                  <Text variant="studio-caption" tone="muted">
                    {head}
                  </Text>
                </th>
              ))}
              {[PREVIEW.ledger.difficulty, PREVIEW.ledger.verdict, PREVIEW.ledger.lock].map((head) => (
                <th key={head} scope="col" className="p-2 text-right">
                  <Text variant="studio-caption" tone="muted">
                    {head}
                  </Text>
                </th>
              ))}
              {working
                ? [PREVIEW.ledger.base, PREVIEW.ledger.speed, PREVIEW.ledger.share, PREVIEW.ledger.bonus].map((head) => (
                    <th key={head} scope="col" className="p-2 text-right">
                      <Text variant="studio-caption" tone="muted">
                        {head}
                      </Text>
                    </th>
                  ))
                : null}
              <th scope="col" className="p-2 pr-3 text-right">
                <Text variant="studio-caption" tone="muted">
                  {PREVIEW.ledger.total}
                </Text>
              </th>
            </tr>
          </thead>
          <tbody>
            {turns.map((turn, index) => {
              const rowKey = `${turn.playId}-${turn.atMs}-${turn.questionId}`
              const { award } = turn
              const columns = working ? 12 : 8
              return (
                <RowGroup
                  key={rowKey}
                  turn={turn}
                  index={turns.length - index}
                  working={working}
                  columns={columns}
                  isOpen={open === rowKey}
                  onToggle={() => setOpen(open === rowKey ? null : rowKey)}
                  working_={workingOf(award)}
                />
              )
            })}
          </tbody>
        </table>
      </Panel>
    </div>
  )
}

interface RowGroupProps {
  turn: TurnAward
  index: number
  working: boolean
  columns: number
  isOpen: boolean
  onToggle: () => void
  working_: string
}

function RowGroup({ turn, index, working, columns, isOpen, onToggle, working_ }: RowGroupProps) {
  const { award } = turn
  const recorded = turn.points + turn.bonus
  const lock =
    turn.remainingMsAtLock === null || turn.timerDurationMs === null
      ? PREVIEW.ledger.none
      : PREVIEW.seconds(turn.timerDurationMs - turn.remainingMsAtLock)

  return (
    <>
      <tr
        className="cursor-pointer border-b border-[var(--separator)] last:border-0 hover:bg-[var(--accent)]/6"
        data-turn={turn.questionId}
        onClick={onToggle}
        aria-expanded={isOpen}
      >
        <th scope="row" className="p-2 pl-3 text-left font-normal">
          <Text variant="studio-caption" tone="muted" tabular>
            {index}
          </Text>
        </th>
        <td className="max-w-[10rem] p-2">
          <Text variant="studio-label" truncate>
            {turn.teamName}
          </Text>
        </td>
        <td className="max-w-[10rem] p-2">
          <Text variant="studio-caption" tone="muted" truncate>
            {turn.domainName}
          </Text>
        </td>
        <td className="max-w-[18rem] p-2">
          <Text variant="studio-caption" tone="muted" truncate>
            {turn.questionStem}
          </Text>
        </td>
        <td className="p-2 text-right">
          <Text variant="studio-body" tone="muted" tabular>
            {turn.difficulty}
          </Text>
        </td>
        <td className="p-2 text-right">
          <Chip tone={turn.verdict === 'correct' ? 'success' : turn.verdict === 'partial' ? 'warning' : 'danger'}>
            {PREVIEW.verdict(turn.verdict)}
          </Chip>
        </td>
        <td className="p-2 text-right">
          <Text variant="studio-caption" tone="muted" tabular>
            {lock}
            {turn.autoLocked ? ` (${PREVIEW.ledger.autoLocked})` : ''}
          </Text>
        </td>
        {working ? (
          <>
            <td className="p-2 text-right">
              <Text variant="studio-body" tone="muted" tabular>
                {award.base}
              </Text>
            </td>
            <td className="p-2 text-right">
              <Text variant="studio-body" tone="muted" tabular>
                {award.speed.state === 'on' ? `×${award.speed.multiplier.toFixed(2)}` : PREVIEW.ledger.none}
              </Text>
            </td>
            <td className="p-2 text-right">
              <Text variant="studio-body" tone="muted" tabular>
                {award.share ? `${Math.round(award.share.share * 100)}%` : PREVIEW.ledger.none}
              </Text>
            </td>
            <td className="p-2 text-right">
              <Text variant="studio-body" tone="muted" tabular>
                {turn.bonus > 0 ? `+${turn.bonus}` : PREVIEW.ledger.none}
              </Text>
            </td>
          </>
        ) : null}
        <td className="p-2 pr-3 text-right">
          <Text variant="studio-label" tabular>
            {recorded}
          </Text>
        </td>
      </tr>
      {isOpen ? (
        <tr className="border-b border-[var(--separator)] bg-[var(--accent)]/4 last:border-0">
          <td colSpan={columns} className="p-3">
            <div className="flex flex-col gap-1">
              <Text variant="studio-caption" tone="muted">
                {PREVIEW.ledger.why}
              </Text>
              <Text variant="studio-body">{working_}</Text>
              <div className="flex flex-wrap gap-2 pt-1">
                {turn.streak > 1 ? <Chip tone="accent">{PREVIEW.ledger.streak(turn.streak)}</Chip> : null}
                {turn.tokenEnds ? <Chip tone="default">{PREVIEW.ledger.tokenEnds}</Chip> : null}
                {award.speed.state === 'off' ? (
                  <Chip tone="default">{PREVIEW.speedOff(award.speed.reason)}</Chip>
                ) : null}
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  )
}
