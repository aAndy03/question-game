import { Popover } from '@heroui/react'
import { Button, Text } from '@/atoms'
import { DisplayGlyphs } from '@/molecules'
import { useNavStore } from '@/chrome/nav'
import { CHROME } from '@/copy'
import { DisplayWindowButtons } from './DisplayWindowButtons'
import { MonitorCards } from './MonitorCards'
import { useDisplays } from './useDisplays'

/**
 * The status bar's displays (P21.4): each connected display as a small screen
 * marked with Stage and Statistics, and a word for what is up; pressed, the
 * popover with the cards Settings ▸ Monitors draws — send Stage, show or close
 * Statistics — without leaving the page.
 */
export function DisplaysStatus() {
  const { displays, stageOpen, statsOpen } = useDisplays()
  const go = useNavStore((s) => s.go)
  const count = displays.length
  const glyphs = displays.map(({ monitor, stage, stats }) => {
    const [w, h] = monitor.physicalSize
    return {
      key: monitor.key,
      aspect: w > 0 && h > 0 ? w / h : 16 / 9,
      stage: stage === 'stage' || stage === 'mirror' ? stage : null,
      stats: stats === 'here',
    }
  })
  const summary = CHROME.displaysSummary(count, stageOpen, statsOpen)

  return (
    <Popover>
      {/* Popover.Trigger is the pressable (a plain button under Popover never
        * opened it), so what is inside it is spans (P21.3). */}
      <Popover.Trigger
        className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded px-1 outline-none hover:bg-[var(--surface-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
        aria-label={`${CHROME.openDisplays}: ${summary}`}
        data-displays-trigger
      >
        <DisplayGlyphs displays={glyphs} />
        <Text variant="studio-caption" tone="muted">
          {summary}
        </Text>
      </Popover.Trigger>
      <Popover.Content placement="top start">
        <Popover.Dialog aria-label={CHROME.openDisplays}>
          <div className="flex max-w-[min(40rem,90vw)] flex-col gap-3" data-displays-panel>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <Text as="h2" variant="studio-subheading">
                {CHROME.displaysTitle(count)}
              </Text>
              <div className="flex items-center gap-1.5">
                <DisplayWindowButtons />
                <Button size="sm" variant="tertiary" icon="settings" onPress={() => void go({ tab: 'settings', inner: 'monitors' })}>
                  {CHROME.displaysSettings}
                </Button>
              </div>
            </div>
            <MonitorCards />
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  )
}
