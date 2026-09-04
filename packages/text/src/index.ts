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
 * This package holds the types and the variant → token resolution. The React
 * components live in each app (`apps/stage/src/atoms/Text.tsx`,
 * `apps/studio/src/atoms/Text.tsx`) because the surfaces differ in how they
 * animate, not in what a variant means.
 */

export type TextTransition = 'none' | 'swap' | 'count';

/**
 * Stage variants map to the questiongame type scale; Studio variants to HeroUI.
 *
 * Stage roles, in the design system's own words:
 *   mega / display / number  hero figures, wordmark — Space Grotesk, tight
 *   question                 the stem — Space Grotesk, sentence case
 *   name                     team and domain names — Space Grotesk, true uppercase
 *   heading                  section titles — Space Grotesk
 *   hud                      HUD labels (`DOMAIN // …`) — Space Mono, broken case
 *   code                     category codes, clocks — Space Mono, no transform
 *   caption                  small mono metadata
 */
export type TextVariant =
  | 'stage-mega'
  | 'stage-display'
  | 'stage-number'
  | 'stage-question'
  | 'stage-name'
  | 'stage-heading'
  | 'stage-hud'
  | 'stage-code'
  | 'stage-caption'
  | 'studio-body'
  | 'studio-label'
  | 'studio-caption';

/**
 * Everything a variant resolves to. Every value is a `var(--…)` reference into
 * the owning design system — never a raw size, weight or family.
 */
export interface VariantTokens {
  readonly size: string;
  readonly family: string;
  readonly weight: string;
  readonly tracking: string;
  readonly leading: string;
  /** `text-transform` token: hud labels are authored uppercase and lowered. */
  readonly casing: string;
}

export interface TextProps {
  /** Token role, never a raw font size. */
  variant: TextVariant;
  /** What happens when the content changes. Defaults to 'none'. */
  transition?: TextTransition;
  /** Element to render. Defaults to 'span'. */
  as?: string;
  children?: unknown;
}

const display = (size: string, tracking: string, leading = 'var(--leading-display)'): VariantTokens => ({
  size,
  family: 'var(--font-display)',
  weight: 'var(--weight-bold)',
  tracking,
  leading,
  casing: 'var(--case-prose)',
});

const mono = (size: string, tracking: string, casing: string): VariantTokens => ({
  size,
  family: 'var(--font-mono)',
  weight: 'var(--weight-bold)',
  tracking,
  leading: 'var(--leading-hud)',
  casing,
});

const studio = (size: string): VariantTokens => ({
  size,
  family: 'var(--font-sans)',
  weight: 'var(--weight-regular)',
  tracking: 'var(--tracking-normal)',
  leading: 'var(--leading-body)',
  casing: 'var(--case-prose)',
});

const VARIANT_TOKENS: Record<TextVariant, VariantTokens> = {
  'stage-mega': display('var(--text-mega)', 'var(--tracking-tight-1)'),
  'stage-display': display('var(--text-display-1)', 'var(--tracking-tight-2)'),
  'stage-number': display('var(--text-giant)', 'var(--tracking-tight-2)'),
  'stage-question': display('var(--text-display-3)', 'var(--tracking-tight-3)', 'var(--leading-heading)'),
  'stage-name': {
    ...display('var(--text-display-2)', 'var(--tracking-tight-3)', 'var(--leading-heading)'),
    casing: 'var(--case-name)',
  },
  'stage-heading': display('var(--text-heading-2)', 'var(--tracking-tight-4)', 'var(--leading-heading)'),
  'stage-hud': mono('var(--text-label)', 'var(--tracking-wide-1)', 'var(--case-hud)'),
  'stage-code': mono('var(--text-label)', 'var(--tracking-wide-2)', 'var(--case-prose)'),
  'stage-caption': mono('var(--text-caption)', 'var(--tracking-wide-1)', 'var(--case-hud)'),
  'studio-body': studio('var(--text-body)'),
  'studio-label': studio('var(--text-label)'),
  'studio-caption': studio('var(--text-caption)'),
};

/** Resolve a variant to its tokens. Exported so tests can assert coverage. */
export function variantTokens(variant: TextVariant): VariantTokens {
  return VARIANT_TOKENS[variant];
}

export const TEXT_VARIANTS = Object.keys(VARIANT_TOKENS) as TextVariant[];
