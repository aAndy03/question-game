# Studio design — the operator app's component system

Status: **accepted and built, P7, 2026-09-06.** Binding for everything rendered
in the `main` webview. The Stage counterpart is
`../questiongame Design System/readme.md`; this file never applies to Stage.
§9 records where the build departed from the proposal.

Precedence: `optimized_first_spec.md` (rules) → `01_codebase-design-spec-v1.md`
(module shape) → `03_CONTEXT.md` (names) → **this file** (how Studio looks and
which component does what) → `04_ROADMAP.md` (when).

---

## 1. What Studio is, in one paragraph

Studio is a desktop control room. One operator, one keyboard, long sessions,
often in a dim studio. It is used *before* a show (building libraries and a
recipe) and *during* one (Control). Every surface projects host truth; the
frontend decides nothing about the game. So the design has two jobs: make a
large amount of library work quick and legible, and make the state of the host
impossible to misread. It must never look like a demo. It looks like HeroUI's
own site: quiet surfaces, one accent, semantic colour only where it carries
meaning, generous but not loose spacing, and the same header, toolbar, list,
editor and notice on every tab.

## 2. Visual foundation

### 2.1 Tokens

`packages/design-studio/globals.css` (HeroUI's theme as shipped) plus
`tokens/theme.css` (the layer HeroUI leaves implicit). **Do not fork the
palette.** Studio is the HeroUI look on purpose (§2.30); everything below is
expressed in those variables and Tailwind utilities that resolve to them.

| Meaning | Token | Used for |
| --- | --- | --- |
| Action, selection, current | `--accent` | primary button, selected row, active sidebar item, focus ring, "current" indicators |
| Good, live, correct | `--success` | `playing` status dot, correct option mark, health ok |
| Attention, provisional, frozen | `--warning` | `archived` chip, dirty indicator, frozen-setting hint, `paused` |
| Destructive, wrong, broken | `--danger` | archive/abandon buttons, incorrect option mark, error notices, broken asset |
| Metadata | `--muted` | ids, timestamps, counts, descriptions, disabled reasons |
| Structure | `--surface`, `--surface-secondary`, `--surface-tertiary`, `--border`, `--separator` | panels, rows, dividers |

**Fields on panels.** HeroUI's shipped dark theme gives a field the same
colour as a surface, so an unfocused input on a `Panel` vanished. `studio.css`
sets `--field-border: var(--border)`, `--field-border-width: 1px` and a dark
`--field-background` one step lighter than the surface. That is the only
departure from the shipped theme.

**Decision on the roadmap's open question ("Studio theme reconciliation"):**
Studio does **not** borrow Stage's mint and coral. The two surfaces agree on
*meaning* (green is correct, red is wrong) and each keeps its own hue. Borrowing
Stage values would break the "HeroUI as shipped" rule for two colours and gain
nothing an operator can act on.

### 2.2 Theme

Light and dark are both first-class (HeroUI ships both; `.dark` on the root
element). Default follows the OS; the operator can pin light or dark in the
top bar and the choice is chrome state persisted per operator. Every custom
component is written against the semantic variables so it never needs a
`dark:` branch of its own.

### 2.3 Type

`--font-sans` is Geist, self-hosted from `@fontsource-variable/geist`
(offline-first; the app must not fetch a font). The `Text` module (§2.29) gains Studio variants:

| Variant | Role |
| --- | --- |
| `studio-display` | one large figure on a card (score, count) |
| `studio-title` | page title |
| `studio-heading` | section title inside a page or card |
| `studio-body` | default text |
| `studio-label` | form labels, table headers, sidebar items |
| `studio-caption` | metadata, timestamps, ids |
| `studio-mono` | ids, codes, chords, durations in ms |

`transition="swap"` / `"count"` are implemented by Calligraph (Motion) in the
Studio `Text` atom. They are used **only** on text whose change deserves to be
seen (a score in the status bar, the play status pill). Everything else is
`none`.

### 2.4 Space, radius, elevation

Spacing is Tailwind's 4px grid via `--spacing`. Named rhythm, used everywhere:

| Name | Value | Where |
| --- | --- | --- |
| page padding | 24px | content area inset |
| section gap | 24px | between page sections |
| card padding | 16px | inside a `Panel` |
| control gap | 8px | between controls in a toolbar |
| row height | 40px table · 64px grid card min | `RecordRow` |
| sidebar | 240px expanded · 56px rail · 0 hidden (8px peek strip) | `SidebarNav` |
| top bar | 48px | `TopBar` |
| status bar | 28px | `StatusBar` |

Radius is HeroUI's `--radius` (0.75rem) on cards and fields, `--radius`/2 on
chips and small controls — never a literal. Elevation: no drop shadows on
panels; only overlays (popover, modal, drawer) float, using HeroUI's own
overlay styling.

### 2.5 Icons

One set: **Gravity UI via the Iconify JSON** (`@iconify-json/gravity-ui`,
bundled offline, no icon runtime). A curated `ICONS` map in `atoms/icons.ts`
names every icon the app uses (`ICONS.teams`, `ICONS.archive`, `ICONS.grid` …)
so two screens can never pick two different icons for one meaning;
`npm run studio:icons` generates the SVG bodies for exactly those keys. No
second icon set is in use. Sizes: `sm` 16, `md` 20, `lg` 24.

### 2.6 Motion

`motion/react` only, and only for chrome: sidebar width, page enter (opacity
+ 4px rise, 140ms, `--ease-standard`), row layout shifts when a list filters,
notice stack frames. Nothing whose truth lives in `play-state` is animated by
Motion; the play status pill and status-bar score use `Text transition` and
nothing else.

## 3. Architecture of the webview

```text
apps/studio/src/
  host/        the seam. host.ts (command/on, injectable transport for tests)
               queries.ts (TanStack Query keys + hooks over catalog_*/recipe_*/settings)
               playState.ts (play-state external store; never a Query)
               bridge.tsx (one subscriber: events → invalidations / stores)
  chrome/      Zustand stores: nav, chrome (sidebar, theme, view prefs), notices
  copy/        every operator-facing string, by area
  atoms/ molecules/ organisms/ templates/ pages/
  App.tsx      providers + ShellLayout + page switch
```

### 3.1 Truth and caches

- **TanStack Query** holds catalog and recipe reads. Key factory in
  `host/queries.ts`; a test asserts no key mentions `play`. Invalidation is
  event-driven: `catalog-changed { kind, id }` invalidates that kind's lists and
  that id; `recipe-changed { id }` invalidates recipes. No manual refetch after
  a write anywhere — the bridge does it. This is the exit criterion "renaming a
  team updates every surface".
- **`play-state`** is a `useSyncExternalStore` store fed by the event, exactly
  as Stage does it. Read by organisms and pages only.
- **Zustand** holds chrome: `nav` (route + back/forward stack), `chrome`
  (sidebar mode, theme, grid|table per tab, settings inner tab, collector open),
  `notices` (open notices and their confirm frames). The chrome store is
  persisted to `localStorage` under a key that includes the active operator id.
  A test greps every store's state shape for score/ring/session/timer keys.
- **Active operator** is host truth: a new global setting
  `active_operator_id` (`GlobalSetting::ActiveOperatorId`), validated in the
  Tauri command against the catalog (exists, not archived). Pin gating stays
  P10; P7 switches freely.

### 3.2 Navigation

An in-memory typed route stack in the `nav` store, not a URL router: a single
desktop window with no deep links to share, and §12's "stack remembers
referrer" is a stack, not an address bar.

```ts
type Route =
  | { tab: 'teams' } | { tab: 'teams'; id: TeamId; mode: 'view' | 'edit' } | { tab: 'teams'; mode: 'new' }
  | { tab: 'library' } | { tab: 'library'; domainId?: DomainId } | { tab: 'library'; questionId: QuestionId; mode: 'view' | 'edit' | 'new'; referrer?: Route }
  | { tab: 'games' } | { tab: 'games'; id: RecipeId; section?: 'roster' | 'board' | 'rules' | 'plays' }
  | { tab: 'operators' } | { tab: 'operators'; id: OperatorId; mode: 'view' | 'edit' | 'new' }
  | { tab: 'control' } | { tab: 'screens' } | { tab: 'statistics' } | { tab: 'settings'; inner?: 'monitors' | 'settings' | 'shortcuts' }
```

`go(route)`, `back()`, `forward()`, `replace(route)`. Crumbs derive from the
route. A dirty editor intercepts `go` with `DirtyGuard`. Screens is blocked
while a Play is `playing|paused` with the §12 two-action notice (the check
reads `play-state`, the route stays typed).

### 3.3 Commands and refusals

`useHostCommand()` returns `run(name, args)`. A refusal (`HostError`) becomes a
notice: `code` selects copy in `copy/notices.ts`, `severity` defaults to
`error`, `targetPath` (when the host sends one) routes it inline to the field
or row that caused it, otherwise to the collector. Success does not toast:
the row updates because the event came back. There is no Toast in P7.

## 4. Component catalog

Naming: one component, one file, one test. A prop that names a variant uses the
HeroUI vocabulary when HeroUI has one (`variant`, `size`, `color`) and a
project word when it does not (`tone`, `layout`, `density`). Every interactive
component accepts `isDisabled` **and** `disabledReason`, so "visible but
disabled, with the reason" (§4.2) is one prop everywhere, not a tooltip
someone remembers to add.

### 4.1 Atoms — thin, variant-pinned wrappers

| Atom | Wraps | Props (beyond HeroUI's) | Variants / states | Rule |
| --- | --- | --- | --- | --- |
| `Button` | HeroUI `Button` | `disabledReason` | `primary` `secondary` `tertiary` `outline` `ghost` `danger` × `sm` `md` `lg`; `isPending` | one `primary` per region |
| `IconButton` | `Button isIconOnly` | `label` (required, tooltip + aria) | same | never an icon without a label |
| `Icon` | `@iconify/react` | `name: keyof ICONS`, `size` | `sm` `md` `lg` | only names from `ICONS` |
| `Text` | Calligraph | `variant`, `transition`, `tone` | see §2.3; `tone: default \| muted \| accent \| success \| warning \| danger` | strings come from `copy/` |
| `Chip` | HeroUI `Chip` | `tone` | `soft` by default; tones map to `color` | fixed vocabulary, §4.6 |
| `StatusDot` | span | `tone`, `pulse` | 5 tones; `pulse` only for `playing` | one place a status is a colour |
| `Kbd` | HeroUI `Kbd` | — | `default` | paints keys only, never binds them |
| `Avatar` | HeroUI `Avatar` | `mark: { color, shortCode, logoUrl? }` | `sm` `md` `lg` | the team mark everywhere in Studio |
| `Swatch` | span | `color`, `size` | — | colour preview in editors and rows |
| `Panel` | HeroUI `Surface` | `density: comfortable \| compact`, `title?` | `default` `secondary` `tertiary` `transparent` | the only card-like box |
| `Separator` | HeroUI `Separator` | — | `default` `secondary`; `horizontal` `vertical` | |
| `Skeleton` | HeroUI `Skeleton` | `shape: row \| card \| text` | — | every loading state |
| `Spinner` | HeroUI `Spinner` | — | `sm` `md` | inside buttons and empty regions only |
| `Tooltip` | HeroUI `Tooltip` | — | 4 placements | reasons and labels, never content |
| `TextField` `TextArea` `NumberField` `Select` `ComboBox` `Switch` `Checkbox` `Slider` | HeroUI | `label`, `description`, `error`, `isRequired`, `disabledReason` | HeroUI sizes; `error` renders `FieldError` | every field carries its own label and error slot |
| `Link` | HeroUI `Link` | `to: Route` | — | in-app navigation only; no external URLs in v1 |

### 4.2 Molecules — one job, two to five atoms

| Molecule | Composition | Props / states | Where |
| --- | --- | --- | --- |
| `PageHeader` | crumbs · `Text studio-title` · description · action slot | `title`, `crumbs`, `primaryAction`, `secondaryActions`, `status?` | top of every page |
| `ListToolbar` | `SearchField` · kind filter · `ViewSwitch` · `ArchiveToggle` · sort · New | all optional; the same order on every list | every record list |
| `SearchField` | HeroUI `SearchField` + Pacer debounce (200ms) | `kinds`, `scope`, `onHits` | `ListToolbar` |
| `ViewSwitch` | `ToggleButtonGroup` grid / table | `value`, `onChange` | `ListToolbar` |
| `ArchiveToggle` | `Tabs variant=secondary` Active / Archived | `scope`, `counts?` | `ListToolbar` |
| `RecordRow` | `Avatar`/`Swatch` · title · subtitle · chips · meta · actions · checkbox | `layout: grid \| table`; states `rest` `hover` `selected` `archived` `overridden` `drag` | `LibraryList` |
| `BulkBar` | count · Archive / Restore · Clear | appears when selection > 0; one confirm per batch | `LibraryList` |
| `EmptyState` | icon · title · body · action | `kind: empty \| noResults \| archivedEmpty \| error` | lists, detail panes |
| `InlineNotice` | HeroUI `Alert` + up to 3 `Button`s | `notice`, `onAction`, `onDismiss`; stacked confirm frames render *inside* | fields, rows, pages |
| `ConfirmDialog` | HeroUI `AlertDialog` | `severity`, `arm → confirm` two-click for destructive | archive with references, abandon (P8) |
| `DirtyGuard` | `AlertDialog` Save / Discard / Cancel | bound to the editor's form state | every editor |
| `ScopeConfirm` | `AlertDialog` This game / Original / Cancel | §2.17; also used for bulk | Games one-file inline edits |
| `SidebarItem` | `Icon` · label · badge | `active`, `collapsed`, `badge?` | `SidebarNav` |
| `NavCrumbs` | HeroUI `Breadcrumbs` | from `Route` | `PageHeader` |
| `MetaList` | label / value pairs | `items`, `columns` | detail views |
| `StatCard` | `Panel` · `Text studio-display` · caption | `value`, `label`, `tone?` | detail views, Games |
| `SettingRow` | label · description · control · reason | `disabled: { reason, detail }` from host | Games rules, Settings (P10), float (P8) |
| `DifficultyField` | `NumberField` + `Slider` + band chip | 1–100; band easy/medium/hard | question editor |
| `OptionRow` | drag handle · `TextField` · correct `Checkbox` · remove | `isLastCorrect` disables the untick | question editor |
| `TeamMark` | `Swatch`/logo + short code | `size` | roster, rows |
| `DomainPicker` | `ComboBox` over domains + "Create domain…" | §2.22; opens `DomainForm` in place | question editor, board |
| `DomainForm` | name · code · description fields | standalone or embedded | Domains pane, `DomainPicker` |
| `OperatorBadge` | `Avatar` initials · name | `size` | `TopBar`, Operators |
| `PlayStatusPill` | `StatusDot` · `Text transition=swap` | status from play-state via props | `TopBar` |

### 4.3 Organisms — regions that know the domain

| Organism | Reads | Writes | Notes |
| --- | --- | --- | --- |
| `HostBridge` | every host event | Query invalidations, play-state store, notices | mounts once in `App`; no UI |
| `SidebarNav` | nav, play-state (to badge Control), chrome | `nav.go` | three states; hidden mode keeps an 8px left-edge peek strip that expands on hover |
| `TopBar` | play-state, settings (active operator), chrome | theme, sidebar mode, `settings_set_global(active_operator_id)` | recipe name if loaded · `PlayStatusPill` · `OperatorBadge` menu |
| `StatusBar` | play-state, monitors, notices | opens collector | health (P10 placeholder "—"), displays count, latest notice one-liner, `remaining_ms` while playing |
| `NoticeCollector` | notices | runs notice actions | HeroUI `Drawer` from the right; `block` severity opens `NoticeDialog` instead |
| `NoticeDialog` | one `block` notice | its actions | modal, cannot be dismissed by click-away |
| `LibraryList` | a Query (list or search hits) | selection (local), bulk commands | TanStack Table engine; grid or table renderer; `@tanstack/react-virtual` above 200 rows; `Skeleton` while loading; `EmptyState` variants |
| `TeamEditor` `DomainEditor` `QuestionEditor` `OperatorEditor` | one item Query | `catalog_upsert` | TanStack Form; validation mirrors host rules; host refusal lands inline |
| `TeamDetail` `QuestionDetail` `OperatorDetail` | one item Query, `referenced_by` | archive / restore | read view with `MetaList`, `StatCard`s, chips |
| `RecipeEditor` | recipe, teams, domains, questions Queries | `recipe_upsert`, `recipe_set_membership`, `recipe_set_settings`, `recipe_set_overlay` | sections Roster · Board · Rules · Plays; frozen when that recipe's Play is `playing\|paused` (banner + all controls disabled with reason) |
| `RosterSection` | recipe, teams | `recipe_set_membership` | order via HeroUI `ListBox` with up/down actions in P7; dnd-kit arrives with P8 |
| `BoardSection` | recipe, domains, questions | `recipe_set_membership`, `recipe_set_overlay` (ScopeConfirm) | domain chips → question checklist; shape summary (a)(b)(c)(d) read-only in P7, Shape manager dialog is P8+ |
| `RulesSection` | recipe settings, `settings_get.disabled` | `recipe_set_settings` | `SettingRow`s; interlocks come from the host's `disabled` list, never recomputed |
| `PlaysSection` | `play_list(recipeId)` | — | history table; read-only |
| `DevHarness` | play-state, monitors | any command | **dev builds only** (`import.meta.env.DEV`); the P6 harness restyled, lives under Control until P8 replaces it |

### 4.4 Templates — skeletons with slots

| Template | Slots | Behaviour |
| --- | --- | --- |
| `ShellLayout` | sidebar · top · content · status · overlays | CSS grid; sidebar column animates between 240/56/0 |
| `LibraryTabLayout` | header · toolbar · list · aside? | list fills; aside (detail) optional at ≥1280px, otherwise stacked page |
| `SplitLayout` | primary pane · secondary pane | Domains + Questions (280px domain pane, resizable later) |
| `RecordPageLayout` | header · sections · sticky footer | editors: Save / Cancel footer pinned; dirty dot in the header |
| `BlankLayout` | content | stubs for P8–P11 tabs |

### 4.5 Pages

| Page | Route | Composition |
| --- | --- | --- |
| `TeamsPage` | `teams` | `LibraryTabLayout` + `LibraryList` (kind team) + `TeamDetail` aside |
| `TeamPage` | `teams/:id` | `RecordPageLayout` + `TeamDetail` or `TeamEditor` |
| `LibraryPage` | `library` | `SplitLayout`: domain pane (`DomainForm` add, domain list with archive scope) · question list filtered by domain, with its own archive scope |
| `QuestionPage` | `library/question/:id` | `RecordPageLayout` + `QuestionEditor` (with `DomainPicker`) |
| `GamesPage` | `games` | `LibraryTabLayout` + `LibraryList` (recipes as cards: name, folder, tags, teams, board size, last play) |
| `GamePage` | `games/:id` | `RecordPageLayout` with a section rail: Roster · Board · Rules · Plays; "Load into Control" primary action |
| `OperatorsPage` `OperatorPage` | `operators`, `operators/:id` | list · detail/editor; "Make active" |
| `ControlPage` | `control` | P7: `BlankLayout` with a P8 note; in dev builds hosts `DevHarness` |
| `ScreensPage` `StatisticsPage` `SettingsPage` | | `BlankLayout` stubs with the tab's title and phase |

### 4.6 Fixed vocabularies

**Chips.** `archived` (warning) · `overridden` (accent) · `seed` (default) ·
`single` / `multiple` (default) · `easy` / `medium` / `hard` (success /
warning / danger, thresholds ≤33 / ≤66 / else) · `playing` (success) ·
`frozen` (warning). Nothing else without adding it here.

**Empty states.** `empty` ("No teams yet" + New) · `noResults` ("Nothing
matches" + Clear search) · `archivedEmpty` ("Nothing archived") · `error`
(the host message + Retry).

**Row actions**, in order, everywhere: Open · Edit · Duplicate (recipes only)
· Archive / Restore. Destructive last, in `danger` only inside a menu or after
selection.

**Toolbar order**, everywhere: Search · filter · sort · view switch · archive
toggle · New (primary, right-aligned).

## 5. Interaction rules

- **Selection** is local to a list; leaving the page clears it.
- **Bulk** is one `ConfirmDialog` per batch, wording carries the count;
  `catalog_archive_many` / `catalog_restore_many` are the only calls.
- **Archive with references** first calls `referenced_by`; when the row is
  used, the confirm names what uses it and asks to arm then confirm.
- **Dirty editors** guard `nav.go`, window close (Tauri `onCloseRequested`,
  P12), and the sidebar. Save writes once; the row updates from the event.
- **Frozen recipe**: `GamePage` reads `play-state`; when `playId`'s recipe is
  this one and status is `playing|paused`, every control is disabled with
  reason `frozen`, and a banner links to Control.
- **Keyboard**: Esc closes overlays, Enter submits a single-field form,
  `Ctrl/Cmd+K` focuses search. Chords for commands are P8 (Hotkeys).
- **Focus**: HeroUI's focus ring, never suppressed. Icon buttons have labels.
- **Density**: `Panel density="compact"` exists for P8's mosaic and is not used
  in P7 pages.

## 6. Tests that guard the design

- `chrome/*.test.ts`: store shapes contain no `score|ring|session|timer` key.
- `host/queries.test.ts`: no query key contains `play`.
- `host/bridge.test.tsx`: a fake transport emits `catalog-changed` after a
  rename → list, detail and top bar re-render with the new name, no refetch
  call in the component tree (exit criterion 1).
- `atoms/*.test.tsx`: every atom renders each variant; `disabledReason` renders
  a tooltip.
- `molecules/InlineNotice.test.tsx`: four actions throw in dev; three render.
- `pages/*.test.tsx`: each page renders against a fake host with an empty
  library and with the demo library.
- `eslint`: `apps/studio` imports no `design-stage`; only organisms/pages
  import `@tauri-apps/api` or `PlayStateForStage`.

## 7. Installs (P7)

`@tanstack/react-query` `@tanstack/react-table@^8` `@tanstack/react-virtual`
`@tanstack/react-pacer` `zustand` `@iconify-json/gravity-ui` (JSON only)
`motion` `calligraph` (in `packages/text`) `@fontsource-variable/geist`
`@heroui/react` `@heroui/styles` `@base-ui/react` `tailwind-variants`.
Not installed, on purpose: `@tanstack/react-form`, `@iconify/react`,
`@phosphor-icons/react` (see §9).

Host: `GlobalSetting::ActiveOperatorId`, its field on `GlobalSettings`, and
the existence check in `crates/app/src/commands/flags.rs`.

## 8. Not in P7, decided

Toasts · dnd-kit roster drag (P8) · Shape manager dialog (P8+) · hotkey chords
(P8) · pin gating (P10) · first run (P10) · Monitors tab (P10) · Statistics
(P11) · window-close dirty guard (P12) · a URL router.

## 9. As built — departures from the proposal

- **TanStack Table is v8** (`@tanstack/react-table@^8`); v9's API is different and
  undocumented for this use. **TanStack Form is not installed** — editors use
  `useDraft` (one form state, dirty by comparison) and the host's validation.
- **No `@iconify/react`.** `scripts/studio-icons.ts` generates the Gravity UI
  bodies for the keys in `atoms/icons.ts` into `icons.generated.ts`; `Icon`
  renders inline SVG. Add a key, run `npm run studio:icons`.
- **Calligraph is imported only by `packages/text/src/studio.tsx`**
  (`@questiongame/text/studio`); the Studio `Text` atom imports that.
- **`ListToolbar` is not one component.** Its parts (`SearchField`, `ViewSwitch`,
  `ArchiveToggle`) are composed in each list page in the fixed order; a wrapper
  would only have forwarded props.
- **`EditorFooter`** (a molecule) is pinned inside the editor's scroll column,
  because an organism may not import a template. `RecordPageLayout` is a padded
  scrolling column with an optional rail.
- **The in-memory host** (`host/fake.ts`) exists and is the second adapter
  behind `HostTransport`; `?fake` on a dev URL installs it with a demo library.
- **Board difficulty overrides** take the value from a `window.prompt` and the
  scope from `ScopeConfirm`; an inline number field per row is P8's inline-edit
  work.
- **`RecordRow` grid cards** put chips and meta on a second line; at narrow
  widths the meta wraps rather than truncates.
