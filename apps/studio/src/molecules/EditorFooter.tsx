import { Button } from '@/atoms'
import { CONFIRM } from '@/copy'

export interface EditorFooterProps {
  canSave: boolean
  isSaving?: boolean | undefined
  onSave: () => void
  onCancel: () => void
  saveLabel?: string
  /** The editor has a side column (`EditorColumns`): the buttons line up with its right edge. */
  withSide?: boolean | undefined
}

/**
 * Cancel · Save, pinned to the bottom of an editor's scroll column. The bar
 * spans the page (P20) — it used to stop where the 48rem column stopped, and
 * on a wide window the page read as cut off — while the buttons line up with
 * the content's right edge, under the same 60rem container rule as
 * `EditorColumns` (the bar's content box is the column's).
 */
export function EditorFooter({ canSave, isSaving, onSave, onCancel, saveLabel = CONFIRM.save, withSide }: EditorFooterProps) {
  return (
    <div
      className="@container/editor-footer sticky bottom-0 -mx-6 -mb-6 mt-auto border-t border-[var(--border)] px-6"
      style={{ background: 'var(--surface)' }}
    >
      <div className={['flex h-14 w-full max-w-3xl items-center justify-end gap-2', withSide ? '@[60rem]/editor-footer:max-w-[71.5rem]' : ''].join(' ')}>
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
    </div>
  )
}
