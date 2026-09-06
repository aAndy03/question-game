import type { ReactNode } from 'react'
import { ChordField, IconButton, Kbd, Text } from '@/atoms'
import { SETTINGS } from '@/copy/settings'

export interface ShortcutRowProps {
  /** The host command the chord fires. */
  command: string
  label: string
  /** The effective chord: the override, else the default. */
  chord: string | null
  defaultChord: string | null
  isOverridden: boolean
  onChange: (chord: string | null) => void
  onReset: () => void
  isDisabled?: boolean | undefined
  disabledReason?: string | null | undefined
  /** A fixed key range (`1–9`) rendered read-only instead of a `ChordField`. */
  fixed?: string | undefined
  /** The conflict notice for this row, rendered under it (§12.2.3). */
  notice?: ReactNode
}

/** label · `ChordField` · default · reset (only when overridden). */
export function ShortcutRow({ command, label, chord, defaultChord, isOverridden, onChange, onReset, isDisabled, disabledReason, fixed, notice }: ShortcutRowProps) {
  return (
    <div className="flex flex-col gap-2 py-2" data-shortcut-row={command}>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(8rem,12rem)_minmax(0,8rem)_2.5rem] items-center gap-3">
        <Text variant="studio-label" truncate>
          {label}
        </Text>
        {fixed !== undefined ? (
          <Text variant="studio-mono" tone="muted">
            {`${fixed} (${SETTINGS.shortcuts.fixed})`}
          </Text>
        ) : (
          <ChordField label={label} value={chord} defaultChord={defaultChord} onChange={onChange} isDisabled={isDisabled} disabledReason={disabledReason} />
        )}
        <span className="opacity-60">
          {fixed === undefined && defaultChord ? (
            <Kbd chord={defaultChord} variant="light" />
          ) : (
            <Text variant="studio-caption" tone="muted">
              {fixed === undefined ? SETTINGS.shortcuts.none : ''}
            </Text>
          )}
        </span>
        {isOverridden && fixed === undefined ? (
          <IconButton icon="restore" label={SETTINGS.shortcuts.reset} size="sm" onPress={onReset} isDisabled={isDisabled} disabledReason={disabledReason} />
        ) : (
          <span />
        )}
      </div>
      {notice ? <div>{notice}</div> : null}
    </div>
  )
}
