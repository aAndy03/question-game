/**
 * One question per difficulty, inside one board domain (P11.13).
 *
 * The rule is the host's — `CatalogService::recipe_upsert` refuses a board that
 * breaks it, and `build_snapshot` refuses to start a Play from one. This module
 * spells the same rule for the Board section, so the checkbox the host would
 * refuse is disabled with a reason before the operator presses it (§4.2's "the
 * UI disables the illegal sibling first"), the way `host/session.ts` spells the
 * host's live-session rule for the Action Panel.
 *
 * It reads only the **effective** difficulty each row already shows — the
 * recipe overlay if there is one, else the catalog's. It decides nothing about
 * whether the rule applies; the rule always applies.
 */

export interface BoardMember {
  readonly questionId: string
  /** The effective difficulty: recipe overlay if set, else the catalog's. */
  readonly difficulty: number
  /** On this recipe's board right now. */
  readonly selected: boolean
}

/**
 * Every member the board may **not** select right now, mapped to the difficulty
 * another selected question has already claimed.
 *
 * A selected member is never blocked — a board written by an older build can
 * hold two at one difficulty, and disabling both would take away the checkbox
 * the operator needs to fix it.
 */
export function blockedMembers(members: readonly BoardMember[]): ReadonlyMap<string, number> {
  const claimed = new Map<number, string>()
  for (const m of members) if (m.selected) claimed.set(m.difficulty, m.questionId)

  const blocked = new Map<string, number>()
  for (const m of members) {
    if (m.selected) continue
    const holder = claimed.get(m.difficulty)
    if (holder !== undefined && holder !== m.questionId) blocked.set(m.questionId, m.difficulty)
  }
  return blocked
}

/**
 * One question per difficulty, `difficulty ASC, id ASC` — the order
 * `SnapshotDomain::new` puts the queue in, so a freshly added domain is already
 * a playable ladder.
 */
export function oneQuestionPerDifficulty(
  members: readonly { readonly questionId: string; readonly difficulty: number }[],
): string[] {
  const picked = new Map<number, string>()
  for (const m of members) {
    const held = picked.get(m.difficulty)
    if (held === undefined || m.questionId < held) picked.set(m.difficulty, m.questionId)
  }
  return [...picked.entries()].sort((a, b) => a[0] - b[0]).map(([, id]) => id)
}
