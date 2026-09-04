import { STAGE_SIZE, STAGE_PADDING } from '@questiongame/design-stage'

/**
 * P0 placeholder. Proves the Stage token scope resolves: fonts, colours,
 * spacing, the fixed 1920x1080 canvas, and the zero-radius / inset-border
 * treatment.
 *
 * P2 replaces this with the real pages (docs/v1/04_ROADMAP.md).
 */
export function App() {
  return (
    <div
      data-surface="stage"
      style={{
        width: STAGE_SIZE.width,
        height: STAGE_SIZE.height,
        padding: STAGE_PADDING,
        background: 'var(--paper)',
        color: 'var(--text-primary)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-6)',
        boxSizing: 'border-box',
      }}
    >
      <header
        style={{
          boxShadow:
            'inset 0 var(--border-thin) 0 0 var(--ink), inset 0 calc(var(--border-thick) * -1) 0 0 var(--ink), inset var(--border-thin) 0 0 0 var(--ink), inset calc(var(--border-thin) * -1) 0 0 0 var(--ink)',
          padding: 'var(--space-3) var(--space-4)',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-label)',
          letterSpacing: 'var(--tracking-wide-1)',
          textTransform: 'lowercase',
        }}
      >
        QUESTIONGAME // STAGE SCOPE OK
      </header>

      <h1
        style={{
          margin: 0,
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: 'var(--text-giant)',
          letterSpacing: 'var(--tracking-tight-2)',
          color: 'var(--text-heading)',
        }}
      >
        question
        <br />
        game
      </h1>

      <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
        {(
          [
            ['correct', 'var(--state-correct)'],
            ['incorrect', 'var(--state-incorrect)'],
            ['info', 'var(--state-info)'],
            ['leader', 'var(--state-leader)'],
            ['accent', 'var(--state-accent)'],
          ] as const
        ).map(([name, value]) => (
          <span
            key={name}
            style={{
              background: value,
              color: 'var(--ink)',
              padding: 'var(--space-1) var(--space-3)',
              borderRadius: 'var(--radius-none)',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-caption)',
              letterSpacing: 'var(--tracking-wide-1)',
            }}
          >
            {name}
          </span>
        ))}
      </div>
    </div>
  )
}
