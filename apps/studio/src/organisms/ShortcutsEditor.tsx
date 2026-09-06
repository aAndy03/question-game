import { useState } from 'react'
import { Button, Text } from '@/atoms'
import { ConfirmDialog, InlineNotice, SettingsGroup, ShortcutRow } from '@/molecules'
import { HOTKEYS } from '@/copy'
import { SETTINGS } from '@/copy/settings'
import { useHostCommand } from '@/host/commands'
import { useSettings } from '@/host/queries'

interface Conflict {
  readonly command: string
  readonly chord: string
  readonly other: string
}

/**
 * Settings ▸ Keyboard shortcuts (05_STUDIO_DESIGN.md §12.2.3). The effective
 * chord is the host's override over `HOTKEYS.defaults` — the same merge
 * `useControlHotkeys` reads, so a saved chord is live on the next keydown.
 * A chord already in use is a two-action notice under the row, *Keep* or
 * *Reassign*; Studio never resolves it on its own, and the host refuses a
 * stored conflict regardless.
 */
export function ShortcutsEditor() {
  const settings = useSettings()
  const run = useHostCommand()
  const overrides = settings.data?.globals.shortcuts ?? {}
  const [conflict, setConflict] = useState<Conflict | null>(null)
  const [resetting, setResetting] = useState(false)

  const commands = Object.keys(HOTKEYS.defaults)
  const effective = (command: string): string | null => overrides[command] ?? HOTKEYS.defaults[command] ?? null
  const overridden = commands.filter((c) => overrides[c] !== undefined)

  const bind = async (command: string, chord: string | null) => {
    setConflict(null)
    if (chord !== null) {
      const other = commands.find((c) => c !== command && effective(c) === chord)
      if (other) {
        setConflict({ command, chord, other })
        return
      }
    }
    await run('settings_set_shortcut', { command, chord })
  }

  const reassign = async () => {
    if (!conflict) return
    // Two commands, one press: the other command loses the chord (its default
    // is masked by an explicit empty override), then this one takes it.
    await run('settings_set_shortcut', { command: conflict.other, chord: null })
    await run('settings_set_shortcut', { command: conflict.command, chord: conflict.chord })
    setConflict(null)
  }

  const resetAll = async () => {
    for (const command of overridden) await run('settings_set_shortcut', { command, chord: null })
  }

  return (
    <div className="flex flex-col gap-6" data-shortcuts-editor>
      <SettingsGroup
        title={SETTINGS.inner.shortcuts}
        description={SETTINGS.shortcuts.hint}
        action={
          <Button size="sm" variant="ghost" icon="restore" onPress={() => setResetting(true)} isDisabled={overridden.length === 0} disabledReason={overridden.length === 0 ? SETTINGS.shortcuts.none : null}>
            {SETTINGS.shortcuts.resetAll}
          </Button>
        }
      >
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(8rem,12rem)_minmax(0,8rem)_2.5rem] items-center gap-3 py-2">
          {[SETTINGS.shortcuts.command, SETTINGS.shortcuts.chord, SETTINGS.shortcuts.default, ''].map((h, i) => (
            <Text key={i} variant="studio-caption" tone="muted">
              {h}
            </Text>
          ))}
        </div>
        {commands.map((command) => (
          <ShortcutRow
            key={command}
            command={command}
            label={HOTKEYS.labels[command] ?? command}
            chord={effective(command)}
            defaultChord={HOTKEYS.defaults[command] ?? null}
            isOverridden={overrides[command] !== undefined}
            onChange={(chord) => void bind(command, chord)}
            onReset={() => void run('settings_set_shortcut', { command, chord: null })}
            notice={
              conflict?.command === command ? (
                <InlineNotice
                  compact
                  notice={{
                    code: 'shortcuts.conflict',
                    severity: 'warn',
                    targetPath: 'shortcuts',
                    actions: ['keep', 'reassign'],
                    detail: { chord: conflict.chord, other: HOTKEYS.labels[conflict.other] ?? conflict.other },
                  }}
                  onAction={(a) => (a === 'reassign' ? void reassign() : setConflict(null))}
                  onDismiss={() => setConflict(null)}
                />
              ) : null
            }
          />
        ))}
        <ShortcutRow command="pick" label={HOTKEYS.labels['pick'] ?? SETTINGS.shortcuts.positional} chord={null} defaultChord={null} isOverridden={false} onChange={() => {}} onReset={() => {}} fixed={SETTINGS.shortcuts.positionalRange} />
      </SettingsGroup>
      <ConfirmDialog
        isOpen={resetting}
        onOpenChange={setResetting}
        severity="warning"
        title={SETTINGS.shortcuts.resetAllTitle}
        body={SETTINGS.shortcuts.resetAllBody}
        confirmLabel={SETTINGS.shortcuts.resetAll}
        onConfirm={resetAll}
      />
    </div>
  )
}
