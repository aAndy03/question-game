import { Chip, Panel, Text, Tooltip } from '@/atoms'
import { PREVIEW } from '@/copy/preview'
import type { BoardShape, DomainLadder } from '@/host/types'

export interface BoardBalanceProps {
  board: BoardShape
}

/**
 * What kind of board this is, and what that means for the show (P11.12).
 *
 * **Uneven domains are not an award problem.** The award never reads domain
 * membership, so difficulty 21 pays the same in a three-question domain and a
 * thirty-question one. What uneven domains change is the *ceiling* — a
 * three-question domain is exhausted in three turns — and the *walk*, since
 * easy→hard inside a domain has fewer rungs. That is board design, so it is
 * reported here rather than fixed by a rule.
 *
 * The presentation **adapts to the shape**, which is the point of asking:
 *
 * - `aligned` — same count *and* the same ladder everywhere — collapses to one
 *   rung table, because then one table is the whole truth: every domain's nth
 *   question is that difficulty and pays that base.
 * - `uniform` and `ragged` show the ladders side by side with the divergence
 *   marked, because there is no single ladder to show.
 */
export function BoardBalance({ board }: BoardBalanceProps) {
  if (board.kind === 'empty') {
    return (
      <Panel>
        <Text variant="studio-caption" tone="muted">
          {PREVIEW.board.empty}
        </Text>
      </Panel>
    )
  }

  return (
    <div className="flex flex-col gap-2" data-board-shape={board.kind}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Text variant="studio-heading">{PREVIEW.board.title}</Text>
        <Chip tone={board.kind === 'ragged' ? 'warning' : 'success'}>
          {board.kind === 'aligned'
            ? PREVIEW.board.aligned(board.perDomain)
            : board.kind === 'uniform'
              ? PREVIEW.board.uniform(board.perDomain)
              : PREVIEW.board.ragged(board.min, board.max)}
        </Chip>
      </div>
      <Text variant="studio-caption" tone="muted">
        {board.kind === 'aligned' ? PREVIEW.board.alignedHint : board.kind === 'ragged' ? PREVIEW.board.raggedHint : ''}
      </Text>

      {board.kind === 'aligned' ? (
        <Panel className="overflow-x-auto" flush>
          <table className="w-full border-collapse" aria-label={PREVIEW.board.title}>
            <thead>
              <tr className="border-b border-[var(--separator)]">
                <th scope="col" className="p-2 pl-3 text-left">
                  <Text variant="studio-caption" tone="muted">
                    {PREVIEW.board.rung}
                  </Text>
                </th>
                <th scope="col" className="p-2 text-right">
                  <Text variant="studio-caption" tone="muted">
                    {PREVIEW.board.span}
                  </Text>
                </th>
                <th scope="col" className="p-2 pr-3 text-right">
                  <Text variant="studio-caption" tone="muted">
                    {PREVIEW.matrix.baseColumn}
                  </Text>
                </th>
              </tr>
            </thead>
            <tbody>
              {board.rungs.map((rung) => (
                <tr key={rung.index} className="border-b border-[var(--separator)] last:border-0" data-rung={rung.index}>
                  <th scope="row" className="p-2 pl-3 text-left font-normal">
                    <Text variant="studio-label" tabular>
                      {PREVIEW.board.rungIndex(rung.index)}
                    </Text>
                  </th>
                  <td className="p-2 text-right">
                    <Text variant="studio-body" tabular>
                      {rung.difficulty}
                    </Text>
                  </td>
                  <td className="p-2 pr-3 text-right">
                    <Text variant="studio-body" tabular>
                      {rung.base}
                    </Text>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      ) : null}

      <LadderTable domains={board.domains} highlight={board.kind === 'ragged'} />
    </div>
  )
}

/** One row per domain: how many, how hard, how far it walks, and its ceiling. */
function LadderTable({ domains, highlight }: { domains: readonly DomainLadder[]; highlight: boolean }) {
  const counts = domains.map((domain) => domain.questions)
  const min = Math.min(...counts)
  return (
    <Panel className="overflow-x-auto" flush>
      <table className="w-full border-collapse" aria-label={PREVIEW.board.domain}>
        <thead>
          <tr className="border-b border-[var(--separator)]">
            {[PREVIEW.board.domain, PREVIEW.board.count, PREVIEW.board.span, PREVIEW.board.ladder].map((head, index) => (
              <th key={head} scope="col" className={['p-2', index === 0 ? 'pl-3 text-left' : 'text-right'].join(' ')}>
                <Text variant="studio-caption" tone="muted">
                  {head}
                </Text>
              </th>
            ))}
            <th scope="col" className="p-2 pr-3 text-right">
              <Tooltip content={PREVIEW.board.availableHint}>
                <Text variant="studio-caption" tone="muted">
                  {PREVIEW.board.available}
                </Text>
              </Tooltip>
            </th>
          </tr>
        </thead>
        <tbody>
          {domains.map((domain) => (
            <tr key={domain.id} className="border-b border-[var(--separator)] last:border-0" data-domain={domain.id}>
              <th scope="row" className="max-w-[16rem] p-2 pl-3 text-left font-normal">
                <Text variant="studio-label" truncate>
                  {domain.name}
                </Text>
              </th>
              <td className="p-2 text-right">
                <Text
                  variant="studio-body"
                  tone={highlight && domain.questions === min ? 'warning' : 'default'}
                  tabular
                >
                  {domain.questions}
                </Text>
              </td>
              <td className="p-2 text-right">
                <Text variant="studio-body" tone="muted" tabular>
                  {domain.minDifficulty}–{domain.maxDifficulty}
                </Text>
              </td>
              <td className="p-2 text-right">
                <Text variant="studio-caption" tone="muted" tabular truncate>
                  {domain.ladder.join(' → ')}
                </Text>
              </td>
              <td className="p-2 pr-3 text-right">
                <Text variant="studio-body" tabular>
                  {domain.pointsAvailable}
                </Text>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  )
}
