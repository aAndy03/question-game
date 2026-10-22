import { QuestionEditor } from '@/organisms'
import { RecordPageLayout } from '@/templates'

export interface QuestionPageProps {
  id: string | null
  mode: 'edit' | 'new'
  domainId?: string | undefined
}

/** A question's editor. Viewing one is the Questions list's aside (1.1.1). */
export function QuestionPage({ id, mode, domainId }: QuestionPageProps) {
  return (
    <RecordPageLayout>
      <QuestionEditor id={mode === 'edit' ? id : null} domainId={domainId} />
    </RecordPageLayout>
  )
}
