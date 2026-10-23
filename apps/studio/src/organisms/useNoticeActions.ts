import { gameSectionOf, useNoticeStore, type OpenNotice } from '@/chrome/notices'
import { useNavStore } from '@/chrome/nav'
import { SCREENS_TAB, SHELL } from '@/copy'
import { toast } from '@/chrome/toast'
import { useHostCommand } from '@/host/commands'

/**
 * What a notice's actions do (spec §14), one table for every place a notice
 * shows — the notices popover, the `block` dialog — so an action behaves the
 * same wherever it was pressed. `goTo` takes the operator to where an inline
 * notice renders.
 */
export function useNoticeActions() {
  const setOpen = useNoticeStore((s) => s.setCollectorOpen)
  const dismiss = useNoticeStore((s) => s.dismiss)
  const pushFrame = useNoticeStore((s) => s.pushFrame)
  const go = useNavStore((s) => s.go)
  const run = useHostCommand()

  const act = async (notice: OpenNotice, action: string) => {
    switch (action) {
      case 'dismiss':
        dismiss(notice.id)
        return
      // A version, never a URL: the host builds the page (P12.9).
      case 'open_release':
        if (notice.detail.version) await run('update_open_release', { version: notice.detail.version })
        setOpen(false)
        dismiss(notice.id)
        return
      case 'pick_monitor':
        setOpen(false)
        await go({ tab: 'settings', inner: 'monitors' })
        dismiss(notice.id)
        return
      case 'move_stage':
        await run('stage_set_monitor', { monitorId: notice.detail.monitorId ?? null })
        dismiss(notice.id)
        return
      case 'stay':
        dismiss(notice.id)
        return
      case 'go_to_control':
        setOpen(false)
        await go({ tab: 'control' })
        dismiss(notice.id)
        return
      // §12.4 / §12.6: every health item's suggestion is a command or a route.
      case 'open_data_folder':
        await run('paths_reveal', { which: 'userData' })
        return
      case 'open_cue_folder':
        await run('paths_reveal', { which: 'cuePack' })
        return
      case 'open_display_settings':
        await run('paths_reveal', { which: 'displaySettings' })
        return
      case 'rebuild_search':
        await run('catalog_rebuild_search')
        dismiss(notice.id)
        return
      case 'open_stage':
        await run('stage_open')
        dismiss(notice.id)
        return
      case 'open_section': {
        // `recipe.<id>.<section>…` → that Game section.
        const at = gameSectionOf(notice.targetPath)
        setOpen(false)
        if (at) await go({ tab: 'games', id: at.recipeId, section: at.section })
        dismiss(notice.id)
        return
      }
      // Screens while playing (spec §12): Stop playing stacks "Are you sure?"
      // in the same notice; only the confirm frame abandons.
      case 'stop_playing':
        pushFrame(notice.id, { title: SCREENS_TAB.stopTitle, body: SCREENS_TAB.stopBody, actions: ['abandon_confirm'] })
        return
      // beta.5: games Load would refuse; tags spelled two ways.
      case 'open_games':
        setOpen(false)
        await go({ tab: 'games' })
        return
      case 'unify_tags': {
        const changed = await run<number>('tags_unify')
        if (changed !== null) toast.success(SHELL.unified(changed))
        dismiss(notice.id)
        return
      }
      // beta.5: the library check. Repair asks first, in the same notice.
      case 'repair_library':
        pushFrame(notice.id, { title: SHELL.repairTitle(notice.detail.count ?? ''), body: SHELL.repairBody, actions: ['repair_confirm'] })
        return
      case 'repair_confirm': {
        const removed = await run<number>('library_repair')
        if (removed !== null) toast.success(SHELL.repaired(removed))
        dismiss(notice.id)
        return
      }
      case 'abandon_confirm':
        await run('abandon')
        dismiss(notice.id)
        setOpen(false)
        await go({ tab: 'screens' })
        return
      default:
        dismiss(notice.id)
    }
  }

  /**
   * Take the operator to where an inline notice actually renders. The notice
   * is not dismissed — it belongs to the field, and the field is what clears
   * it (or, for a health item, the host's next report).
   */
  const goTo = async (notice: OpenNotice) => {
    const path = notice.targetPath ?? ''
    setOpen(false)
    const at = gameSectionOf(path)
    if (at) {
      await go({ tab: 'games', id: at.recipeId, section: at.section })
      return
    }
    if (path.startsWith('stage.') || path.startsWith('stats.')) {
      await go({ tab: 'settings', inner: 'monitors' })
      return
    }
    await go({ tab: 'settings', inner: 'settings' })
  }

  return { act, goTo }
}
