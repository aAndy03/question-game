import { Chip, Icon, Panel, Text } from '@/atoms'
import { PREVIEW } from '@/copy/preview'
import type { BoardShape } from '@/host/types'

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
 * - `aligned` — same count *and* the same ladder everywhere — offers one rung
 *   table, closed, because then one table is the whole truth: every domain's
 *   nth question is that difficulty and pays that base.
 * - `uniform` and `ragged` say so in a line; each domain's count, span and
 *   ceiling are on its Board row (P20), the shortest marked on a ragged board.
 */
export function BoardBalance({ board }: BoardBalanceProps) {
  if (board.kind === 'empty') {
    return (
      <Text as="p" variant="studio-caption" tone="muted">
        {PREVIEW.board.empty}
      </Text>
    )
  }
  const hint = board.kind === 'aligned' ? PREVIEW.board.alignedHint : board.kind === 'ragged' ? PREVIEW.board.raggedHint : null
  return (
    // One line on the Board (P20); each domain's own numbers are on its row.
    <div className="flex flex-col gap-1.5" data-board-shape={board.kind}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Chip tone={board.kind === 'ragged' ? 'warning' : 'success'}>
          {board.kind === 'aligned'
            ? PREVIEW.board.aligned(board.perDomain)
            : board.kind === 'uniform'
              ? PREVIEW.board.uniform(board.perDomain)
              : PREVIEW.board.ragged(board.min, board.max)}
        </Chip>
        {hint ? (
          <Text variant="studio-caption" tone="muted">
            {hint}
          </Text>
        ) : null}
      </div>
      {board.kind === 'aligned' ? (
        <details className="group">
          <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded py-1 outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]">
            <Icon name="chevronRight" size="sm" className="transition-transform group-open:rotate-90" />
            <Text variant="studio-label">{PREVIEW.board.ladderTitle(board.rungs.length)}</Text>
          </summary>
          <Panel className="mt-1 max-w-md overflow-x-auto" flush>
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
        </details>
      ) : null}
    </div>
  )
}
