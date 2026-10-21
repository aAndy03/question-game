import { useEffect, useState } from 'react'
import { Modal } from '@heroui/react'
import { Button, NumberField, Text } from '@/atoms'
import { CONFIRM, QUESTION } from '@/copy'
import type { EditScope } from '@/host/types'

export interface DifficultyDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  /** The difficulty this game asks now; `null` when it is not set. */
  current: number | null
  isPending?: boolean | undefined
  /** `false` keeps the dialog open: a later question (the copies) was cancelled. */
  onChoose: (scope: EditScope, difficulty: number) => Promise<boolean | void>
}

/** A whole number 1–100 that is not the one already set. */
export function acceptsDifficulty(value: number | null, current: number | null): value is number {
  return value !== null && Number.isInteger(value) && value >= 1 && value <= 100 && value !== current
}

/**
 * A board question's difficulty, and where it goes (beta.4, replacing a
 * `window.prompt`): the number, then *This game* · *Apply to original* in the
 * same frame (§2.17) — Cancel writes nothing.
 */
export function DifficultyDialog({ isOpen, onOpenChange, current, isPending, onChoose }: DifficultyDialogProps) {
  const [value, setValue] = useState<number | null>(current)
  useEffect(() => {
    if (isOpen) setValue(current)
  }, [isOpen, current])
  const [tried, setTried] = useState(false)
  // One press at a time: a second *This game only* would write twice.
  const [pending, setPending] = useState(false)
  useEffect(() => {
    if (isOpen) setTried(false)
  }, [isOpen])
  const valid = value !== null && Number.isInteger(value) && value >= 1 && value <= 100
  const error = (tried || value !== null) && !valid ? QUESTION.difficultyRange : null
  // The buttons stay pressable: the number field commits on blur, which the
  // press itself causes — a button disabled until then ate the first click
  // (found on the real app). The value is judged when pressed.
  const choose = async (scope: EditScope) => {
    setTried(true)
    if (!valid || pending) return
    // The value this game already asks is no edit here — but *Apply to
    // original* of it promotes this game's difficulty to the library (review).
    if (scope === 'this_game' && !acceptsDifficulty(value, current)) return onOpenChange(false)
    setPending(true)
    const done = await onChoose(scope, value)
    setPending(false)
    if (done !== false) onOpenChange(false)
  }
  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Container size="md">
        <Modal.Dialog>
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>{QUESTION.difficulty}</Modal.Heading>
          </Modal.Header>
          <Modal.Body className="flex flex-col gap-3">
            <NumberField label={QUESTION.difficulty} value={value} onChange={setValue} minValue={1} maxValue={100} step={1} error={error} autoFocus />
            <Text variant="studio-caption" tone="muted">
              {CONFIRM.scopeDifficulty}
            </Text>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="tertiary" onPress={() => onOpenChange(false)} isDisabled={isPending || pending}>
              {CONFIRM.cancel}
            </Button>
            <Button variant="secondary" onPress={() => void choose('original')} isPending={isPending || pending}>
              {CONFIRM.original}
            </Button>
            <Button variant="primary" onPress={() => void choose('this_game')} isPending={isPending || pending}>
              {CONFIRM.thisGame}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}
