import { Button } from '@/atoms'
import { CONFIRM } from '@/copy'

export interface EditorFooterProps {
  canSave: boolean
  isSaving?: boolean | undefined
  onSave: () => void
  onCancel: () => void
  saveLabel?: string
}

/** Cancel · Save, pinned to the bottom of an editor's scroll column. */
export function EditorFooter({ canSave, isSaving, onSave, onCancel, saveLabel = CONFIRM.save }: EditorFooterProps) {
  return (
    <div
      className="sticky bottom-0 -mx-6 -mb-6 mt-auto flex h-14 items-center justify-end gap-2 border-t border-[var(--border)] px-6"
      style={{ background: 'var(--surface)' }}
    >
      {/* data-keep-draft: leaving a field for Cancel does not commit what was typed in it. */}
      <span className="contents" data-keep-draft>
        <Button variant="tertiary" onPress={onCancel} isDisabled={isSaving}>
          {CONFIRM.cancel}
        </Button>
      </span>
      <Button variant="primary" onPress={onSave} isDisabled={!canSave} isPending={isSaving}>
        {saveLabel}
      </Button>
    </div>
  )
}
