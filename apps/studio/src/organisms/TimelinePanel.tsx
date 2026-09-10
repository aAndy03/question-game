import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { IconButton, Text, TransportButton } from '@/atoms'
import { EmptyState, EventRow } from '@/molecules'
import { useControlLayoutStore, useTimelineCollapsed } from '@/chrome/control'
import { CONTROL, HOTKEYS, TIMELINE, TRANSPORT } from '@/copy'
import { useHostCommand } from '@/host/commands'
import { command } from '@/host/host'
import { usePlayState } from '@/host/playState'
import type { PlayEvent } from '@/host/types'
import type { PlayStateForMain } from '@questiongame/contract'

export interface TimelinePanelProps {
  density: 'comfortable' | 'compact' | 'dense'
}

/**
 * The event log (spec §5.8), read with `play_events` — a Query keyed on the
 * Play id and its `eventCount`, so the tick's count is what refreshes it and
 * no Play field is ever a cache key. Undo appends; nothing here rewrites.
 */
export function TimelinePanel({ density }: TimelinePanelProps) {
  const play = usePlayState()
  const run = useHostCommand()
  const collapsed = useTimelineCollapsed()
  const setCollapsed = useControlLayoutStore((s) => s.setTimelineCollapsed)
  const playId = play?.playId ?? null
  const count = play?.operator.eventCount ?? 0
  const events = useQuery({
    queryKey: ['plays', 'events', playId ?? '', count],
    queryFn: () => command<PlayEvent[]>('play_events', { playId }),
    enabled: playId !== null && !collapsed,
    placeholderData: (prev) => prev,
  })
  const list = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight })
  }, [events.data?.length])

  if (!play) return <EmptyState kind="empty" what={CONTROL.panels.timeline.toLowerCase()} detail={CONTROL.noRecipeBody} compact />

  const inverted = new Set<string>()
  for (const e of events.data ?? []) {
    if (e.kind.type === 'turn_inverted' && typeof e.kind['target_event_id'] === 'string') inverted.add(e.kind['target_event_id'])
    if (e.kind.type === 'turn_reapplied' && typeof e.kind['target_event_id'] === 'string') inverted.delete(e.kind['target_event_id'])
  }
  const last = events.data?.[events.data.length - 1]
  const busy = play.overlay.busy

  return (
    <div className="flex h-full min-h-0 flex-col gap-2" data-timeline-panel>
      <div className="flex items-center gap-2">
        <IconButton icon={collapsed ? 'chevronUp' : 'chevronDown'} label={collapsed ? TIMELINE.expand : TIMELINE.collapse} size="sm" onPress={() => setCollapsed(!collapsed)} />
        <Text variant="studio-caption" tone="muted">
          {TIMELINE.events(count)}
        </Text>
        {collapsed && last ? (
          <Text variant="studio-caption" truncate className="min-w-0 flex-1">
            {`${TIMELINE.kinds[last.kind.type] ?? last.kind.type} · ${detailOf(last, play)}`}
          </Text>
        ) : (
          <div className="flex-1" />
        )}
        {count <= 2 && play.operator.canUndo ? (
          <Text variant="studio-caption" tone="warning" truncate>
            {TIMELINE.rewindWarning}
          </Text>
        ) : null}
        <TransportButton icon="undo" label={TRANSPORT.undo} size="sm" onPress={() => void run('undo_turn')} isDisabled={!play.operator.canUndo} disabledReason={busy ? TRANSPORT.waitOverlay : null} kbd={HOTKEYS.defaults['undo_turn']} />
        <TransportButton icon="redo" label={TRANSPORT.redo} size="sm" onPress={() => void run('redo_turn')} isDisabled={!play.operator.canRedo} disabledReason={busy ? TRANSPORT.waitOverlay : null} kbd={HOTKEYS.defaults['redo_turn']} />
      </div>
      {collapsed ? null : (
        <div ref={list} className="min-h-0 flex-1 overflow-y-auto rounded-[calc(var(--radius)/2)] border border-[var(--border)]">
          {(events.data ?? []).length === 0 ? (
            <div className="p-3">
              <Text variant="studio-caption" tone="muted">
                {TIMELINE.empty}
              </Text>
            </div>
          ) : (
            (events.data ?? []).map((e) => (
              <EventRow key={e.id} seq={e.seq} atMs={e.atMs} type={e.kind.type} detail={detailOf(e, play)} isInverted={inverted.has(e.id)} isLast={e.id === last?.id} compact={density !== 'comfortable'} />
            ))
          )}
        </div>
      )}
    </div>
  )
}

/** A one-line detail from the event's own fields; names come from the snapshot. */
function detailOf(e: PlayEvent, play: PlayStateForMain): string {
  const k = e.kind
  const teamName = (id: unknown) => (typeof id === 'string' ? (play.teams.find((t) => t.id === id)?.name ?? id) : '')
  switch (k.type) {
    case 'token_given':
      return teamName(k['team'])
    case 'question_issued':
      return String(play.domains.find((d) => d.id === k['domain'])?.name ?? k['domain'] ?? '')
    case 'turn_resolved':
      return [k['verdict'], k['points'] !== undefined ? `+${String(k['points'])}` : ''].filter(Boolean).join(' ')
    case 'selection_set':
      return Array.isArray(k['options']) ? `${(k['options'] as unknown[]).length} selected` : ''
    case 'leaderboard_rank_revealed':
      return k['rank'] !== undefined ? `#${String(k['rank'])}` : ''
    default:
      return ''
  }
}
