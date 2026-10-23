import { useEffect, useState } from 'react'
import { Popover } from '@heroui/react'
import { Icon, StatusDot, Text } from '@/atoms'
import { latestForStatusBar, useNoticeStore } from '@/chrome/notices'
import { healthTone, useHealthStore } from '@/chrome/health'
import { CHROME, fmt, noticeTitle } from '@/copy'
import { usePlayClock, usePlayState } from '@/host/playState'
import { DisplaysStatus } from './DisplaysStatus'
import { NoticePanel } from './NoticePanel'

/**
 * Health and the latest notice (one popover) · the displays (a popover with
 * the Monitors drawing) · the timer while playing (spec §11.I, §8; P21.3).
 */
export function StatusBar() {
  const play = usePlayState()
  const notices = useNoticeStore((s) => s.notices)
  const setCollectorOpen = useNoticeStore((s) => s.setCollectorOpen)
  const collectorOpen = useNoticeStore((s) => s.collectorOpen)
  const [open, setOpen] = useState(false)
  // The store flag is what the rest of Studio opens and closes the list with
  // (a refusal, a notice action); the popover follows it through local state —
  // bound to the store directly it closed as soon as it opened.
  useEffect(() => setOpen(collectorOpen), [collectorOpen])
  const openChange = (next: boolean) => {
    setOpen(next)
    setCollectorOpen(next)
  }
  const latest = latestForStatusBar(notices)
  const health = useHealthStore((s) => s.report)
  const tone = healthTone(health)
  const healthText = health === null ? CHROME.healthUnknown : health.status === 'ok' ? CHROME.healthOk : health.status === 'warn' ? CHROME.healthWarn : CHROME.healthError
  // Whether there is a countdown at all is stable state; the number itself is
  // read one component down, so a tick does not re-render the health dot, the
  // display count and the notice line with it.
  const showTimer = play?.status === 'playing' && (play.session?.timer ?? null) !== null

  return (
    <footer
      className="flex h-7 shrink-0 items-center gap-4 border-t border-[var(--chrome-line)] px-3"
      style={{ background: 'var(--chrome)' }}
    >
      {/*
        Health and the notices are one button and one popover (P21.3): both
        opened the same list. A fixed size, so a long list scrolls inside it.
        Popover.Trigger is the pressable (a plain button is not one), so what is
        inside it is spans, never a second button.
      */}
      <Popover isOpen={open} onOpenChange={openChange}>
        <Popover.Trigger
          className="flex min-w-0 max-w-[60%] cursor-pointer items-center gap-3 rounded px-1 text-left outline-none hover:bg-[var(--surface-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
          aria-label={`${CHROME.health}: ${healthText} · ${CHROME.openCollector}`}
          data-health={health?.status ?? 'unknown'}
          data-notices-trigger
        >
          <span className="inline-flex shrink-0 items-center gap-1.5">
            <StatusDot tone={tone} label={CHROME.health} />
            <Text variant="studio-caption" tone="muted">
              {CHROME.health}
            </Text>
          </span>
          <span className="flex min-w-0 items-center gap-1.5">
            <Icon name="bell" size="sm" className={latest ? '' : 'opacity-60'} />
            <Text
              variant="studio-caption"
              tone={latest ? (latest.severity === 'info' ? 'accent' : latest.severity === 'warn' ? 'warning' : 'danger') : 'muted'}
              truncate
            >
              {latest ? noticeTitle(latest.code, latest.detail) : CHROME.noNotices}
            </Text>
            {notices.length > 0 ? <Text variant="studio-caption" tone="muted">{`(${notices.length})`}</Text> : null}
          </span>
        </Popover.Trigger>
        <Popover.Content placement="top start">
          <Popover.Dialog aria-label={CHROME.notices}>
            <Text as="div" variant="studio-caption" tone="muted" className="pb-2">
              {`${CHROME.health}: ${healthText}`}
            </Text>
            <NoticePanel />
          </Popover.Dialog>
        </Popover.Content>
      </Popover>
      <DisplaysStatus />
      <span className="flex-1" />
      {showTimer ? <StatusClock /> : null}
    </footer>
  )
}

/**
 * The countdown, and nothing else.
 *
 * The one thing in the status bar that moves ten times a second, so it is the
 * only thing subscribed to `usePlayClock()` — the rest of the bar reads the
 * stable Play and re-renders when an operator would expect it to.
 */
function StatusClock() {
  const { remainingMs } = usePlayClock()
  if (remainingMs === null) return null
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon name="clock" size="sm" className="opacity-60" />
      <Text variant="studio-mono" tone="default" tabular transition="count">
        {fmt.clock(remainingMs)}
      </Text>
    </span>
  )
}
