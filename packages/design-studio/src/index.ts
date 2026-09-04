/**
 * Studio design system — the HeroUI v3 theme as shipped.
 *
 * The stylesheet is the product here: `@questiongame/design-studio/studio.css`.
 * Studio components should use HeroUI's own variables wherever HeroUI already
 * exposes them; these constants exist for the few places that need the name in
 * TypeScript.
 *
 * Never imported by apps/stage (enforced by eslint).
 */

export const HEROUI_VERSION = '^3.2.4' as const;

export const THEME = {
  background: 'var(--background)',
  foreground: 'var(--foreground)',
  surface: 'var(--surface)',
  border: 'var(--border)',
  muted: 'var(--muted)',
  accent: 'var(--accent)',
  success: 'var(--success)',
  danger: 'var(--danger)',
  warning: 'var(--warning)',
} as const;
