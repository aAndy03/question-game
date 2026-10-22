import { Panel, Text } from '@/atoms'
import { TEAM } from '@/copy'
import { TeamMark } from './TeamMark'

export interface TeamPreviewProps {
  name: string
  /** As it will be saved: the typed code, or the first five letters of the name. */
  shortCode: string
  color: string
}

/** A colour that is a Stage theme token (`var(--state-…)`): Studio cannot draw it. */
const isTheme = (c: string) => /^var\(--[\w-]+\)$/.test(c.trim())

/**
 * The team as it will look (P20), from the draft: the mark Studio's rows show,
 * and the mark Stage shows — one letter in the colour, the name in capitals.
 * The colour hint promised "the team mark on Stage" and the operator never saw
 * it; two teams starting with the same letter look alike there. A theme colour
 * is Stage's own and does not resolve in Studio (the lint boundary keeps its
 * tokens out), so it is a hatched box captioned *Theme colour* — never the token.
 * Nothing here is interactive.
 */
export function TeamPreview({ name, shortCode, color }: TeamPreviewProps) {
  const theme = isTheme(color)
  const shown = name.trim() || TEAM.one
  const letter = (shortCode.trim() || name.trim()).charAt(0).toUpperCase() || '?'
  return (
    <Panel className="flex flex-col gap-4">
      <Text as="h2" variant="studio-subheading">
        {TEAM.preview}
      </Text>
      <div className="flex flex-col gap-1.5">
        <Text as="div" variant="studio-caption" tone="muted">
          {TEAM.inStudio}
        </Text>
        <TeamMark mark={{ color: theme ? 'var(--surface-secondary)' : color, shortCode: shortCode.trim() || '—', name: shown }} withName size="lg" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Text as="div" variant="studio-caption" tone="muted">
          {TEAM.onStage}
        </Text>
        <div className="flex items-center gap-3">
          <span
            data-testid="stage-letter"
            aria-hidden
            className="grid h-10 w-10 shrink-0 place-items-center rounded-[calc(var(--radius)/3)] text-lg font-semibold text-white"
            style={
              theme
                ? { background: 'repeating-linear-gradient(45deg, var(--surface-secondary) 0 6px, var(--surface) 6px 12px)', color: 'var(--foreground)' }
                : { background: color }
            }
          >
            {letter}
          </span>
          <Text variant="studio-subheading" truncate>
            {shown.toUpperCase()}
          </Text>
        </div>
        {theme ? (
          <Text as="div" variant="studio-caption" tone="muted">
            {TEAM.themeColour}
          </Text>
        ) : null}
      </div>
    </Panel>
  )
}
