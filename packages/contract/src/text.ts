/**
 * Operator-editable Stage text (P11.16; 05_STUDIO_DESIGN.md §16).
 *
 * Stage's authored copy comes in one table per language (`apps/stage/src/copy`).
 * A recipe may override a handful of those strings — the ones that name
 * *this* show rather than the game: the eyebrow every header carries, the
 * tagline, the session line, the screen titles, the two small labels on a
 * team row, the word in front of a domain. Everything else authored is
 * translated only, and everything derived from the Play is never touched.
 *
 * The overrides live in the recipe layout document (`layout.text`), keyed
 * by language and then by `TextKey`, so an operator who runs the same recipe
 * in both languages writes each once. Stage merges the language's block over
 * its table in exactly one place (`resolveCopy`).
 *
 * `TEXT_KEYS_BY_NODE` is the Inspector's map: which keys a selected node
 * edits. Every header edits the eyebrow, because the header *is* the eyebrow.
 */

import type { NodeId } from './nodes'
import { parseNodeId } from './nodes'
import type { StageLanguage } from './play-state'
import { STAGE_LANGUAGES } from './play-state'

export const TEXT_KEYS = [
  'idleEyebrow',
  'idleTagline',
  'idleStatus',
  'sessionValue',
  'teamOrderTitle',
  'chooseDomainTitle',
  'scoreboardTitle',
  'finalLeaderboardTitle',
  'teamDetailLabel',
  'teamPointsLabel',
  'domainLabel',
] as const

export type TextKey = (typeof TEXT_KEYS)[number]

/** One language's overrides. Absent key means the table's own word. */
export type StageTextOverrides = Partial<Record<TextKey, string>>

/** The `layout.text` block. */
export type StageText = Partial<Record<StageLanguage, StageTextOverrides>>

/** An override longer than this is refused by the parser; Stage type is large. */
export const TEXT_MAX_LENGTH = 120

export function isTextKey(value: unknown): value is TextKey {
  return typeof value === 'string' && (TEXT_KEYS as readonly string[]).includes(value)
}

/** Which keys a node on the canvas edits, by `<screen>.<slot>`. */
const BY_SLOT: Readonly<Record<string, readonly TextKey[]>> = {
  'idle.eyebrow': ['idleEyebrow'],
  'idle.tagline': ['idleTagline'],
  'idle.status': ['idleStatus'],
  'idle.session': ['sessionValue'],
  'teamOrder.header': ['idleEyebrow'],
  'teamOrder.title': ['teamOrderTitle'],
  'teamOrder.row': ['teamDetailLabel', 'teamPointsLabel'],
  'chooseDomain.header': ['idleEyebrow'],
  'chooseDomain.title': ['chooseDomainTitle'],
  'question.header': ['idleEyebrow'],
  'question.category': ['domainLabel'],
  'scoreboard.header': ['idleEyebrow'],
  'scoreboard.title': ['scoreboardTitle'],
  'finalLeaderboard.header': ['idleEyebrow'],
  'finalLeaderboard.title': ['finalLeaderboardTitle'],
  'currentTeam.domain': ['domainLabel'],
}

const NO_KEYS: readonly TextKey[] = []

/** The text keys a node edits; empty for a node whose words are all derived or translated only. */
export function textKeysForNode(id: NodeId): readonly TextKey[] {
  const parsed = parseNodeId(id)
  if (!parsed) return NO_KEYS
  return BY_SLOT[`${parsed.screen}.${parsed.slot}`] ?? NO_KEYS
}

function parseOverrides(raw: unknown): StageTextOverrides | null {
  if (typeof raw !== 'object' || raw === null) return null
  const out: { -readonly [K in TextKey]?: string } = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isTextKey(key)) continue
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (trimmed.length === 0 || trimmed.length > TEXT_MAX_LENGTH) continue
    out[key] = trimmed
  }
  return Object.keys(out).length === 0 ? null : out
}

/** Parse a `layout.text` block. Unknown languages, keys, empty and overlong values are dropped. */
export function parseText(raw: unknown): StageText {
  const out: { -readonly [L in StageLanguage]?: StageTextOverrides } = {}
  if (typeof raw !== 'object' || raw === null) return out
  for (const language of STAGE_LANGUAGES) {
    const parsed = parseOverrides((raw as Record<string, unknown>)[language])
    if (parsed) out[language] = parsed
  }
  return out
}
