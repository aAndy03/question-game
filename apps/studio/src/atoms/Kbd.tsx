import { Kbd as HeroKbd } from '@heroui/react'
import type { KbdKey } from '@heroui/react'

const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

/** Chord words -> HeroUI key names, which paint the platform's own symbols. */
const KEY: Record<string, KbdKey> = {
  mod: MAC ? 'command' : 'ctrl',
  cmd: 'command',
  ctrl: 'ctrl',
  alt: MAC ? 'option' : 'alt',
  option: 'option',
  shift: 'shift',
  enter: 'enter',
  esc: 'escape',
  escape: 'escape',
  tab: 'tab',
  space: 'space',
  delete: 'delete',
  backspace: 'delete',
  up: 'up',
  down: 'down',
  left: 'left',
  right: 'right',
}

export interface KbdProps {
  /** `mod+k`, `shift+enter`, `esc`. Painted, never bound (spec §7). */
  chord: string
  variant?: 'default' | 'light'
}

export function Kbd({ chord, variant = 'default' }: KbdProps) {
  const parts = chord.toLowerCase().split('+')
  return (
    <span className="inline-flex items-center gap-0.5">
      {parts.map((part, i) => {
        const key = KEY[part]
        return (
          <HeroKbd key={`${part}-${i}`} variant={variant}>
            {key ? (
              <HeroKbd.Abbr keyValue={key} />
            ) : (
              <HeroKbd.Content>{part.length === 1 ? part.toUpperCase() : part}</HeroKbd.Content>
            )}
          </HeroKbd>
        )
      })}
    </span>
  )
}
