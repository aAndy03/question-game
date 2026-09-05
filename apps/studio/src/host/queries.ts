/**
 * TanStack Query over the catalog read seam.
 *
 * Keys mirror the §13 verbs and nothing else: `catalog_*`, `recipe_*`,
 * `settings_get`, `monitors_list`, `play_list`, `play_events`. **No key names a
 * Play's live state** — `play-state` is `playState.ts`, and a test asserts the
 * word `play-state` never appears in a key.
 *
 * Nothing here refetches on a timer or after a write. `bridge.tsx` invalidates
 * on `catalog-changed` / `recipe-changed`, so a rename lands on every surface
 * because the host said so, not because a component remembered to refetch.
 */

import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { MonitorInfo } from '@questiongame/contract'
import { command, hasHost } from './host'
import type {
  ArchiveScope,
  CatalogItem,
  ItemOf,
  LibraryKind,
  PlayEvent,
  PlayRecord,
  Recipe,
  SearchHit,
  SearchQuery,
  SettingsView,
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
  plays: {
    list: (recipeId: string | null) => ['plays', 'list', recipeId] as const,
    events: (playId: string) => ['plays', 'events', playId] as const,
  },
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
  if (kind === 'recipe') {
    void client.invalidateQueries({ queryKey: keys.recipes.all })
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
