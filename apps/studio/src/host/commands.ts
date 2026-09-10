/**
 * `useHostCommand` — the one way an organism or page issues a §13 command.
 *
 * Every write in Studio is `run(name, args)`. A refusal becomes a notice
 * through the store; the caller gets `null` back and draws nothing itself,
 * because the row it wanted to change will update when the host's event
 * arrives — or will not, because the host said no. There is no success toast
 * (05_STUDIO_DESIGN.md §3.3).
 *
 * `targetPath` lets a form route the refusal inline to the field the host
 * named (`team.<id>.name`), which is how §14's "inline on the parent" works
 * without the form knowing the host's reject table.
 *
 * Most §13 commands answer with `()`, which arrives as `null` — the same
 * `null` a refusal returns. A caller that must know whether the host accepted
 * asks `run.ok(…)`, which reports the outcome rather than the payload. Use
 * `run(…)` when you want the value, `run.ok(…)` when you want the verdict;
 * `await run('play_load', …) !== null` is always false and is a bug.
 */

import { useCallback, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Command } from '@questiongame/contract'
import { useNoticeStore } from '@/chrome/notices'
import { command, isHostError } from './host'
import { invalidateSettings } from './queries'

export interface RunOptions {
  /** Where an inline refusal should land, when the host does not say. */
  readonly targetPath?: string | null
}

export interface Run {
  /** Issue a command and take its payload; `null` is a refusal *or* a `()`. */
  <T = unknown>(name: Command, args?: Record<string, unknown>, options?: RunOptions): Promise<T | null>
  /** Issue a command and take the verdict. The only honest test for a `()` command. */
  ok(name: Command, args?: Record<string, unknown>, options?: RunOptions): Promise<boolean>
}

/**
 * Commands that change the settings document.
 *
 * The document has **no host event of its own** — `settings_get` is a read and
 * nothing emits when it changes — so a write is the one moment Studio can know
 * to ask for it again. A command that writes settings and is missing from here
 * looks like it did nothing: the host is right, the store is stale, and the
 * control the operator just used springs back.
 *
 * The `stage_*` window commands are on the list because they remember where
 * Stage goes (`stage.monitor_id`, `stage.mirror_ids`) as well as moving a
 * window.
 */
function writesSettings(name: Command): boolean {
  return (
    name.startsWith('settings_') ||
    name.startsWith('operator_') ||
    name === 'stage_set_monitor' ||
    name === 'stage_add_mirror' ||
    name === 'stage_remove_mirror'
  )
}

export function useHostCommand(): Run {
  const pushError = useNoticeStore((s) => s.pushError)
  const client = useQueryClient()
  const attempt = useCallback(
    async (name: Command, args?: Record<string, unknown>, options?: RunOptions): Promise<{ ok: boolean; value: unknown }> => {
      try {
        const value = await command(name, args)
        if (writesSettings(name)) invalidateSettings(client)
        return { ok: true, value }
      } catch (caught) {
        if (isHostError(caught)) {
          pushError(caught.code, caught.message, targetPathOf(caught.message) ?? options?.targetPath ?? null)
        } else {
          pushError('unknown', String(caught), options?.targetPath ?? null)
        }
        return { ok: false, value: null }
      }
    },
    [pushError, client],
  )
  return useMemo(() => {
    const run = async <T,>(name: Command, args?: Record<string, unknown>, options?: RunOptions): Promise<T | null> =>
      ((await attempt(name, args, options)).value ?? null) as T | null
    run.ok = async (name: Command, args?: Record<string, unknown>, options?: RunOptions): Promise<boolean> =>
      (await attempt(name, args, options)).ok
    return run as Run
  }, [attempt])
}

/**
 * `CatalogError::invalid` messages read `<path>: <reason>`; the path is what
 * the editor keys its inline notice on. Anything else has no path.
 *
 * Catalog kinds carry an id (`team.<id>.name`); the settings paths are bare
 * (`audio.volume`, `shortcuts`) — one Settings row each (§12.2).
 */
export function targetPathOf(message: string): string | null {
  const match = /^((?:team|domain|question|operator|recipe|asset|audio|shortcuts)(?:\.[^\s:]+)?):/.exec(message)
  return match?.[1] ?? null
}
