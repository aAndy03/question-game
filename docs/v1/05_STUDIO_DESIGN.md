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

**Scrollbars.** A control room has a dozen scroll containers on screen at once
— sidebar, list, editor, every mosaic panel — and the OS default puts a wide
chrome bar with a visible trough on each. Studio quiets them in
`packages/design-studio/studio.css`: no track, and a **4px thumb inside a 10px
lane** (a 3px transparent border with `background-clip: padding-box`), coloured
`--scrollbar`, darkening on hover with `color-mix`. Two things that look like
detail and are not:

- **WebKit pseudo-elements only.** The app runs on WebView2 and WKWebView,
  which both style them — but in Chromium a non-`auto` `scrollbar-width` or
  `scrollbar-color` *disables* `::-webkit-scrollbar`, so setting both would
  silently undo the styling. The standard properties are the Firefox fallback
  and sit behind `@supports not selector(::-webkit-scrollbar)`.
- **`background-color`, not the `background` shorthand.** The build expands the
  shorthand into longhands and cannot resolve a custom property inside it,
  which leaves the thumb with no colour at all.

`mosaic.css` restates the same thumb for the tab strip, whose own stylesheet
hardcodes `rgba(0,0,0,.2)` — invisible on a dark surface — at a selector that
outranks the app-wide rule.

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

## 10. Control tab (P8)

Status: **built, P8, 2026-09-06.** The room where the show is run. Everything on
it is a projector or a call site of a §13 command; nothing here decides a
game rule.

### 10.1 The mosaic

Six panels on one grid, the spec's default arrangement (§11.H), every panel
resizable within a min/max, movable to another cell, and stackable as tabs in
one cell. Persisted per operator (`control_layout` in the chrome store; the
host's per-operator `control_layout.json` of §5.10 arrives with P10's
paths work — until then `localStorage`, keyed by operator id like every other
chrome preference).

```text
┌──────────────┬────────────────────────────┬──────────────┐
│ top: Stage display · Statistics display · ⚙ settings float   │
├──────────────┼────────────────────────────┼──────────────┤
│ Game panel   │ Viewer                     │ Action Panel │
│              │                            ├──────────────┤
│              │                            │ Strips       │
├──────────────┴────────────────────────────┴──────────────┤
│ Timeline (collapsed by default)                           │
└───────────────────────────────────────────────────────────┘
```

Mechanism (decided 2026-09-06): **`react-mosaic-component`** — a tiling
tree of splits and tab groups, drag a panel's title bar to re-split anywhere,
drag onto another panel to stack as tabs, dividers resize. `MosaicLayout`
wraps it: the tree is the persisted layout, `MosaicPanel` is the tile with
the questiongame title bar (density, *Reset layout*), and its CSS is
restyled onto the HeroUI tokens in `packages/design-studio/mosaic.css` so
nothing of its default look survives. Density
(`comfortable | compact | dense`) is chosen by the panel from its own box via
a `ResizeObserver`, never by the operator per panel; the global
`control.mosaic_density` (host, Control-live) sets the floor. Vertical
scroll only, never horizontal (§8).

### 10.2 The Viewer

The Viewer is *the Stage tree* with hit targets over it (§5.7). Studio may
not import Stage's tokens, and Stage's tree is GSAP-driven, so Studio does not
re-render it. It **embeds Stage** in an `<iframe src="/stage/?viewer">`
(same origin in dev and in the bundle, so the CSP's `default-src 'self'`
allows it) and Stage gets a third host adapter:

| Adapter | Where | Truth arrives by | `anim-complete` |
| --- | --- | --- | --- |
| `tauriHost` | the Stage window | `play-state` event | `overlay_ack_complete` |
| fixture strip | `dev:stage` | the URL | nowhere |
| **`viewerHost`** (new) | the iframe in Control | `postMessage` from Studio, the same `PlayStateForStage` the host emits (the operator half stripped) | **dropped** — the Stage window acks; the Viewer never writes |

The iframe scales the 1920×1080 frame to its box (`transform: scale`,
computed in Stage's viewer mode from `innerWidth`). After every render Stage
posts the **rects of every `data-node-id` element** in frame coordinates
(`viewer-nodes`); Studio draws `HitTarget`s over them, scaled to the box.
Which node maps to which command is one table:

| Node | Command |
| --- | --- |
| `chooseDomain.card.<id>` | `choose_domain { domainId }` |
| `question.option.<id>` | `set_selection` toggling that id (single: replace) |
| `question.stem` | `reveal_stem` |
| `question.result` | `reveal_outcome` |
| `teamOrder.row.<id>` / `scoreboard.row.<id>` | `give_token { teamId }` when legal |
| `finalLeaderboard.row.<rank>` | `reveal_leaderboard_rank { rank }` |

`viewer.hit_targets` (host, Control-live) hides them all. A hit target that
would be refused renders as `drop-illegal`-style disabled with the reason,
using `OperatorState` (legal targets, session state) — the host still gets
the last word.

### 10.3 Panels

| Panel | Reads | Writes | Density behaviour |
| --- | --- | --- | --- |
| **Game panel** | play-state: teams, ring, scores, domains | — | comfortable: mark · name · score · turns; compact: mark · score; dense: marks only, scores as tooltips |
| **Action Panel** | play-state + operator | `TransportButton`s → `play_start` `pause` `resume` · `TimerCluster` → `start_timer` `pause_timer` · `RevealControls` → `reveal_stem` `reveal_next_option` `reveal_outcome` · `lock_selection` · `give_token` / `reveal_and_pass` (the arm→confirm of §2.6) · `undo_turn` `redo_turn` · `restart` `abandon` (`ConfirmDialog`, stacked "Are you sure?") | compact drops labels to icons with tooltips |
| **Strips** | play-state | `ScreenStrip` → `show_screen`; `OverlayStrip` → `show_overlay` (five kinds) | dense: icons only |
| **Timeline** | `play_events` (a Query keyed on `playId` + `eventCount`, invalidated by the tick's `eventCount`, never a Play field) | `undo_turn` `redo_turn` | collapsed: one line (last event + counts) |
| **Settings float** | `settings_get` | `settings_set_global` (Global) · `settings_set_current_game` (Current game) | a HeroUI `Popover` from the top bar's ⚙; two `Tabs`; `SettingRow`s with the host's `disabled` list, game-affecting rows visible but disabled while playing |
| **Display pickers** | `monitors_list` + `monitors-changed` | `stage_set_monitor` · `stage_open` | — |

Ring rows (Action Panel and Game panel share `RingRow`) carry the nine
variants of §5.4: `history`, `current`, `future`, `drop-ok`, `drop-illegal`,
`overlooked`, `override-armed`, `override-blocked`, `rehearsal-solo`. Drag
reorders the **future** ring only, with `@dnd-kit/react` sortable; a drop
that would move a history row or the current row is `drop-illegal` and is
refused client-side *and* by the host.

### 10.4 Three call sites, one command

The Viewer hit target, the Action Panel button and the keyboard chord all
call `useHostCommand().run(name, args)` — the same function, the same notice
path. `hotkeys.ts` maps the chords in `settings_get.globals.shortcuts`
(defaults below) to commands with `@tanstack/react-hotkeys`, mounted **only
on the Control page**, `ignoreInputs: true`, never on Stage. A test renders
Control against the fake host and asserts that a click, a press and a chord
produce one `lock_selection` call each through one handler.

Default chords (P10's Shortcuts tab edits them; the host stores them):
`space` start/pause timer · `enter` lock · `r` reveal outcome · `s` reveal
stem · `a` reveal next option · `1`–`9` choose domain / select option by
position · `t` give token to the default target · `mod+z` undo · `mod+shift+z`
redo · `[` / `]` previous / next screen.

### 10.5 Rules

- **An overlay busy blocks undo, restart and abandon** with a wait notice
  (P8 exit criterion); the buttons stay visible and disabled with the reason.
- **Nothing on Control is remembered locally** except the mosaic layout. Armed
  states (override armed, restart armed) are component state that resets on
  unmount.
- **Timer cluster is icon-only and hidden at operator pace** (§2.21); the
  clock is `Text transition="count"` over `remaining_ms`; the frontend never
  passes host zero.
- **A wrong answer never auto-advances Stage** — Strips is where the operator
  moves on, and the Game panel shows the token holder so the pace is theirs.
- **No operator chrome ever reaches Stage**: the Viewer's hit targets live in
  Studio's DOM over the iframe; Stage's viewer mode adds nothing to its own
  tree (a test renders Stage in viewer mode and diffs it against the host-fed
  tree).

### 10.6 New components

| Level | Components |
| --- | --- |
| atoms | `TransportButton` (icon-only, `state: rest \| active \| armed`) · `TimerIcon` · `HitTarget` (positioned button, `legal \| illegal`) · `RingRowHandle` |
| molecules | `TimerCluster` · `RevealControls` · `RingRow` (nine variants) · `ScreenStrip` · `OverlayStrip` · `MosaicPanel` (title bar, density, menu) · `DisplayPicker` · `EventRow` |
| organisms | `Viewer` · `GamePanel` · `ActionPanel` · `StripsPanel` · `TimelinePanel` · `SettingsFloat` · `ControlTopBar` |
| templates | `MosaicLayout` |
| pages | `ControlPage` (replaces the stub; `DevHarness` is deleted) |

### 10.7 Stage-side changes

- `apps/stage/src/host/host.ts`: `viewerHost()` chosen when `?viewer` and
  `window.parent !== window`; `animComplete` is a no-op there.
- `apps/stage/src/App.tsx`: viewer mode scales the frame and posts node rects.
- Nothing in the Stage *tree* changes.

### 10.8 As built

- **Toasts exist, with Sonner** (user decision 2026-09-06), for transient,
  action-free feedback only. §3.3's "no toast" is amended: a refused command
  is still a notice; a *succeeded* save, restore, load or layout reset is a
  toast.
- **The mosaic layout store** is `chrome/control.ts`; the per-operator
  `control_layout.json` of §5.10 waits for P10's paths.
- **Reveal & pass** is arm → confirm on the ring row itself (variant
  `override-armed`), not a separate dialog.
- **Ring drag** uses `@dnd-kit/react`'s sortable in the Game panel; the Action
  Panel's ring is press-to-give only.
- **The Shape manager** is not on Control (§11.B puts it on the Game tab) and
  is left for a later phase.

## 11. Screens tab (P9)

Status: **built, P9, 2026-09-06.** The layout workshop: a recipe's overrides of
the Stage screens, saved onto that recipe, nowhere else (spec §12, §17).

### 11.1 The layout document

`recipe.layout` has been an opaque JSON value the catalog stores and
`crates/app/src/decor.rs` reads one key of. P9 gives it a shape, owned by
`packages/contract/src/layout.ts` and validated there (`parseLayout`), so
the host still stores it opaquely and Stage reads it typed:

```ts
interface StageLayout {
  readonly version: 1
  readonly decor: StageDecorSettings                       // the P6 dials
  readonly nodes: Record<NodeId, NodeStyle>                // per node
  readonly screens: Partial<Record<StageScreen, ScreenBox>> // per screen
}
interface NodeStyle {          // every field optional; absent = built-in
  readonly fontSize?: number   // px, in the 1920×1080 frame
  readonly color?: string      // a questiongame token name or a literal
  readonly fontFamily?: 'display' | 'mono'
  readonly dx?: number; readonly dy?: number   // offset, frame px
  readonly width?: number; readonly height?: number
  readonly hidden?: boolean
}
interface ScreenBox {          // the decor field for that screen
  readonly boundary?: { x: number; y: number; width: number; height: number }
  readonly anchor?: { x: number; y: number }               // fractions 0–1
}
```

Node ids are the contract's (`screen.slot[.key]`), so a renamed team or a
reordered board never moves an override (risk register). **Apply to all
screens** writes the same style under the same *slot* on every screen that
has it (`header`, `title`, `row`, …).

### 11.2 How it reaches Stage

`PlayStateForStage` gains `layout: { nodes, screens }` (additive; `decor`
stays where it is). The host passes it through: `PresentationService` holds
the recipe's layout value next to `decor`, `recipe_set_layout` while the
recipe is in Control updates both, `play_load` reads it off the snapshot.
Stage applies it in one place: a `LayoutContext` at the root and
`useNodeStyle(nodeId)`, which the elements that carry `data-node-id` (the
`Text` atom, `DomainCard`, `AnswerOption`, `TeamMark`, `DecorShape`) merge
into their style. `DecorField` reads `screens[screen]` for its boundary and
anchor. A recipe with no overrides renders exactly as before — the existing
Stage tests are the proof.

### 11.3 The page

```text
┌ Screens ─────────────────────────────────────────────────────────────┐
│ Game: [Season opener ▾]   Screen: Idle · Team order · … · Final      │
├───────────────────────────────────────────┬──────────────────────────┤
│ Canvas: the Stage iframe (?viewer, the   │ Inspector                 │
│ same embed as Control's Viewer), fed a   │  Node: question.stem      │
│ preview Play built from the recipe, with │  Font size · Colour ·     │
│ selection handles over its node rects.  │  Family · Offset · Size   │
│ Click a node to select; drag to nudge.   │  Hidden                   │
│                                          │  [Apply to all screens]   │
│                                          │  [Reset node]             │
│                                          ├──────────────────────────┤
│                                          │ Decor (DialKit dials)     │
│                                          │  mode, drift, attraction, │
│                                          │  bounce, spin, max speed, │
│                                          │  anchor on/off/attract/   │
│                                          │  repel/strength;          │
│                                          │  this screen's box/anchor │
└───────────────────────────────────────────┴──────────────────────────┘
```

- **Blocked while a Play is `playing|paused`** (already in the nav guard):
  the notice's two actions become *Go to Control* and *Stop playing*, the
  second stacking "Are you sure?" and then `abandon` (spec §12).
- **The preview Play** is built client-side from the recipe (teams, domains,
  the first board question) purely to have something to draw; it never
  touches the host and is never a `play-state`. The canvas iframe gets it
  over the same Viewer protocol.
- **Selection handles** are the Viewer's hit-target mechanism reused with a
  different meaning: `NodeHandle` (a molecule) draws the selected node's box
  and lets it be dragged to change `dx`/`dy`; every other node is a faint
  outline on hover. Handles live in Studio's DOM (spec §17: "Viewer overlays
  are never saved as Stage design").
- **Auto-save**: every change goes through a 400ms Pacer debounce into one
  `recipe_set_layout`, one `rev` (spec §2.10). The header shows the rev and
  a saving dot; leaving mid-debounce flushes.
- **Decor dials** use DialKit's `Slider` / `Toggle` primitives inside a
  Studio `Panel`, bound to `layout.decor` and `layout.screens[screen]`; the
  canvas iframe shows the bodies moving live.

### 11.4 Components

| Level | Components |
| --- | --- |
| atoms | — (the fields exist) |
| molecules | `NodeHandle` (selected box, drag to nudge) · `NodeOutline` · `ScreenTabs` (the seven screens) · `DecorDials` (the DialKit block) · `NodeInspector` (the style form) |
| organisms | `ScreensCanvas` (iframe + handles + selection) · `LayoutEditor` (state, debounce, save) |
| templates | `WorkshopLayout` (toolbar · canvas · inspector column) |
| pages | `ScreensPage` (replaces the stub) |

### 11.5 Tests

- `packages/contract`: `parseLayout` accepts an empty document, rejects
  unknown node ids and out-of-range values, and never carries a key outside
  `version | decor | nodes | screens` (the "Viewer overlays are never
  persisted" criterion, as a schema).
- `crates/host`: a snapshot carries the recipe's layout and the emission
  carries `layout.nodes`; `stage_contract.rs` keeps the fixtures in step.
- `apps/stage`: `useNodeStyle` merges an override; an empty layout leaves
  the tree byte-identical (existing host/fixture diff test).
- `apps/studio`: editing a node saves one `recipe_set_layout` for that
  recipe id after the debounce, with the document shape above and nothing
  from the handles; the Screens route is refused while playing with the two
  actions.

### 11.6 As built

- **Overrides are applied by one DOM applier at the Stage root**
  (`apps/stage/src/layout/apply.ts`), not by `useNodeStyle` in each
  component; `useScreenBox` remains for the decor field. Offsets use
  `translate` so GSAP's `transform` is untouched.
- **DialKit was dropped** — its controls render at zero height outside its
  own panel. The dials are `SliderField`, `SwitchField` and `NumberField`.
- **Decor nodes get no handle**; the dials own them.
- **Colour** is a token name (`ink`, `paper`, `muted`, `correct`,
  `incorrect`, `info`, `leader`, `accent`) or a CSS literal; the wordmark
  follows `currentColor` for named fills so it recolours like text.
