import { useState } from 'react'
import { Button, MeaningChip, Panel, PinField, PIN_SHAPE, Text } from '@/atoms'
import { InlineNotice } from '@/molecules'
import { SETTINGS } from '@/copy/settings'
import { noticesAt, useNoticeStore, noticeText } from '@/chrome/notices'
import { useHostCommand } from '@/host/commands'
import { toast } from '@/chrome/toast'
import type { Operator } from '@/host/types'

export interface OperatorPinPanelProps {
  operator: Operator
}

type Mode = 'idle' | 'set' | 'change' | 'remove'

/**
 * The Pin panel of the operator editor (§2.15, 05_STUDIO_DESIGN.md §12.3):
 * `none` → *Set a pin*; `set` → *Change* · *Remove*, both asking the current
 * pin. The digits go to `operator_set_pin` and nowhere else — the host hashes,
 * the row's `pin_hash` stays opaque here, and a refusal lands on the field.
 */
export function OperatorPinPanel({ operator }: OperatorPinPanelProps) {
  const run = useHostCommand()
  const notices = useNoticeStore((s) => s.notices)
  const dismiss = useNoticeStore((s) => s.dismiss)
  const [mode, setMode] = useState<Mode>('idle')
  const [current, setCurrent] = useState('')
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)

  const path = `operator.${operator.id}.pin`
  const inline = noticesAt(notices, path)
  const hostError = noticeText(inline[0])
  const pinned = operator.pinHash !== null
  const needsCurrent = mode === 'change' || mode === 'remove'
  const needsNew = mode === 'set' || mode === 'change'
  const shapeOk = !needsNew || PIN_SHAPE.test(pin)
  const matchOk = !needsNew || pin === confirm
  const canSave = (!needsCurrent || current.length > 0) && shapeOk && matchOk

  const reset = () => {
    setMode('idle')
    setCurrent('')
    setPin('')
    setConfirm('')
    inline.forEach((n) => dismiss(n.id))
  }

  const save = async () => {
    setSaving(true)
    const ok = await run.ok(
      'operator_set_pin',
      { id: operator.id, pin: mode === 'remove' ? null : pin, currentPin: needsCurrent ? current : null },
      { targetPath: path },
    )
    setSaving(false)
    if (!ok) return
    toast.success(mode === 'remove' ? SETTINGS.pin.none : SETTINGS.pin.isSet)
    reset()
  }

  return (
    // data- hooks do not survive Panel (§14.6): the wrapper carries it.
    <div data-operator-pin>
      <Panel className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <Text variant="studio-heading">{SETTINGS.pin.label}</Text>
            <Text variant="studio-caption" tone="muted">
              {SETTINGS.pin.optional}
            </Text>
          </div>
          {pinned ? <MeaningChip meaning="pinned">{SETTINGS.pin.isSet}</MeaningChip> : <MeaningChip meaning="seed">{SETTINGS.pin.none}</MeaningChip>}
        </div>
        {mode === 'idle' ? (
          <div className="flex flex-wrap gap-2">
            {pinned ? (
              <>
                <Button variant="secondary" icon="pin" onPress={() => setMode('change')}>
                  {SETTINGS.pin.change}
                </Button>
                <Button variant="ghost" icon="pinOff" onPress={() => setMode('remove')}>
                  {SETTINGS.pin.remove}
                </Button>
              </>
            ) : (
              <Button variant="secondary" icon="pin" onPress={() => setMode('set')}>
                {SETTINGS.pin.set}
              </Button>
            )}
          </div>
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (canSave) void save()
            }}
          >
            {inline
              .filter((n) => n.targetPath !== path)
              .map((n) => (
                <InlineNotice key={n.id} notice={n} onAction={() => dismiss(n.id)} onDismiss={() => dismiss(n.id)} compact />
              ))}
            {needsCurrent ? <PinField label={SETTINGS.pin.current} value={current} onChange={setCurrent} error={hostError} autoFocus isRequired /> : null}
            {needsNew ? (
              <>
                <PinField label={SETTINGS.pin.label} value={pin} onChange={setPin} description={SETTINGS.pin.hint} error={pin.length > 0 && !shapeOk ? SETTINGS.pin.invalid : needsCurrent ? null : hostError} autoFocus={!needsCurrent} isRequired />
                <PinField label={SETTINGS.pin.confirm} value={confirm} onChange={setConfirm} error={confirm.length > 0 && !matchOk ? SETTINGS.pin.mismatch : null} isRequired />
              </>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button variant="tertiary" onPress={reset} isDisabled={saving}>
                {SETTINGS.shortcuts.none === 'None' ? 'Cancel' : 'Cancel'}
              </Button>
              <Button variant={mode === 'remove' ? 'danger' : 'primary'} type="submit" isDisabled={!canSave} isPending={saving}>
                {mode === 'remove' ? SETTINGS.pin.remove : mode === 'change' ? SETTINGS.pin.change : SETTINGS.pin.set}
              </Button>
            </div>
          </form>
        )}
      </Panel>
    </div>
  )
}
