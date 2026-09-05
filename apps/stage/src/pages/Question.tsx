import { currentTeam, nodeId } from '@questiongame/contract'
import { LAYOUT, SPACE } from '@questiongame/design-stage'
import { Rule } from '@/atoms'
import { resolveCopy } from '@/copy'
import { CategoryLine, QuestionStem, ResultWidget, TimerPanel } from '@/molecules'
import { AnswerGrid } from '@/organisms'
import type { StagePageProps } from './StageRoot'

/**
 * Question - one issued question, as the reference draws it:
 *
 *   domain // technology | TEAM ALPHA                  ┌ timer // remaining ┐
 *   What is the highest peak in the Solar System?      │       00:30        │
 *   ────────────────────────────────────────────────── └────────────────────┘
 *   [A] Olympus Mons              [B] Mount Everest
 *   [C] Mauna Kea                 [D] Maxwell Montes
 *
 * Every state the engine can produce renders from the same tree:
 *   issued            stem and options mounted but hidden; timer idle
 *   stem revealed     stem shows; options still hidden
 *   options revealed  by id, in reveal order
 *   running / locked  timer counts, then freezes at the lock value
 *   expired open      00:00 in the alert colour, nothing selected
 *   operator pace     no timer anywhere (session.timer is null)
 *   outcome           the result widget replaces the timer; cards take
 *                     their verdict looks; the decor keeps only the
 *                     matching commentary body at full opacity
 * Nothing here decides; it reads play-state and draws.
 */
export function QuestionPage({ state }: StagePageProps) {
  const copy = resolveCopy()
  const session = state.session
  const domain = state.domains.find((d) => d.id === session?.domainId) ?? null
  const team = currentTeam(state)

  const outcomeShown = Boolean(session?.outcome && session.reveals.outcome)
  const timer = session?.timer ?? null
  const timerMs = timer ? (timer.remainingMsAtLock ?? timer.remainingMs) : 0
  const urgent = timer !== null && !outcomeShown && (timer.expiredOpen || timerMs <= copy.timerUrgentSeconds * 1000)

  return (
    <section data-page="question" style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', gap: SPACE[5] }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: LAYOUT.gapLoose }}>
        <div data-decor-solid style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: SPACE[3], paddingTop: SPACE[7] }}>
          <CategoryLine nodeId={nodeId('question', 'category')} domainName={domain?.name ?? null} teamName={team?.name ?? null} />
          <QuestionStem nodeId={nodeId('question', 'stem')} stem={session?.stem ?? ''} revealed={Boolean(session?.reveals.stem)} />
        </div>

        {/* The side panel slot: timer and result share it; both stay mounted. */}
        <div data-decor-solid style={{ position: 'relative', flex: '0 0 auto', width: LAYOUT.sidePanelWidth, minHeight: LAYOUT.sidePanelHeight }}>
          <TimerPanel
            nodeId={nodeId('question', 'timer')}
            label={copy.timerLabel}
            value={copy.timerValue}
            ms={timerMs}
            hours="never"
            urgent={urgent}
            visible={timer !== null && !outcomeShown}
          />
          <div style={{ position: 'absolute', inset: 0 }}>
            <ResultWidget
              nodeId={nodeId('question', 'result')}
              verdict={session?.outcome?.verdict ?? 'incorrect'}
              points={session?.outcome?.pointsAwarded ?? 0}
              bonus={session?.outcome?.bonusAwarded ?? null}
              revealed={outcomeShown}
            />
          </div>
        </div>
      </div>

      <Rule weight="thick" />

      <div data-decor-solid style={{ width: LAYOUT.questionColumn, maxWidth: '100%' }}>
        <AnswerGrid state={state} columns={2} />
      </div>
    </section>
  )
}
