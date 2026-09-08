import { useHotkeys, type UseHotkeyDefinition } from '@tanstack/react-hotkeys'
import { STAGE_SCREENS } from '@questiongame/contract'
import { HOTKEYS } from '@/copy'
import { useHostCommand } from '@/host/commands'
import { usePlayState } from '@/host/playState'
import { canChooseDomain, liveSession } from '@/host/session'
import { useSettings } from '@/host/queries'

/**
 * Chords → the same `run` the buttons and the Viewer call (05_STUDIO_DESIGN.md
 * §10.4). Mounted only by the Control page; `ignoreInputs` so a field keeps
 * its keys; never on Stage. The chords come from the host's shortcut table,
 * falling back to the defaults in copy until P10's Shortcuts tab writes them.
 */
export function useControlHotkeys(enabled: boolean): void {
  const play = usePlayState()
  const settings = useSettings()
  const run = useHostCommand()
  const chord = (command: string) => settings.data?.globals.shortcuts[command] ?? HOTKEYS.defaults[command] ?? ''
  const open = play !== null && (play.status === 'playing' || play.status === 'paused')
  // The live one: a resolved question is still in `play.session`, and the
  // number keys have to fall back to picking a domain once it is revealed.
  const session = liveSession(play)

  const screenStep = (dir: -1 | 1) => {
    if (!play) return
    const i = STAGE_SCREENS.indexOf(play.currentScreen)
    const next = STAGE_SCREENS[(i + dir + STAGE_SCREENS.length) % STAGE_SCREENS.length]
    if (next) void run('show_screen', { screen: next })
  }

  const pick = (position: number) => {
    if (!play) return
    if (session) {
      const option = session.options[position - 1]
      if (!option || session.lockedOptionIds !== null) return
      const selected = session.selectedOptionIds.includes(option.id)
      const next = session.answerMode === 'multiple' ? (selected ? session.selectedOptionIds.filter((id) => id !== option.id) : [...session.selectedOptionIds, option.id]) : [option.id]
      void run('set_selection', { optionIds: next })
      return
    }
    const domain = play.domains[position - 1]
    if (domain && !domain.exhausted && canChooseDomain(play)) void run('choose_domain', { domainId: domain.id })
  }

  const definitions = [
    { hotkey: chord('start_timer'), callback: () => void run(session?.timer?.running ? 'pause_timer' : 'start_timer') },
    { hotkey: chord('lock_selection'), callback: () => void run('lock_selection') },
    { hotkey: chord('reveal_outcome'), callback: () => void run('reveal_outcome') },
    { hotkey: chord('reveal_stem'), callback: () => void run('reveal_stem') },
    { hotkey: chord('reveal_next_option'), callback: () => void run('reveal_next_option') },
    {
      hotkey: chord('give_token'),
      callback: () => {
        const target = play?.operator.defaultNextTeamId
        if (target && !session) void run('give_token', { teamId: target })
      },
    },
    { hotkey: chord('undo_turn'), callback: () => void run('undo_turn') },
    { hotkey: chord('redo_turn'), callback: () => void run('redo_turn') },
    { hotkey: chord('screen_prev'), callback: () => screenStep(-1) },
    { hotkey: chord('screen_next'), callback: () => screenStep(1) },
    ...Array.from({ length: 9 }, (_, i) => ({ hotkey: String(i + 1), callback: () => pick(i + 1) })),
  ].filter((d) => d.hotkey !== '')

  useHotkeys(
    definitions.map((d) => ({ hotkey: d.hotkey as UseHotkeyDefinition['hotkey'], callback: d.callback })),
    { enabled: enabled && open, ignoreInputs: true, preventDefault: true },
  )
}
