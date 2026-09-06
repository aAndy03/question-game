import { Tabs } from '@heroui/react'
import { STAGE_SCREENS, type StageScreen } from '@questiongame/contract'
import { SCREENS } from '@/copy'

export interface ScreenTabsProps {
  value: StageScreen
  onChange: (screen: StageScreen) => void
  /** How many overrides each screen carries, shown after its name. */
  counts?: Partial<Record<StageScreen, number>> | undefined
}

/** The seven screens as secondary tabs (the Screens canvas). */
export function ScreenTabs({ value, onChange, counts }: ScreenTabsProps) {
  return (
    <Tabs
      variant="secondary"
      selectedKey={value}
      onSelectionChange={(key) => {
        if (typeof key === 'string' && (STAGE_SCREENS as readonly string[]).includes(key)) onChange(key as StageScreen)
      }}
    >
      <Tabs.ListContainer>
        <Tabs.List aria-label="Screens">
          {STAGE_SCREENS.map((screen) => (
            <Tabs.Tab key={screen} id={screen}>
              {SCREENS[screen]}
              {counts?.[screen] ? <span className="ml-1.5 text-[var(--accent)]">{counts[screen]}</span> : null}
              <Tabs.Indicator />
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs.ListContainer>
    </Tabs>
  )
}
