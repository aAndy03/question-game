/**
 * What makes a question ready for a show (§2.32, P11.17).
 *
 * The rule is the host's — `crates/host/src/catalog/complete.rs` — and the
 * host refuses on it: a board write, a Load, an import report. This spells the
 * same five gaps for display, the way `host/board.ts` spells one question per
 * difficulty, so the row mark, the Incomplete filter and the editor's live
 * list never wait on a refusal to find out. It decides nothing.
 */

import type { Domain, QuestionGap, QuestionOption, QuestionOverlay } from './types'

/** What the gaps are read from — a library row, a draft, or an overlay-applied body. */
export interface QuestionBody {
  readonly stem: string
  readonly options: readonly QuestionOption[]
  readonly difficulty: number | null
}

/** The four gaps a body has on its own — everything but the domain. */
export function bodyGaps(q: QuestionBody): QuestionGap[] {
  const gaps: QuestionGap[] = []
  if (!q.stem.trim()) gaps.push('stem')
  if (q.options.length < 2) gaps.push('options')
  if (!q.options.some((o) => o.correct)) gaps.push('correct')
  if (q.difficulty === null) gaps.push('difficulty')
  return gaps
}

/** Every gap a library row has. Membership lives on the domains (§4.1). */
export function questionGaps(q: QuestionBody, inActiveDomain: boolean): QuestionGap[] {
  const gaps = bodyGaps(q)
  if (!inActiveDomain) gaps.push('domain')
  return gaps
}

/** The body this show would ask: the recipe overlay applied field by field (§2.17). */
export function effectiveBody(q: QuestionBody, overlay: QuestionOverlay | undefined): QuestionBody {
  return {
    stem: overlay?.stem ?? q.stem,
    options: overlay?.options ?? q.options,
    difficulty: overlay?.difficulty ?? q.difficulty,
  }
}

/** The floor every write keeps: question text, or one option with text. */
export function acceptsQuestion(q: Pick<QuestionBody, 'stem' | 'options'>): boolean {
  return q.stem.trim().length > 0 || q.options.some((o) => o.text.trim().length > 0)
}

/** Every question id that sits in at least one **active** domain. */
export function activeMemberIds(domains: readonly Domain[]): ReadonlySet<string> {
  const ids = new Set<string>()
  for (const d of domains) if (d.archivedAt === null) for (const m of d.questions) ids.add(m.questionId)
  return ids
}
