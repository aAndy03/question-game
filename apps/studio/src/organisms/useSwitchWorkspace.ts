import { useNavStore, type Route } from '@/chrome/nav'
import { useHostCommand } from '@/host/commands'

/** Where a tab starts: its own root, the route a switch lands on. */
function rootOf(route: Route): Route {
  return { tab: route.tab } as Route
}

/**
 * Work in another workspace (Beta 2.0). The route first goes to the tab's
 * root **through the nav guard** — an id on screen belongs to the workspace
 * being left, and a dirty editor must be asked before it is dropped — then
 * the host switches. A refused navigation switches nothing.
 */
export function useSwitchWorkspace(): (id: string) => Promise<boolean> {
  const go = useNavStore((s) => s.go)
  const run = useHostCommand()
  return async (id) => {
    const route = useNavStore.getState().route
    if (!(await go(rootOf(route)))) return false
    return run.ok('workspace_switch', { id })
  }
}

/** A game in Control, in any state: what refuses a switch and a delete (`refuse_while_play_loaded`). */
export function isGameLoaded(play: unknown): boolean {
  return play !== null && play !== undefined
}
