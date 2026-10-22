import { OperatorEditor } from '@/organisms'
import { RecordPageLayout } from '@/templates'

export interface OperatorPageProps {
  id: string | null
  mode: 'edit' | 'new'
}

/** An operator's editor. Viewing one is the Operators list's aside (1.1.1). */
export function OperatorPage({ id, mode }: OperatorPageProps) {
  return (
    <RecordPageLayout>
      <OperatorEditor id={mode === 'edit' ? id : null} />
    </RecordPageLayout>
  )
}
