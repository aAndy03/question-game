import { TeamEditor } from '@/organisms'
import { RecordPageLayout } from '@/templates'

export interface TeamPageProps {
  id: string | null
  mode: 'edit' | 'new'
}

/** `team/:id/edit` and *New team* (spec §12). Viewing a team is the Teams list's aside (1.1.1). */
export function TeamPage({ id, mode }: TeamPageProps) {
  return (
    <RecordPageLayout>
      <TeamEditor id={mode === 'edit' ? id : null} />
    </RecordPageLayout>
  )
}
