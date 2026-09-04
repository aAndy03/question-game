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

/** Fixed Stage canvas. Never a responsive breakpoint. */
export const STAGE_SIZE = { width: 1920, height: 1080 } as const;
export const STAGE_PADDING = 64;
