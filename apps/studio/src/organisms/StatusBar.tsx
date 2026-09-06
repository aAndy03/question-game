import { Icon, StatusDot, Text, Tooltip } from '@/atoms'
import { latestForStatusBar, useNoticeStore } from '@/chrome/notices'
import { healthTone, useHealthStore } from '@/chrome/health'
import { CHROME, fmt, noticeTitle } from '@/copy'
import { usePlayState } from '@/host/playState'
import { useMonitors } from '@/host/queries'

/**
 * Health · displays · latest notice · timer remaining while playing
 * (spec §11.I, §8). Health has no producer until P10 and says so.
 */
export function StatusBar() {
  const play = usePlayState()
  const monitors = useMonitors()
  const notices = useNoticeStore((s) => s.notices)
  const setCollectorOpen = useNoticeStore((s) => s.setCollectorOpen)
  const latest = latestForStatusBar(notices)
  const health = useHealthStore((s) => s.report)
  const tone = healthTone(health)
  const healthText = health === null ? CHROME.healthUnknown : health.status === 'ok' ? CHROME.healthOk : health.status === 'warn' ? CHROME.healthWarn : CHROME.healthError
  const timer = play?.session?.timer ?? null
  const showTimer = play?.status === 'playing' && timer !== null

  return (
    <footer
      className="flex h-7 shrink-0 items-center gap-4 border-t border-[var(--border)] px-3"
      style={{ background: 'var(--surface)' }}
    >
      <Tooltip content={healthText} placement="top">
        <button
          type="button"
          onClick={() => setCollectorOpen(true)}
          className="inline-flex items-center gap-1.5 rounded px-1 outline-none hover:bg-[var(--surface-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
          aria-label={`${CHROME.health}: ${healthText}`}
          data-health={health?.status ?? 'unknown'}
        >
          <StatusDot tone={tone} label={CHROME.health} />
          <Text variant="studio-caption" tone="muted">
            {CHROME.health}
          </Text>
        </button>
      </Tooltip>
      <span className="inline-flex items-center gap-1.5">
        <Icon name="displays" size="sm" className="opacity-60" />
        <Text variant="studio-caption" tone="muted">
          {CHROME.displays(monitors.data?.length ?? 0)}
        </Text>
      </span>
      <button
        type="button"
        onClick={() => setCollectorOpen(true)}
        className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 text-left outline-none hover:bg-[var(--surface-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
        aria-label={CHROME.openCollector}
      >
        <Icon name="bell" size="sm" className={latest ? '' : 'opacity-60'} />
        <Text
          variant="studio-caption"
          tone={latest ? (latest.severity === 'info' ? 'accent' : latest.severity === 'warn' ? 'warning' : 'danger') : 'muted'}
          truncate
        >
          {latest ? noticeTitle(latest.code, latest.detail) : CHROME.noNotices}
        </Text>
        {notices.length > 0 ? (
          <Text variant="studio-caption" tone="muted">{`(${notices.length})`}</Text>
        ) : null}
      </button>
      {showTimer ? (
        <span className="inline-flex items-center gap-1.5">
          <Icon name="clock" size="sm" className="opacity-60" />
          <Text variant="studio-mono" tone="default" tabular transition="count">
            {fmt.clock(timer.remainingMs)}
          </Text>
        </span>
      ) : null}
    </footer>
  )
}
