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
import { useNoticeStore, type OpenNotice } from '@/chrome/notices'
import { command, isHostError } from './host'
import { invalidateSettings } from './queries'
import type { RulesPreview } from './types'

export interface RunOptions {
  /** Where an inline refusal should land, when the host does not say. */
  readonly targetPath?: string | null
  /**
   * Open the notice collector when the host refuses. For a command whose
   * reason usually renders somewhere else — `play_load` refused for a Board
   * problem, pressed from the Roster (P12.8) — so the click is answered where
   * it was made.
   */
  readonly openCollectorOnRefusal?: boolean
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
    name === 'stage_remove_mirror' ||
    // A copied library brings its own operators and settings (P13.1).
    name === 'beta_copy_stable_library'
  )
}

export function useHostCommand(): Run {
  const pushError = useNoticeStore((s) => s.pushError)
  const dismissUnder = useNoticeStore((s) => s.dismissUnder)
  const setCollectorOpen = useNoticeStore((s) => s.setCollectorOpen)
  const client = useQueryClient()
  const attempt = useCallback(
    async (name: Command, args?: Record<string, unknown>, options?: RunOptions): Promise<{ ok: boolean; value: unknown }> => {
      try {
        const value = await command(name, args)
        if (writesSettings(name)) invalidateSettings(client)
        // A write the host accepted answers what it refused about that record
        // before; the refusal no longer stands (P12.8).
        const answered = answeredBy(name, args)
        if (answered !== null) dismissUnder(answered)
        // A Board refusal can be answered from the library too (P12.12).
        answerFromLibrary(name, args)
        return { ok: true, value }
      } catch (caught) {
        if (isHostError(caught)) {
          pushError(caught.code, caught.message, targetPathOf(caught.message) ?? options?.targetPath ?? null)
        } else {
          pushError('unknown', String(caught), options?.targetPath ?? null)
        }
        if (options?.openCollectorOnRefusal) setCollectorOpen(true)
        return { ok: false, value: null }
      }
    },
    [pushError, dismissUnder, setCollectorOpen, client],
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
  const match = /^((?:team|domain|question|operator|recipe|asset|audio|shortcuts|import)(?:\.[^\s:]+)?):/.exec(message)
  return match?.[1] ?? null
}

/**
 * The notices a command the host **accepted** has answered, as a path prefix.
 *
 * A board write the host took is a board it found legal — every recipe write
 * runs the board rules (§2.31, §2.32) — so the Board's refusals no longer
 * stand. A Load the host took is a recipe it could build a Play from, so
 * nothing addressed to that recipe stands. Anything else answers nothing.
 */
export function answeredBy(name: Command, args?: Record<string, unknown>): string | null {
  const id = (value: unknown) => (typeof value === 'string' ? value : null)
  switch (name) {
    case 'play_load': {
      const recipe = id(args?.recipeId)
      return recipe === null ? null : `recipe.${recipe}.`
    }
    case 'recipe_set_membership':
    case 'recipe_set_settings':
    case 'recipe_set_overlay': {
      const recipe = id(args?.id)
      return recipe === null ? null : `recipe.${recipe}.board.`
    }
    case 'recipe_upsert': {
      const recipe = id((args?.recipe as { id?: unknown } | undefined)?.id)
      return recipe === null ? null : `recipe.${recipe}.board.`
    }
    default:
      return null
  }
}

/** A Board refusal a library edit can fix: a shared difficulty, an incomplete question. */
const BOARD_RULE = /^recipe\.([^.]+)\.board\.[^.]+\.(?:difficulty|question)\./
/** A Board refusal for a row the board names that is archived or gone. */
const BOARD_ROW = /^recipe\.[^.]+\.board\.(domain|question)\.([^.]+)$/

const isBoardRuleFor = (recipeId: string) => (n: OpenNotice) => BOARD_RULE.exec(n.targetPath ?? '')?.[1] === recipeId

/**
 * Refusals a successful **library** write may have answered (P12.12).
 *
 * Re-grading the twin in Questions, finishing an incomplete question or
 * restoring the archived row a board names fixes the board from outside the
 * recipe. A restore answers its own notice exactly. An edit is checked
 * rather than assumed: the host's `rules_preview` says whether the board
 * still shares a difficulty or holds an incomplete question, and only a board
 * it clears loses its notice — a false all-clear would be the worse bug.
 */
function answerFromLibrary(name: Command, args?: Record<string, unknown>): void {
  const kind = args?.kind
  if ((name === 'catalog_restore' || name === 'catalog_restore_many') && (kind === 'question' || kind === 'domain')) {
    const ids = new Set<unknown>(name === 'catalog_restore' ? [args?.id] : ((args?.ids as unknown[] | undefined) ?? []))
    useNoticeStore.getState().dismissWhere((n) => {
      const row = BOARD_ROW.exec(n.targetPath ?? '')
      return row !== null && row[1] === kind && ids.has(row[2])
    })
  }
  const edit =
    name === 'catalog_upsert_many' ||
    name === 'catalog_restore' ||
    name === 'catalog_restore_many' ||
    (name === 'catalog_upsert' && ['question', 'domain'].includes((args?.item as { kind?: string } | undefined)?.kind ?? ''))
  if (!edit) return
  const recipes = new Set(
    useNoticeStore
      .getState()
      .notices.filter((n) => n.severity === 'error')
      .flatMap((n) => BOARD_RULE.exec(n.targetPath ?? '')?.[1] ?? []),
  )
  for (const recipeId of recipes) {
    void (async () => {
      try {
        const preview = await command<RulesPreview>('rules_preview', { recipeId })
        const stands = preview.warnings.some((w) => w.code === 'duplicateDifficulty' || w.code === 'incompleteQuestions')
        if (!stands) useNoticeStore.getState().dismissWhere(isBoardRuleFor(recipeId))
      } catch {
        // No answer is no all-clear: the notice stays.
      }
    })()
  }
}
