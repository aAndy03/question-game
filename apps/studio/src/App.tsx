import { THEME } from '@questiongame/design-studio'

/**
 * P0 placeholder. Proves the Studio token scope resolves and that no
 * questiongame Stage token is present in this webview.
 *
 * P7 replaces this with the real shell (docs/v1/04_ROADMAP.md).
 */
export function App() {
  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '2rem',
        background: THEME.background,
        color: THEME.foreground,
        fontFamily: 'var(--font-sans)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        alignItems: 'flex-start',
      }}
    >
      <h1 style={{ margin: 0, fontSize: '1.5rem' }}>QuestionGame Studio</h1>
      <p style={{ margin: 0, color: THEME.muted }}>HeroUI v3 theme scope OK.</p>

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {(['accent', 'success', 'danger', 'warning'] as const).map((name) => (
          <span
            key={name}
            style={{
              background: THEME[name],
              color: THEME.background,
              padding: '0.25rem 0.75rem',
              borderRadius: 'var(--radius)',
              fontSize: '0.875rem',
            }}
          >
            {name}
          </span>
        ))}
      </div>
    </div>
  )
}
