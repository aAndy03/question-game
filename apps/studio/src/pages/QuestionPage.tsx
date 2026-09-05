import { QuestionDetail, QuestionEditor } from '@/organisms'
import { RecordPageLayout } from '@/templates'

export interface QuestionPageProps {
  id: string | null
  mode: 'view' | 'edit' | 'new'
  domainId?: string | undefined
}

export function QuestionPage({ id, mode, domainId }: QuestionPageProps) {
  return (
    <RecordPageLayout>
      {mode === 'view' && id ? (
        <QuestionDetail id={id} domainId={domainId} />
      ) : (
        <QuestionEditor id={mode === 'edit' ? id : null} domainId={domainId} />
      )}
    </RecordPageLayout>
  )
}
