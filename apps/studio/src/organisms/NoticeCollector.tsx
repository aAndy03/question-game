import { AlertDialog, Drawer } from '@heroui/react'
import { Button, Text } from '@/atoms'
import { EmptyState, InlineNotice } from '@/molecules'
import { inlineNotices, surfaceOf, useNoticeStore, type OpenNotice } from '@/chrome/notices'
import { useNavStore } from '@/chrome/nav'
import { CHROME, CONFIRM, SCREENS_TAB, noticeAction, noticeTitle } from '@/copy'
import { useHostCommand } from '@/host/commands'

/**
 * The collector float (a right-hand `Drawer`) and the destructive dialog for
 * `block` notices (spec §14). Both run the same action table, so an action
 * behaves the same wherever the notice showed.
 */
export function NoticeCollector() {
  const notices = useNoticeStore((s) => s.notices)
  const open = useNoticeStore((s) => s.collectorOpen)
  const setOpen = useNoticeStore((s) => s.setCollectorOpen)
  const dismiss = useNoticeStore((s) => s.dismiss)
  const popFrame = useNoticeStore((s) => s.popFrame)
  const pushFrame = useNoticeStore((s) => s.pushFrame)
  const clear = useNoticeStore((s) => s.clear)
  const go = useNavStore((s) => s.go)
  const run = useHostCommand()

  const act = async (notice: OpenNotice, action: string) => {
    switch (action) {
      case 'dismiss':
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
        // `recipe.<id>.roster` / `recipe.<id>.board` → that Game section.
        const match = /^recipe\.([^.]+)\.(roster|board)$/.exec(notice.targetPath ?? '')
        setOpen(false)
        if (match?.[1] && (match[2] === 'roster' || match[2] === 'board')) await go({ tab: 'games', id: match[1], section: match[2] })
        dismiss(notice.id)
        return
      }
      // Screens while playing (spec §12): Stop playing stacks "Are you sure?"
      // in the same notice; only the confirm frame abandons.
      case 'stop_playing':
        pushFrame(notice.id, { title: SCREENS_TAB.stopTitle, body: SCREENS_TAB.stopBody, actions: ['abandon_confirm'] })
        return
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
    const section = /^recipe\.([^.]+)\.(roster|board)$/.exec(path)
    if (section?.[1] && (section[2] === 'roster' || section[2] === 'board')) {
      await go({ tab: 'games', id: section[1], section: section[2] })
      return
    }
    if (path.startsWith('stage.') || path.startsWith('stats.')) {
      await go({ tab: 'settings', inner: 'monitors' })
      return
    }
    await go({ tab: 'settings', inner: 'settings' })
  }

  const collected = notices.filter((n) => surfaceOf(n) === 'collector')
  const blocking = notices.find((n) => surfaceOf(n) === 'dialog') ?? null
  // Findings that render at a field. They are the reason the status dot can be
  // amber over an empty collector, so the collector names them and offers the
  // way there (P11.8).
  const elsewhere = inlineNotices(notices)
  const elsewhereGroups = [...new Map(elsewhere.map((n) => [placeOf(n), n])).entries()]

  // Neither overlay has a `<Drawer>` / `<AlertDialog>` root: a root exists to
  // wire a trigger, and a controlled overlay has none — it then mounts a
  // PressResponder with no pressable child and warns on every render. HeroUI
  // v3's controlled examples start at `.Backdrop` (docs: drawer and
  // alert-dialog, "Controlled State").
  return (
    <>
      <Drawer.Backdrop isOpen={open} onOpenChange={setOpen}>
        <Drawer.Content placement="right" className="w-[26rem] max-w-[90vw]">
          <Drawer.Dialog aria-label={CHROME.notices}>
            <Drawer.CloseTrigger />
            <Drawer.Header>
              <Drawer.Heading>{CHROME.notices}</Drawer.Heading>
            </Drawer.Header>
            <Drawer.Body>
              {collected.length === 0 && elsewhere.length === 0 ? (
                <EmptyState kind="empty" what="notices" compact />
              ) : (
                <div className="flex flex-col gap-3">
                  {collected.map((n) => (
                    <InlineNotice
                      key={n.id}
                      notice={n}
                      frames={n.frames}
                      onAction={(a) => void act(n, a)}
                      onDismiss={() => dismiss(n.id)}
                      onCancelFrame={() => popFrame(n.id)}
                    />
                  ))}
                  {elsewhere.length > 0 ? (
                    <div
                      className="flex flex-col gap-2 rounded-[var(--radius)] border border-[var(--border)] p-3"
                      data-notices-elsewhere
                    >
                      <Text variant="studio-label" tone="muted">
                        {CHROME.elsewhere(elsewhere.length)}
                      </Text>
                      {elsewhereGroups.map(([place, n]) => (
                        <div key={place} className="flex items-center justify-between gap-2">
                          <Text variant="studio-caption" tone="muted" truncate>
                            {place}
                          </Text>
                          <Button size="sm" variant="tertiary" onPress={() => void goTo(n)}>
                            {CHROME.elsewhereGo}
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
            </Drawer.Body>
            <Drawer.Footer>
              <Button variant="tertiary" size="sm" onPress={clear} isDisabled={collected.length === 0}>
                {CONFIRM.cancel === 'Cancel' ? 'Clear all' : 'Clear all'}
              </Button>
            </Drawer.Footer>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>

      {blocking ? (
        <AlertDialog.Backdrop isOpen onOpenChange={() => {}} isDismissable={false} isKeyboardDismissDisabled>
          <AlertDialog.Container size="sm">
            <AlertDialog.Dialog>
              <AlertDialog.Header>
                <AlertDialog.Icon status="danger" />
                <AlertDialog.Heading>
                  {blocking.frames.length > 0
                    ? blocking.frames[blocking.frames.length - 1]?.title
                    : noticeTitle(blocking.code, blocking.detail)}
                </AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <Text variant="studio-body" tone="muted">
                  {blocking.frames.length > 0
                    ? blocking.frames[blocking.frames.length - 1]?.body
                    : (blocking.detail.message ?? '')}
                </Text>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                {blocking.frames.length > 0 ? (
                  <Button variant="tertiary" onPress={() => popFrame(blocking.id)}>
                    {CONFIRM.cancel}
                  </Button>
                ) : (
                  <Button variant="tertiary" onPress={() => dismiss(blocking.id)}>
                    {noticeAction(blocking.code, 'dismiss')}
                  </Button>
                )}
                {(blocking.frames.length > 0
                  ? (blocking.frames[blocking.frames.length - 1]?.actions ?? [])
                  : blocking.actions
                ).map((a, i) => (
                  <Button key={a} variant={i === 0 ? 'danger' : 'secondary'} onPress={() => void act(blocking, a)}>
                    {noticeAction(blocking.code, a)}
                  </Button>
                ))}
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      
      ) : null}
    </>
  )
}

/** Where an inline notice renders, for the collector's "elsewhere" line. */
function placeOf(notice: OpenNotice): string {
  const path = notice.targetPath ?? ''
  const exact = CHROME.elsewhereAt[path as keyof typeof CHROME.elsewhereAt]
  if (exact) return exact
  return path.startsWith('recipe.') ? CHROME.elsewhereAt.recipe : path
}
