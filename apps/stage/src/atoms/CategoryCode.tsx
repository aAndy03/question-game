import { Text, type TextTone } from './Text'

/**
 * A part-number style code, `TEC_881`. The value comes from the domain record
 * in play-state; the atom only sets it in the system voice.
 */

export interface CategoryCodeProps {
  code: string
  tone?: TextTone
}

export function CategoryCode({ code, tone = 'primary' }: CategoryCodeProps) {
  return (
    <Text variant="stage-code" tone={tone}>
      {code}
    </Text>
  )
}
