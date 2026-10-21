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
  const ok = acceptsDifficulty(value, current)
  const error = value !== null && !(Number.isInteger(value) && value >= 1 && value <= 100) ? QUESTION.difficultyRange : null
  const choose = async (scope: EditScope) => {
    if (!ok) return
    if ((await onChoose(scope, value)) !== false) onOpenChange(false)
  }
  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Container size="sm">
        <Modal.Dialog>
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>{QUESTION.difficulty}</Modal.Heading>
          </Modal.Header>
          <Modal.Body className="flex flex-col gap-3">
            <NumberField label={QUESTION.difficulty} value={value} onChange={setValue} minValue={1} maxValue={100} step={1} error={error} autoFocus />
            <Text variant="studio-caption" tone="muted">
              {`${CONFIRM.scopeBody} (${QUESTION.difficulty})`}
            </Text>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="tertiary" onPress={() => onOpenChange(false)} isDisabled={isPending}>
              {CONFIRM.cancel}
            </Button>
            <Button variant="secondary" onPress={() => void choose('original')} isPending={isPending} isDisabled={!ok}>
              {CONFIRM.original}
            </Button>
            <Button variant="primary" onPress={() => void choose('this_game')} isPending={isPending} isDisabled={!ok}>
              {CONFIRM.thisGame}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}
