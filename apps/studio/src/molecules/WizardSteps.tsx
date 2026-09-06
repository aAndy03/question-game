import { Icon, Text } from '@/atoms'

export interface WizardStep {
  readonly id: string
  readonly label: string
}

export interface WizardStepsProps {
  steps: readonly WizardStep[]
  current: string
  done: readonly string[]
  /** The rail's accessible name. */
  label: string
}

type StepState = 'done' | 'current' | 'todo'

/** The horizontal step rail of the first-run wizard: done · current · todo. */
export function WizardSteps({ steps, current, done, label }: WizardStepsProps) {
  const stateOf = (id: string): StepState => (id === current ? 'current' : done.includes(id) ? 'done' : 'todo')
  return (
    <ol aria-label={label} className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {steps.map((step, i) => {
        const state = stateOf(step.id)
        return (
          <li key={step.id} className="flex items-center gap-2" data-step={step.id} data-step-state={state} aria-current={state === 'current' ? 'step' : undefined}>
            {i > 0 ? <span aria-hidden className="h-px w-6" style={{ background: 'var(--separator)' }} /> : null}
            <span className="flex h-4 w-4 items-center justify-center">
              {state === 'done' ? (
                <Icon name="wizardDone" size="sm" style={{ color: 'var(--success)' }} />
              ) : (
                <span
                  aria-hidden
                  className="block rounded-full"
                  style={
                    state === 'current'
                      ? { width: 10, height: 10, background: 'var(--accent)' }
                      : { width: 8, height: 8, border: '2px solid var(--muted)' }
                  }
                />
              )}
            </span>
            <Text variant="studio-label" tone={state === 'todo' ? 'muted' : 'default'}>
              {step.label}
            </Text>
          </li>
        )
      })}
    </ol>
  )
}
