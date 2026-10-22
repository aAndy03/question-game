import { Chip, Panel, Text, Tooltip } from '@/atoms'
import { PREVIEW } from '@/copy/preview'
import type { AwardBreakdown, RulesPreview } from '@/host/types'

export interface AwardMatrixProps {
  preview: RulesPreview
  /** True when the rows came from the fallback ladder, not a real board. */
  sampled?: boolean | undefined
}

/**
 * Difficulty rows × answer-speed columns, every cell the exact points the
 * current rules would pay (P11.12).
 *
 * The whole point is that the numbers are the host's: each cell is an
 * `AwardBreakdown` computed by the same function `reveal_outcome` scores with,
 * so a number here is a promise. This component formats and explains; it never
 * multiplies anything.
 *
 * Rows come from **this game's own board** — the difficulties actually on it,
 * with how many questions sit at each and which domains they belong to — so
 * the operator reads what this show will pay rather than a hypothetical curve.
 */
export function AwardMatrix({ preview, sampled }: AwardMatrixProps) {
  const { columns, rows } = preview
  const partialShown = rows.some((row) => row.partial !== null)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Text as="h3" variant="studio-subheading">{PREVIEW.matrix.title}</Text>
        {sampled ? (
          <Text variant="studio-caption" tone="muted">
            {PREVIEW.matrix.fallback}
          </Text>
        ) : null}
      </div>
      <Panel className="overflow-x-auto" flush>
        <table className="w-full border-collapse" aria-label={PREVIEW.matrix.title}>
          <thead>
            <tr className="border-b border-[var(--separator)]">
              <th scope="col" className="p-2 pl-3 text-left">
                <Text variant="studio-caption" tone="muted">
                  {PREVIEW.matrix.difficulty}
                </Text>
              </th>
              <th scope="col" className="p-2 text-right">
                <Text variant="studio-caption" tone="muted">
                  {PREVIEW.matrix.baseColumn}
                </Text>
              </th>
              {columns.map((column, index) => (
                <th key={index} scope="col" className="p-2 text-right">
                  <Text variant="studio-caption" tone="muted">
                    {PREVIEW.lock(column.lock)}
                  </Text>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.difficulty} className="border-b border-[var(--separator)] last:border-0" data-difficulty={row.difficulty}>
                <th scope="row" className="p-2 pl-3 text-left font-normal">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <Text variant="studio-label" tabular>
                      {row.difficulty}
                    </Text>
                    <Text variant="studio-caption" tone="muted">
                      {row.questionCount > 0 ? PREVIEW.matrix.questions(row.questionCount) : PREVIEW.matrix.noQuestions}
                    </Text>
                  </div>
                  {row.domains.length > 0 ? (
                    <Text as="div" variant="studio-caption" tone="muted" truncate>
                      {row.domains.join(' · ')}
                    </Text>
                  ) : null}
                </th>
                <td className="p-2 text-right">
                  <Tooltip content={PREVIEW.base(row.baseFrom)}>
                    <Text variant="studio-body" tone="muted" tabular>
                      {row.base}
                    </Text>
                  </Tooltip>
                </td>
                {row.correct.map((cell, index) => (
                  <Cell key={index} breakdown={cell} />
                ))}
              </tr>
            ))}
            {partialShown
              ? rows.map((row) =>
                  row.partial ? (
                    <tr key={`${row.difficulty}-partial`} className="border-b border-[var(--separator)] last:border-0 opacity-80">
                      <th scope="row" className="p-2 pl-3 text-left font-normal">
                        <Text variant="studio-caption" tone="muted">
                          {row.difficulty} · {PREVIEW.matrix.partial}
                        </Text>
                      </th>
                      <td />
                      {row.partial.map((cell, index) => (
                        <Cell key={index} breakdown={cell} muted />
                      ))}
                    </tr>
                  ) : null,
                )
              : null}
          </tbody>
        </table>
      </Panel>
      <Text variant="studio-caption" tone="muted">
        {PREVIEW.matrix.incorrectAlways}
      </Text>
    </div>
  )
}

/** One cell: the number, and the working behind it on hover. */
function Cell({ breakdown, muted }: { breakdown: AwardBreakdown; muted?: boolean }) {
  return (
    <td className="p-2 text-right">
      <Tooltip content={workingOf(breakdown)}>
        <Text variant="studio-body" tone={muted ? 'muted' : 'default'} tabular>
          {breakdown.total}
        </Text>
      </Tooltip>
    </td>
  )
}

/**
 * The arithmetic in one line, read off the breakdown. Formatting, not
 * computing: every number here was already decided by the host.
 */
export function workingOf(breakdown: AwardBreakdown): string {
  const parts: string[] = [`${PREVIEW.base(breakdown.baseFrom)} = ${breakdown.base}`]
  if (breakdown.speed.state === 'on') {
    const { multiplier, remainingMs, durationMs, weight } = breakdown.speed
    parts.push(
      `× ${multiplier.toFixed(2)} (locked with ${PREVIEW.seconds(remainingMs)} of ${PREVIEW.seconds(durationMs)} left, weight ${weight})`,
    )
  } else {
    parts.push(`× 1 (${PREVIEW.speedOff(breakdown.speed.reason)})`)
  }
  if (breakdown.share) {
    parts.push(
      `× ${Math.round(breakdown.share.share * 100)}% (${breakdown.share.correctLocked} of ${breakdown.share.correctTotal} right)`,
    )
  }
  if (breakdown.bonus) {
    parts.push(`+ ${breakdown.bonus.award} (${PREVIEW.ledger.streak(breakdown.bonus.streak)})`)
  }
  return `${parts.join(' ')} = ${breakdown.total}`
}

/** The band ladder — the answer to "what does Bands do", drawn as ranges. */
export function BandLadder({ bands }: { bands: RulesPreview['bands'] }) {
  if (bands.length === 0) return null
  const lastReachable = [...bands].reverse().find((band) => band.reachable)
  return (
    <div className="flex flex-col gap-2" data-band-ladder>
      <Text as="h3" variant="studio-subheading">{PREVIEW.bands.title}</Text>
      <Text variant="studio-caption" tone="muted">
        {PREVIEW.bands.hint}
      </Text>
      <Panel className="flex flex-col gap-1">
        {bands.map((band) => (
          <div
            key={band.index}
            className={['flex items-baseline justify-between gap-3', band.reachable ? '' : 'opacity-50'].join(' ')}
            data-band={band.index}
          >
            <Text variant="studio-label" tabular>
              {band.reachable ? PREVIEW.bands.range(band.from, band.upTo) : `≤ ${band.upTo}`}
            </Text>
            <div className="flex items-baseline gap-2">
              {band.reachable ? null : (
                <Tooltip content={PREVIEW.bands.unreachableHint}>
                  <Chip tone="warning">{PREVIEW.bands.unreachable}</Chip>
                </Tooltip>
              )}
              <Text variant="studio-body" tabular>
                {band.points}
              </Text>
            </div>
          </div>
        ))}
        {lastReachable && lastReachable.upTo < 100 ? (
          <Text variant="studio-caption" tone="muted">
            {PREVIEW.bands.aboveLast(lastReachable.upTo)}
          </Text>
        ) : null}
      </Panel>
    </div>
  )
}
