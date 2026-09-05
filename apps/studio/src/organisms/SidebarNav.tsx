import { motion } from 'motion/react'
import { IconButton, Separator, Text, type IconName } from '@/atoms'
import { SidebarItem } from '@/molecules'
import { useChromeStore, usePrefs, type SidebarMode } from '@/chrome/chrome'
import { useNavStore, useRoute, type Tab } from '@/chrome/nav'
import { APP, CHROME, TABS } from '@/copy'
import { usePlayState } from '@/host/playState'

export const SIDEBAR_WIDTH: Record<SidebarMode, number> = { expanded: 240, rail: 56, hidden: 0 }

const LIBRARY: readonly { tab: Tab; icon: IconName }[] = [
  { tab: 'teams', icon: 'teams' },
  { tab: 'library', icon: 'library' },
  { tab: 'games', icon: 'games' },
  { tab: 'operators', icon: 'operators' },
]
const SHOW: readonly { tab: Tab; icon: IconName }[] = [
  { tab: 'control', icon: 'control' },
  { tab: 'screens', icon: 'screens' },
  { tab: 'statistics', icon: 'statistics' },
]

/**
 * Three states — expanded, icon rail, hidden with a left-edge peek strip
 * (spec §11.I). Width animates with Motion; nothing here is Play truth
 * except the Control badge, which reads `play-state` to say a show is on.
 */
export function SidebarNav() {
  const { sidebar } = usePrefs()
  const peeking = useChromeStore((s) => s.peeking)
  const setPeeking = useChromeStore((s) => s.setPeeking)
  const cycle = useChromeStore((s) => s.cycleSidebar)
  const route = useRoute()
  const go = useNavStore((s) => s.go)
  const play = usePlayState()

  const mode: SidebarMode = sidebar === 'hidden' && peeking ? 'expanded' : sidebar
  const collapsed = mode === 'rail'
  const width = SIDEBAR_WIDTH[mode]
  const playing = play?.status === 'playing' || play?.status === 'paused'

  const item = ({ tab, icon }: { tab: Tab; icon: IconName }) => (
    <SidebarItem
      key={tab}
      icon={icon}
      label={TABS[tab].label}
      hint={TABS[tab].hint}
      isActive={route.tab === tab}
      collapsed={collapsed}
      badge={tab === 'control' && playing ? '●' : undefined}
      onPress={() => void go({ tab } as never)}
    />
  )

  return (
    <>
      {sidebar === 'hidden' ? (
        <div
          aria-hidden
          onMouseEnter={() => setPeeking(true)}
          className="absolute inset-y-0 left-0 z-20 w-2 cursor-e-resize"
          style={{ background: 'linear-gradient(to right, var(--separator), transparent)' }}
        />
      ) : null}
      <motion.nav
        aria-label="Sections"
        initial={false}
        animate={{ width }}
        transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
        onMouseLeave={() => sidebar === 'hidden' && setPeeking(false)}
        className={[
          'relative z-10 flex h-full shrink-0 flex-col overflow-hidden border-r border-[var(--border)]',
          sidebar === 'hidden' && peeking ? 'absolute inset-y-0 left-0 shadow-lg' : '',
        ].join(' ')}
        style={{ background: 'var(--surface)' }}
      >
        <div className={['flex h-12 items-center', collapsed ? 'justify-center' : 'justify-between px-3'].join(' ')}>
          {collapsed ? null : (
            <Text variant="studio-label" tone="default" className="px-1.5">
              {APP.name}
            </Text>
          )}
          <IconButton
            icon={mode === 'expanded' ? 'sidebarExpanded' : 'sidebarRail'}
            label={mode === 'expanded' ? CHROME.sidebarCollapse : mode === 'rail' ? CHROME.sidebarHide : CHROME.sidebarShow}
            size="sm"
            onPress={cycle}
          />
        </div>
        <Separator />
        <div className={['flex flex-1 flex-col gap-0.5 overflow-y-auto py-2', collapsed ? 'px-2' : 'px-2'].join(' ')}>
          {collapsed ? null : (
            <Text variant="studio-caption" tone="muted" className="px-2.5 pb-1 pt-2">
              Library
            </Text>
          )}
          {LIBRARY.map(item)}
          {collapsed ? <Separator className="my-2" /> : (
            <Text variant="studio-caption" tone="muted" className="px-2.5 pb-1 pt-4">
              Show
            </Text>
          )}
          {SHOW.map(item)}
        </div>
        <Separator />
        <div className="px-2 py-2">{item({ tab: 'settings', icon: 'settings' })}</div>
      </motion.nav>
    </>
  )
}
