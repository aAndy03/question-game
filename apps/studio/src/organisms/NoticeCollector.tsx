import { AlertDialog } from '@heroui/react'
import { Button, Text } from '@/atoms'
import { surfaceOf, useNoticeStore, noticeText } from '@/chrome/notices'
import { CONFIRM, noticeAction, noticeTitle } from '@/copy'
import { useNoticeActions } from './useNoticeActions'

/**
 * The destructive dialog for `block` notices (spec §14). The other notices
 * live in the status bar's popover (`NoticePanel`, P21.3); both run
 * `useNoticeActions`, so an action behaves the same wherever it was pressed.
 */
export function NoticeCollector() {
  const notices = useNoticeStore((s) => s.notices)
  const dismiss = useNoticeStore((s) => s.dismiss)
  const popFrame = useNoticeStore((s) => s.popFrame)
  const { act } = useNoticeActions()
  const blocking = notices.find((n) => surfaceOf(n) === 'dialog') ?? null

  // No `<AlertDialog>` root: a root exists to wire a trigger, and a controlled
  // overlay has none — it then mounts a PressResponder with no pressable child
  // and warns on every render. HeroUI v3's controlled examples start at
  // `.Backdrop` (docs: alert-dialog, "Controlled State").
  return (
    <>
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
                    : (noticeText(blocking) ?? '')}
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
