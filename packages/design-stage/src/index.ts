/**
 * Stage design system — questiongame tokens.
 *
 * The stylesheet is the product here: `@questiongame/design-stage/stage.css`.
 * This entry point exposes the token names so components reference them by
 * identifier instead of retyping `var(--…)` strings.
 *
 * Never imported by apps/studio (enforced by eslint).
 */

export const COLOR = {
  ink: 'var(--ink)',
  inkBlack: 'var(--ink-black)',
  paper: 'var(--paper)',
  textPrimary: 'var(--text-primary)',
  textHeading: 'var(--text-heading)',
  textMuted: 'var(--text-muted)',
  borderDefault: 'var(--border-default)',
  borderSubtle: 'var(--border-subtle)',
  correct: 'var(--state-correct)',
  incorrect: 'var(--state-incorrect)',
  info: 'var(--state-info)',
  leader: 'var(--state-leader)',
  accent: 'var(--state-accent)',
} as const;

export const SPACE = {
  1: 'var(--space-1)',
  2: 'var(--space-2)',
  3: 'var(--space-3)',
  4: 'var(--space-4)',
  5: 'var(--space-5)',
  6: 'var(--space-6)',
  7: 'var(--space-7)',
  8: 'var(--space-8)',
} as const;

/** The design system allows exactly three radii. */
export const RADIUS = {
  /** Frames, dividers, tag pills, header. The default. */
  none: 'var(--radius-none)',
  /** Letter / avatar boxes only. */
  sm: 'var(--radius-sm)',
  /** Answer-option cards and result widgets only. */
  md: 'var(--radius-md)',
} as const;

/** Structure comes from inset box-shadows, never from `border` or drop shadows. */
export const BORDER = {
  thin: 'var(--border-thin)',
  thick: 'var(--border-thick)',
  heavy: 'var(--border-heavy)',
} as const;

export const TYPE = {
  mega: 'var(--text-mega)',
  giant: 'var(--text-giant)',
  display1: 'var(--text-display-1)',
  display2: 'var(--text-display-2)',
  display3: 'var(--text-display-3)',
  display4: 'var(--text-display-4)',
  heading1: 'var(--text-heading-1)',
  heading2: 'var(--text-heading-2)',
  heading3: 'var(--text-heading-3)',
  heading4: 'var(--text-heading-4)',
  body: 'var(--text-body)',
  label: 'var(--text-label)',
  caption: 'var(--text-caption)',
  micro: 'var(--text-micro)',
} as const;

export const WEIGHT = {
  regular: 'var(--weight-regular)',
  medium: 'var(--weight-medium)',
  bold: 'var(--weight-bold)',
} as const;

/**
 * Stage layout. Values live in tokens/layout.css — these are references, not
 * copies, so there is exactly one place to change the canvas.
 */
export const LAYOUT = {
  width: 'var(--stage-width)',
  height: 'var(--stage-height)',
  padding: 'var(--stage-padding)',
  zoneGap: 'var(--stage-zone-gap)',
  gapTight: 'var(--stage-gap-tight)',
  gapLoose: 'var(--stage-gap-loose)',
  contentColumn: 'var(--stage-content-column)',
  contentColumnWide: 'var(--stage-content-column-wide)',
  sidePanelWidth: 'var(--stage-side-panel-width)',
  sidePanelHeight: 'var(--stage-side-panel-height)',
  questionColumn: 'var(--stage-question-column)',
  answerCardHeight: 'var(--stage-answer-card-height)',
  decorColumnMin: 'var(--stage-decor-column-min)',
  decorColumnMax: 'var(--stage-decor-column-max)',
} as const;

/**
 * Every token this package exposes, as `{ group: [names] }`. Tests use it to
 * assert that each name resolves in a real document, so a token deleted from
 * CSS but still referenced here fails rather than rendering as nothing.
 */
export const TOKEN_GROUPS = {
  color: COLOR,
  space: SPACE,
  radius: RADIUS,
  border: BORDER,
  type: TYPE,
  weight: WEIGHT,
  layout: LAYOUT,
} as const;

/** Extract the custom-property name from a `var(--x)` reference. */
export function tokenName(reference: string): string {
  const match = /^var\((--[^),]+)/.exec(reference);
  if (!match?.[1]) throw new Error(`not a token reference: ${reference}`);
  return match[1];
}
