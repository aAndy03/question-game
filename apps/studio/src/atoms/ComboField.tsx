import { useEffect, useState } from 'react'
import { ComboBox, Description, FieldError, Input, Label, ListBox } from '@heroui/react'
import { DisabledReason } from './Tooltip'

export interface ComboFieldProps {
  label: string
  description?: string | undefined
  error?: string | null | undefined
  /** What is saved now; `null` for none. */
  value: string | null
  /** Values already used — the only ones ever offered. */
  options: readonly string[]
  /** A new value, trimmed, or `null` when emptied. Not called when nothing changed. */
  onCommit: (value: string | null) => void
  /** Every keystroke, before anything commits — what a dialog's *Apply* reads, so the press that blurs the field is never eaten. */
  onInputChange?: ((text: string) => void) | undefined
  maxLength?: number | undefined
  isDisabled?: boolean | undefined
  disabledReason?: string | null | undefined
  className?: string | undefined
}

/**
 * A free-text field that offers what is already used (P20: a game's folder).
 * HeroUI's `ComboBox` with custom values: typing filters the offers, an offer
 * can be taken, and anything typed is kept — on Enter, or on leaving the
 * field (unless focus goes to a `data-keep-draft` control, as `TagField`).
 * Emptying it and leaving says `null`. Nothing is suggested that was not
 * already used.
 */
export function ComboField({ label, description, error, value, options, onCommit, onInputChange, maxLength, isDisabled, disabledReason, className }: ComboFieldProps) {
  const [text, setText] = useState(value ?? '')
  // A value written elsewhere (or put back after a refusal) replaces what is shown.
  useEffect(() => setText(value ?? ''), [value])
  const disabled = Boolean(isDisabled) || Boolean(disabledReason)
  const commit = (raw: string) => {
    const next = raw.trim() || null
    if (next !== (value ?? null)) onCommit(next)
  }
  const field = (
    <ComboBox
      allowsCustomValue
      inputValue={text}
      onInputChange={(t) => {
        setText(t)
        onInputChange?.(t)
      }}
      onSelectionChange={(key) => {
        if (key === null) return
        setText(String(key))
        commit(String(key))
      }}
      isDisabled={disabled}
      isInvalid={Boolean(error)}
      fullWidth
      {...(className ? { className } : {})}
    >
      <Label>{label}</Label>
      <ComboBox.InputGroup>
        <Input
          {...(maxLength ? { maxLength } : {})}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit(text)
          }}
          onBlur={(e) => {
            const to = e.relatedTarget instanceof Element ? e.relatedTarget : null
            if (to?.closest('[data-keep-draft]') || to?.closest('[role="listbox"]')) return
            commit(text)
          }}
        />
        <ComboBox.Trigger />
      </ComboBox.InputGroup>
      {description && !error ? <Description>{description}</Description> : null}
      {error ? <FieldError>{error}</FieldError> : null}
      <ComboBox.Popover>
        <ListBox>
          {options.map((o) => (
            <ListBox.Item key={o} id={o} textValue={o}>
              <Label>{o}</Label>
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </ComboBox.Popover>
    </ComboBox>
  )
  return <DisabledReason reason={disabled ? disabledReason : null} block>{field}</DisabledReason>
}
