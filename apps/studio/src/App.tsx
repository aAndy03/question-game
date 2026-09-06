import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { Text } from '@/atoms'
import { NoticeCollector, SidebarNav, StatusBar, TopBar } from '@/organisms'
import {
  ControlPage,
  GamePage,
  GamesPage,
  LibraryPage,
  OperatorPage,
  OperatorsPage,
  QuestionPage,
  ScreensPage,
  SettingsPage,
  StatisticsPage,
  TeamPage,
  TeamsPage,
} from '@/pages'
import { ShellLayout } from '@/templates'
import { useChromeStore, usePrefs } from '@/chrome/chrome'
import { useRoute, useNavStore, type Route } from '@/chrome/nav'
import { useApplyTheme } from '@/chrome/theme'
import { useNoticeStore } from '@/chrome/notices'
import { APP, SCREENS_TAB } from '@/copy'
import { HostBridge } from '@/host/bridge'
import { hasHost } from '@/host/host'
import { isPlayOpen, peekPlayState } from '@/host/playState'
import { useSettings } from '@/host/queries'

/**
 * The Studio shell (P7): providers, the shell layout, and the page switch.
 *
 * Nothing here holds Play state. What the pages draw comes from TanStack
 * Query (catalog, recipes, settings — invalidated by host events) and from
 * the `play-state` store; the chrome stores hold only chrome.
 */

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
    },
  })
}

export function App() {
  // One cache per mount, so a test (or a hot reload) never inherits another's.
  const [queryClient] = useState(makeQueryClient)
  if (!hasHost()) return <NoHost />
  return (
    <QueryClientProvider client={queryClient}>
      <HostBridge />
      <Shell />
    </QueryClientProvider>
  )
}

function Shell() {
  useApplyTheme()
  const route = useRoute()
  const settings = useSettings()
  const setOperator = useChromeStore((s) => s.setOperator)
  const setGuard = useNavStore((s) => s.setGuard)
  const pushNotice = useNoticeStore((s) => s.push)
  const { theme } = usePrefs()

  // Chrome preferences follow the active operator (host truth).
  useEffect(() => {
    setOperator(settings.data?.globals.active_operator_id ?? null)
  }, [settings.data?.globals.active_operator_id, setOperator])

  // Screens is blocked while a Play is open (spec §12). The route stays typed;
  // the notice offers the two actions and nothing else.
  useEffect(() => {
    const screensGuard = (to: Route) => {
      if (to.tab !== 'screens' || !isPlayOpen(peekPlayState())) return true
      pushNotice({
        code: 'screens.blocked',
        severity: 'warn',
        targetPath: null,
        actions: ['go_to_control', 'stop_playing'],
        detail: { message: SCREENS_TAB.blocked },
      })
      return false
    }
    // A dirty editor replaces this guard while it is mounted and restores
    // nothing; re-registering on each route keeps the Screens rule in force.
    setGuard(screensGuard)
    return () => setGuard(null)
  }, [route, setGuard, pushNotice])

  return (
    <ShellLayout
      sidebar={<SidebarNav />}
      top={<TopBar />}
      status={<StatusBar />}
      overlays={
        <>
          <NoticeCollector />
          <Toaster theme={theme} position="bottom-right" closeButton duration={3500} toastOptions={{ style: { fontFamily: 'var(--font-sans)' } }} />
        </>
      }
    >
      <Page route={route} />
    </ShellLayout>
  )
}

function Page({ route }: { route: Route }) {
  switch (route.tab) {
    case 'teams':
      if ('mode' in route) {
        if (route.mode === 'new') return <TeamPage id={null} mode="new" />
        if (route.mode === 'edit') return <TeamPage id={route.id} mode="edit" />
        return <TeamsPage currentId={route.id} />
      }
      return <TeamsPage />
    case 'library':
      if ('questionId' in route) {
        if (route.mode === 'view') return <LibraryPage domainId={route.domainId ?? null} currentId={route.questionId} />
        return <QuestionPage id={route.questionId} mode={route.mode} domainId={route.domainId} />
      }
      if ('mode' in route) return <QuestionPage id={null} mode="new" domainId={route.domainId} />
      return <LibraryPage domainId={route.domainId ?? null} />
    case 'games':
      return 'id' in route ? <GamePage id={route.id} section={route.section} /> : <GamesPage />
    case 'operators':
      if ('mode' in route) {
        if (route.mode === 'new') return <OperatorPage id={null} mode="new" />
        if (route.mode === 'edit') return <OperatorPage id={route.id} mode="edit" />
        return <OperatorsPage currentId={route.id} />
      }
      return <OperatorsPage />
    case 'control':
      return <ControlPage />
    case 'screens':
      return <ScreensPage />
    case 'statistics':
      return <StatisticsPage />
    case 'settings':
      return <SettingsPage />
  }
}

function NoHost() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6" style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
      <Text as="h1" variant="studio-title">
        {`${APP.name} ${APP.studio}`}
      </Text>
      <Text as="p" variant="studio-body" tone="muted">
        {APP.noHost}
      </Text>
      <Text as="p" variant="studio-caption" tone="muted">
        {APP.noHostBody}
      </Text>
    </div>
  )
}
