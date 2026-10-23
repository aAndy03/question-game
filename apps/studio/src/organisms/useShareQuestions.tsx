import { useState, type ReactNode } from 'react'
import { TextAreaField } from '@/atoms'
import { ConfirmDialog } from '@/molecules'
import { toast } from '@/chrome/toast'
import { SHARE } from '@/copy'
import { useHostCommand } from '@/host/commands'

/** What *Import questions…* takes at once — sharing more would hand over a text it refuses whole. */
const IMPORT_MAX = 2000

export interface ShareQuestions {
  /** Copy these questions, in this order, as the text *Import questions…* reads. */
  share(ids: readonly string[]): Promise<void>
  /** The copy-by-hand dialog, for a webview with no clipboard. Render once. */
  dialog: ReactNode
}

/**
 * *Share* on Domains & Questions (beta.8): the picked questions — a row, or a
 * selection — copied as one `questiongame.questions` document, complete
 * (every option and which are right, the difficulty, every domain, the tags,
 * the explanation). The host writes it (`catalog_export_questions`), beside the
 * reader that takes it back in, so the two cannot drift; the operator brings it
 * in by pasting it into *Import questions…* here or in any other library.
 */
export function useShareQuestions(): ShareQuestions {
  const run = useHostCommand()
  const [byHand, setByHand] = useState<string | null>(null)

  const share = async (ids: readonly string[]) => {
    if (ids.length === 0) return
    if (ids.length > IMPORT_MAX) {
      toast.warn(SHARE.tooMany(ids.length))
      return
    }
    const text = await run<string>('catalog_export_questions', { ids })
    if (text === null) return
    try {
      await navigator.clipboard.writeText(text)
      toast.success(SHARE.copied(ids.length))
    } catch {
      // No clipboard in this webview: the text goes where it can be copied by hand.
      setByHand(text)
    }
  }

  const dialog = (
    <ConfirmDialog
      isOpen={byHand !== null}
      onOpenChange={(open) => (open ? undefined : setByHand(null))}
      title={SHARE.byHandTitle}
      severity="default"
      body={
        <div className="flex flex-col gap-2">
          <TextAreaField label={SHARE.byHandLabel} description={SHARE.byHandBody} value={byHand ?? ''} onChange={() => {}} rows={10} />
        </div>
      }
      confirmLabel={SHARE.done}
      onConfirm={() => setByHand(null)}
    />
  )

  return { share, dialog }
}
