import { Button, Text } from '@/atoms'
import { EmptyState, InlineNotice } from '@/molecules'
import { gameSectionOf, inlineNotices, surfaceOf, useNoticeStore, type OpenNotice } from '@/chrome/notices'
import { CHROME, GAME } from '@/copy'
import { useNoticeActions } from './useNoticeActions'

/**
 * The notices, in the status bar's popover (P21.3; a right-hand sheet until
 * then). A fixed size whatever it holds — a long list scrolls inside it rather
 * than growing over the page — and every notice compact. Findings that render
 * at a field are named under the list with the way there, because they are
 * what turns the health dot amber over an empty list (P11.8).
 */
export function NoticePanel() {
  const notices = useNoticeStore((s) => s.notices)
  const dismiss = useNoticeStore((s) => s.dismiss)
  const popFrame = useNoticeStore((s) => s.popFrame)
  const clear = useNoticeStore((s) => s.clear)
  const { act, goTo } = useNoticeActions()

  const collected = notices.filter((n) => surfaceOf(n) === 'collector')
  const elsewhere = inlineNotices(notices)
  const elsewhereGroups = [...new Map(elsewhere.map((n) => [placeOf(n), n])).entries()]

  return (
    <div className="flex h-[min(26rem,70vh)] w-[min(24rem,90vw)] flex-col" data-notice-panel>
      <div className="flex items-center justify-between gap-2 pb-2">
        <Text as="h2" variant="studio-subheading">
          {CHROME.notices}
        </Text>
        <Button variant="tertiary" size="sm" onPress={clear} isDisabled={collected.length === 0}>
          {CHROME.clearAll}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {collected.length === 0 && elsewhere.length === 0 ? (
          <EmptyState kind="empty" what="notices" compact />
        ) : (
          <div className="flex flex-col gap-2">
            {collected.map((n) => (
              <InlineNotice
                key={n.id}
                notice={n}
                frames={n.frames}
                onAction={(a) => void act(n, a)}
                onDismiss={() => dismiss(n.id)}
                onCancelFrame={() => popFrame(n.id)}
                compact
              />
            ))}
            {elsewhere.length > 0 ? (
              <div className="flex flex-col gap-1 px-1 pt-1" data-notices-elsewhere>
                <Text variant="studio-caption" tone="muted">
                  {CHROME.elsewhere(elsewhere.length)}
                </Text>
                {elsewhereGroups.map(([place, n]) => (
                  <div key={place} className="flex items-center justify-between gap-2">
                    <Text variant="studio-caption" truncate>
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
      </div>
    </div>
  )
}

/** Where an inline notice renders, for the "elsewhere" lines. */
function placeOf(notice: OpenNotice): string {
  const path = notice.targetPath ?? ''
  const exact = CHROME.elsewhereAt[path as keyof typeof CHROME.elsewhereAt]
  if (exact) return exact
  const at = gameSectionOf(path)
  if (at) return CHROME.elsewhereGame(GAME.sections[at.section])
  return path.startsWith('recipe.') ? CHROME.elsewhereAt.recipe : path
}
