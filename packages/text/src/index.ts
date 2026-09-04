/**
 * The Text module — optimized_first_spec.md §2.29.
 *
 * One module owns every operator- and audience-readable string. Callers pick a
 * token `variant` and a change behaviour; they never learn which library runs
 * underneath.
 *
 *   transition="none"   plain DOM node, no animation runtime. The default, and
 *                       correct for the overwhelming majority of strings.
 *   transition="swap"   the change should be seen (team name, domain, stem).
 *   transition="count"  numeric roll (scores, timer digits, points deltas).
 *
 * Studio implements swap/count with Calligraph (Motion). Stage implements them
 * with GSAP inside the screen's own timeline, so the overlay queue and
 * anim-complete stay authoritative. No component may import `calligraph`
 * directly.
 *
 * P0 scaffold: types plus the `none` path. The two animated implementations
 * arrive with P3 (Stage) and P7 (Studio).
 */

export type TextTransition = 'none' | 'swap' | 'count';

/** Stage variants map to the questiongame type scale; Studio variants to HeroUI. */
export type TextVariant =
  | 'stage-mega'
  | 'stage-display'
  | 'stage-question'
  | 'stage-heading'
  | 'stage-hud'
  | 'stage-caption'
  | 'studio-body'
  | 'studio-label'
  | 'studio-caption';

export interface TextProps {
  /** Token role, never a raw font size. */
  variant: TextVariant;
  /** What happens when the content changes. Defaults to 'none'. */
  transition?: TextTransition;
  /** Element to render. Defaults to 'span'. */
  as?: string;
  children?: unknown;
}

const VARIANT_TOKENS: Record<TextVariant, { size: string; family: string }> = {
  'stage-mega': { size: 'var(--text-mega)', family: 'var(--font-display)' },
  'stage-display': { size: 'var(--text-display-1)', family: 'var(--font-display)' },
  'stage-question': { size: 'var(--text-display-3)', family: 'var(--font-display)' },
  'stage-heading': { size: 'var(--text-heading-2)', family: 'var(--font-display)' },
  'stage-hud': { size: 'var(--text-label)', family: 'var(--font-mono)' },
  'stage-caption': { size: 'var(--text-caption)', family: 'var(--font-mono)' },
  'studio-body': { size: 'var(--text-body)', family: 'var(--font-sans)' },
  'studio-label': { size: 'var(--text-label)', family: 'var(--font-sans)' },
  'studio-caption': { size: 'var(--text-caption)', family: 'var(--font-sans)' },
};

/** Resolve a variant to its token pair. Exported so tests can assert coverage. */
export function variantTokens(variant: TextVariant): { size: string; family: string } {
  return VARIANT_TOKENS[variant];
}

export const TEXT_VARIANTS = Object.keys(VARIANT_TOKENS) as TextVariant[];
