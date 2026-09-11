import type { CSSProperties } from 'react'
import type { TextVariant } from '@questiongame/text'
import { useCopy } from '@/copy'
import { bracketed, clock, type ClockHours } from '@/copy/format'
import { Text, type TextTone } from './Text'

/**
 * Digits of a clock, `[ 00:12:20 ]`. Takes milliseconds and formats; it does
 * not tick. Whoever owns the time (the host, via play-state) owns the ticking.
 */

export interface ClockDigitsProps {
  ms: number
  hours?: ClockHours
  brackets?: boolean
  variant?: TextVariant
  tone?: TextTone
  style?: CSSProperties | undefined
}

export function ClockDigits({
  ms,
  hours = 'auto',
  brackets = true,
  variant = 'stage-code',
  tone = 'primary',
  style,
}: ClockDigitsProps) {
  const copy = useCopy()
  const digits = clock(ms, hours)
  return (
    <Text variant={variant} transition="count" tone={tone} style={{ fontVariantNumeric: 'tabular-nums', ...style }}>
      {brackets ? bracketed(copy, digits) : digits}
    </Text>
  )
}
