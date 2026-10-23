import { useState } from 'react'
import { Popover } from '@heroui/react'
import { Button, Text } from '@/atoms'
import { DisplayGlyphs } from '@/molecules'
import { useNavStore } from '@/chrome/nav'
import { CHROME } from '@/copy'
import { SETTINGS } from '@/copy/settings'
import { DisplayWindowButtons } from './DisplayWindowButtons'
import { DisplaysPanel } from './DisplaysPanel'
import { useDisplays } from './useDisplays'

/**
 * The status bar's displays (P21.4): each connected display as a small
 * screen, left to right as they stand, marked with Stage and Statistics, and
 * a word for what is up; pressed, the popover with the panel Settings ▸
 * Monitors draws — the map and a row per display, compact — so Stage can be
 * sent and Statistics shown or closed without leaving the page.
 */
export function DisplaysStatus() {
  const { displays, loading, stageOn, statsOn, statsOpen } = useDisplays()
  const go = useNavStore((s) => s.go)
  // Controlled only so *Monitors settings* can close it on the way out: left
  // open, it sat over the page it had just opened.
  const [open, setOpen] = useState(false)
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
  const nameOf = (key: string | null) => {
    const m = displays.find((d) => d.monitor.key === key)?.monitor
    return key === null ? null : (m?.friendlyName ?? m?.name ?? SETTINGS.monitors.unnamed)
  }
  const mirrors = displays.filter((d) => d.stage === 'mirror').length
  // Nothing to count before the host has answered: "0 displays" for a
  // moment at boot read as a fault.
  const summary = loading ? '' : CHROME.displaysSummary(count, stageOn !== null, statsOpen)

  return (
    <Popover isOpen={open} onOpenChange={setOpen}>
      {/* Popover.Trigger is the pressable (a plain button under Popover never
        * opened it), so what is inside it is spans (P21.3). */}
      <Popover.Trigger
        className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded px-1 outline-none hover:bg-[var(--surface-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
        aria-label={`${CHROME.openDisplays}: ${CHROME.displaysStatus(count, nameOf(stageOn), mirrors, statsOpen ? nameOf(statsOn) : null)}`}
        data-displays-trigger
      >
        <DisplayGlyphs displays={glyphs} />
        <Text variant="studio-caption" tone="muted">
          {summary}
        </Text>
      </Popover.Trigger>
      <Popover.Content placement="top start">
        <Popover.Dialog aria-label={CHROME.openDisplays}>
          <div className="flex w-max min-w-[24rem] max-w-[min(44rem,92vw)] flex-col gap-2" data-displays-panel>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <Text as="h2" variant="studio-subheading">
                {CHROME.displaysTitle(count)}
              </Text>
              <div className="flex items-center gap-1.5">
                <DisplayWindowButtons />
                <Button
                  size="sm"
                  variant="ghost"
                  icon="settings"
                  onPress={() => {
                    setOpen(false)
                    void go({ tab: 'settings', inner: 'monitors' })
                  }}
                >
                  {CHROME.displaysSettings}
                </Button>
              </div>
            </div>
            <div className="-mx-2 max-h-[min(30rem,65vh)] overflow-y-auto">
              <DisplaysPanel compact />
            </div>
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  )
}
