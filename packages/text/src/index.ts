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
 *   eyebrow                  a short line above the wordmark — Space Grotesk, regular
 *   tagline                  a short line below it — Space Mono, regular
 *   brand / partner          the header pair — Space Grotesk bold / regular, as typed
 *   title                    a body title (`playing sequence //`) — Space Mono bold, broken case
 *   row-number / row-name    a list row — Space Grotesk bold
 *   meta-label / meta-value  small label over value stacks — Space Grotesk
 *   code-quiet               a category code at rest — Space Mono regular
 *   card-figure / card-name  the domain card's number and name
 *   figure                   a hero figure in a panel (timer digits, points) — Space Grotesk bold
 *   team-tag                 a team name beside a HUD label — Space Grotesk regular, uppercase
 *   letter / answer          an answer card's letter and text — Space Grotesk bold
 *   champion                 the winner's name, huge — Space Grotesk regular, uppercase
 *   hero                     an interstitial word (CORRECT, TEAM ALPHA) — Space Grotesk bold, huge, uppercase
 *   hud-large                a HUD line at interstitial size — Space Mono bold, as typed
 *   place-label              `PLACE_01` — Space Grotesk bold, small, uppercase
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
  | 'stage-eyebrow'
  | 'stage-tagline'
  | 'stage-brand'
  | 'stage-partner'
  | 'stage-title'
  | 'stage-row-number'
  | 'stage-row-name'
  | 'stage-meta-label'
  | 'stage-meta-value'
  | 'stage-code-quiet'
  | 'stage-card-figure'
  | 'stage-card-name'
  | 'stage-figure'
  | 'stage-team-tag'
  | 'stage-letter'
  | 'stage-answer'
  | 'stage-champion'
  | 'stage-hero'
  | 'stage-hud-large'
  | 'stage-place-label'
  | 'studio-display'
  | 'studio-title'
  | 'studio-heading'
  | 'studio-subheading'
  | 'studio-body'
  | 'studio-label'
  | 'studio-caption'
  | 'studio-mono';

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

/** Space Grotesk at a small size: no display tracking, heading leading. */
const grotesk = (size: string, weight: string): VariantTokens => ({
  size,
  family: 'var(--font-display)',
  weight,
  tracking: 'var(--tracking-normal)',
  leading: 'var(--leading-heading)',
  casing: 'var(--case-prose)',
});

/**
 * Studio resolves to HeroUI's Tailwind-v4 theme: the `--text-studio-*` roles
 * declared in `packages/design-studio/tokens/theme.css`, Tailwind's own weight
 * and tracking variables, and `--font-sans` / `--font-mono`. Studio has no
 * casing token — its chrome is sentence case everywhere — so `casing` is the
 * literal `none`, which is still not a raw size.
 */
const studio = (
  size: string,
  weight = 'var(--font-weight-normal)',
  family = 'var(--font-sans)',
  tracking = 'var(--tracking-normal)',
): VariantTokens => ({
  size,
  family,
  weight,
  tracking,
  leading: `var(${size.slice(4, -1)}--line-height)`,
  casing: 'none',
});

const VARIANT_TOKENS: Record<TextVariant, VariantTokens> = {
  'stage-mega': display('var(--text-mega)', 'var(--tracking-tight-1)'),
  'stage-display': display('var(--text-display-1)', 'var(--tracking-tight-2)'),
  'stage-number': display('var(--text-giant)', 'var(--tracking-tight-2)'),
  'stage-question': display('var(--text-display-2)', 'var(--tracking-tight-3)', 'var(--leading-heading)'),
  'stage-name': {
    ...display('var(--text-display-2)', 'var(--tracking-tight-3)', 'var(--leading-heading)'),
    casing: 'var(--case-name)',
  },
  'stage-heading': display('var(--text-heading-2)', 'var(--tracking-tight-4)', 'var(--leading-heading)'),
  'stage-hud': mono('var(--text-label)', 'var(--tracking-wide-1)', 'var(--case-hud)'),
  'stage-code': mono('var(--text-label)', 'var(--tracking-wide-2)', 'var(--case-prose)'),
  'stage-caption': mono('var(--text-caption)', 'var(--tracking-wide-1)', 'var(--case-hud)'),
  'stage-eyebrow': {
    size: 'var(--text-heading-4)',
    family: 'var(--font-display)',
    weight: 'var(--weight-regular)',
    tracking: 'var(--tracking-normal)',
    leading: 'var(--leading-heading)',
    casing: 'var(--case-prose)',
  },
  'stage-tagline': {
    size: 'var(--text-heading-4)',
    family: 'var(--font-mono)',
    weight: 'var(--weight-regular)',
    tracking: 'var(--tracking-normal)',
    leading: 'var(--leading-heading)',
    casing: 'var(--case-prose)',
  },
  'stage-brand': { ...grotesk('var(--text-body)', 'var(--weight-bold)'), casing: 'var(--case-name)' },
  'stage-partner': { ...grotesk('var(--text-body)', 'var(--weight-regular)'), casing: 'var(--case-prose)' },
  'stage-title': { ...mono('var(--text-display-3)', 'var(--tracking-normal)', 'var(--case-hud)'), leading: 'var(--leading-heading)' },
  'stage-row-number': grotesk('var(--text-heading-3)', 'var(--weight-bold)'),
  'stage-row-name': { ...grotesk('var(--text-heading-2)', 'var(--weight-bold)'), casing: 'var(--case-name)' },
  'stage-meta-label': { ...grotesk('var(--text-caption)', 'var(--weight-regular)'), casing: 'var(--case-name)' },
  'stage-meta-value': { ...grotesk('var(--text-label)', 'var(--weight-bold)'), casing: 'var(--case-name)' },
  'stage-code-quiet': { ...mono('var(--text-body)', 'var(--tracking-normal)', 'var(--case-prose)'), weight: 'var(--weight-regular)' },
  'stage-card-figure': grotesk('var(--text-display-4)', 'var(--weight-bold)'),
  'stage-card-name': { ...mono('var(--text-display-4)', 'var(--tracking-normal)', 'var(--case-prose)'), leading: 'var(--leading-heading)' },
  'stage-figure': { ...grotesk('var(--text-heading-1)', 'var(--weight-bold)'), tracking: 'var(--tracking-tight-3)', leading: 'var(--leading-display)' },
  'stage-team-tag': { ...grotesk('var(--text-body)', 'var(--weight-regular)'), casing: 'var(--case-name)' },
  'stage-letter': grotesk('var(--text-heading-4)', 'var(--weight-bold)'),
  'stage-answer': grotesk('var(--text-heading-2)', 'var(--weight-bold)'),
  'stage-champion': { ...grotesk('var(--text-giant)', 'var(--weight-regular)'), tracking: 'var(--tracking-tight-2)', leading: 'var(--leading-display)', casing: 'var(--case-name)' },
  'stage-place-label': { ...grotesk('var(--text-label)', 'var(--weight-bold)'), tracking: 'var(--tracking-wide-1)', casing: 'var(--case-name)' },
  'stage-hero': { ...grotesk('var(--text-giant)', 'var(--weight-bold)'), tracking: 'var(--tracking-tight-2)', leading: 'var(--leading-display)', casing: 'var(--case-name)' },
  'stage-hud-large': { ...mono('var(--text-heading-4)', 'var(--tracking-wide-1)', 'var(--case-prose)'), leading: 'var(--leading-heading)' },
  'studio-display': studio('var(--text-studio-display)', 'var(--font-weight-semibold)', 'var(--font-sans)', 'var(--tracking-tight)'),
  'studio-title': studio('var(--text-studio-title)', 'var(--font-weight-semibold)', 'var(--font-sans)', 'var(--tracking-tight)'),
  'studio-heading': studio('var(--text-studio-heading)', 'var(--font-weight-medium)'),
  'studio-subheading': studio('var(--text-studio-subheading)', 'var(--font-weight-medium)'),
  'studio-body': studio('var(--text-studio-body)'),
  'studio-label': studio('var(--text-studio-label)', 'var(--font-weight-medium)'),
  'studio-caption': studio('var(--text-studio-caption)'),
  'studio-mono': studio('var(--text-studio-mono)', 'var(--font-weight-normal)', 'var(--font-mono)'),
};

/** Resolve a variant to its tokens. Exported so tests can assert coverage. */
export function variantTokens(variant: TextVariant): VariantTokens {
  return VARIANT_TOKENS[variant];
}

export const TEXT_VARIANTS = Object.keys(VARIANT_TOKENS) as TextVariant[];
