import { LAYOUT } from '@questiongame/design-stage'

/**
 * P0/P1 placeholder: a token proof sheet.
 *
 * It renders nothing from the real design — its job is to show, at a glance
 * and in the DOM, that a Tailwind utility and a `var(--…)` reference resolve to
 * the same value. P2 replaces it with the real pages.
 *
 * Everything here reads from tokens. No pixel value is written inline.
 */
export function App() {
  return (
    <div
      data-surface="stage"
      className="flex flex-col bg-paper text-ink box-border"
      style={{
        width: LAYOUT.width,
        height: LAYOUT.height,
        padding: LAYOUT.padding,
        gap: LAYOUT.zoneGap,
      }}
    >
      <header className="px-3 py-2 font-mono text-label tracking-wide-1 lowercase shadow-[inset_0_1px_0_0_var(--ink),inset_0_-2px_0_0_var(--ink),inset_1px_0_0_0_var(--ink),inset_-1px_0_0_0_var(--ink)]">
        QUESTIONGAME // TOKEN SCOPE OK
      </header>

      <h1 className="m-0 font-display font-bold text-giant tracking-tight-2 text-[var(--text-heading)]">
        question
        <br />
        game
      </h1>

      {/* Tailwind scans source for complete class strings, so a class can never
       * be built by interpolation (`bg-${name}` produces nothing). Map to whole
       * class names instead. This bites once per project; here is the once. */}
      <div className="flex" style={{ gap: LAYOUT.gapTight }}>
        {(
          [
            ['correct', 'bg-correct'],
            ['incorrect', 'bg-incorrect'],
            ['info', 'bg-info'],
            ['leader', 'bg-leader'],
            ['accent', 'bg-accent'],
          ] as const
        ).map(([name, bg]) => (
          <span
            key={name}
            className={`${bg} px-3 py-1 rounded-none font-mono text-caption tracking-wide-1 text-ink`}
          >
            {name}
          </span>
        ))}
      </div>

      {/* Utility vs var(): both columns must render identically. */}
      <div className="flex" style={{ gap: LAYOUT.gapLoose }}>
        <div className="p-4 font-mono text-caption border-2 border-ink">
          utility · p-4 · text-caption
        </div>
        <div
          className="font-mono border-2 border-ink"
          style={{ padding: 'var(--space-4)', fontSize: 'var(--text-caption)' }}
        >
          var() · --space-4 · --text-caption
        </div>
      </div>
    </div>
  )
}
