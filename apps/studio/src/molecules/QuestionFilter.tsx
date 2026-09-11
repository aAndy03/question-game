import { Tabs } from '@heroui/react'
import { QUESTION } from '@/copy'

export type QuestionFilterValue = 'all' | 'incomplete'

export interface QuestionFilterProps {
  value: QuestionFilterValue
  onChange: (value: QuestionFilterValue) => void
  /** How many incomplete questions the current view holds. */
  incomplete: number
}

/**
 * All | Incomplete · n, beside the archive scope in the question list
 * (§17.4). The same secondary `Tabs` as `ArchiveToggle`, so two filters on one
 * toolbar read as one family.
 */
export function QuestionFilter({ value, onChange, incomplete }: QuestionFilterProps) {
  return (
    <Tabs
      variant="secondary"
      selectedKey={value}
      onSelectionChange={(key) => {
        if (key === 'all' || key === 'incomplete') onChange(key)
      }}
    >
      <Tabs.ListContainer>
        <Tabs.List aria-label={QUESTION.filterLabel}>
          <Tabs.Tab id="all">
            {QUESTION.filterAll}
            <Tabs.Indicator />
          </Tabs.Tab>
          <Tabs.Tab id="incomplete">
            {QUESTION.filterIncomplete(incomplete)}
            <Tabs.Indicator />
          </Tabs.Tab>
        </Tabs.List>
      </Tabs.ListContainer>
    </Tabs>
  )
}
