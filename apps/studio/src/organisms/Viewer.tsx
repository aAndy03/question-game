import { useEffect, useMemo, useRef, useState } from 'react'
import {
  leaderboard,
  STAGE_FRAME,
  VIEWER_SOURCE,
  isViewerMessage,
  parseNodeId,
  type PlayStateForMain,
  type PlayStateForStage,
  type StageToViewer,
  type ViewerNodeRect,
  type ViewerToStage,
} from '@questiongame/contract'
import { HitTarget, Text } from '@/atoms'
import { EmptyState } from '@/molecules'
import { CONTROL, RING_ROLE, SESSION } from '@/copy'
import { useHostCommand } from '@/host/commands'
import { hasTauri } from '@/host/host'
import { usePlayState } from '@/host/playState'
import { ringEntries, ringRole } from '@/host/ring'
import { canChooseDomain, liveSession } from '@/host/session'
import { useSettings } from '@/host/queries'

/**
 * The Viewer (spec §5.7): the real Stage in an iframe, fed the stripped
 * play-state over `postMessage`, with hit targets laid over the node rects
 * Stage reports. The chrome is in this DOM; the Stage tree gains nothing.
 * Every hit target calls the same `run` the Action Panel and the chords do.
 */
export function Viewer({ density }: { density: 'comfortable' | 'compact' | 'dense' }) {
  const play = usePlayState()
  const settings = useSettings()
  const run = useHostCommand()
  const frame = useRef<HTMLIFrameElement | null>(null)
  const box = useRef<HTMLDivElement | null>(null)
  const [ready, setReady] = useState(false)
  const [nodes, setNodes] = useState<readonly ViewerNodeRect[]>([])
  const [size, setSize] = useState({ width: 0, height: 0 })
  const hitTargets = settings.data?.control.viewer_hit_targets ?? true
  // The latest Play, for the `ready` handler: a re-mounted iframe (the mosaic
  // moved the tile) announces itself again and must get the state at once.
  const latest = useRef<PlayStateForMain | null>(play)
  latest.current = play

  // The box decides the iframe's size; the iframe scales the 1920×1080 frame.
  useEffect(() => {
    const el = box.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      const w = entry.contentRect.width
      const h = entry.contentRect.height
      const scale = Math.min(w / STAGE_FRAME.width, h / STAGE_FRAME.height)
      setSize({ width: Math.floor(STAGE_FRAME.width * scale), height: Math.floor(STAGE_FRAME.height * scale) })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Stage → Studio: ready, node rects.
  useEffect(() => {
    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== frame.current?.contentWindow || !isViewerMessage(event.data)) return
      const message = event.data as StageToViewer
      if (message.type === 'ready') {
        setReady(true)
        const state = latest.current ? strip(latest.current) : null
        if (state && frame.current?.contentWindow) {
          const reply: ViewerToStage = { source: VIEWER_SOURCE, type: 'play-state', state }
          frame.current.contentWindow.postMessage(reply, '*')
        }
      }
      if (message.type === 'nodes') setNodes(message.nodes)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  // Studio → Stage: the stripped state on every change, and once on ready.
  useEffect(() => {
    const target = frame.current?.contentWindow
    if (!target || !ready) return
    const state = play ? strip(play) : null
    if (!state) return
    const message: ViewerToStage = { source: VIEWER_SOURCE, type: 'play-state', state }
    target.postMessage(message, '*')
  }, [play, ready])

  useEffect(() => {
    const target = frame.current?.contentWindow
    if (!target || !ready) return
    const message: ViewerToStage = { source: VIEWER_SOURCE, type: 'measure' }
    target.postMessage(message, '*')
  }, [size, ready])

  const scale = size.width / STAGE_FRAME.width
  const targets = useMemo(() => (play && hitTargets ? nodesToTargets(play, nodes, scale) : []), [play, nodes, scale, hitTargets])

  if (!hasTauri() && !import.meta.env.DEV) {
    return <EmptyState kind="empty" what="viewer" detail={CONTROL.viewerNoHost} compact />
  }

  return (
    <div ref={box} className="flex h-full w-full items-center justify-center" style={{ background: 'var(--surface-tertiary)' }} data-viewer>
      <div className="relative" style={{ width: size.width || undefined, height: size.height || undefined }}>
        <iframe
          ref={frame}
          title={CONTROL.panels.viewer}
          src="/stage/?viewer"
          className="block border-0"
          style={{ width: size.width, height: size.height, background: 'white' }}
          tabIndex={-1}
          aria-hidden
        />
        {!ready ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Text variant="studio-caption" tone="muted">
              {CONTROL.viewerLoading}
            </Text>
          </div>
        ) : null}
        {targets.map((t) => (
          <HitTarget
            key={t.id}
            x={t.x}
            y={t.y}
            width={t.width}
            height={t.height}
            label={t.label}
            legality={t.legal ? 'legal' : 'illegal'}
            reason={t.reason}
            isSelected={t.selected}
            onPress={() => void run(t.command, t.args)}
          />
        ))}
        {density === 'dense' ? null : (
          <div className="pointer-events-none absolute bottom-1 right-2">
            <Text variant="studio-mono" tone="muted">
              {`${Math.round(scale * 100)}%`}
            </Text>
          </div>
        )}
      </div>
    </div>
  )
}

/** The operator half never crosses into the iframe (spec §5.7). */
function strip(play: PlayStateForMain): PlayStateForStage {
  const stage: Record<string, unknown> = { ...play }
  delete stage['operator']
  return stage as unknown as PlayStateForStage
}

interface Target {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly label: string
  readonly legal: boolean
  readonly reason: string | null
  readonly selected: boolean
  readonly command: 'choose_domain' | 'set_selection' | 'reveal_stem' | 'reveal_outcome' | 'give_token' | 'reveal_leaderboard_rank'
  readonly args: Record<string, unknown> | undefined
}

/** The node → command table of 05_STUDIO_DESIGN.md §10.2. */
function nodesToTargets(play: PlayStateForMain, nodes: readonly ViewerNodeRect[], scale: number): Target[] {
  // The **live** session (`host/session.ts`), not `play.session`: a resolved
  // question stays in the projection so Stage can keep drawing it, and reading
  // it as "a question is in progress" is what left the operator with no legal
  // domain card for the rest of the Play.
  const session = play.session
  const live = liveSession(play)
  const canChoose = canChooseDomain(play)
  const playOpen = play.status === 'playing' || play.status === 'paused'
  const legalTargets = new Set(play.operator.legalTokenTargets)
  // The same sentence the Action Panel's rows carry, so a target reads the
  // same wherever the operator is looking.
  const roles = new Map(ringEntries(play).map((e) => [e.team.id, ringRole(play, e)]))
  const out: Target[] = []
  for (const n of nodes) {
    const parsed = parseNodeId(n.id)
    if (!parsed || parsed.slot === 'decor') continue
    const geom = { id: n.id, x: n.x * scale, y: n.y * scale, width: n.width * scale, height: n.height * scale }
    const slot = `${parsed.screen}.${parsed.slot}`
    if (slot === 'chooseDomain.card' && parsed.key) {
      const domain = play.domains.find((d) => d.id === parsed.key)
      if (!domain) continue
      const legal = !domain.exhausted && canChoose
      out.push({ ...geom, label: domain.name, legal, reason: domain.exhausted ? SESSION.exhausted : live ? SESSION.revealFirst : null, selected: false, command: 'choose_domain', args: { domainId: domain.id } })
    } else if (slot === 'question.option' && parsed.key && session) {
      const option = session.options.find((o) => o.id === parsed.key)
      if (!option) continue
      const selected = session.selectedOptionIds.includes(option.id)
      const next = session.answerMode === 'multiple' ? (selected ? session.selectedOptionIds.filter((id) => id !== option.id) : [...session.selectedOptionIds, option.id]) : [option.id]
      const legal = session.lockedOptionIds === null
      out.push({ ...geom, label: option.text, legal, reason: legal ? null : TIMER_LOCKED, selected, command: 'set_selection', args: { optionIds: next } })
    } else if (slot === 'question.stem' && session) {
      out.push({ ...geom, label: SESSION.revealStem, legal: !session.reveals.stem, reason: null, selected: session.reveals.stem, command: 'reveal_stem', args: undefined })
    } else if (slot === 'question.result' && session) {
      out.push({ ...geom, label: SESSION.revealOutcome, legal: session.outcome === null, reason: null, selected: session.outcome !== null, command: 'reveal_outcome', args: undefined })
    } else if ((slot === 'teamOrder.row' || slot === 'scoreboard.row') && parsed.key) {
      const team = play.teams.find((t) => t.id === parsed.key)
      if (!team) continue
      // A closed Play refuses `give_token` (`require_open`), so the row is not
      // a target once the board is empty — it would only refuse.
      const legal = playOpen && legalTargets.has(team.id) && play.operator.showGiveToken
      const role = roles.get(team.id)
      out.push({ ...geom, label: legal ? SESSION.giveTokenTo(team.name) : `${team.name} — ${role ? RING_ROLE[role] : ''}`, legal, reason: legal || !role ? null : RING_ROLE[role], selected: play.ring.currentTeamId === team.id, command: 'give_token', args: { teamId: team.id } })
    } else if (slot === 'finalLeaderboard.row' && parsed.key) {
      // **The node key is the finishing position, not the rank** — two tied
      // teams are positions 1 and 2 sharing rank 1, and `LeaderboardList`
      // keys its cards by position so the ids stay distinct. The command
      // takes a rank, so read it off the team standing in that position;
      // sending the position would reveal a rank nobody holds.
      const team = leaderboard(play)[Number(parsed.key) - 1]
      if (!team) continue
      const revealed = play.leaderboardRevealedRanks.includes(team.rank)
      out.push({ ...geom, label: SESSION.leaderboardNext, legal: !revealed, reason: null, selected: revealed, command: 'reveal_leaderboard_rank', args: { rank: team.rank } })
    }
  }
  return out
}

const TIMER_LOCKED = 'Locked'
