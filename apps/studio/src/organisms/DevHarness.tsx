import { useState } from 'react'
import type { StageScreen } from '@questiongame/contract'
import { STAGE_SCREENS } from '@questiongame/contract'
import { Button, Panel, Text } from '@/atoms'
import { STUB } from '@/copy'
import { useHostCommand } from '@/host/commands'
import { usePlayState } from '@/host/playState'
import { useMonitors, useRecipeList } from '@/host/queries'

/**
 * **Dev builds only.** The P6 harness, restyled: one button per host command
 * so a show can be driven end to end before P8's Control exists. Nothing here
 * holds Play state — every value drawn comes from `play-state`.
 */
export function DevHarness() {
  const play = usePlayState()
  const recipes = useRecipeList('active')
  const monitors = useMonitors()
  const run = useHostCommand()
  const [recipeId, setRecipeId] = useState<string | null>(null)
  const chosen = recipeId ?? recipes.data?.[0]?.id ?? null
  const session = play?.session ?? null

  const Row = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="flex flex-col gap-2">
      <Text variant="studio-caption" tone="muted">
        {title}
      </Text>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )

  return (
    <Panel variant="secondary" className="flex flex-col gap-5">
      <div className="flex flex-col gap-0.5">
        <Text variant="studio-heading">{STUB.harness}</Text>
        <Text variant="studio-caption" tone="muted">
          {STUB.harnessHint}
        </Text>
      </div>
      <Row title="Recipe">
        {(recipes.data ?? []).map((r) => (
          <Button key={r.id} size="sm" variant={chosen === r.id ? 'primary' : 'outline'} onPress={() => setRecipeId(r.id)}>
            {r.name}
          </Button>
        ))}
        <Button size="sm" variant="ghost" onPress={() => void run('seed_demo_library')}>
          Seed demo
        </Button>
      </Row>
      <Row title="Play">
        <Button size="sm" onPress={() => chosen && void run('play_load', { recipeId: chosen, playId: `play-${Date.now()}` })} isDisabled={!chosen}>
          Control Load
        </Button>
        <Button size="sm" onPress={() => void run('play_start')}>Start</Button>
        <Button size="sm" onPress={() => void run('pause')}>Pause</Button>
        <Button size="sm" onPress={() => void run('resume')}>Resume</Button>
        <Button size="sm" onPress={() => void run('undo_turn')} isDisabled={!play?.operator.canUndo}>Undo</Button>
        <Button size="sm" onPress={() => void run('redo_turn')} isDisabled={!play?.operator.canRedo}>Redo</Button>
        <Button size="sm" variant="danger" onPress={() => void run('abandon')} isDisabled={!play}>Abandon</Button>
      </Row>
      <Row title="Screen">
        {STAGE_SCREENS.map((screen: StageScreen) => (
          <Button key={screen} size="sm" variant={play?.currentScreen === screen ? 'primary' : 'outline'} onPress={() => void run('show_screen', { screen })}>
            {screen}
          </Button>
        ))}
      </Row>
      <Row title="Domain">
        {(play?.domains ?? []).map((d) => (
          <Button key={d.id} size="sm" variant="outline" isDisabled={d.exhausted} onPress={() => void run('choose_domain', { domainId: d.id })}>
            {`${d.code} (${d.remaining})`}
          </Button>
        ))}
      </Row>
      {session ? (
        <Row title={`Session · ${session.stem}`}>
          {session.options.map((o) => (
            <Button key={o.id} size="sm" variant={session.selectedOptionIds.includes(o.id) ? 'primary' : 'outline'} onPress={() => void run('set_selection', { optionIds: [o.id] })}>
              {o.text}
            </Button>
          ))}
          <Button size="sm" onPress={() => void run('reveal_stem')}>Reveal stem</Button>
          <Button size="sm" onPress={() => void run('reveal_next_option')}>Reveal option</Button>
          <Button size="sm" onPress={() => void run('start_timer')}>Timer</Button>
          <Button size="sm" onPress={() => void run('lock_selection')}>Lock</Button>
          <Button size="sm" variant="primary" onPress={() => void run('reveal_outcome')}>Reveal outcome</Button>
        </Row>
      ) : null}
      {play && play.operator.legalTokenTargets.length > 0 ? (
        <Row title="Give token">
          {play.operator.legalTokenTargets.map((teamId) => (
            <Button key={teamId} size="sm" variant={teamId === play.operator.defaultNextTeamId ? 'primary' : 'outline'} onPress={() => void run('give_token', { teamId })}>
              {play.teams.find((t) => t.id === teamId)?.name ?? teamId}
            </Button>
          ))}
        </Row>
      ) : null}
      <Row title="Stage display">
        <Button size="sm" onPress={() => void run('stage_open')}>Open Stage</Button>
        <Button size="sm" variant="outline" onPress={() => void run('stage_set_monitor', { monitorId: null })}>Primary</Button>
        {(monitors.data ?? []).map((m) => (
          <Button key={m.key} size="sm" variant="outline" onPress={() => void run('stage_set_monitor', { monitorId: m.key })}>
            {`${m.name ?? m.key}${m.primary ? ' (primary)' : ''}`}
          </Button>
        ))}
      </Row>
      <details>
        <summary className="cursor-pointer text-xs" style={{ color: 'var(--muted)' }}>
          play-state
        </summary>
        <pre className="mt-2 max-h-80 overflow-auto rounded-[var(--radius)] p-3 text-[11px]" style={{ background: 'var(--surface-tertiary)' }}>
          {play ? JSON.stringify(play, null, 2) : 'no play loaded'}
        </pre>
      </details>
    </Panel>
  )
}
