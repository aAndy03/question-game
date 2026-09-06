import { IconButton, Text } from '@/atoms'
import { SETTINGS } from '@/copy/settings'

const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

export interface PathRowProps {
  label: string
  path: string
  /** Opens the OS file manager on the path (`paths_reveal`). Read-only without it. */
  onReveal?: (() => void) | undefined
  isDisabled?: boolean | undefined
  disabledReason?: string | null | undefined
}

/**
 * label · path · reveal. The path is mono and truncates from the left so
 * the end — the part that differs — stays readable; the full path is the
 * title (05_STUDIO_DESIGN.md §12.1).
 */
export function PathRow({ label, path, onReveal, isDisabled, disabledReason }: PathRowProps) {
  return (
    <div className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_2.5rem] items-center gap-3 py-2" data-path-row>
      <Text variant="studio-label" truncate>
        {label}
      </Text>
      <Text variant="studio-mono" tone="muted" truncate title={path} style={{ direction: 'rtl', textAlign: 'left' }}>
        {path}
      </Text>
      {onReveal ? (
        <IconButton icon="reveal" label={SETTINGS.paths.reveal(MAC)} size="sm" onPress={onReveal} isDisabled={isDisabled} disabledReason={disabledReason} />
      ) : (
        <span />
      )}
    </div>
  )
}
