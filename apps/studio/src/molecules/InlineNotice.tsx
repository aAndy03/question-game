import { Alert } from '@heroui/react'
import type { Notice } from '@questiongame/contract'
import { Button, IconButton, Text } from '@/atoms'
import { CONFIRM, noticeAction, noticeTitle } from '@/copy'

export interface ConfirmFrameView {
  readonly title: string
  readonly body: string
  readonly actions: readonly string[]
}

export interface InlineNoticeProps {
  notice: Notice
  /** Stacked confirm frames, innermost last (spec §14). */
  frames?: readonly ConfirmFrameView[] | undefined
  onAction: (action: string) => void
  onDismiss?: (() => void) | undefined
  /** Cancel pops one frame. */
  onCancelFrame?: (() => void) | undefined
  compact?: boolean | undefined
}

const STATUS: Record<Notice['severity'], 'default' | 'accent' | 'success' | 'warning' | 'danger'> = {
  info: 'accent',
  warn: 'warning',
  error: 'danger',
  block: 'danger',
}

/**
 * A notice on its parent: HeroUI `Alert` with at most three actions. Further
 * confirms render inside the same component as frames — nothing opens a new
 * dialog (spec §14).
 */
export function InlineNotice({ notice, frames = [], onAction, onDismiss, onCancelFrame, compact }: InlineNoticeProps) {
  if (notice.actions.length > 3) throw new Error(`notice ${notice.code}: ${notice.actions.length} actions, §14 allows 3`)
  const frame = frames[frames.length - 1]
  const title = frame ? frame.title : noticeTitle(notice.code, notice.detail)
  // The host's `path: reason` — the path routes the notice here, it is not words (beta.4: ids on screen).
  const message = notice.targetPath && notice.detail.message?.startsWith(`${notice.targetPath}: `) ? notice.detail.message.slice(notice.targetPath.length + 2) : notice.detail.message
  const body = frame ? frame.body : message && message !== title ? message : null
  const actions = frame ? frame.actions : notice.actions

  return (
    <Alert status={STATUS[notice.severity]} className={compact ? 'py-2' : ''}>
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>{title}</Alert.Title>
        {body ? <Alert.Description>{body}</Alert.Description> : null}
        {actions.length > 0 || frame ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {actions.map((action, i) => (
              <Button
                key={action}
                size="sm"
                variant={i === 0 ? (notice.severity === 'block' || frame ? 'danger' : 'primary') : 'secondary'}
                onPress={() => onAction(action)}
              >
                {noticeAction(notice.code, action)}
              </Button>
            ))}
            {frame && onCancelFrame ? (
              <Button size="sm" variant="tertiary" onPress={onCancelFrame}>
                {CONFIRM.cancel}
              </Button>
            ) : null}
            {frames.length > 0 ? (
              <Text variant="studio-caption" tone="muted">{`${frames.length + 1}/3`}</Text>
            ) : null}
          </div>
        ) : null}
      </Alert.Content>
      {onDismiss ? <IconButton icon="close" label="Dismiss" size="sm" onPress={onDismiss} hideTooltip /> : null}
    </Alert>
  )
}
