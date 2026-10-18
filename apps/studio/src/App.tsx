import { Profiler, useEffect, useRef, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { Text } from '@/atoms'
import { NoticeCollector, QuitGuard, SidebarNav, StatusBar, TopBar, WhatsNewDialog } from '@/organisms'
import {
  ControlPage,
  FirstRunPage,
  GamePage,
  GamesPage,
  LibraryPage,
  OperatorPage,
  OperatorsPage,
  QuestionPage,
  ScreensPage,
  SettingsPage,
  StatisticsPage,
  type StatsView,
  TeamPage,
  TeamsPage,
} from '@/pages'
import { ShellLayout } from '@/templates'
import { useChromeStore, usePrefs } from '@/chrome/chrome'
import { useRoute, useNavStore, type Route } from '@/chrome/nav'
import { useApplyTheme } from '@/chrome/theme'
import { useNoticeStore } from '@/chrome/notices'
import { APP, SCREENS_TAB } from '@/copy'
import { installDiagnostics, onPageCommit, setDiagnosticRoute } from '@/chrome/diagnostics'
import { HostBridge } from '@/host/bridge'
import { hasHost } from '@/host/host'
import { isPlayOpen, peekPlayState } from '@/host/playState'
import { useCatalogList, useSettings } from '@/host/queries'
import { useUpdateCheckOnStart } from '@/host/updates'
import { useWhatsNewOnStart } from '@/host/whatsNew'

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

/**
 * `?stats` on the URL: the Statistics window (§11.K, 05_STUDIO_DESIGN.md
 * §13.3). Studio's own bundle and tokens, the Statistics page alone — no
 * sidebar, no route stack, nothing that could write. The host refuses a write
 * from this webview regardless (`guard::STATS_COMMANDS`); this is the half
 * that means it never asks.
 */
export function isStatsWindow(): boolean {
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('stats')
}

export function App() {
  // One cache per mount, so a test (or a hot reload) never inherits another's.
  const [queryClient] = useState(makeQueryClient)
  if (!hasHost()) return <NoHost />
  return (
    <QueryClientProvider client={queryClient}>
      <HostBridge />
      {isStatsWindow() ? (
        <StatsWindow />
      ) : (
        <>
          {/* Outside the shell, so first run is covered too (P12.2). */}
          <QuitGuard />
          <Shell />
        </>
      )}
    </QueryClientProvider>
  )
}

/** The Statistics page on its own display, Live by default. */
function StatsWindow() {
  useApplyTheme()
  // Its own view state: this window has no route stack to keep it in.
  const [view, setView] = useState<StatsView>('live')
  return (
    <div className="h-full min-h-0 overflow-hidden" data-stats-window>
      <StatisticsPage view={view} onView={setView} surface="window" />
    </div>
  )
}

function Shell() {
  installDiagnostics()
  // Which page the watchdog would be reporting about, if it fires.

  useApplyTheme()
  const route = useRoute()
  setDiagnosticRoute(JSON.stringify(route))
  const settings = useSettings()
  const operators = useCatalogList('operator', 'all')
  const setOperator = useChromeStore((s) => s.setOperator)
  const setGuard = useNavStore((s) => s.setGuard)
  // First run, latched: see below.
  const inWizard = useRef(false)
  const [wizardDone, setWizardDone] = useState(false)
  const pushNotice = useNoticeStore((s) => s.push)
  const { theme } = usePrefs()
  // "Is there a newer release?" — once per session, never during a game (P12.9).
  useUpdateCheckOnStart()
  // What changed, once after an update and never over a game (P12.10).
  useWhatsNewOnStart()

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

  // First run (§12.1): no operator has ever been created, so the shell is not
  // shown at all. A library with operators but no active one is the top bar's
  // operator menu, not first run.
  //
  // The condition **latches**: the operator step creates and activates a row,
  // which would otherwise flip this false and drop the operator into the shell
  // before the sample and defaults steps ever rendered. The wizard leaves by
  // its own Finish, which is what `onDone` reports.
  const firstRun =
    !wizardDone &&
    (inWizard.current ||
      (settings.data !== undefined &&
        settings.data.globals.active_operator_id === null &&
        operators.data !== undefined &&
        operators.data.length === 0))
  if (firstRun) {
    inWizard.current = true
    return <FirstRunPage onDone={() => setWizardDone(true)} />
  }

  return (
    <ShellLayout
      sidebar={<SidebarNav />}
      top={<TopBar />}
      status={<StatusBar />}
      overlays={
        <>
          <NoticeCollector />
          <WhatsNewDialog />
          <Toaster theme={theme} position="bottom-right" closeButton duration={3500} toastOptions={{ style: { fontFamily: 'var(--font-sans)' } }} />
        </>
      }
    >
      {/* The `Profiler` is how the watchdog counts commits: a page that
        * commits hundreds of times a second is spinning, and nothing else in
        * the app would ever notice. It wraps only the routed page, so the
        * count is the page's own and not the shell's. */}
      {import.meta.env.DEV ? (
        <Profiler id="page" onRender={onPageCommit}>
          <Page route={route} />
        </Profiler>
      ) : (
        // A release build has no watchdog (P12.1): React's production build
        // never calls `onRender`, and the code that would count is compiled out.
        <Page route={route} />
      )}
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
      return <StatisticsPage view={route.view} />
    case 'settings':
      return <SettingsPage inner={route.inner} />
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
