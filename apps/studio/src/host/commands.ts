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
 */

import { useCallback } from 'react'
import type { Command } from '@questiongame/contract'
import { useNoticeStore } from '@/chrome/notices'
import { command, isHostError } from './host'

export interface RunOptions {
  /** Where an inline refusal should land, when the host does not say. */
  readonly targetPath?: string | null
}

export type Run = <T = unknown>(
  name: Command,
  args?: Record<string, unknown>,
  options?: RunOptions,
) => Promise<T | null>

export function useHostCommand(): Run {
  const pushError = useNoticeStore((s) => s.pushError)
  return useCallback<Run>(
    async (name, args, options) => {
      try {
        return await command(name, args)
      } catch (caught) {
        if (isHostError(caught)) {
          pushError(caught.code, caught.message, targetPathOf(caught.message) ?? options?.targetPath ?? null)
        } else {
          pushError('unknown', String(caught), options?.targetPath ?? null)
        }
        return null
      }
    },
    [pushError],
  )
}

/**
 * `CatalogError::invalid` messages read `<path>: <reason>`; the path is what
 * the editor keys its inline notice on. Anything else has no path.
 */
export function targetPathOf(message: string): string | null {
  const match = /^((?:team|domain|question|operator|recipe|asset)\.[^\s:]+):/.exec(message)
  return match?.[1] ?? null
}
