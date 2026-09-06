import { useFirstRunFlow } from '@/organisms'
import { WizardLayout } from '@/templates'
import { useNavStore } from '@/chrome/nav'
import { FIRST_RUN } from '@/copy/firstRun'

export interface FirstRunPageProps {
  /** Told once, when the wizard ends: `App` unlatches and shows the shell. */
  onDone: () => void
}

/**
 * First run (05_STUDIO_DESIGN.md §12.1): rendered by `App` instead of the shell
 * while no operator exists. Finish lands on Teams, or on the Demo game when
 * the sample was loaded.
 */
export function FirstRunPage({ onDone }: FirstRunPageProps) {
  const go = useNavStore((s) => s.go)
  const flow = useFirstRunFlow({
    onFinish: (recipeId) => {
      void go(recipeId ? { tab: 'games', id: recipeId } : { tab: 'teams' })
      onDone()
    },
  })
  return (
    <WizardLayout brand={FIRST_RUN.brand} steps={flow.steps} footer={flow.footer}>
      {flow.body}
    </WizardLayout>
  )
}
