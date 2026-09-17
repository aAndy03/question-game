/**
 * TanStack Query over the catalog read seam.
 *
 * Keys mirror the §13 verbs and nothing else: `catalog_*`, `recipe_*`,
 * `settings_get`, `monitors_list`, `play_list`, `play_events`, `paths_get`,
 * `catalog_seed_status`, `stats_query`, and `catalog_import_questions` as a
 * preview that writes nothing. **No key names a Play's live state** — `play-state`
 * is `playState.ts`, and a test asserts the word `play-state` never appears in
 * a key. (`plays` is the closed-Play *history*, `play_list`, which is a
 * catalog-shaped read: it changes on a host event, never on a tick.)
 *
 * Nothing here refetches on a timer or after a write. `bridge.tsx` invalidates
 * on `catalog-changed` / `recipe-changed`, so a rename lands on every surface
 * because the host said so, not because a component remembered to refetch.
 */

import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { MonitorInfo } from '@questiongame/contract'
import { command, hasHost } from './host'
import type {
  AppInfo,
  AppPaths,
  ArchiveScope,
  CatalogItem,
  ImportReport,
  ItemOf,
  LibraryKind,
  PlayEvent,
  PlayRecord,
  Recipe,
  RulesPreview,
  SearchHit,
  SearchQuery,
  SeedDemo,
  SeedStatus,
  SettingsView,
  StatsQuery,
  StatsResult,
} from './types'

export const keys = {
  catalog: {
    all: ['catalog'] as const,
    kind: (kind: LibraryKind) => ['catalog', kind] as const,
    list: (kind: LibraryKind, scope: ArchiveScope) => ['catalog', kind, 'list', scope] as const,
    item: (kind: LibraryKind, id: string) => ['catalog', kind, 'item', id] as const,
    referencedBy: (kind: LibraryKind, id: string) => ['catalog', kind, 'refs', id] as const,
  },
  search: (query: SearchQuery) => ['search', query] as const,
  recipes: {
    all: ['recipes'] as const,
    list: (scope: ArchiveScope) => ['recipes', 'list', scope] as const,
    item: (id: string) => ['recipes', 'item', id] as const,
  },
  settings: ['settings'] as const,
  monitors: ['monitors'] as const,
  /** `paths_get` — fixed for the life of the process. */
  paths: ['paths'] as const,
  appInfo: ['appInfo'] as const,
  /** `catalog_seed_status`, per Demo — invalidated by every catalog/recipe change. */
  seedStatus: {
    all: ['seed-status'] as const,
    of: (demo: SeedDemo) => ['seed-status', demo] as const,
  },
  /**
   * `catalog_import_questions { commit: false }` — the import dialog's preview.
   * Keyed on the text itself, so a paste that has not changed is not planned
   * again.
   */
  importPreview: (text: string, defaultDomainId: string | null) => ['import-preview', text, defaultDomainId] as const,
  plays: {
    list: (recipeId: string | null) => ['plays', 'list', recipeId] as const,
    events: (playId: string) => ['plays', 'events', playId] as const,
  },
  /**
   * `stats_query` (§11.K). The query document *is* the key, plus a liveness
   * token — the open Play's event count for the Live view, `null` for All
   * data. That is the Timeline's trick (§10.3): a Play that grew refetches,
   * a countdown that ticked does not. The Play is still not cached here —
   * what is cached is an answer about a log, keyed by how long that log was.
   */
  stats: (query: StatsQuery, liveness: number | null) => ['stats', query, liveness] as const,
  /**
   * The Rules preview (P11.12), keyed on the recipe and its `rev`. A settings
   * write bumps the rev, so the explanation refetches with the thing it
   * explains and never lags a keystroke behind it.
   */
  rulesPreview: (recipeId: string | null, rev: number | null) =>
    ['rulesPreview', recipeId, rev] as const,
} as const

const enabled = () => hasHost()

export function useCatalogList<K extends LibraryKind>(kind: K, scope: ArchiveScope) {
  return useQuery({
    queryKey: keys.catalog.list(kind, scope),
    queryFn: async () => {
      const items = await command<CatalogItem[]>('catalog_list', { kind, scope })
      return items.map((row) => row.item as ItemOf<K>)
    },
    enabled: enabled(),
  })
}

export function useCatalogItem<K extends LibraryKind>(kind: K, id: string | null) {
  return useQuery({
    queryKey: keys.catalog.item(kind, id ?? ''),
    queryFn: async () => {
      const row = await command<CatalogItem>('catalog_get', { kind, id })
      return row.item as ItemOf<K>
    },
    enabled: enabled() && id !== null,
  })
}

/** What still points at a row — shown before an archive (§4.1). */
export function useReferencedBy(kind: LibraryKind, id: string | null) {
  return useQuery({
    queryKey: keys.catalog.referencedBy(kind, id ?? ''),
    queryFn: () => command<string | null>('referenced_by', { kind, id }),
    enabled: enabled() && id !== null,
    staleTime: 0,
  })
}

export function useSearch(query: SearchQuery | null) {
  return useQuery({
    queryKey: keys.search(query ?? { text: '', kinds: [], scope: 'active', limit: 0 }),
    queryFn: () => command<SearchHit[]>('catalog_search', { query }),
    enabled: enabled() && query !== null && query.text.trim().length > 0,
    placeholderData: (previous) => previous,
  })
}

export function useRecipeList(scope: ArchiveScope) {
  return useQuery({
    queryKey: keys.recipes.list(scope),
    queryFn: () => command<Recipe[]>('recipe_list', { scope }),
    enabled: enabled(),
  })
}

export function useRecipe(id: string | null) {
  return useQuery({
    queryKey: keys.recipes.item(id ?? ''),
    queryFn: () => command<Recipe>('recipe_get', { id }),
    enabled: enabled() && id !== null,
  })
}

export function useSettings() {
  return useQuery({
    queryKey: keys.settings,
    queryFn: () => command<SettingsView>('settings_get'),
    enabled: enabled(),
  })
}

export function useMonitors() {
  return useQuery({
    queryKey: keys.monitors,
    queryFn: () => command<MonitorInfo[]>('monitors_list'),
    enabled: enabled(),
  })
}

export function usePlayList(recipeId: string | null) {
  return useQuery({
    queryKey: keys.plays.list(recipeId),
    queryFn: () => command<PlayRecord[]>('play_list', { recipeId }),
    enabled: enabled(),
  })
}

/** Every closed Play — what Wipe Plays' confirm counts (§12.3). */
export function usePlays() {
  return usePlayList(null)
}

/** What this build is (Settings ▸ About, P12.3). It never changes while the app runs. */
export function useAppInfo() {
  return useQuery({
    queryKey: keys.appInfo,
    queryFn: () => command<AppInfo>('app_info'),
    enabled: enabled(),
    staleTime: Infinity,
  })
}

/** Where the generated files live (§12.1, §12.3). */
export function usePaths() {
  return useQuery({
    queryKey: keys.paths,
    queryFn: () => command<AppPaths>('paths_get'),
    enabled: enabled(),
    staleTime: Infinity,
  })
}

/** One Demo's seed rows present / missing / edited — its Restore confirm (§12.1, §17.5). */
export function useSeedStatus(demo: SeedDemo = 'en') {
  return useQuery({
    queryKey: keys.seedStatus.of(demo),
    queryFn: () => command<SeedStatus>('catalog_seed_status', { demo }),
    enabled: enabled(),
  })
}

/**
 * The import dialog's preview (§2.32): the host plans the file and writes
 * nothing. A refusal — not JSON, not this format, too long — is this query's
 * error and the dialog shows it; it is never a notice, because the operator is
 * mid-paste, not being told off.
 */
export function useImportPreview(text: string, defaultDomainId: string | null) {
  return useQuery({
    queryKey: keys.importPreview(text, defaultDomainId),
    queryFn: () => command<ImportReport>('catalog_import_questions', { text, commit: false, defaultDomainId }),
    enabled: enabled() && text.trim().length > 0,
    retry: false,
    placeholderData: (previous) => previous,
  })
}

/**
 * One `stats_query`. Read-only by construction: Statistics has no write verb
 * to call (§11.K), and this hook is the only door it needs.
 */
export function useStats(query: StatsQuery, liveness: number | null = null, isEnabled = true) {
  return useQuery({
    queryKey: keys.stats(query, liveness),
    queryFn: () => command<StatsResult>('stats_query', { query }),
    // An empty `playIds` means *every* Play to the host, so a Live view with
    // no Play must not ask at all — it would read the whole history to draw
    // an empty state.
    enabled: enabled() && isEnabled,
    // A previous answer stays on screen while the next one loads, so the
    // Live table does not blink on every resolved turn.
    placeholderData: (previous) => previous,
  })
}

/**
 * `rules_preview` — what these rules would pay (P11.12).
 *
 * Keyed on the recipe *and its rev*, so it refetches on the settings write it
 * is explaining without a subscription of its own: `recipe-changed` bumps the
 * rev, `bridge.tsx` invalidates the recipe, and the new rev is a new key. A
 * `null` id previews the all-games defaults, which have no rev — the settings
 * document has no event either, so the write path invalidates it by hand.
 */
export function useRulesPreview(recipeId: string | null, rev: number | null = null) {
  return useQuery({
    queryKey: keys.rulesPreview(recipeId, rev),
    queryFn: () => command<RulesPreview>('rules_preview', { recipeId }),
    enabled: enabled(),
    // The panel sits beside the form it explains; blanking it on every
    // keystroke would make the numbers harder to read, not easier.
    placeholderData: (previous) => previous,
  })
}

export function usePlayEvents(playId: string | null) {
  return useQuery({
    queryKey: keys.plays.events(playId ?? ''),
    queryFn: () => command<PlayEvent[]>('play_events', { playId }),
    enabled: enabled() && playId !== null,
  })
}

/** The bridge's half: which keys a host event touches. */
export function invalidateForCatalogChange(
  client: QueryClient,
  kind: string,
  id: string,
): void {
  void client.invalidateQueries({ queryKey: keys.seedStatus.all })
  if (kind === 'recipe') {
    void client.invalidateQueries({ queryKey: keys.recipes.all })
    // `wipe_plays` reports through this event too (§12.3).
    void client.invalidateQueries({ queryKey: ['plays', 'list'] })
    return
  }
  void client.invalidateQueries({ queryKey: keys.catalog.kind(kind as LibraryKind) })
  void client.invalidateQueries({ queryKey: ['search'] })
  // A domain's membership names questions; a question edit changes what a
  // domain lists. Both are one library tab (§12), so keep them in step.
  if (kind === 'question') void client.invalidateQueries({ queryKey: keys.catalog.kind('domain') })
  if (kind === 'operator') void client.invalidateQueries({ queryKey: keys.settings })
  void id
}

export function invalidateForRecipeChange(client: QueryClient, id: string): void {
  void client.invalidateQueries({ queryKey: keys.seedStatus.all })
  void client.invalidateQueries({ queryKey: keys.recipes.list('active') })
  void client.invalidateQueries({ queryKey: keys.recipes.list('archived') })
  void client.invalidateQueries({ queryKey: keys.recipes.list('all') })
  void client.invalidateQueries({ queryKey: keys.recipes.item(id) })
  void client.invalidateQueries({ queryKey: keys.settings })
}

export function invalidateSettings(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: keys.settings })
}

export { useQueryClient }
