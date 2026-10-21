import { Button, MeaningChip, Panel, Text } from '@/atoms'
import { LIST } from '@/copy'
import { TRANSFER } from '@/copy/workspaces'
import { useHostCommand } from '@/host/commands'
import { useFamily } from '@/host/queries'
import type { LibraryKind } from '@/host/types'

export interface CopiesBlockProps {
  kind: Exclude<LibraryKind, 'operator'>
  id: string
}

/**
 * Where else this row lives (beta.5): each other member of its family, by
 * workspace, and *Stop following its copies*. Nothing at all for a row that
 * was never copied — the block is the answer to "does this have copies?".
 */
export function CopiesBlock({ kind, id }: CopiesBlockProps) {
  const family = useFamily(kind, id)
  const run = useHostCommand()
  const copies = family.data ?? []
  if (copies.length === 0) return null
  return (
    <Panel className="flex flex-col gap-2" data-copies>
      <Text variant="studio-label">{TRANSFER.copiesTitle(copies.length)}</Text>
      <ul className="flex flex-col gap-1">
        {copies.map((c) => (
          <li key={c.id} className="flex items-center gap-2">
            <Text variant="studio-body">{c.workspaceName ?? TRANSFER.unnamedWorkspace}</Text>
            {c.archived ? <MeaningChip meaning="archived">{LIST.archived}</MeaningChip> : null}
          </li>
        ))}
      </ul>
      <Text variant="studio-caption" tone="muted">
        {TRANSFER.copiesHint}
      </Text>
      <div>
        <Button variant="secondary" size="sm" onPress={() => void run('catalog_unfollow', { kind, id })}>
          {TRANSFER.unfollow}
        </Button>
      </div>
    </Panel>
  )
}
