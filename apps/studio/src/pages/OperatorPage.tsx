import { OperatorDetail, OperatorEditor } from '@/organisms'
import { RecordPageLayout } from '@/templates'

export interface OperatorPageProps {
  id: string | null
  mode: 'view' | 'edit' | 'new'
}

export function OperatorPage({ id, mode }: OperatorPageProps) {
  return (
    <RecordPageLayout>
      {mode === 'view' && id ? <OperatorDetail id={id} /> : <OperatorEditor id={mode === 'edit' ? id : null} />}
    </RecordPageLayout>
  )
}
