import { Button } from '@/atoms'
import { CONFIRM } from '@/copy'

export interface EditorActionsProps {
  canSave: boolean
  isSaving?: boolean | undefined
  onSave: () => void
  onCancel: () => void
  saveLabel?: string | undefined
}

/**
 * Cancel · Save, in an editor's `PageHeader` beside the title (P20). They used
 * to sit in a bar pinned to the bottom of the page — a strip of its own colour
 * across the whole width, the one thing on the page with nothing to say. The
 * header stays at the top while the form scrolls (`PageHeader sticky`), so the
 * buttons are always where the eye starts, and no bar is drawn.
 */
export function EditorActions({ canSave, isSaving, onSave, onCancel, saveLabel = CONFIRM.save }: EditorActionsProps) {
  return (
    <>
      {/* data-keep-draft: leaving a field for Cancel does not commit what was typed in it. */}
      <span className="contents" data-keep-draft>
        <Button variant="tertiary" onPress={onCancel} isDisabled={isSaving}>
          {CONFIRM.cancel}
        </Button>
      </span>
      <Button variant="primary" onPress={onSave} isDisabled={!canSave} isPending={isSaving}>
        {saveLabel}
      </Button>
    </>
  )
}
