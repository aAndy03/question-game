import { TeamDetail, TeamEditor } from '@/organisms'
import { RecordPageLayout } from '@/templates'

export interface TeamPageProps {
  id: string | null
  mode: 'view' | 'edit' | 'new'
}

/** `team/:id` → detail or editor (spec §12). */
export function TeamPage({ id, mode }: TeamPageProps) {
  return (
    <RecordPageLayout>
      {mode === 'view' && id ? <TeamDetail id={id} /> : <TeamEditor id={mode === 'edit' ? id : null} />}
    </RecordPageLayout>
  )
}
