import { useEffect, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Button as HeroButton } from '@heroui/react'
import { SETTINGS } from '@/copy/settings'
import { Kbd } from './Kbd'
import { DisabledReason } from './Tooltip'
import { defined } from './props'

const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'OS', 'AltGraph', 'Hyper', 'Super', 'Fn', 'CapsLock', 'NumLock'])

type KeyLike = Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>

/**
 * One keydown → the host's chord spelling, the one `useControlHotkeys`
 * already reads: modifiers `mod` (Ctrl on Windows, Cmd on macOS), then
 * `alt`, then `shift`, then the key in lowercase (`space`, `enter`, `[`,
 * `arrowup`, letters, digits). The platform's *other* primary modifier is
 * spelled literally (`ctrl` on a Mac, `meta` on Windows) after `mod`.
 * Returns `null` for a modifier pressed on its own.
 */
export function chordFromKeyboardEvent(e: KeyLike, mac: boolean = MAC): string | null {
  if (MODIFIER_KEYS.has(e.key) || e.key === 'Dead' || e.key === 'Unidentified') return null
  const parts: string[] = []
  const mod = mac ? e.metaKey : e.ctrlKey
  const other = mac ? e.ctrlKey : e.metaKey
  if (mod) parts.push('mod')
  if (other) parts.push(mac ? 'ctrl' : 'meta')
  if (e.altKey) parts.push('alt')
  if (e.shiftKey) parts.push('shift')
  parts.push(keyName(e))
  return parts.join('+')
}

function keyName(e: KeyLike): string {
  // The physical key survives Shift and macOS Option for letters and digits.
  const letter = /^Key([A-Z])$/.exec(e.code)
  if (letter?.[1]) return letter[1].toLowerCase()
  const digit = /^Digit([0-9])$/.exec(e.code)
  if (digit?.[1]) return digit[1]
  if (e.key === ' ' || e.code === 'Space') return 'space'
  return e.key.toLowerCase()
}

export interface ChordFieldProps {
  /** The accessible name — the command the chord fires. */
  label: string
  value: string | null
  /** Painted muted when `value` is null so the operator sees what a clear restores. */
  defaultChord?: string | null | undefined
  onChange: (chord: string | null) => void
  isDisabled?: boolean | undefined
  disabledReason?: string | null | undefined
  size?: 'sm' | 'md'
  className?: string | undefined
}

/**
 * A button that shows the chord as `Kbd`s and records a new one on press:
 * one keydown sets it, Escape cancels, Backspace or Delete clears (`null`).
 * Blur cancels too, so a chord is never half-recorded (§12.2.3).
 */
export function ChordField({ label, value, defaultChord, onChange, isDisabled, disabledReason, size = 'sm', className }: ChordFieldProps) {
  const [recording, setRecording] = useState(false)
  const disabled = Boolean(isDisabled) || Boolean(disabledReason)
  useEffect(() => {
    if (disabled) setRecording(false)
  }, [disabled])

  const onKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!recording) return
    e.preventDefault()
    e.stopPropagation()
    if (e.key === 'Escape') {
      setRecording(false)
      return
    }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      setRecording(false)
      onChange(null)
      return
    }
    const chord = chordFromKeyboardEvent(e.nativeEvent)
    if (chord === null) return
    setRecording(false)
    onChange(chord)
  }

  const shown = value ?? defaultChord ?? null
  const button = (
    <HeroButton
      variant={recording ? 'primary' : 'outline'}
      size={size}
      isDisabled={disabled}
      aria-label={label}
      aria-pressed={recording}
      data-recording={recording ? 'true' : undefined}
      onPress={() => setRecording(true)}
      onKeyDown={onKeyDown}
      onBlur={() => setRecording(false)}
      {...defined({ className: ['min-w-[8rem] justify-start font-normal', className].filter(Boolean).join(' ') })}
    >
      {recording ? (
        SETTINGS.shortcuts.pressKeys
      ) : shown ? (
        <span className={value === null ? 'opacity-50' : ''}>
          <Kbd chord={shown} />
        </span>
      ) : (
        <span className="opacity-50">{SETTINGS.shortcuts.none}</span>
      )}
    </HeroButton>
  )
  return <DisabledReason reason={disabled ? disabledReason : null}>{button}</DisabledReason>
}
