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

`packages/design-studio/globals.css` (HeroUI's theme as shipped, its dark
ramp lifted — below) plus `tokens/theme.css` (the layer HeroUI leaves
implicit). **Do not fork the palette.** Studio is the HeroUI look on purpose
(§2.30); everything below is expressed in those variables and Tailwind
utilities that resolve to them.

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
sets `--field-border: var(--border)`, `--field-border-width: 1px` and, in dark,
`--field-background: var(--surface-secondary)` — one step above the surface,
and a reference rather than a copied literal since P20, so it follows the ramp
below.

**Dark is dark gray, not black (P20).** HeroUI's dark background is oklch 12%,
and a near-black page under every tab cost the operator contrast. The dark
block of `globals.css` lifts the whole ramp together, so each layer still steps
above the one under it:

| Token (dark) | HeroUI | Studio |
| --- | --- | --- |
| `--background` | 12% | 24% |
| `--surface` | 21.03% | 28.5% |
| `--overlay` | 21.03% | 30.5% |
| `--surface-secondary` (and so a field) | 25.7% | 32.5% |
| `--separator` | 25% | 33% |
| `--default` | 27.4% | 34% |
| `--surface-tertiary` | 27.21% | 34.5% |
| `--border` | 28% | 37% |
| `--segment` | 39.64% | 44% |
| `--scrollbar` (P20.11) | 70.5% | 42% |
| `--muted`, `--field-placeholder` | 70.5% | 73% |

Lightness only, at hue 253.83 with a chroma of 0.003 (0.0035 on `--surface`
and `--overlay`); the accent, the state colours and `--foreground` are
HeroUI's. Muted text lifts with the panels to keep its contrast on them; the
scrollbar comes down, a thumb a step above the borders rather than the
brightest thing on a gray page. Light mode and Stage are unchanged. These two —
the field override and the dark ramp — are the only departures from the
shipped theme.

**The shell's own tokens (P20.11, `studio.css`).** `--chrome` is what the top
bar, sidebar and status bar paint — `var(--background)`, so the bars and the
page are one surface. `--chrome-line` is every line the shell draws, one colour
at one weight — `transparent`. `[data-density="compact"]` shrinks the HeroUI
buttons, selects, search fields, tabs and toggle buttons inside it to 28px
(§26). Since P21 every page's chrome opts in — `PageHeader`, `ListToolbar`,
`BulkBar` (36px), the Domains pane's header — while rows, cards, panels and
dialogs keep HeroUI's sizes. Buttons (P21.2) and select triggers (P21.3) are
28px everywhere, and every menu and select list is compact: 26px rows, 12px
labels, 11px descriptions.

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

| Variant | Size · weight | Role |
| --- | --- | --- |
| `studio-display` | 30px · semibold, tight | one large figure on a card (score, count) |
| `studio-title` | 18px · semibold, tight | page title (20px until P21) |
| `studio-heading` | 16px · medium | section title inside a page or card (18px until P21) |
| `studio-subheading` | 14px · medium | a name inside a section (P20): a setting's name, a titled block in a section (*Preview*, *Chosen*, *What each setting does*) |
| `studio-body` | 14px | default text |
| `studio-label` | 12px · medium | form labels, table headers, sidebar items |
| `studio-caption` | 12px | metadata, timestamps, ids, a setting's description |
| `studio-mono` | 12px, `--font-mono` | ids, codes, chords, durations in ms |

The sizes are Tailwind's (`--text-3xl`, `-xl`, `-lg`, `-sm`, `-xs`), named as
roles in `tokens/theme.css`; add a role there rather than reaching for
`text-[13px]`. A sub-heading is body size at medium weight: a name stands out
from its description by weight and by the caption under it, not by size.

**The scale is emitted (P20).** The roles were declared `@theme inline`.
Tailwind v4 emits a theme variable only when a utility uses it, and `Text`
reads its role from an inline style Tailwind never sees — so every role but
one resolved to nothing and fell back to the inherited 16px. Titles, headings,
body and captions were one size from P7 to P20 while labels were 12px, which is
how a setting's name read smaller than its own description, the Board read
flat, and a list row's meta outweighed its question. The block is now
`@theme static` (always emitted) and restates the weights, the tracking and
`--font-mono` that `Text` reads, at Tailwind's own values.
`packages/design-studio/src/tokens.test.ts` compiles `globals.css` and
`tokens/theme.css` with Tailwind and no candidates at all, and fails on any
variable a `studio-*` variant reads that is not emitted — jsdom applies no CSS,
so only the compiled stylesheet can say. A role added to `packages/text`
without its variable fails it.

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

**Page layout — binding for every page (P20).** The maintainer's list of
2026-10-22: editor pages used the width badly, the Questions status strip jumped under the toolbar
when a row opened, the selection strip made lists jump, Rules and Settings put
a setting's name at one edge and its switch at the other. The rules that came
out of it, checked on a library of 1,050 questions and on one of three:

1. **A reading column is at most 48rem.** Inside it a row keeps its label and
   its controls together; a wider window never stretches a row.
2. **Extra width is a second column of related content** — a preview, where
   the record is filed, what the page's settings pay, an index of the page —
   22rem, like the detail aside and the Screens inspector. A page with nothing
   for it stays one column.
3. **No bar, no rule** (P20.11). The shell and the pages draw no separators
   (`--chrome-line`, §2.1) and no bar at a page's foot: an editor's
   Cancel · Save sit in its header, which stays at the top and ends where the
   content ends (`EditorColumns`' `header`, `EditorActions`); a wizard's
   buttons follow its fields.
4. **Widths are container queries** (`@container/…`), never viewport
   breakpoints: the sidebar is 240, 56 or 0px, so the window says nothing about
   the room a page has. `DetailAside` keeps its 1280px breakpoint (1.1.1).
5. **Below the threshold the second column follows the first**, in reading
   order; nothing needed to finish the task is hidden.
6. **Nothing moves because something appeared.** A strip that can appear is
   always there, quiet when empty (`BulkBar`); a panel that opens starts below
   the toolbar, never beside it (`ListArea`).
7. **A name reads before its explanation.** A setting's or a field's name is
   the strongest text in its row (`studio-subheading`); its description is a
   muted caption.
8. **Summary first, detail on demand.** A long section opens on its counts and
   ranges and its rows are a press away — open by default only when they are
   few. The Board opens its domains only on a small board; *What each setting
   does*, the ledger's working and Statistics' *More options* start closed.

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

Two movements that are not Motion (P20): a dragged list's other rows slide
aside with dnd-kit's own sortable transition (`SortableList`, 220ms on the
standard curve, `cubic-bezier(0.2, 0, 0, 1)`), and a `MeterBar` eases its fill
with a CSS width transition (300ms, none under `prefers-reduced-motion`).

## 3. Architecture of the webview

```text
apps/studio/src/
  host/        the seam. host.ts (command/on, injectable transport for tests)
               queries.ts (TanStack Query keys + hooks over catalog_*/recipe_*/settings)
               playState.ts (play-state external store; never a Query. Two reads:
                 usePlayState = stable across a bare tick, usePlayClock = the countdown)
               bridge.tsx (one subscriber: events → invalidations / stores)
  chrome/      Zustand stores: nav, chrome (sidebar, theme, view prefs), notices
  copy/        every operator-facing string, by area
  atoms/ molecules/ organisms/ templates/ pages/
  App.tsx      providers + ShellLayout + page switch
```

### 3.1 Truth and caches

**The Play is read twice, at two rates (P11.7, P11.9).** `play-state` is
event-driven; the 100 ms show loop sends `play-tick`, two numbers.
`playState.ts` therefore keeps two things — `usePlayState()` reads the last
`play-state`, and `usePlayClock()` reads the last tick. P11.6 had to *guess*
which was which, because everything arrived as one emission; splitting the wire
turned the guess into a lookup. `usePlayClock` publishes at the resolution
Studio prints (`fmt.clock` rounds to the second), so nine ticks in ten render
nothing at all. Mount `usePlayClock()` in the smallest component that draws a
number; a panel subscribing to it re-renders at 10 Hz, which is what the split
exists to stop. `usePlayState(select, isEqual?)` narrows further — pass
`shallow` when the selector builds an object.

The rule this replaces: reading the whole Play in a page cost 28 React commits
a second on Control and 77% of a core, because `ControlPage` re-rendering
handed `react-mosaic` a new `renderTile` and rebuilt everything under it. Two
consequences for anything added here — **hoist any function or array handed to
a memoizing library out of the render** (`useCallback`, or a module constant,
as `LibraryList` does with `NO_ROWS`), and **never read the countdown off
`usePlayState()`**: those two fields are as old as the last real change, and a
grep test enforces it.

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

**An addressed refusal is still heard from anywhere** (P12.8). Inline is where
a refusal is *fixed*, not the only place it is *seen* — an operator pressed
*Load into Control* on Game ▸ Roster, the host refused it for a Board problem,
and the only trace was on a section they were not looking at.

- The **status bar** shows the newest *error* whatever its surface
  (`latestForStatusBar`), and the collector's *needs attention elsewhere* line
  names the place — `Game ▸ Board`, from `gameSectionOf(path)`, which reads a
  `recipe.<id>.<section>…` path at any depth — with *Show* to go there.
- A refusal of `play_load` **opens the collector** where the click was
  (`run.ok(…, { openCollectorOnRefusal: true })`).
- The Game **rail** marks a section that holds an unresolved error (a danger
  dot, and *needs attention* in its accessible name).
- **The same refusal again replaces the open one** (code, path, message), so
  pressing Load five times is one notice, not five.
- **A write the host accepts answers the refusals it covers**
  (`answeredBy`): a board write clears `recipe.<id>.board.…`, a Load clears
  everything under `recipe.<id>.`.
- **So can a library write** (P12.12, `answerFromLibrary`): restoring the row a
  refusal names clears it exactly; re-grading or finishing a question asks
  `rules_preview` and clears the recipe's Board refusals only once the host no
  longer reports a shared difficulty or an incomplete question.
- Still a notice, never a toast: a toast disappears and cannot carry *Show*.

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
| `Chip` | HeroUI `Chip` | `tone` | `soft` by default; tones map to `color` | fixed vocabulary, §4.6; never wraps or shrinks (P20) — a squeezed row clips its chips rather than fold *Multiple answers* onto two lines |
| `StatusDot` | span | `tone`, `pulse` | 5 tones; `pulse` only for `playing` | one place a status is a colour |
| `Kbd` | HeroUI `Kbd` | — | `default` | paints keys only, never binds them |
| `Avatar` | HeroUI `Avatar` | `mark: { color, shortCode, logoUrl? }` | `sm` `md` `lg` | the team mark everywhere in Studio |
| `Swatch` | span | `color`, `size` | — | colour preview in editors and rows |
| `MeterBar` | div `role="meter"` | `value`, `max`, `label` (required), `tone` | `accent` `success` `warning` `danger` | "how much of" under a `StatCard` (Statistics ▸ Live, P20); clamped to its track, `max ≤ 0` is empty, never `NaN`. Not HeroUI's `Meter`, which lays out its own label and output and divides by `max` itself |
| `Panel` | HeroUI `Surface` | `density: comfortable \| compact`, `title?` | `default` `secondary` `tertiary` `transparent` | the only card-like box |
| `Separator` | HeroUI `Separator` | — | `default` `secondary`; `horizontal` `vertical` | |
| `Skeleton` | HeroUI `Skeleton` | `shape: row \| card \| text` | — | every loading state |
| `Spinner` | HeroUI `Spinner` | — | `sm` `md` | inside buttons and empty regions only |
| `Tooltip` | HeroUI `Tooltip` | — | 4 placements | reasons and labels, never content |
| `DisabledReason` | a focusable `span role="group"` in a `Tooltip` | `reason`, `block` | inline · `block` | how a disabled control says why: the reason is its name and its tooltip; no reason, no wrapper. `block` (P20) for a field that fills its width — `TextField`, `TextAreaField`, `NumberField`, `SelectField`, `SliderField`, `ComboField` pass it; a switch, checkbox, segmented field or button does not. The inline wrapper had shrunk the inert *Speed weight* slider to 24px |
| `TextField` `TextArea` `NumberField` `Select` `ComboBox` `Switch` `Checkbox` `Slider` | HeroUI | `label`, `description`, `error`, `isRequired`, `disabledReason` | HeroUI sizes; `error` renders `FieldError` | every field carries its own label and error slot |
| `ComboField` | HeroUI `ComboBox` with custom values | `value`, `options` (values already used, the only offers), `onCommit(value \| null)`, `onInputChange`, `maxLength` | — | a free-text field that offers what is used (P20): the game's Folder (Game page, *Set folder…*) and *Add game tag…*. Enter or leaving commits — not when focus goes to a `data-keep-draft` control or its own list; emptied is `null`; unchanged commits nothing. `onInputChange` is every keystroke, so a dialog's *Apply* reads what has not blurred yet |
| `Link` | HeroUI `Link` | `to: Route` | — | in-app navigation only; no external URLs in v1 |

### 4.2 Molecules — one job, two to five atoms

| Molecule | Composition | Props / states | Where |
| --- | --- | --- | --- |
| `PageHeader` | crumbs · `Text studio-title` · description · action slot | `title`, `crumbs`, `primaryAction`, `secondaryActions`, `status?` | top of every page |
| `ListToolbar` *(an organism since 1.1)* | `SearchField` · `FilterMenu` · `SortMenu` · `GroupMenu` · `ViewSwitch` · `ArchiveToggle`, then the active-filter chips | `view` (`useListView`), layout, status, `lead` | every library tab (§20), the pickers and the import dialog (no View, no Status). Two groups since P20: the lead · Search · Filters · Sort · Group wrap on the left; View · Status are a cluster on the right that never wraps, so Status stays top right at every width. DOM order is the toolbar order |
| `SearchField` | HeroUI `SearchField` + Pacer debounce (200ms) | `kinds`, `scope`, `onHits` | `ListToolbar` |
| `ViewSwitch` | `ToggleButtonGroup` grid / table | `value`, `onChange` | `ListToolbar` |
| `ArchiveToggle` | `Tabs variant=secondary` Active / Archived (/ All with `withAll`) | `value`, `counts?`, `withAll?` | `ListToolbar` (with All), `DomainPane` |
| `RecordRow` | `Avatar`/`Swatch` · title · subtitle · chips · meta · actions · checkbox | `layout: grid \| table`; states `rest` `hover` `selected` `archived` `overridden` `drag` | `LibraryList` |
| `BulkBar` | (page checkbox) · count · Archive / Restore · extra · Select all *n* · Clear | **always mounted** on a list with bulk actions (P20): at 0 a quiet strip — dashed hairline, no fill, "0 selected", nothing to press, no `toolbar` role — and the same element, one height (`h-11`), once something is ticked; `page` draws grid view's *Select all* for the page (table view has it in the header); the actions scroll inside the strip, the count and *Clear* never shrink; one confirm per batch | `LibraryList` on Teams, Questions, Games (Operators has none) |
| `EmptyState` | icon · title · body · action | `kind: empty \| noResults \| archivedEmpty \| error` | lists, detail panes |
| `InlineNotice` | HeroUI `Alert` + up to 3 `Button`s | `notice`, `onAction`, `onDismiss`; stacked confirm frames render *inside* | fields, rows, pages |
| `ConfirmDialog` | HeroUI `AlertDialog` | `severity`, `arm → confirm` two-click for destructive | archive with references, abandon (P8) |
| `DirtyGuard` | `AlertDialog` Save / Discard / Cancel | bound to the editor's form state | every editor |
| `DifficultyDialog` | `Modal`: a number 1–100, then Cancel · Apply to original · This game only | §2.17, §24 (beta.4: replaced `ScopeConfirm` and the `window.prompt`) | the Board's difficulty edit |
| `SidebarItem` | `Icon` · label · badge | `active`, `collapsed`, `badge?` | `SidebarNav` |
| `NavCrumbs` | HeroUI `Breadcrumbs` | from `Route` | `PageHeader` |
| `MetaList` | label / value pairs | `items`, `columns` | detail views |
| `StatCard` | `Panel` · caption label · `Text studio-display` · detail · `MeterBar` | `value`, `label`, `tone?`, `animate?`, `detail?` (P20: whose, of what — the leader, "5 left"), `meter?: { value, max }`; a `group` named by its label, so the number is read with what it means | detail views, Statistics ▸ Live tiles and All data's summary |
| `SettingRow` | name · description · reason · control | `disabled: { reason, detail }` from host, `nested`, `wide` | Games rules, Settings (P10), float (P8) — a **container query**: two columns at ≥ 34rem, stacked below, so the Control float reads label-over-control. P20: the name is a `studio-subheading` over a muted caption; a `wide` row puts its control under the name at full width (the reveal grid, the cue map, the difficulty band table) |
| `RecordRow` | one record, two layouts | `index` (1-based place in the list as filtered and sorted, table only) · `isCurrent` · `isSelected` · `badge` (P20) | the table row's ring is `ring-inset` and its container is `overflow-hidden`, so hover and selection follow the rounded corners. A `badge` always shows — in a table it ends the title area at one width, so it reads as a column down the list, and stays when a narrow list hides the chips; on a card it is the first chip. The subtitle and the *also in …* note follow the list's width (`@container/list`), not the window's |
| `DifficultyChip` | `MeaningChip` in the band's tone | `difficulty` (`null` is *Not set*), `unset?` | the one difficulty pill (P20), `Easy · 20`: the Questions list (its `badge` — no number column before the stem), the Board, the managers, the import dialog, Question detail. `difficultyLabel` is the same words without the pill |
| `DifficultyField` | `NumberField` + `Slider` + band chip | 1–100; band easy/medium/hard | question editor |
| `OptionRow` | (`DragHandle`) · letter · `TextField` · correct `Checkbox` · remove | `isLastCorrect` disables the untick; `handle` from `SortableList` (P20) — the letter follows the position, the correct tick follows its option | question editor, `ImportRowForm` (the draft only, until Save or Apply) |
| `TeamMark` | `Swatch`/logo + short code | `size` | roster, rows |
| `DomainPicker` | `ComboBox` over domains + "Create domain…" | §2.22; opens `DomainForm` in place; measures its own box (P20): one column, two from a 30rem container | question editor's side column, board |
| `DomainForm` | name · code · description fields | standalone or embedded; name and code side by side from a 24rem container (P20) | Domains pane, `DomainPicker` |
| `TagField` | chips with a remove button · field · the offered tags | `value`, `known`, `words` (P20: the game's words, `GAME_TAG_WORDS`; the question's by default), `limits` | question editor, the Game page, the game-tags dialog, `ImportRowForm` (its domains too, in their own words) — chips under the field |
| `ActionMenu` | `IconButton` (⋮) · HeroUI `Dropdown` | `sections: { id, title, items }[]`; an item's `icon`, `isDanger`, `disabledReason`, `description`; `label` (default *Open*) | every row menu, a group header's, a manager's. **Sections** (P20): a `Header` per section from `MENU` (§4.6), a separator between, an empty section left out; a disabled item says why under its name and keeps its label as its accessible name. `renderMenuSections` draws the hand-built menus (bulk *Edit…*, *Copy or move…*) the same way |
| `EditorColumns` | the form · an `aside` | `children`, `side?`, `sideLabel?` | an editor's body (P20, §2.4): one 48rem column; from a 60rem container, and only with a `side`, 48rem + 22rem. Below, the side follows the form. Team (*Preview*, then *Copies*), Question (*Where it is filed*: domains and their domain groups, then *Question tags*, then *Copies*), Operator (*Pin*, editing only — it saves on its own) |
| `EditorActions` | Cancel · Save | `canSave`, `isSaving`, `onSave`, `onCancel`, `saveLabel` | an editor's `PageHeader` `primaryAction` (P20.11; it was `EditorFooter`, a bar pinned across the page's foot). Cancel sits in `data-keep-draft`. The header goes in `EditorColumns`' `header` slot, sticky on the page's background, spanning both columns so the buttons end where the content ends |
| `TeamPreview` | the Studio mark · the Stage mark | `name`, `shortCode`, `color` | the team editor's side (P20): the mark rows show, and Stage's — one letter of the short code in the colour, the name in capitals. A theme colour (`var(--state-…)`) does not resolve in Studio, so it is a hatched box captioned *Theme colour*, never the token. Nothing in it is interactive |
| `SortableList` · `DragHandle` | an `ol` in a dnd-kit `DragDropProvider` · a grip `button` | `ids`, `onReorder(next)` (`false` puts the order back), `label`, `disabledReason`, `renderRow(id, { index, handleRef, isDragging })` | a list ordered by dragging (P20): the roster, the Board's domains, a question's options. A handle per row; the others slide aside; the drop writes once; the new order shows until the next `ids` arrives (compared by content). Keyboard on the handle: Space or Enter lifts, arrows move, Space drops, Escape cancels. A `disabledReason` (a frozen game) turns every handle off with the reason |
| `BoardDomainRow` | handle · disclosure (name, code) · *Overridden* · *n of m questions* · span · points · actions | `count`/`of`, `ladder` (the host's `rules_preview` for the domain), `short` (a ragged board's shortest), `open`, `onToggle`, `frozenReason`, `actions` | one domain on the Board (P20), replacing the domain card and the ladder table; its questions are mounted only while open |
| `BoardBalance` | the shape chip · its hint · (aligned) the rung table | `board: BoardShape` | the Board, one line (P20). Its domain table is gone — each row carries its domain's count, span and ceiling — and an aligned board's rung table is a closed disclosure |
| `SectionIndex` | a `nav` *On this page* of buttons | `entries: { id, title }[]` | beside the Settings tab's form (P20): sticky; a press scrolls its section into view; the section in view is marked (`aria-current`) |
| `ManagerDialog` | `Modal`: the list · the chosen entry · a footer | `isOpen`, `onClose`, `title`, `description?`, `list`, `detail`, `footer`, `hook` (a `data-…` attribute on the body) | the managers' frame (P20): 56rem wide and a fixed height (40rem, or the window), the two panes side by side from a 36rem body and stacked below, each scrolling on its own |
| `PaneList` | a `listbox` of name · count | `entries: { id, label, count, muted? }[]`, `selectedId`, `onSelect`, `what`, `top?` | a manager's entries (P20), the Domains pane's look; a search above eight entries; `top` holds A–Z · Most used |
| `MemberList` | Board-style lines: text · chips | `members`, `limit` (100), `more(hidden)`, `onOpen?` | what a question tag, a domain group, a folder or a game tag holds (P20): the first 100, then — where the manager passes `more` — one line for the rest, *and N more — Show in list* |
| `ImportRowForm` | question · options (`OptionRow`s in a `SortableList`) · difficulty · question tags · domains · explanation | `value: ImportDraft`, `onChange`, `knownTags`, `knownDomains` | one row of an import file, edited in the dialog (P20) in the file's own terms (domains as names or codes). Pure: the dialog sends it back to the host as a row of the file |
| `StatsTable` | rank · name (swatch) · one cell per metric · totals | `result`, `markedKey`, `hideTotals`, `bars` (the first metric drawn against the largest row), `cap` (50), `ranks`, `colors` | Statistics (§13.4): 50 rows, then *Show all N*; the totals row is never capped |
| `StatsCards` | a card per row | `result`, `markedKey`, `cap` (50) | All data's grid view: the table's cap, so the two views agree |
| `StatsChart` | caption · the chart · a note | `result`, `kind` (`bars` `ranking` `verdicts` `timeline` `bands` `race`), `metricIndex`, `title`, `colors`; `turns`, `totals`, `teams` for `race` | the only ECharts importer (§13.2) |
| `StatsFilterBar` | Time · Game · Team · Domain · Verdict · Group by · *More options* · *Clear filters* | `filter`, `groupBy`, `metrics`, `allMetrics`, `defaultMetrics` | All data: one row; Columns, *Include rehearsals* and *All workspaces* inside a HeroUI `Disclosure`, whose closed button reads *More options · n* when n of them are not at their default |
| `OperatorBadge` | `Avatar` initials · name | `size` | `TopBar`, Operators |
| `PlayStatusPill` | `StatusDot` · `Text transition=swap` | status from play-state via props | `TopBar` |

### 4.3 Organisms — regions that know the domain

| Organism | Reads | Writes | Notes |
| --- | --- | --- | --- |
| `HostBridge` | every host event | Query invalidations, play-state store, notices | mounts once in `App`; no UI |
| `SidebarNav` | nav, play-state (to badge Control), chrome | `nav.go` | three states; hidden mode keeps an 8px left-edge peek strip that expands on hover |
| `TopBar` | play-state, settings (active operator), chrome | theme, sidebar mode, `settings_set_global(active_operator_id)` | recipe name if loaded · `PlayStatusPill` · `OperatorBadge` menu |
| `StatusBar` | play-state, monitors, notices | opens the notices and displays popovers | one button for health and the latest notice (its popover is `NoticePanel`), the displays count (its popover draws `MonitorCards`), `remaining_ms` while playing (P21.3) |
| `NoticePanel` | notices | runs notice actions (`useNoticeActions`) | fixed 24rem × 26rem, scrolls, compact `InlineNotice`s, *Clear all*, the *needs attention elsewhere* lines |
| `DisplaysPanel` | `useDisplays` | `stage_open`, `stage_set_monitor`, `stage_add_mirror`, `stage_remove_mirror`, `stats_window`, `stats_monitor_id` | the arrangement map and one `DisplayRow` per display, Stage and Statistics columns — Settings ▸ Monitors and, `compact`, the status bar's popover (P21.5) |
| `DisplaysStatus` | `useDisplays` | — | the status bar's displays: `DisplayGlyphs` and what is up; its popover is `DisplayWindowButtons` and `DisplaysPanel compact` |
| `UnloadGame` | play-state | `play_unload` | the ✕ beside the play pill while a game is loaded, on Control (P21.5) |
| `ControlTools` | settings, Control layout | `audio_muted`, reset layout | audio · *Reset layout* · `SettingsFloat`, in `TopBar` while Control is open (P21.4) |
| `NoticeCollector` | notices | runs notice actions | the `block` dialog only since P21.3 |
| `NoticeDialog` | one `block` notice | its actions | modal, cannot be dismissed by click-away |
| `LibraryList` | a `useListView` page | selection (the view's), bulk commands | draws the list view (§20): group headers, sortable header row, page footer; grid or table renderer; `@tanstack/react-virtual` above 200 entries; `Skeleton` while loading; `EmptyState` variants. No TanStack Table since 1.1. P20: the selection strip (`BulkBar`) is mounted before the first tick and sits right above the list body; grid view hands it the page's *Select all* |
| `TeamEditor` `DomainEditor` `QuestionEditor` `OperatorEditor` | one item Query | `catalog_upsert` | TanStack Form; validation mirrors host rules; host refusal lands inline. P20: Team, Question and Operator draw their body in `EditorColumns` (§4.2) — the side column holds the preview, where the question is filed and its question tags, the PIN panel |
| `DomainPane` | domains, archive scope | — (its menu's commands) | P20: a row is the name over a muted code, the count in one column down the pane, the menu in a slot every row keeps |
| `TeamDetail` `QuestionDetail` `OperatorDetail` | one item Query, `referenced_by` | archive / restore | read view with `MetaList`, `StatCard`s, chips |
| `RecipeEditor` | recipe, teams, domains, questions Queries | `recipe_upsert`, `recipe_set_membership`, `recipe_set_settings`, `recipe_set_overlay` | sections Roster · Board · Rules · Plays; frozen when that recipe's Play is `playing\|paused` (banner + all controls disabled with reason) |
| `RosterSection` | recipe, teams | `recipe_set_membership` | the roster in play order, dragged by a handle (`SortableList`, P20 — the ↑/↓ buttons are gone), *Remove from roster* a button on each row; *Add teams…* is a `PickerDialog` (§24); an archived team by name with *Archived*; its own refusals inline |
| `PickList` | spec, items, chosen, disabledReason | — (its caller holds the ticks) | the body of a choice of rows on the list-view model (beta.4, extracted P20): `ListToolbar`, a *Select all* for the page with the count, group headers with *Select all in …*, a checkbox per row, pages. Its chrome is pinned — toolbar, strip and page footer stay put and only the rows scroll. `columns={2}` runs short rows in two columns from a 56rem list; `onOpen` opens a row (the import dialog). A row that cannot be ticked says why on its second line |
| `PickerDialog` | spec, items, initial, disabledReason | — (its caller writes) | §24, P20: the window's width (72rem) and a fixed height (52rem, or the window), so filtering never moves the frame; `PickList` beside a **Chosen** pane (18rem, from a 52rem body) listing what is ticked, numbered, each with a remove button, the first 100 then *and N more*. `chosenOrder` sets the pane's order — as ticked (the roster's play order), or the questions' easy→hard walk. Apply / Cancel |
| `BoardSection` | recipe, domains, questions, `rules_preview` | `recipe_set_membership`, `recipe_set_overlay` (`DifficultyDialog`, `alsoCopies`), `recipe_set_settings` (the repeats switch) | P20: a header (title; the long hint only while the board is empty; *n domains · m questions*; *Add domains…*), *Allow repeated difficulties* as a `SettingRow`, `BoardBalance` in a line, then one `BoardDomainRow` per domain in a `SortableList` — dragged into the order teams see the domains in; *Choose questions…* and *Remove from board* on the row. Open, a row lists its questions in the walk (difficulty, then id), difficulty first; *Reset to original* and *Take off the board* quiet until the line is hovered or focused. A board of more than 40 questions or more than 4 domains opens closed, with *Open all · Close all*. **One question per difficulty** — a member whose difficulty is taken is disabled with the reason (§15), unless *Allow repeated difficulties* is on (§15.4) |
| `RulesSection` | recipe settings, `rules_preview.effects` | `recipe_set_settings` | P20: grouped and titled as Settings groups them — Award · Turn · Judging · Timer · Reveal · Stage language (`SettingsGroup`) — each key with the control Settings uses (the segmented award mode, the weight slider, the optional consecutive cap, the labelled bonus, a three-way timer, the duration in seconds); every row carries the host's disabled reason; interlocks are never recomputed |
| `RulesPreviewPanel` | `rules_preview` | — | *What these rules pay*: beside the rules, sticky, from a 72rem page (P20); its inner titles are sub-headings, its warnings compact `InlineNotice`s, *What each setting does* a closed disclosure whose rows stay in the page |
| `QuestionTagsManager` | `tag_list`, the questions | `tag_rename`, `tag_delete` | *Question tags…* on Domains & Questions (P20, was *Manage tags*): a `ManagerDialog` — the tags with their counts (A–Z · Most used), the chosen one's questions beside them; *Rename* (to an existing tag merges), *Merge into…* (judged on press), *Show in list* (filters Questions to it and closes), *Delete question tag*; a tag written several ways says *Written n ways* and offers *Use “…”* for each spelling |
| `DomainGroupsManager` · `useGroupEditing` | the open domain, the questions | `domain_group_create`, `_rename`, `_reorder`, `_delete { id, into? }` | *Domain groups…* inside a domain (P20): the domain's groups in order with their counts, *No domain group* last; *Rename*, *Move up* · *Move down*, *Merge into…* (one write: `domain_group_delete { into }`), *Show in list*, *Delete domain group*; *New domain group*. `useGroupEditing` holds Rename · New · Delete, shared with a group header's menu so the two say the same thing |
| `GameLabelsManager` | the games | `recipe_bulk_edit` | *Folders and game tags…* on the Games tab (P20): every folder and game tag with how many games hold it, the chosen one's games beside them. A folder: *Rename* · *Empty folder* · *Show in list*; a game tag: *Rename* · *Merge into…* · *Show in list* · *Delete game tag*. Each write is one `recipe_bulk_edit` over the games it names, so a rename onto an existing name merges |
| `useGameLabels` | the games | `recipe_bulk_edit` | the Games tab's bulk *Edit…* (*Folder*: Set folder…, Clear folder · *Game tags*: Add game tag…, Remove game tag…), the row's *Organise* dialogs, and the workspace's folders and game tags (distinct, A–Z) the fields offer. Labels are organisation, not the show: the game in Control is included and nothing freezes. A dialog's value is judged on *Apply* |
| `ImportQuestionsDialog` | `catalog_import_questions { commit: false }` | `catalog_import_questions { commit: true }` | §17.4, P20: a workspace for the file (§26) — the rows in a `PickList` on the import spec, each ticked to import or left out, one opened beside the list in `ImportRowForm`; edits and skips go to the host as `overrides { edits, skip }` |
| `LiveStats` · `AllDataStats` | `play-state`, `stats_query` | — | Statistics ▸ Live and ▸ All data (§13.2); read-only, neither imports the command hook |
| `PlaysSection` | `play_list(recipeId)` | — | history table; read-only |
| `DevHarness` | play-state, monitors | any command | **dev builds only** (`import.meta.env.DEV`); the P6 harness restyled, lives under Control until P8 replaces it |

### 4.4 Templates — skeletons with slots

| Template | Slots | Behaviour |
| --- | --- | --- |
| `ShellLayout` | sidebar · top · content · status · overlays | CSS grid; sidebar column animates between 240/56/0 |
| `LibraryTabLayout` | header · toolbar · list · aside? | list fills; draws its toolbar, list and aside through `ListArea` (P20) |
| `ListArea` | toolbar · list · aside? | P20: the toolbar on its own row, then the list and the opened row's `DetailAside` side by side — the aside starts **below** the toolbar (beside the list at ≥1280px, over its right edge below). Every library tab draws its list here; Domains & Questions uses it as its second pane |
| `SplitLayout` | primary pane · secondary pane | Domains + Questions (280px domain pane, resizable later) |
| `RecordPageLayout` | sections · rail? | a padded scrolling column; editors put their own `PageHeader` in `EditorColumns`' sticky `header` (P20.11), which assumes this column's padding. `width`: `fluid` (default since P20 — the column fills the page and `EditorColumns` caps the content) or `wide` (the Game page, up to 96rem) |
| `SettingsLayout` | header · inner tabs · scrolling column · aside? | `width`: `form` (48rem; 64rem with an aside), `wide` (`max-w-6xl`, the Statistics tab), `full` (no cap, the Statistics window, P20). `aside` (P20): beside the form from a 60rem column — 48rem + 12rem, *On this page* on the Settings tab — and hidden below that |
| `BlankLayout` | content | stubs for P8–P11 tabs |

### 4.5 Pages

| Page | Route | Composition |
| --- | --- | --- |
| `TeamsPage` | `teams` | `LibraryTabLayout` + `LibraryList` (kind team) + `TeamDetail` aside |
| `TeamPage` | `teams/:id` | `RecordPageLayout` + `TeamEditor` (a view route opens the list's aside since 1.1.1; the page's unreachable view branch went in P20) |
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
`frozen` (warning) · `unset` (default — a difficulty not set yet, P11.17) ·
`active` (accent) · `pinned` (default) · `primary` / `stage` / `disconnected`
(default / accent / warning — monitors, §12.2.1) · `tag` (default — a question
tag, P15, or a game tag, P20) · `edited` (accent — an import row changed in
the dialog, P20) · `leftOut` (default — an import row left out of the import,
P20). The list is `CHIP_TONES` in `atoms/Chip.tsx`. Nothing else without
adding it here. *Filter chips* (stable 1.1, §20) are a separate family:
removable, under the toolbar, "{filter}: {value}" with a ×.

**Empty states.** `empty` ("No teams yet" + New) · `noResults` ("Nothing
matches" + Clear search) · `archivedEmpty` ("Nothing archived") ·
`allComplete` ("No incomplete questions here", the Incomplete filter,
P11.17) · `error` (the host message + Retry).

**Row actions**, in order, everywhere: Open · Edit · Duplicate · Copy to… ·
Move to… · Archive / Restore. Destructive last, in `danger` only inside a menu
or after selection.

**Menu sections** (P20). A menu's items sit under titled sections, and the
titles are `MENU` in `copy/index.ts` — never written at a call site:

| `MENU` key | Title |
| --- | --- |
| `team` `question` `domain` `game` `operator` `workspace` | *Team* · *Question* · *Domain* · *Game* · *Operator* · *Workspace* — the row's own kind |
| `domainGroup` `workspaceGroup` `folder` | *Domain group* · *Workspace group* · *Folder* |
| `questionTag` `gameTag` `roster` | *Question tag* · *Game tag* · *Play order* (in the vocabulary, drawn by no menu yet) |
| `copyMove` · `organise` · `arrange` · `status` · `danger` | *Copy and move* · *Organise* · *Arrange* · *Status* · *Danger zone* |
| `questionTags` `domains` `difficulty` `gameTags` `toWorkspace` | *Question tags* · *Domains* · *Difficulty* · *Game tags* · *To another workspace* — the bulk menus |

| Menu | Sections (items, in order) |
| --- | --- |
| Team row · Question row | *Team* / *Question* (Open, Edit) · *Copy and move* (Duplicate, Copy to…, Move to…, and *Stop following its copies* on a copy) · *Status* (Archive / Restore) |
| Domain row | *Domain* (Edit) · *Copy and move* (as above) · *Status* |
| Game row | *Game* (Open) · *Organise* (Folder…, Game tags…) · *Copy and move* (Duplicate, Copy to…, Move to…) · *Status* |
| Game page, *More actions* | *Copy and move* (Duplicate, Copy to…, Move to…) |
| Operator row | *Operator* (Open, Edit, Make active) · *Status* |
| Workspace row | *Workspace* (Open, Rename, Move to workspace group…) · *Copy and move* (Duplicate…) · *Status* · *Danger zone* (Delete permanently…) |
| Workspace group header | *Workspace group* (Rename workspace group) · *Arrange* (Move up, Move down) · *Danger zone* (Delete workspace group) |
| Domain group header (Questions, inside a domain) | *Domain group* (Rename) · *Danger zone* (Delete domain group) |
| Bulk *Edit…*, questions | *Question tags* (Add question tag…, Remove question tag…) · *Domains* (Set domain group…, Add to domain…, Remove from domain — the first and last inside a domain only) · *Difficulty* (Set difficulty…) |
| Bulk *Edit…*, games | *Folder* (Set folder…, Clear folder) · *Game tags* (Add game tag…, Remove game tag…) |
| Bulk *Copy or move…* | *To another workspace* (Copy to…, Move to…) |

A section title never repeats an item's text; a "delete" word appears only
under *Danger zone* — what cannot be undone — and Archive only under *Status*.
An empty section is not drawn. A disabled item stays in its place and says why
under its name (`disabledReason`); its accessible name is its label alone, so
the e2e suite and a screen reader find it by the same words.

**Toolbar order**, everywhere: **Search · Filters · Sort · Group · View ·
Status** (Active · Archived · All), then New (primary, in the page header). On
the library tabs this is one organism, `ListToolbar` (stable 1.1, §20); since
P20 it is two groups — the first four wrap, View · Status stay together at the
top right.

**Words P20 fixed.** *Question tags…* (the manager, was *Manage tags…*) ·
*Domain groups…* · *Folders and game tags…* · *Show in list* · *Merge into…* ·
*No domain group* · *Open all* · *Close all* · *Show all N* · *More options* ·
*On this page* · *Chosen* · *Preview* · *Where it is filed* · *Theme colour* ·
*Leading* · *Questions* · *Accuracy* · *Round* · *Fastest lock* · *Edited* ·
*Left out*; and, from the host, a Statistics row's *No operator*.

## 5. Interaction rules

- **Selection** is local to a list; leaving the page clears it.
- **Bulk** is one `ConfirmDialog` per batch, wording carries the count;
  `catalog_archive_many` / `catalog_restore_many` are the only calls.
- **Order is dragged** (P20) where an operator sets it: the roster, the
  Board's domains, a question's options (`SortableList`, by a handle, the
  keyboard on the handle too). The drop writes once — an option's only to the
  editor's draft, until Save; the order shows before the host answers and a
  refusal puts it back. The Domain groups manager and
  the workspace groups menu keep *Move up* · *Move down*.
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
  undocumented for this use. *Since 1.1 `LibraryList` does not use it at all — the
  list-view model sorts, filters, groups and pages (§20).* **TanStack Form is not installed** — editors use
  `useDraft` (one form state, dirty by comparison) and the host's validation.
- **No `@iconify/react`.** `scripts/studio-icons.ts` generates the Gravity UI
  bodies for the keys in `atoms/icons.ts` into `icons.generated.ts`; `Icon`
  renders inline SVG. Add a key, run `npm run studio:icons`.
- **Calligraph is imported only by `packages/text/src/studio.tsx`**
  (`@questiongame/text/studio`); the Studio `Text` atom imports that.
- **`ListToolbar` is one component since 1.1** (an organism). Before, its parts were
  composed in each list page and a wrapper would only have forwarded props; once
  the toolbar carried Filters, Sort and Group, four hand-built copies were how the
  tabs would drift apart (§20).
- **`EditorActions`** (a molecule; `EditorFooter` until P20.11) goes in the
  editor's header, inside `EditorColumns`, because an organism may not import a
  template. `RecordPageLayout` is a padded scrolling column with an optional rail.
- **The in-memory host** (`host/fake.ts`) exists and is the second adapter
  behind `HostTransport`; `?fake` on a dev URL installs it with a demo library.
- **Board difficulty overrides** take the value and the scope from one
  `DifficultyDialog` (beta.4; a `window.prompt` and `ScopeConfirm` before).
- **`RecordRow` grid cards** put chips and meta on a second line; at narrow
  widths the meta wraps rather than truncates.
- **HeroUI v3 overlays: the trigger is the button, and a controlled overlay has
  no root.** `Dropdown.Trigger` / `Popover.Trigger` render a pressable *around*
  their child, so wrapping a `Button` nests two `<button>`s — invalid HTML and a
  React error; v3's own examples put the Button directly under `<Dropdown>` /
  `<Popover>`. And a `<Drawer>` / `<AlertDialog>` root exists to wire that
  trigger: a controlled overlay (`isOpen` on the `.Backdrop`) has none, and the
  root then mounts a `PressResponder` with no pressable child and warns on every
  render. Controlled overlays here start at `.Backdrop`, as the v3 "Controlled
  State" examples do.

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
computed in Stage's viewer mode from `innerWidth`) — since P11.6 through the
same `useFitScale` the **Stage window** uses, so the preview and the surface
cannot disagree about how the canvas meets a viewport. The Viewer skips
`StageFit`'s letterbox: Control has already sized this iframe to the canvas
aspect, so there is nothing to bar.

**The Viewer does not simulate decor (P11.10).** It was stepping a second full
matter-js world at 60 Hz — the same bodies, the same collisions — for as long
as Control was open, in an iframe nobody films. It now draws the shapes where
the settle put them, which is what the operator is checking; motion belongs to
the Stage window. The Viewer's countdown still moves: Control posts it a `tick`
message, because since P11.9 it posts the whole state only when it changed. After every render Stage
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
| **Game panel** | play-state: teams, ring, scores, domains | — | comfortable: mark · name · score · turns; compact: mark · name · score; dense: mark · score, name on a tooltip. The ring scrolls in its own column under a fixed round header, the domain footer stays; the roster's *height* steps the row density down further when the tile is short |
| **Action Panel** | play-state + operator | `TransportButton`s → `play_start` `pause` `resume` · `TimerCluster` → `start_timer` `pause_timer` · `RevealControls` → `reveal_stem` `reveal_next_option` `reveal_outcome` · `lock_selection` · **one button per domain → `choose_domain`** (the next question, from any screen) · `give_token` / `reveal_and_pass` (the arm→confirm of §2.6) · `undo_turn` `redo_turn` · `restart` `abandon` (`ConfirmDialog`, stacked "Are you sure?") | compact drops labels to icons with tooltips |
| **Strips** | play-state | `ScreenStrip` → `show_screen`; `OverlayStrip` → `show_overlay` (five kinds) | both strips **wrap**; never `fullWidth`, because seven labelled screens fit no single row the mosaic offers. comfortable: icon + label; below it the screens are icon-only with the label on a tooltip, and the overlay pills keep their whole label |
| **Timeline** | `play_events` (a Query keyed on `playId` + `eventCount`, invalidated by the tick's `eventCount`, never a Play field) | `undo_turn` `redo_turn` | collapsed: one line (last event + counts) |
| **Settings float** | `settings_get` | `settings_set_global` (Global) · `settings_set_current_game` (Current game) | a HeroUI `Popover` from the top bar's ⚙ (`min(34rem, 92vw)`); two `Tabs`; `SettingRow`s with the host's `disabled` list, game-affecting rows visible but disabled while playing. The popover is narrower than `SettingRow`'s two-column threshold, so every row in it stacks |
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

- **A ring row says what it is** (added 2026-09-07). Colour and position carry
  a lot but not enough: the operator has to tell the team the invariant serves
  **next in order** from the ones a hand-over would jump to (**out of order**),
  and see why an ordinary-looking row cannot be pressed. `ringRole` in
  `host/ring.ts` answers every case a Play can be in — `holder · next ·
  override · reveal-first · served · inactive · solo · closed` — and both the
  Action Panel's rows and the Viewer's hit targets read their wording from
  `RING_ROLE`, so a target says the same thing wherever it is met.
- **Unload is in the Control top bar** (added 2026-09-07). `play_unload` is the
  way back out of a loaded game and the only one; before it, the sole way to
  clear Control was to load a different recipe. It sits in the top bar rather
  than in a panel because it is about what is *in* Control and must be reachable
  whatever the mosaic looks like, and it is live from the moment a recipe is
  loaded — before the start, mid-show and after the end. A game that was never
  played goes without a question (there is no record worth keeping); anything
  that was played asks one dialog with two answers, **Keep the record**
  (default) or **Discard it** — a hard delete of that Play's log, so it is
  chosen, never assumed, and the confirm button names which act it runs.
- **The panel draws one phase at a time** (added 2026-09-07). `controlPhase`
  in `host/session.ts` answers where the operator stands — `ready · question ·
  resolved · handover · standings · ended` — and the Action Panel draws
  transport, that phase's single block, and the token rows, in that order.
  Within a block an illegal control stays visible and disabled with its reason
  (§4.2); *across* blocks the panel hides, because a control belonging to
  another phase is not a disabled control but one the host would refuse. The
  reveals, the clock and the option buttons therefore leave with the question
  they belong to, the domains appear only once it is resolved, and the token
  rows only while the Play can still take a hand-over.
- **`standings` is a phase, not a leftover** (fixed 2026-09-07). When the last
  question resolves the host appends `PlayCompleted`, and Control used to go on
  showing that question's spent controls with no way to reveal a place — the
  Play was over and the operator was stuck. The phase now offers *Reveal next
  place* (`reveal_leaderboard_rank` with the lowest unrevealed **rank**, ties
  sharing one), *Show final leaderboard* when Stage is elsewhere, and a count
  of the places up. Restart is enabled here too: a completed Play may be
  played again, an abandoned one is a closed record.
- **Leaderboard nodes are keyed by finishing position, the command takes a
  rank.** `LeaderboardList` keys its cards `1..n` so tied teams keep distinct
  ids; the Viewer maps the position back to that team's rank before calling.
  Sending the position revealed a place nobody stood in — the host now refuses
  an unknown rank rather than appending an event that shows nothing.
- **A resolved question is not a live one** (fixed 2026-09-07). The projection
  keeps the session after `reveal_outcome` — Stage has to go on drawing the
  question with its outcome — and only ever *replaces* it, at the next
  `QuestionIssued`. So `play.session !== null` is true from the first question
  of a Play to its end, and every surface that read it as "a question is in
  progress" went permanently inert after the first reveal: the Viewer's domain
  cards, the `1`–`9` chords. With `choose_domain` unreachable and no other
  affordance for it, the operator was simply stuck — the Play could not
  continue, on any screen. `host/session.ts` now spells the host's rule
  (`liveSession` · `isSessionLive` · `canChooseDomain`, issued **and
  unresolved**) and Control, the Viewer and the chords read it from there.
- **The Action Panel offers the next question** — one outline button per
  domain, labelled with the domain's next difficulty, disabled with a reason
  when the domain is exhausted or the current question is still live. It is on
  the panel rather than only on the ChooseDomain screen because the operator is
  not obliged to be showing that screen: after a correct answer the token stays
  put and the usual next act is another question, often with the audience still
  looking at the outcome or the scoreboard.
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
| organisms | `Viewer` · `GamePanel` · `ActionPanel` · `StripsPanel` · `TimelinePanel` · `SettingsFloat` · `ControlTopBar` (*Unload game* only since P21.4) · `ControlTools` (in the top bar) |
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

## 12. Settings, first run, notices, audio, health (P10)

Status: **as built, P10, 2026-09-06.** Everything the operator sets up
*around* a show, and the three infrastructure families every tab already
leans on. Rules that hold across the section: the host owns every value on
this page and Studio projects it (§4.2 through `settings_get.disabled`, never
recomputed); a pin is hashed in the host and never in the webview (§2.15); a
notice carries two, at most three, solve actions and stacks its confirms in
the same component (§14); a Control-behaviour key takes effect mid-Play and a
game-affecting key cannot (§2.5); no generated tone exists while
`feat.audio.synth` is off (§2.25).

### 12.1 First run

The shell is not shown until an operator exists. `App` reads
`settings_get.globals.active_operator_id`; while it is `null` **and** the
operator list is empty, the page switch renders `FirstRunPage` inside
`WizardLayout` (no sidebar, no top bar, no status bar) instead of
`ShellLayout`. A library with operators but no active one is not first run —
that is the top bar's operator menu.

```text
┌──────────────────────────────────────────────────────────────────────┐
│  questiongame Studio                                                  │
│                                                                       │
│   ● Where things live   ○ Operator   ○ Sample game   ○ Defaults      │
│  ─────────────────────────────────────────────────────────────────── │
│                                                                       │
│   [step body — one Panel, ≤ 560px wide, centred]                      │
│                                                                       │
│                                                     [Skip]  [Next →]  │
└──────────────────────────────────────────────────────────────────────┘
```

| Step | Reads | Writes | Skip? |
| --- | --- | --- | --- |
| **Where things live** | `paths_get` → user-data directory, catalog file, cue pack directory | — | no skip; *Next* only. `PathRow`s are read-only with a *Reveal in Explorer / Finder* icon button (`paths_reveal`). |
| **Operator** | — | `catalog_upsert` (operator) then `operator_activate` | **cannot skip** (§2.27: required before Play). Display name required; pin optional (`PinField`, confirm field, §12.3). |
| **Sample game** | — | `catalog_seed_demo { mode: 'missing' }` | *Skip* leaves an empty library; the Games empty state and Settings ▸ Library keep offering **Load Demo** (§2.28). |
| **Defaults** | `settings_get` | `settings_set_global` | *Skip* keeps the shipped defaults. The step is the Award, Timer and Reveal groups of §12.2.2 rendered by the same `SettingsGroup`s — not a second form. |

*Finish* goes to Teams (or to the Demo game when the sample was loaded).
Progress is component state: closing the app mid-wizard lands on the same
first step next boot, except that a created operator stays created (the
operator step is skipped once one exists).

**Demo defaults** are the shipped `GlobalSettings::default()` (already in
the host since P5): award `difficulty` (linear ×10), lock-speed off, timer on
at 30 s, cap and bonus off, every reveal operator-timed, override
`refuse_until_reveal`.

#### The sample catalog `"Demo"` (§2.27, §2.28)

Built in the host (`crates/host/src/catalog/seed.rs`, a plain function over
the catalog types) and written through the ordinary bulk verbs, exactly as
`crates/app/src/demo.rs` does today. **It replaces `demo.rs`,
`seed_demo_library` and the `?fake` demo library's hand-written rows**: the
fake host seeds the same document from a TypeScript mirror
(`host/fake/seed.ts`) so dev and app show the same Demo.

| | |
| --- | --- |
| Teams | `Red` (`RED`, `--state-incorrect`) · `Blue` (`BLUE`, `--state-info`) |
| Domains | `Geography` (`GEO_101`) · `Science` (`SCI_204`), three questions each at difficulty 10 / 20 / 30, four options, one correct |
| Recipe | `"Demo"`, roster Red → Blue, board both domains, settings = the globals' `game_defaults`, timer inherit (30 s), layout empty |
| Marker | every row `origin: 'seed'`; everything the operator makes is `origin: 'operator'`. `origin` is a new column with a migration, shown as the existing `seed` chip (§4.6) |

`catalog_seed_demo { mode }`: `missing` inserts only the seed rows that are
absent (archived ones are restored, edits are kept); `overwrite` rewrites
every seed row to the shipped body. **Restore Demo** in Settings ▸ Library
calls `missing` outright and offers `overwrite` behind a `ConfirmDialog`
that names the count of edited seed rows (§2.28: "overwrite of edits needs
confirm"). A seed row is a normal row after insert — archive, edit and
overlay work on it like any other.

#### Play is blocked until there is something to play

`CatalogService::build_snapshot` refuses an empty roster (`RosterEmpty`,
`target_path: recipe.<id>.roster`) and an empty board (`BoardEmpty`,
`recipe.<id>.board`) at **Load into Control**, not only at `play_start`. The
Game page disables *Load into Control* with the same reason first; the host's
refusal is the enforcement and lands inline on the Roster or Board section.
`RosterEmpty` is new; `BoardEmpty` moves up from `play_start`.

### 12.2 Settings tab

Route `{ tab: 'settings', inner?: 'monitors' | 'settings' | 'shortcuts' }`;
the inner tab is chrome (`chrome.settingsInner`, per operator), the route's
`inner` wins when present so a notice can deep-link (`pick_monitor`).
`SettingsPage` renders `PageHeader` + HeroUI `Tabs variant="secondary"` in
the fixed order **Monitors | Settings | Keyboard shortcuts** (§2.20).

```text
┌ Settings ────────────────────────────────────────────────────────────┐
│ Settings                                                             │
│ Monitors · Settings · Keyboard shortcuts                             │
├──────────────────────────────────────────────────────────────────────┤
│ [inner tab body, one scrolling column, page padding]                 │
└──────────────────────────────────────────────────────────────────────┘
```

#### 12.2.1 Monitors

Reads `monitors_list` (kept fresh by `monitors-changed`) and
`settings_get.control.stage_monitor_id / stats_monitor_id / stage_reattach`.
Writes `stage_set_monitor` and `settings_set_global { stage_reattach }`.

```text
┌ Displays (2) ────────────────────────────────────────────────────────┐
│ ┌────────────────────┐  ┌────────────────────┐                        │
│ │ ▣ DELL U2720Q       │  │ ▣ Built-in         │   ← MonitorCard        │
│ │ 2560×1440 · primary │  │ 1920×1080          │                        │
│ │ [Stage]             │  │ [Send Stage here]  │                        │
│ └────────────────────┘  └────────────────────┘                        │
│ Stage stands on: DELL U2720Q · remembered: DELL U2720Q               │
├──────────────────────────────────────────────────────────────────────┤
│ SettingRow  Stage reattach   [Ask ▾]                                 │
│ SettingRow  Statistics display  [None ▾]   (feature_off until P11)  │
└──────────────────────────────────────────────────────────────────────┘
```

- **Since P21.5 the cards are rows** (`DisplayRow`, `DisplayTile`,
  `DisplayMap` — ▸ as-built `studio.md`, The smaller scale); the states and
  rules below hold, the drawing above is history.
- `MonitorCard` (molecule, until P21.5): a proportional rectangle drawn from
  `physicalSize`, name, resolution, `primary` chip, and one of three states —
  `stage` (Stage stands here; `accent` border), `remembered` (the pick,
  currently unplugged; `warning` chip *Not connected*), `free` (button
  *Send Stage here*). The Stage window is created if it does not exist
  yet (`stage_open` then `stage_set_monitor`).
- **Statistics on a card** (P21.4): `stats` is `here` (a `statistics`
  chip and its icon in the rectangle, *Close Statistics*), `free` (*Show
  Statistics here*) or `blocked` (Stage stands there; no button). Stage gets
  its icon in the rectangle too. *Move Stage here* moves the pacer while it
  stands on another display.
- **A display can be a Stage display, or mirror one** (P11.11). The card's
  action is *Send Stage here* on a free display and *Remove Stage* on one that
  is mirroring; the **pacer's card offers neither**, because it is *moved* with
  the display picker rather than removed, so the operator cannot end up with no
  Stage at all. The first display sent to is the pacer and the rest mirror it —
  the operator never has to know the word.
- **The resolution shown is the panel's mode, not its logical size** (P11.6).
  `MonitorInfo` carries both: `size` is logical — window placement, and the CSS
  viewport a fullscreen Stage gets — while `physicalSize` is what the OS's own
  display settings call the resolution. On a 1080p TV at Windows' default 150%
  those are 1280×720 and 1920×1080, and a card reading *1280×720* was telling
  the operator their 1080p TV was a 720p one. When `scaleFactor` is not 1 it is
  shown beside the resolution (*150% scaling*), because that is where the
  difference between the two numbers actually lives. The card's proportions come
  from `physicalSize` too, so its aspect matches the panel.
- **The card names the panel, and says who else is watching it** (P11.18).
  `MonitorInfo.friendlyName` is the panel's EDID name (*DELL G2724D*, *NINJA
  V*) and is shown in preference to the OS's `\\.\DISPLAY2`; it is never part
  of the key. `alsoOn` lists the panels Windows is **duplicating** this display
  onto — a Duplicate group is one display to the OS, so a recorder attached that
  way is in no list and the card is where it is reported: *Also shown on NINJA V
  (duplicated by Windows)*. A panel that is connected and that Windows is not
  drawing on at all is `health.display_unused`, a warn whose one action opens
  the OS display settings. Both come from `crates/app/src/topology.rs`, which
  is empty off Windows.
- One display is a valid setup and says so: a single card, *Stage
  fullscreen on this display; Studio is an Alt-Tab away* (§2.28).
- The Statistics display row is disabled with `feature_off` (`stats`) until
  P11; the key stays visible (§4.2 "visible but disabled").
- Nothing here touches a Play (§9). The `stage.monitor_*` notices stay the
  host's; this tab is where `pick_monitor` lands.

#### 12.2.2 Settings (the global document)

One `SettingsForm` organism, grouped, every row a `SettingRow` whose control
carries the host's `disabled` entry (`disabledFor(key)`), so a key frozen by
an open Play, made inert by a sibling, or switched off by a feature root is
visible with its reason. Writes are live: one `settings_set_global` per
change, no Save. The group order is fixed and shared with the Control float
and the first-run Defaults step (`SettingsGroup` + `SETTINGS_GROUPS` in
`copy/settings.ts` — one table, three surfaces).

| Group | Rows (key) | Control | Nesting |
| --- | --- | --- | --- |
| **Award** | `scoring.mode` | `SegmentedField` flat / difficulty / lock-speed | parent |
| | `scoring.flat_points` | `NumberField` | nested, shown when a flat base is in use |
| | `scoring.difficulty_map` | `DifficultyMapField` (linear factor, or a band table) | nested, shown when a difficulty base is in use |
| | `scoring.lock_speed_base` | `SegmentedField` | nested, exclusive mode only |
| | `scoring.lock_speed.enabled` | `SwitchField` | nested, flat / difficulty only |
| | `scoring.speed_weight` | `SliderField` 0–2, step 0.05 | nested; `inert` from the host when the option is off |
| **Turn** | `turn.max_consecutive_correct` | `OptionalNumberField` (switch + number) | |
| | `turn.bonus_after_consecutive` | `OptionalNumberField` ×2 (count · award) | nested under the cap |
| **Judging** | `judging.partial_credit` · `judging.order_matters` | `SwitchField` | |
| **Timer** | `globals.timer.enabled` | `SwitchField` | parent |
| | `globals.timer.duration_ms` | `DurationField` (seconds in, ms out) | nested |
| **Reveal** | `reveal.question/answers/outcome/leaderboard` | `SegmentedField` operator / auto | one row, four segments; live |
| **Control** | `override.after_lock` · `overlay_animations.enabled` · `viewer.hit_targets` · `control.mosaic_density` · `stage.reattach` | as in the float | live |
| **Audio** | `audio.volume` (0–100) · `audio.muted` | `SliderField` · `SwitchField` | live (§12.5) |
| | `audio.cues.<key>` | `CueMapRow` ×8 | nested under a *Cue map* row |
| | `feat.audio` · `feat.audio.synth` | `SwitchField` | synth row carries description *No generated tones in v1* and stays off |
| **Library** | Restore Demo | `Button` secondary → `catalog_seed_demo` | + edited-count confirm |
| **Data** | Wipe Plays · Remove generated data | `Button danger` → §12.3 gated actions | disabled with reason while a Play is open |

Above the form, a permanent `InlineNotice severity=info` with no actions:
*Open Plays keep their frozen copy; a global award default does not rewrite
a game that already set its own* (§12 banner). The Award, Turn, Judging and
Timer groups write `game_defaults`, which seed **new** recipes only.

**Control float parity.** `SettingsFloat` (P8) stops listing rows by hand
and renders `SettingsGroup`s for Control, Audio and Reveal on its Global tab.
The Game tab keeps its own rows (they write `settings_set_current_game`).

#### 12.2.3 Keyboard shortcuts

Reads `settings_get.globals.shortcuts` merged over `HOTKEYS.defaults`;
writes `settings_set_shortcut { command, chord }`. `useControlHotkeys`
already reads that same merge, so a saved chord is live on the next keydown
(§2.20 "live during Play"). Not shown on Stage.

```text
┌ Keyboard shortcuts ─────────────────────────────────────  [Reset all] ┐
│ Command                          Chord            Default             │
│ Start / pause timer              [ Space      ]   Space               │
│ Lock                             [ Enter      ]   Enter               │
│ Reveal outcome                   [ R          ]   R                   │
│ …                                                                     │
│ Pick domain / answer by position  1 – 9 (fixed)                       │
│ ┌ InlineNotice warn ─────────────────────────────────────────────────┐│
│ │ R is already bound to Reveal outcome.   [Keep]  [Reassign to Lock] ││
│ └────────────────────────────────────────────────────────────────────┘│
└───────────────────────────────────────────────────────────────────────┘
```

- `ChordField` (atom): a button that reads *Press keys…* while recording,
  captures one keydown, normalises it to the host's spelling
  (`mod+shift+z`), renders it as `Kbd`s. Esc cancels; Backspace clears
  (`chord: null`).
- **Conflicts** are the host's call: `settings_set_shortcut` refuses a chord
  bound elsewhere; the refusal lands inline under the row as a two-action
  notice, *Keep* (dismiss) and *Reassign* (clear the other command, then set
  this one — two commands, one press). Studio never resolves the conflict on
  its own.
- *Reset to default* per row (clears the override); *Reset all* is one
  `ConfirmDialog`.
- The `1`–`9` positional row is display-only (fixed in `useControlHotkeys`).

### 12.3 Operators — pin gating and the gated actions

Pin rules (§2.15): optional, set on the Operators tab only, hashed by the
host, never in metadata or the status bar. Required to switch **to** a pinned
operator, and for Wipe Plays / Remove generated data. **Live Play commands
never ask for the pin** — none of the gated commands can reach a Play, and
every one of them is refused by the host while a Play is `playing|paused`.

| Command (new) | Args | Host rule |
| --- | --- | --- |
| `operator_set_pin` | `{ id, pin: string \| null, currentPin?: string }` | hash with argon2id (`argon2` crate, PHC string in `pin_hash`); changing or clearing an existing pin needs `currentPin`; pins are 4–8 digits |
| `operator_activate` | `{ id, pin?: string }` | replaces `settings_set_global { active_operator_id }` for the switch path; verifies the pin when the target is pinned; appends `OperatorSwitched` to an open Play (§2.26); stamps `last_active_at` |
| `wipe_plays` | `{ pin?: string }` | refused while a Play is open; deletes every closed Play and its events; `catalog-changed` per recipe so Plays sections refresh |
| `uninstall_data` | `{ pin?: string }` | refused while a Play is open; closes the catalog, removes the user-data directory (catalog, search sidecar, assets, per-operator files) and quits. App files are P12's installer |
| `paths_get` · `paths_reveal` | — · `{ which }` | read-only; the OS file manager opens the directory |

`pin?` is the active operator's pin when one is set; the host decides whether
one is needed (`PinRequired` refusal, `target_path: operator.<id>.pin`).

- `PinField` (atom): `TextField type=password inputMode=numeric` with the
  eye toggle, 4–8 digits enforced client-side for the message only.
- `PinPrompt` (molecule): **a confirm frame, not a dialog.** Where the gated
  action was already inside an `InlineNotice` or `ConfirmDialog`, the pin is
  the last frame (§14 "Pin may be the last frame, depth 3"). Where it was a
  plain press (the top bar switch), `PinPrompt` is a small HeroUI `Popover`
  anchored to the trigger with the `PinField`, *Cancel*, *Unlock*. A wrong
  pin lands inline on the field; three wrong pins close the prompt (no
  lockout — the host is local and the pin is not a security boundary).
- `OperatorEditor` gains a **Pin** `Panel`: state `none` (*Set a pin*) →
  `setting` (pin + confirm) → `set` (*Change* · *Remove*, both asking the
  current pin). It calls `operator_set_pin` after the row saved, never as
  part of `catalog_upsert` (which keeps `pin_hash` opaque and untouched).
- `TopBar`'s operator menu calls `operator_activate`; a pinned target opens
  `PinPrompt` first. `OperatorDetail`'s *Make active* does the same.
- Settings ▸ Data: *Wipe Plays* → `ConfirmDialog` (arm → confirm, wording
  carries the Play count from `play_list`) → pin frame if set → `wipe_plays`.
  *Remove generated data* → the same shape, with the paths listed, final
  frame **Remove and quit**. Both buttons are disabled with reason *A Play
  is open* whenever `play-state` says so; the host refuses regardless.

### 12.4 The notice family — audit and rules

Every notice in the project, by producer. None exceeds three actions;
`Notice::new` debug-asserts it in Rust and the store throws in Studio.

| Code | Producer | Severity | Surface | Actions |
| --- | --- | --- | --- | --- |
| `stage.monitor_lost` | host `monitor` | warn | inline → Monitors | `pick_monitor` |
| `stage.monitor_ambiguous` | host `monitor` | warn | inline → Monitors | `pick_monitor` |
| `stage.monitor_restored` | host `monitor` | info | collector | — |
| `stage.monitor_available` | host `monitor` | info | collector | `move_stage` `stay` |
| `stage.contract_mismatch` | app `stage_ready` | error | collector | `reinstall` |
| `screens.blocked` | Studio nav guard | warn | collector | `go_to_control` `stop_playing` (+ frame `abandon_confirm`) |
| `play.roster_empty` · `play.board_empty` | host `build_snapshot` | error | inline → Game roster / board | `open_section` |
| `shortcuts.conflict` | host `settings_set_shortcut` | warn | inline → shortcut row | `keep` `reassign` |
| `operator.pin_required` · `operator.pin_wrong` | host | error | inline → pin field | — |
| `data.play_open` | host gated commands | error | inline → the button | `go_to_control` |
| `seed.edited_rows` | Studio (from `catalog_seed_demo` dry-run count) | warn | dialog frame | `overwrite` `keep_edits` |
| `health.*` (§12.6) | host `health` | warn / error | collector | one suggestion action + optional second |
| `match` `catalog` `monitor` `window` | any refused command | error | inline when the message carries a path, else collector | — |

Rules that the audit makes explicit:

- **Dismiss is not an action.** It always exists (the × on inline, *Dismiss*
  in the dialog) and is not counted; the three-action cap is on *solve*
  actions. `NOTICE_COPY` may name `dismiss` copy without it being in
  `actions`.
- **Confirms stack; dialogs do not open dialogs.** A second question is a
  `pushFrame` on the same notice (depth ≤ 3, the third may be the pin).
  `ConfirmDialog` gains `frames` to carry the same stack for arm → confirm →
  pin, so the one component that is not a notice follows the same rule.
- **Surfaces stay the three of §14**: inline (has `targetPath`), dialog
  (`block`), collector (everything else); the status bar shows the latest
  non-inline one-liner. Toasts remain success-only (§10.8).
- **A health item is a notice.** There is no fourth surface; the status
  bar's health dot is a summary of the same list (§12.6).
- **No notice on Stage, ever.** Audio failures on Stage are reported to the
  host by Stage (`stage_report { code }`, a third Stage command) and become
  `health.audio_*` notices in Studio.

### 12.5 Audio

The interface is the **cue key**; nothing above it names a file (§2.25).

```text
packages/design-stage/audio/
  manifest.ts        CUE_KEYS · the shipped file per key · export type CueKey
  lock.wav correct.wav wrong.wav overlay_start.wav play_start.wav
  timer_start.wav timer_pause.wav timer_expired.wav
scripts/audio-placeholders.ts   `npm run audio:placeholders` — writes the
  eight files above (short PCM WAV, one distinct pitch and envelope per key)
  so a real pack can overwrite them file for file with no other change
```

| Layer | Where | Job |
| --- | --- | --- |
| `AudioSettings` | host `flags.rs` → `ControlSettings.audio { volume: u8, muted: bool, cues: BTreeMap<CueKey, CueBinding> }` | Control-behaviour keys (§2.5); `CueBinding = { file: Option<String> }`, `None` mutes that key. Written by `settings_set_global { audio_volume \| audio_muted \| audio_cue }` |
| `play-state.audio` | `PresentationService::play_state` merges `{ volume, muted, cues }` from `FlagService::audio()` (passed in per call, like `revealModes`) | Stage reads the live values from the same emission everything else arrives in; **`CONTRACT_VERSION` bumps** |
| `cuesFor(prev, next)` | `apps/stage/src/audio/cues.ts` | pure diff of two `PlayStateForStage` → `CueKey[]`: a lock appeared → `lock`; outcome `correct` / `incorrect` appeared → `correct` / `wrong`; `overlay.active` changed key → `overlay_start`; status `loaded → playing` → `play_start`; timer `running` flipped on / off → `timer_start` / `timer_pause`; `remainingMs` reached 0 with `outcome === null` → `timer_expired` |
| `AudioPort` | `apps/stage/src/audio/port.ts` | `{ play(cue): void; set(volume, muted): void }` — the seam. Two adapters: `howlerAudio(manifest)` (the Stage window, `howler` installed here) and `silentAudio()` (the Viewer iframe, tests, `dev:stage` fixtures) |
| Synth | **absent** | `feat.audio.synth` is a switch with no adapter behind it. A Stage test greps `apps/stage/src` for `AudioContext`, `OscillatorNode` and `@web-kits/audio` and fails on a hit; `require_feature(AudioSynth)` guards nothing yet because nothing asks |

- Cues play on the **Stage window only**. The Viewer iframe gets
  `silentAudio()` from `viewerHost()`; Studio plays nothing.
- `feat.audio` off → `silentAudio()` regardless of the pack.
- Volume and mute are live: `set()` runs on every `play-state` whose `audio`
  changed, and Howler's global volume follows — mid-Play, mid-cue.
- Control gets a **mute toggle** in `ControlTopBar` next to ⚙
  (`IconButton icon=volume|volumeMuted`) → `settings_set_global {
  audio_muted }`. Same command as the Settings row.
- `CueMapRow` (molecule, Settings ▸ Audio ▸ Cue map): cue label · `Select`
  over the bundled files plus *Muted* · a *Preview* icon button that plays
  the file **in Studio through a throwaway `Howl`** — the one place Studio
  makes a sound, and it is the operator auditioning a file, not a cue.
- A missing or unreadable file at load is `health.audio_missing_cue`
  (warn, suggestion *Run npm run audio:placeholders* in dev / *Reinstall*).

### 12.6 Health

Silent until it has something to say (§11.J). One producer, one event, one
family.

- **`HealthService`** (`crates/host/src/health.rs`, a plain module): `check(inputs)
  -> HealthReport { status: ok \| warn \| error, items: Vec<Notice> }` over
  values the app crate hands it — free bytes on the user-data volume, the
  catalog's last write error, the search index state, whether the Stage
  window is created and has called `stage_ready`, Stage's contract version,
  the cue files Stage reported missing. The inputs are parameters, not a
  trait (the monitor seam's discipline).
- **Cadence:** at boot, after every refused persist, and every 30 s from
  `tick.rs` (the 100 ms show loop is not touched). `health` is emitted only
  when the report **changed**; an `ok` after a `warn` is emitted so the dot
  clears.
- **Every item is a suggestion.** A `health.*` notice has ≥ 1 action, and
  the copy table pairs the message with what to do:
  `health.disk_low` → *Open data folder* · `health.persist_failed` (error) →
  *Retry* · *Open data folder* · `health.search_degraded` → *Rebuild index*
  (`catalog_rebuild_search`) · `health.stage_not_ready` → *Open Stage* ·
  `health.audio_missing_cue` → *Reinstall*.
- **Every input needs a reverse (P11.8).** A finding that can only be added
  latches: `missing_cue` had no partner, so one report from Stage held the dot
  amber until the app restarted — through `play_unload`, through closing the
  Stage window. Stage reports `audio_ok` when a cue it had reported loads after
  all, and `cue_ok` withdraws it. There is deliberately no clear on
  `play_unload`: a cue file that really is missing is still missing.
- **An `inline` health item must still be findable (P11.8).** The dot reads
  `report.status`; the collector renders only notices whose `surfaceOf` is
  `collector`. `health.audio_missing_cue` carries `.at("audio.cues")`, so it
  was `inline` and appeared in neither — the dot went amber over a panel
  reading *No notices yet*. The collector now ends with a **"needs attention
  elsewhere"** line, one row per place, each with *Show*. `inlineNotices` is
  the selector and `CHROME.elsewhereAt` maps a `targetPath` to a place; add an
  entry there whenever a new inline notice is introduced.
- **Studio:** `bridge.tsx` subscribes to `health`, replaces the previous
  report's items in the notice store (health notices carry
  `detail.source = 'health'` and are replaced, never accumulated), and the
  `StatusBar` dot reads `status` — `success` ok, `warning` warn, `danger`
  error, `neutral` before the first report — and opens the collector.

### 12.7 Components

| Level | Components |
| --- | --- |
| atoms | `PinField` (password, numeric, eye toggle) · `ChordField` (record one chord, renders `Kbd`s) · `SegmentedField` (HeroUI `ToggleButtonGroup` single-select, `label` `hideLabel` `disabledReason`) · `DurationField` (`NumberField` in seconds, value in ms) · `OptionalNumberField` (`Switch` + `NumberField`, `null` when off) |
| molecules | `SettingsGroup` (title · description · `SettingRow`s from a `SETTINGS_GROUPS` entry) · `DifficultyMapField` (linear factor ⇄ band table) · `CueMapRow` · `MonitorCard` (`stage` `remembered` `free`) · `PathRow` (label · path `studio-mono` · reveal) · `PinPrompt` (popover or frame) · `ShortcutRow` (label · `ChordField` · default · reset) · `WizardSteps` (the step rail, `done` `current` `todo`) |
| organisms | `FirstRunFlow` (the four steps, state, finish) · `MonitorsSettings` · `SettingsForm` · `ShortcutsEditor` · `DataActions` (Wipe Plays / Remove generated data with frames) · `HealthDot` (status-bar summary, replaces the placeholder) · `OperatorPinPanel` (inside `OperatorEditor`) |
| templates | `WizardLayout` (rail · body · footer, no chrome) · `SettingsLayout` (header · inner tabs · scrolling column) |
| pages | `FirstRunPage` · `SettingsPage` (replaces the stub) |

New `ICONS` keys: `volume` `volumeMuted` `keyboard` `pin` `pinOff` `folder`
`reveal` `health` `eye` `eyeOff` `wizardDone`. New chip meaning: none
(`seed` and `pinned` exist). New empty state: none.

### 12.8 Host and contract changes

| Where | Change |
| --- | --- |
| `crates/host` | `catalog/seed.rs` (the Demo document, `Origin` enum + column + migration) · `RosterEmpty` in `build_snapshot`, `BoardEmpty` moved there · `health.rs` · `AudioSettings` + `CueKey` in `flags.rs`, `GlobalSetting::{AudioVolume, AudioMuted, AudioCue}` · `PresentationService::play_state` takes `AudioSettings` · `operator::{hash_pin, verify_pin}` (argon2) · `CatalogService::{seed_demo, wipe_plays, edited_seed_count}` · `stage::CONTRACT_VERSION` bump |
| `crates/app` | `demo.rs` and `seed_demo_library` **deleted** · commands `catalog_seed_demo` `operator_set_pin` `operator_activate` `wipe_plays` `uninstall_data` `paths_get` `paths_reveal` `health_get` `catalog_rebuild_search` `stage_report` · `health` emission from `tick.rs` (30 s) · `STAGE_COMMANDS` += `stage_report` |
| `packages/contract` | `PlayStateForStage.audio` · `CueKey` · `CONTRACT_VERSION` · `COMMAND_GROUPS` additions · `HealthReport` · `STAGE_COMMANDS` |
| `packages/design-stage` | `audio/` (manifest + eight placeholder files) |
| `apps/stage` | `audio/{port,cues,howler,silent}.ts` · `stage_report` on a failed load · `App` wires `useAudio(host)` |
| `apps/studio` | everything in §12.7 · `copy/settings.ts` `copy/firstRun.ts` · `NOTICE_COPY` for §12.4 · `chrome.settingsInner` · fake host: seed mirror, pin, shortcuts, audio, health |

### 12.9 Tests

- `crates/host`: `build_snapshot` refuses an empty roster and an empty
  board with the right `target_path` (exit criterion 1) · `seed_demo`
  `missing` keeps an edited row and restores an archived one, `overwrite`
  rewrites it · `hash_pin`/`verify_pin` round-trip and reject · a gated
  command with a Play open is refused before any pin check · `health::check`
  is `ok` with no findings and pairs every item with ≥ 1 action ·
  `settings_set_global(AudioMuted)` succeeds while playing and
  `settings_set_current_game(ScoringMode)` is refused (exit criterion 3) ·
  `stage_contract.rs` carries `audio` in every fixture.
- `packages/contract`: every `Notice` fixture and every `NOTICE_COPY` key has
  ≤ 3 actions (a test walks the copy table — exit criterion 2).
- `apps/stage`: `cuesFor` over fixture pairs yields exactly the listed cues
  and nothing on an identical pair · `howlerAudio.set` is called when
  `audio` changes and not otherwise · the source grep for
  `AudioContext|OscillatorNode|@web-kits/audio` finds nothing (exit
  criterion 4) · the Viewer host installs `silentAudio`.
- `apps/studio`: `FirstRunPage` renders when the operator list is empty and
  the shell otherwise · the operator step cannot be skipped · Settings
  renders every `SETTINGS_GROUPS` key through a `SettingRow` and shows the
  host's reason for a frozen key · a recorded chord issues one
  `settings_set_shortcut`; a refusal renders *Keep* / *Reassign* and
  *Reassign* issues two · switching to a pinned operator opens `PinPrompt`
  and sends the pin to `operator_activate` (never hashes) · *Wipe Plays* is
  disabled with a reason while `play-state` is open · `health` replaces
  rather than accumulates and the dot follows `status` · `chrome.test.ts`
  still finds no Play-shaped key.

### 12.10 Not in P10, decided

Per-operator `control_layout.json` on disk (stays in `localStorage` keyed by
operator; nothing else reads it) · Statistics display assignment (row
present, `feature_off` until P11) · user-replaceable cue packs and Stage
beds (v2) · a synth adapter (§2.25) · app-file removal (P12's installer;
`uninstall_data` removes generated data only) · window-close dirty guard
(P12) · a lockout after wrong pins.

### 12.11 As built

The section shipped as proposed. What a later phase should know:

- **First run latches.** The operator step creates and activates a row, so
  the "no operator exists" condition that raised the wizard goes false
  halfway through it. `App` therefore latches the decision and leaves the
  wizard only when `FirstRunPage` reports `onDone` — its own Finish. Without
  the latch the sample and defaults steps never render.
- **`run.ok` is the verdict, `run` is the payload.** Most §13 commands answer
  `()`, which reaches the webview as `null` — the same `null` a refusal
  returns, so `await run('play_load', …) !== null` is always false.
  `useHostCommand()` now exposes `run.ok(…)`, and every call site of a `()`
  command (`operator_activate`, `operator_set_pin`, `uninstall_data`,
  `play_load`) asks it. A command that answers with a value
  (`wipe_plays`, `catalog_upsert`, `catalog_seed_demo`) still reads `run(…)`.
- **The fake host answers `settings_get.disabled`.** It carries the freeze
  (`GAME_AFFECTING_KEYS` while a Play is open) and the audio feature graph,
  mirroring `flags::disabled`; the inert interlocks need a recipe in Control,
  which the fake never loads. A test that wants a frozen key sets both
  `fake.playState` (what the host sees) and `receivePlayState` (what Studio
  reads).
- **Tests** landed as `pages/settings.test.tsx` (groups, the frozen reason,
  the gated data actions, chord recording and the conflict's two actions, the
  pin prompt, the unskippable operator step), `copy/notices.test.ts` (the
  ≤ 3-action audit), `apps/stage/src/audio/*` (cue mapping, the Howler
  adapter, the no-synth source grep) and the host suites named in §12.9.

---

## 13. Statistics (P11)

Status: **as built, P11, 2026-09-06.** Two jobs — the Play on the desk right
now, and everything that ever happened — from one host command. Rules that
hold across the section: **Statistics writes nothing** (§11.K "reads
projections, never writes rules"), so no file under `statistics/` imports
`useHostCommand`, and a test greps for it; a number shown here is the number
the scoreboard showed, because both fold the same log; the optional second
window is Studio on another display, never a second Stage.

### 13.1 One command, one document

`stats_query` is the whole family (§13). The host answers it from the Play
logs — `crates/host/src/stats.rs` is a pure fold, `CatalogService::stats_query`
is the thin thing that decides which logs to read:

```text
events ──facts()──▶ [TurnFact] ──aggregate(query)──▶ StatsResult
```

**A resolved turn is the unit.** One issued-answered-revealed question is one
`TurnFact` carrying who, what, which domain, how hard, how fast and what it
was worth, so every metric is a fold over one row set and one command feeds
the Live tiles, the table, the cards and the charts.

```ts
interface StatsQuery {
  filter: StatsFilter          // §11.K's "all variables + time"
  groupBy: StatsDimension      // team | domain | question | difficulty
                               // | operator | recipe | play | day
  metrics: StatsMetric[]       // the columns, in order; [] = the defaults
  limit?: number
}
interface StatsResult {
  groupBy: StatsDimension
  metrics: StatsMetric[]
  rows: StatsRow[]             // { key, label, values, turns, plays }
  totals: StatsRow
  playCount: number
  turnCount: number
}
```

Three rules that keep the arithmetic honest and are covered by tests:

- **An undone turn is not a fact.** `TurnInverted` takes a span out of the
  projection (§2.7) and out of statistics, so the table and the Stage
  scoreboard can never disagree.
- **A metric with nothing to average is `null`, not `0`.** An operator-pace
  Play has no lock time; a zero there would be a lie about speed.
- **A rehearsal (one active team, §4.3) is excluded** from All data unless
  `includeRehearsal` asks for it — it is legal and it skews an average. Live
  includes it, because a rehearsal is what the operator is looking at.

Labels come from the Play's own snapshot, then the current catalog row wins
where one exists (`relabel` in `CatalogService`): §12 says a renamed team is
renamed in Statistics too, and a Play whose team was archived afterwards still
reads correctly.

### 13.2 The page

```text
┌ Statistics ──────────────────────────────────────────────────────────┐
│ Live | All data                                    [grid|table]      │
├──────────────────────────────────────────────────────────────────────┤
│ Live:      tiles: Leading · Questions ▬ · Accuracy ▬ · Round ·       │
│            Fastest lock                                              │
│            By team: rank · colour · team · points ▬ · turns …        │
│            Score over turns (one line per team)                      │
│            By domain (verdicts)  |  By difficulty (bands)            │
│            Award ledger (working closed)                             │
│ All data:  Time · Game · Team · Domain · Verdict · Group by          │
│            [More options · n]  [Clear filters]                       │
│            Plays · Turns · Accuracy · Points                         │
│            [Chart ▾]  StatsChart, its kind from Group by             │
│            StatsTable | StatsCards — 50 rows, then Show all N        │
└──────────────────────────────────────────────────────────────────────┘
```

**A picture first (P20).** The maintainer found the tab hard to read: numbers
in tables, one chart at the bottom. Since P20 each view leads with what it means
and keeps the table for the detail.

- **Live** reads two sources, each for what it owns. What the scoreboard shows
  comes straight off `play-state` — scores, ranks, team colours, questions
  left, the round, who holds the token. What needs the log is three
  `stats_query`s scoped to the open Play — by team (with the award ledger,
  `detail: 60`), by domain and by difficulty — refreshed on
  `operator.eventCount`, the Timeline's trick (§10.3), not a clock.
- **The tiles** (`StatCard`) say what they mean: *Leading* (the top score;
  the team, or "*n* teams tied"), *Questions* (asked / asked + left, with a
  meter, "*n* left" under it — asked is what the log resolved, since a team
  keeps the token through a run, left the board's unconsumed rest), *Accuracy*
  (with a meter of 100), *Round* ("*team* holds the token"), *Fastest lock*. A
  figure the log cannot give yet is an em dash, and a meter is drawn only over
  a figure.
- **By team** is the leaderboard in the scoreboard's order (`leaderboard(play)`)
  with the host's ranks — ties share one, `1, 1, 3` — not ranked by turns. Every
  team of the Play has a row (em dashes where the log has nothing yet), a swatch
  in its colour, and its points drawn as a bar against the leader's; no Total
  row, the tiles carry the totals. A theme colour (`var(--state-…)`) is Stage's
  token and Studio cannot draw it, so that team has no swatch and its race line
  takes one of ECharts' own colours.
- **Three charts**: *Score over turns* (`race`), then *By domain* (`verdicts`:
  correct, partial and wrong stacked) and *By difficulty* (`bands`: the points
  each band paid) side by side once the column is 48rem wide.
- **The award ledger is last** (§14.5), its *Show working* off by default.
- **All data** is one command with the filter document the bar builds. The
  bar is one row — Time · Game · Team · Domain · Verdict · Group by — and what
  is asked least, *Columns*, *Include rehearsals* and *All workspaces*, waits
  behind *More options*. A hidden filter is never invisible: the closed button
  reads *More options · n* when *n* of those three are not at their default.
- **Then a summary strip** — *Plays*, *Turns*, *Accuracy*, *Points*, the
  answer's own counts and totals (an em dash when the column was not asked) —
  then the chart, with a *Chart* picker for the column it draws (none for
  `verdicts`, which draws three), then the table (the default) or the cards
  (§12; the preference is chrome, per operator, like every other list).
- **The chart's kind follows Group by**: *Team* → `ranking`, or `verdicts`
  when Correct and Wrong are both columns · *Domain* → `ranking` · *Day* →
  `timeline` · *Difficulty* → `bands` · anything else → `bars`. The kind is
  read off the answer, not the bar, so while the next answer loads the picture
  stays the one of the rows it was drawn from. When the chart will stack
  verdicts the query asks for *Partial* too — without it a game with partial
  credit stacks short of its turns — and the table and cards still show only
  the columns the operator chose.
- **No Play open** is an empty state that points at Control, not an error.

Rules for the chart, the tables and the host's rows:

- **One file imports ECharts** (`molecules/StatsChart.tsx`), and its `kind` is
  closed: `bars` · `ranking` · `verdicts` · `timeline` · `bands` · `race`.
  EvilCharts is not installed: it is a Recharts component collection, and one
  themed wrapper over ECharts is less surface than a second chart runtime.
- **ECharts is handed rgb colours — never oklch, never `var(…)`.** It paints
  outside CSS, so the theme is read off the chart's own element when it draws:
  a `var(--…)` is resolved to its value, and the value converted to rgb;
  anything still unresolved is the accent. HeroUI's tokens are oklch, which
  ECharts cannot parse — its hover highlight derived an invalid colour from one
  and the hovered bar vanished. Axis text is `--muted` (it read
  `--foreground-muted`, which does not exist, and was always `#666`).
- **Options are memoised.** The option is built in a memo keyed on content
  (colours, totals and roster compared as JSON), so a re-render that changes
  nothing does not call `setOption`; `animation: false`; the instance is
  disposed once, on unmount, and not created where there is no layout to
  measure (jsdom, a hidden panel).
- **`null` is never a zero.** A ranking or a bar leaves the row out; a line
  over days or a bar per band leaves a gap where it stands; the tooltip prints
  an em dash. A ranking draws the top 12 and says the rest are in the table.
- **The race is computed backwards from the scores.** The ledger is capped
  (60 turns), so each line ends at the team's score now and each earlier point
  takes off what that turn paid (points + bonus). When the ledger accounts for
  every point every line starts at 0 and this is the whole Play; when it does
  not, the axis counts on from the turns before it and the note says *The last
  n turns*.
- **Tables and cards show 50 rows** (`STATS_CAP`), then *Show all N*; the
  totals row is never capped, and a bar is scaled against every row, not only
  the ones shown, so *Show all* never rescales.
- **The host orders the rows** (P20.8): days by date and difficulty bands
  easy to hard, whatever they counted; every other dimension ranks by its
  first column, then its label, and `limit` keeps the top. A turn with nobody
  at the desk is its own *No operator* row, never the name of the team that
  answered, and the catalog never renames it. A Play row is its game and the
  day it started (`Quiz Night · 2025-09-06`), the game's current name winning
  as a team's does. The chart draws in the order it is given — except a
  ranking, which is a sort by definition.

### 13.3 The Statistics window (§9)

Optional, off by default, and **opened only by the operator** (revised
2026-09-07). **Since P21.4 it is on the display cards beside Stage**: a card
offers *Show Statistics here* or *Close Statistics* and marks the display it
stands on; *Show / Close Statistics* sits above the cards, the Fullscreen
switch under them. The status bar's displays carry the same cards on every
page, because mid-show is exactly when the numbers go up and come down (it was
a group of its own, and a picker in Control's top strip, until then).

```text
Settings ▸ Monitors ─ Statistics window                   [Show Statistics]
  Statistics display   [ Primary display ▾ ]   where it opens
  Fullscreen           [on]                    off = a window you can size
  Right now            Open | Closed           window state, from the host
```

- **Remembering a display is not showing one.** `stats.monitor_id` says
  *where*; `stats_window { open }` is the only thing that makes the window
  appear or go. A display coming back never re-opens it, and closing it — by
  the button or by its own close box — means closed. This is §9's rule ("the
  host never picks a display") applied to the second window: the earlier build
  opened it the moment a display was picked and re-opened it from the monitor
  watch, so a window the operator had closed came back on the next monitor
  refresh.
- **`stats.fullscreen`** (default on) is the other half of that: fullscreen is
  right on a wall display and wrong on the single display a laptop has, where
  it buries Studio behind a screen of numbers.
- **Whether it is open is window state, not settings state.** The host answers
  it from its own window list, on `monitors-changed` (`statsOpen`); Studio
  keeps it in `chrome/windows.ts` — the store the button's label reads. A
  setting would have been a second truth that re-opens the window whenever
  something reads it.
- It is not a second Stage: Studio's bundle at `studio/index.html?stats`,
  Studio's tokens, the Statistics page alone, no screen, no overlay queue, no
  `anim-complete`. Its empty state offers no "Go to Control" — that window has
  no route stack to go anywhere with.
- **It is addressed, not overheard** (fixed 2026-09-07). `emit::play_state`
  sends the `stats` label the same `main` shape Studio's own window gets, and
  `catalog-changed` / `recipe-changed` go to it too, so a rename relabels the
  numbers. Until that fix this window only worked by accident: every webview
  called `listen()` with no target, which registers `EventTarget::Any`, and
  Tauri lets an `Any` listener past the `emit_to` filter entirely — so all
  three windows received every event, whoever it was addressed to. Studio then
  also received Stage's *stripped* `play-state`, which has no `operator` half,
  and `TopBar` threw on `play.operator.recipeId` the moment a recipe was
  loaded, taking the whole window down while Stage kept drawing. Both webviews
  now listen as their own label (`{ target: { kind: 'AnyLabel', label } }`),
  with a test each.
- `guard.rs` gains `STATS_COMMANDS` — `stats_query`, `get_state`,
  `settings_get`, `monitors_list`, `play_list`, `catalog_list`, `catalog_get`,
  `recipe_list`, `health_get` — and the `stats` label may call nothing else:
  not a write, not `stats_window` itself, not Stage's own handshake.
  `health_get` is on the list because the bridge asks for the report on mount
  the way Studio's own window does; refusing it logged a warning on every open.
- **It never asks `workspace_list`** (P20). The line under the title names the
  workspace from the query cache alone (`useKnownWorkspaces`): in Studio's own
  window the sidebar's read fills it, in this one `workspace-changed` does. The
  page used to call `useWorkspaces()`, which this window may not;
  `guard::statistics_may_only_read` now names `workspace_list` and
  `workspace_counts` among the refused.
- **It is full width** (P20, `SettingsLayout width="full"`): it is there to be
  read across a room. The tab keeps its `wide` column.
- **Windows are never built while the host lock is held.** Building a webview
  pumps the Windows message loop, and the new window invokes as soon as it
  loads — with the lock still held it waits on the command that created it.
  That is what produced a white, unresponsive window when `monitors_list` (a
  read Control makes on mount) created one. `stats_window` reads the settings
  it needs, drops the lock, then touches the window; the monitor watch only
  *follows* an open window and closes it with a notice when its display goes.
- Unplugging its display closes it with a `stats.monitor_lost` notice, and
  nothing about the Play changes.
- **Closing Studio ends the app.** Studio is the application; Stage and
  Statistics are surfaces it puts on displays. Without that, closing the main
  window with a second one open left the process running behind a window of
  numbers that could not start anything.

### 13.4 Components

| Level | New | Notes |
| --- | --- | --- |
| atoms | `MeterBar` (P20) | the tiles are still P7's `StatCard` — it gained `detail` and `meter` rather than a `StatTile` beside it, which would have been the same component twice |
| molecules | `StatsTable` · `StatsCards` · `StatsChart` · `StatsFilterBar` | `StatsChart` is the only ECharts importer and takes a `kind` (P20); `StatsTable` takes `bars`, `cap`, `ranks` and `colors`, `StatsCards` the same `cap`; *More options* is a HeroUI `Disclosure` inside the filter bar. The chart's column picker is a `SelectField` in `AllDataStats`, not a component of its own |
| organisms | `LiveStats` · `AllDataStats` · `AwardLedger` | all read-only; none imports the command hook. `LiveStats` builds the tiles, the ranked leaderboard (`leaderboard(play)`) and the race's roster in ring order from `play-state`; `AllDataStats` holds the filter, the summary strip and the chart's kind per Group by |
| pages | `StatisticsPage` | Live \| All data, the view toggle, the empty state. Takes `onView` so the Statistics window, which has no route stack, can hold the view itself, and `surface` so that window's empty state offers no door out and its column takes the whole display (P20) |

Formatting lives on the metric, not the call site: `formatMetric` reads
`statsUnit(metric)` (a ratio is a percentage, milliseconds are seconds to one
decimal, `null` is an em dash), so the table, the cards and the chart tooltip
cannot disagree.

### 13.5 Tests

- `crates/host`: the fold (names and difficulty off the snapshot, an undone
  turn is not a fact, `None` where nothing can be averaged, every dimension
  groups, filters intersect, the UTC day) and `stats_query` through both
  catalog adapters, including that a query grows no log and that a renamed
  team renames the row.
- `packages/contract`: the registered Tauri handlers are exactly `COMMANDS`
  (this is what would have caught a `stats_query` that existed on one side
  only).
- `apps/studio`: `pages/statistics.test.tsx` — the empty state points at
  Control and asks nothing at all (an empty `playIds` means *every* Play to
  the host); Live scopes every query to the open Play; it refetches when
  `eventCount` grows and not when the countdown ticks; All data asks for the
  dimension the operator picked; every command the surface issued in a run is
  a read; and the source grep: **no file under the Statistics surface imports
  the command hook**, and only `StatsChart` imports ECharts.
- `crates/app`: `guard::statistics_may_only_read` walks `STATS_COMMANDS` and a
  list of writes, `windows::the_statistics_window_is_studio_not_stage` pins the
  URL to Studio's bundle, and
  `windows::nothing_but_the_command_opens_the_statistics_window` reads
  `refresh`'s own source to keep the monitor watch from opening a window.
- `apps/studio`: picking a display issues a settings write and **no**
  `stats_window`; the button shows, then closes, and its label follows the
  host's `statsOpen`; Control offers the same pair.
- P20: `molecules/StatsChart.test.tsx` (each kind; a theme colour never
  reaches ECharts and a literal passes through; axis text from `--muted`;
  re-rendering the same props does not call `setOption`; no animation, an em
  dash for `null`, one dispose), `StatsTable` / `StatsCards` (50 rows, then
  *Show all N*; bars against the largest row; a rank column), `StatsFilterBar`
  (*More options* holds the three and counts what is set), `StatCard`,
  `atoms/MeterBar` (never overflows, never `NaN`); `pages/p20.test.tsx` (the
  tiles, ranks `1, 1, 3`, team colours, the three charts in order, the ledger
  last and closed, the summary strip, the kind per Group by, and the window
  asking no `workspace_list`); `crates/host` (days in date order, bands easy to
  hard, *No operator*, a Play row's label).

### 13.6 Not in P11, decided

Saved filter presets · CSV export (explicitly not in v1) · per-question
answer-distribution charts (they need option-level facts the log does not
carry: `SelectionLocked` records the set, not the miss) · cross-Play
"form guide" trends beyond the day series · a stats window on the same
display as Stage (the picker refuses it).

### 13.7 As built — departures worth knowing

- **The tab list gained `statistics`.** grid | table is per operator like every
  other list tab (§12), so `ListTab` and the persisted `view` document carry
  one more key; an older document falls back to `table`.
- **`useStats(query, liveness, isEnabled)`.** The third argument exists because
  an empty `playIds` means *every* Play to the host: a Live view with no Play
  would have read the whole history to draw an empty state.
- **Three fixes landed alongside**, all pre-existing and all visible here
  first: `Dropdown.Trigger` wrapping a `Button` nests two `<button>`s (HeroUI
  v3's own example puts the Button directly under `Dropdown` — `ActionMenu`
  and both top-bar menus now do); `[role='tab']` no longer wraps to two lines;
  and the jsdom setup stubs `Element.prototype.getAnimations`.
- **`?fake` carries a canned `stats_query` answer** (`demoStats`), the way
  `&play=<fixture>` carries a Play — the fake host does not fold events, and
  the tab needs something to draw in a browser. Since P20 there is one per
  dimension (`fake.statsBy`; team, domain, difficulty, day, operator, game and
  Play), because Live alone asks three at once and one answer relabelled for
  all of them is a table of teams under a Domain heading; and a canned answer
  is read by metric name, so a query gets exactly the columns it asked for, in
  its order, `null` for one the answer lacks.

---

## 14. Rules you can see, awards you can explain (P11.12)

Status: **as built, P11.12, 2026-09-10.** Fourteen settings can move a number
and four of them silently neutralise others. Until now the operator set them
one at a time in a form and found out what the combination meant during the
show. Two surfaces close that: a **preview** in Game ▸ Rules that says what
these rules would pay *before* a Play, and a **ledger** in Statistics ▸ Live
that says what they did pay and why, *after* one.

The rule that holds across the section: **every number on both surfaces comes
from the host, computed with the same function that scores a real answer.**
Studio formats and explains; it never multiplies. A preview that computed its
own numbers would be a second rules engine, and the first thing it would do is
disagree with the scoreboard.

### 14.1 One arithmetic

`crates/host/src/explain.rs` holds the formula, and `award::award_points` is
`explain(..).points`. `base_points` and `speed_multiplier` are fields of the
same breakdown. There is no second copy to drift.

```text
base ──┬─ scoring.flat_points            mode=flat, or lock_speed & base=flat
       └─ scoring.difficulty_map(d)      mode=difficulty, or lock_speed & base=difficulty
            ├─ linear{factor}  → floor(d × factor)
            └─ bands[]         → first band with up_to ≥ d, else the last band

×speed ─ 1 + speed_weight × progress, or exactly 1.0 and a reason why:
         ModeOff · OperatorPace · NeverLocked · WeightZero · OutsideWindow

scaled = floor(base × speed)
verdict → scaled | share of scaled (partial credit) | 0
+bonus  → the streak award, once per token, added after everything else
```

`AwardBreakdown` records every one of those steps, including *which band paid*
(`BaseSource::Band` carries the band's index and its resolved `from..=up_to`)
and *why* a speed factor did nothing. That is what makes an explanation
possible in data rather than in a tooltip written by hand.

**The award is a pure function of `(difficulty, verdict, lock progress,
streak)` and the frozen settings.** It never reads the domain, the team, the
round or the position on the board — which is the operator's own rule, and
`tests/award_compound.rs` holds it down over generated documents rather than
over four-team examples.

Writing those properties over the single copy immediately found two real
defects: a partial share could exceed the whole award when a judgement claimed
more correct locks than existed (unreachable through `judge`, but
`award_points` is public and the ledger re-judges from logs), and two bands
sharing a ceiling produced an overlapping span the ladder would have drawn as
a range.

### 14.2 Two keys that make speed predictable

The P4 factor was `remaining / duration` — a share of whatever clock *that*
question happened to get, so a one-second answer on a 30 s clock and on a 10 s
clock were worth different amounts. Deterministic, but not predictable.

```rust
speed_window: Fraction(f64) | Ms(u32)   // default Fraction(1.0)
speed_steps: Option<u32>                // default None
```

- `Fraction(0.333)` — "no speed bonus after a third of the clock".
- `Ms(10_000)` — the bonus decays over ten absolute seconds, so **the same
  answer time is worth the same on every question** whatever its countdown.
  This is the answer to a board with per-question duration overrides, and the
  preview raises `MixedDurations` to say so when one is set and the window is
  still a fraction.
- `speed_steps: Some(3)` — fast / medium / slow bands where every answer inside
  a band pays *identically* the same. The strongest form of "predictable": two
  answers the operator cannot tell apart cannot score differently.

Both carry `#[serde(default)]`, and `Fraction(1.0)` with no steps reproduces
the pre-P11.12 formula byte for byte. An old `PlaySnapshot` therefore
deserialises into the rules it was played under, and no existing recipe pays
anything different than it did before.

### 14.3 The preview

`rules_preview { recipeId }` is a new §13 verb on `FlagService`, composed in
the app crate the way `play_load` already is — the catalog knows the board, the
flag service knows the interlocks, `preview::build` knows the arithmetic.
`recipeId: null` explains the all-games defaults over an empty board.

```text
┌ Game ▸ Rules ────────────────────────────────────────────────────────┐
│ the form (SettingRow per key)                                        │
├──────────────────────────────────────────────────────────────────────┤
│ What these rules pay                                                 │
│   Countdown  30s from the all-games default · window                 │
│   Points by difficulty and answer speed                              │
│     difficulty × [instant · ¾ · half · ¼ · buzzer · never locked]    │
│   Difficulty bands (when the base is banded) — resolved ranges       │
│   What each setting does — key · what it changes · what disables it  │
└──────────────────────────────────────────────────────────────────────┘
```

- **Rows come from this game's own board** — the difficulties actually on it,
  with how many questions sit at each and which domains they belong to. An
  empty board (or the globals form) falls back to 1 / 25 / 50 / 75 / 100 and
  says so; more than eight distinct difficulties sample evenly with both ends
  kept.
- **Each cell is a whole `AwardBreakdown`**, so the number carries its working
  on hover rather than being a bare figure to trust.
- **`preview.rules` is the point of truth for the effects table.** One entry
  per `AWARD_KEYS` key, in order, carrying **both** what the setting is doing
  and what it is set to. The first version asked the host only "is this key
  disabled" — the §4.2 interlock — and a switch that is *usable but off* has no
  interlock entry, so it fell through to "In use": Rules claimed partial credit
  was on while the form right above it showed the switch off (reported
  2026-09-10). `RuleState` is therefore three-valued, and the distinction is
  load-bearing:

  | state | means | the operator can |
  | --- | --- | --- |
  | `Active` | live, and contributing | change what it does |
  | `Off` | usable, set to nothing — a switch off, an optional unset, a weight of 0 | **turn it on right now** |
  | `Disabled` | a sibling has neutralised it, whatever its value | not use it until the sibling changes |

  An interlock always wins over an off value, because "lock-speed scoring is
  off" is more useful than "the weight is 0". An `Off` key's value *is* its
  state, so the chip says it once rather than "Off Off". A setting that gains
  an interlock cannot be left out, and `preview::rules_for` is the only place
  the two questions are answered — inferring a value from an absence is what
  caused the bug.
- **`preview.effects` is the §4.2 table run over *this* recipe.**
  `settings_get.disabled` can only answer for the recipe in Control, so
  `RulesSection` used to re-derive "the weight is inert" and "the timer is off"
  in TypeScript — a second copy of an interlock, which §4.2 exists to prevent.
  Those copies are gone.
- **Warnings are codes, not sentences** (`PreviewWarning`), rendered from
  `copy/preview.ts` like `RING_ROLE` and `disabledReasonText`.

**The Bands bug.** Before P11.12 this row had its own `SelectField` and a
factor field, and the Bands branch rendered *nothing*: the operator picked
Bands and the panel went blank. `DifficultyMapField` — which already existed,
wired only into the global Settings form — is now used at both call sites, and
`RulesSection.test.tsx` asserts an editable band table appears, by role.

### 14.4 The board's shape

Uneven domains are **not an award problem**, and the answer belongs in Board
rather than in Rules. The award never reads domain membership, so difficulty 21
pays the same in a three-question domain and a thirty-question one. What uneven
domains change is the *ceiling* (a three-question domain is exhausted in three
turns) and the *walk* (easy→hard has fewer rungs). That is board design.

```rust
BoardShape::Aligned { per_domain, rungs, domains }  // same count AND same ladder
BoardShape::Uniform { per_domain, domains }         // same count, ladders differ
BoardShape::Ragged  { min, max, domains }           // counts differ
BoardShape::Empty
```

**The readout adapts to the shape, which is the point of asking.** `Aligned`
collapses to one rung table — "every domain's 3rd question is difficulty 70 and
pays 700" — because then one table is the whole truth about the board. The
other two show the per-domain ladders side by side with the divergence marked,
because there is no single ladder to show. Every shape also lists each domain's
count, its difficulty span, its walk and its `points_available` — the honest
ceiling, every question answered correctly with no speed bonus.

### 14.5 The award ledger

`stats_query` gains `detail: u32` (how many turn rows, newest first; `0`, the
default, returns none) and `StatsResult` gains `turns: Vec<TurnAward>`. **One
command, one document** as §13.1 requires: the ledger is a *detail level* of
the same question, not a second stats verb. `TurnFact` gained `streak` and
`token_ends`, both free from the log.

```text
# · Team · Domain · Question · Diff. · Result · Locked ·
    Base · × Speed · Share · Bonus · TOTAL          [Show working]
      -> clicking a row: the same thing as a sentence naming the settings
```

- **`points + bonus` is the truth; `award.total` is the working.** The TOTAL
  column reads the number the log recorded — what the scoreboard actually moved
  by — and the breakdown explains it. They agree (`demo_scenarios.rs` s16
  replays a whole Demo asserting it), but a log written by an older build is
  still a record of what that Play paid, and a recomputation must never rewrite
  a score.
- **It recomputes from the Play's *frozen* settings**, so a rules edit today
  cannot change what a Play paid yesterday. Labels are relabelled from the
  catalog, like the rows (§12's "rename team → Statistics").
- **It rides on the Live view's existing by-team query.** Asking twice would
  send every breakdown down the wire twice for one view; a test asserts exactly
  one query carries `detail`.
- **Statistics is still a projector.** `AwardLedger` is under the same grep as
  the rest of the surface: no `useHostCommand`, anywhere.

### 14.6 As built — departures worth knowing

- **`data-` hooks do not survive `Panel`.** It takes named props only, so
  `<Panel data-rules-preview>` is silently dropped — and a test keying on one
  would be asserting nothing. Both preview hooks sit on plain wrappers.
- **`Text` is inline by default.** A label and the sentence under it need
  `as="div"` or a flex column, or they run together; the effects table was
  reading "Award modeChooses the base..." until they got one.
- **`NumberField` renders a text input**, so its role is `textbox`, not
  `spinbutton` — HeroUI v3. Worth knowing before writing an assertion about
  one.
- **The P11.7 clock guard was sharpened, not widened.** `playState.test.ts`
  confined `remainingMs` / `elapsedMs` to `usePlayClock`; the ledger names
  `remainingMsAtLock` throughout, but that is the clock as it stood when a turn
  *resolved*, read out of `stats_query` and as still as any other historical
  fact. The rule now exempts a file that never touches the play-state store,
  which points it at the thing it protects instead of at the word.
- **`?fake`'s preview and ledger are fixtures, not a second fold**
  (`host/fake/preview.ts`), the same rule the canned `stats_query` answer
  already follows. They describe the demo recipe the fake seeds — History 20 /
  45 / 70 and Technology 15 / 60, deliberately ragged — so shell work can lay
  the panels out; they do not change when the settings do.

---

## 15. One question per difficulty, per domain (P11.13)

The rule is `optimized_first_spec.md` §2.31 and it is the host's. This section
is only what Studio does with it.

### 15.1 Where the answer comes from

`apps/studio/src/host/board.ts`, beside `host/ring.ts` and `host/session.ts` —
the established pattern for *spelling a host rule so the operator meets it as a
greyed control rather than as a refusal*. Two pure functions:

```ts
blockedMembers(members, allow)     // questionId → the difficulty already taken
oneQuestionPerDifficulty(members)  // difficulty ASC, id ASC — one id each
everyQuestion(members)             // the same order, every id (P12.7)
```

They read only the **effective** difficulty each row already shows
(`recipe.overlays.questions[id]?.difficulty ?? catalog`); whether the rule
applies is the recipe's switch, passed in (§15.4). Deriving the dim
locally rather than from `rules_preview` is deliberate: the preview is a
separate Query keyed on `rev`, so it lags a checkbox by a refetch, and the dim
has to be instant to read as *dynamic*.

### 15.2 What the operator sees

- A member whose difficulty another **selected** question has claimed renders
  at 40% with its checkbox disabled and `GAME.difficultyTaken(n)` as the
  reason — visible, disabled, explained (§4.2). Not hidden: an operator who
  cannot see the alternative cannot choose it.
- **A selected member is never disabled.** A board written by an older build
  can hold two at one difficulty, and disabling both would take away the very
  checkbox needed to fix it.
- **Add domain** ticks one question per difficulty rather than all of them, so
  a freshly added domain is a playable ladder instead of a board the host would
  refuse the moment it was written.
- A host refusal at `recipe.<id>.board.…` renders as an `InlineNotice` at the
  top of the section — `useHostCommand` already routes `<path>: <reason>`
  there, the section just had nowhere to put it before.

### 15.3 The fake refuses too

`host/fake.ts` runs the same check in `recipe_upsert`, `recipe_set_membership`
and `recipe_set_overlay` — including *before* the `Original` scope touches a
catalog row, so a refused write changes nothing there as well. A shell that
only stays legal because the fake never refuses is exactly the shell the app
rejects.

### 15.4 A game that allows repeats (P12.7)

`board.allow_repeated_difficulty` is a `SwitchField` at the top of the Board
section — *Allow repeated difficulties*, with the consequence as its
description (two at one difficulty pay the same and the team cannot tell them
apart). It writes `recipe_set_settings` like any Rules key and freezes with the
page while the game is playing (`frozenReason`). On, `blockedMembers(members,
true)` blocks nothing and *Add domain* ticks `everyQuestion(members)` —
`difficulty ASC, id ASC`, the order the queue asks them. Off on a board that
holds repeats, the host (and the fake) refuse the write and name the clash.
It sits on Board, not Rules: it decides what the board may hold, not what an
answer pays.

### 15.4 As built — departures worth knowing

- **React Aria's listbox cannot be opened under jsdom.** Its selection utils
  throw from a mount effect, so the Add-domain picker is not drivable from a
  component test; the rule it applies is asserted in `board.test.ts` instead,
  where it lives. The `Select` does render a real hidden `<select>` for form
  submission, which is a usable seam for the *value* — but not for the popover.
- **Two controls in this section share the name "Add domain"** — the select
  trigger and the button — and an open React Aria popover marks the rest of the
  tree `aria-hidden`, so a query for the button after opening it finds nothing.
  Capture both before opening.

## 16. Stage speaks two languages (P11.15)

The show is run in Romanian as often as in English, and every label on Stage
was English by construction: `HOPE CHALLENGE | AMiCUS` in the header, `SELECT
CATEGORY`, `LEADER`, `PLACE_01`, `TIMER // REMAINING`. This section makes the
**authored** half of Stage's text translatable and leaves the **derived** half
alone: team names, domain names, stems, options and every number are shown as
the author wrote them, in whichever language the show is in (spec §2.29).

### 16.1 The key

`stage.language` — `en` (default) | `ro` — is a recipe key on the Game tab
(`GameSettings.language`), one `SegmentedField` row at the bottom of Rules:

```
Stage language                                   [ English | Română ]
The labels and titles Stage shows. Team names,
domains and questions stay as written.
```

It is modelled on `reveal`: a Game-tab default that is **not** game-affecting.
A language switch moves no score, so it is never frozen and never disabled —
the row has no `disabledReason` and the `frozenReason` that greys the rest of
the form does not apply. Writing it goes through `recipe_set_settings` like
every other Rules key; when the recipe written is the one in Control the app
crate pushes the key through `FlagService` and re-emits, so Stage redraws on
the next `play-state`.

### 16.2 What Stage does with it

`play-state.language` (contract v7) picks one of two tables in
`apps/stage/src/copy/tables.ts`; `StageRoot` mounts one `CopyProvider` and
every component reads `useCopy()`. The Screens canvas draws the recipe's own
language (`previewPlay` copies it from `recipe.settings`), so the operator sees
the change on the canvas as well as on the wall.

Translated in Romanian: every HUD label, screen title, tag, verdict, overlay
word, meta label and the points unit (`PCT`); the thousands separator groups
with `.`. Shared on purpose: the `//` delimiter, the clock brackets, digit
padding, the champion joiner — those are the design system's, not the
language's.

Two defaults changed with it, because they were the author's sample copy
rather than the product's: the idle eyebrow reads `YOUR TEXT GOES HERE` /
`TEXTUL TĂU AICI` and the tagline `Write your tagline` / `Scrie-ți sloganul`,
and **the header now carries the eyebrow** instead of a brand | partner pair.
The eyebrow is the show's name, written once; the next slice makes it
editable from the Screens tab per language.

### 16.3 Tests

- `crates/host/tests/flag_service.rs`: the key moves during a Play, is not
  game-affecting, and an older document without it reads as English.
- `crates/host/tests/stage_contract.rs`: `language` is in the presentation half
  of every fixture.
- `apps/stage/src/copy/copy.test.tsx`: the two tables have the same keys; every
  authored word differs unless it is on the shared-formatting list; a
  `choose-domain` fixture with `language: 'ro'` draws `ALEGE CATEGORIA // TEAM
  GAMMA` with the team name untouched, and the scoreboard shows `LIDER` and
  `PCT`, never `LEADER`.
- `apps/studio/src/organisms/RulesSection.test.tsx`: pressing *Română* writes
  `recipe_set_settings` with `language: 'ro'`.

### 16.4 Not in this slice, decided

- Studio's own UI language. This section is Stage only.
- The words an overlay shows (`NOW PLAYING`, `ROUND`, the verdicts) and the
  Question screen's `TIMER // REMAINING`, `RESULT`, `QUESTION n` are
  translated only. They are the game's vocabulary, not the show's name.

### 16.5 The show's own words (P11.16)

Eleven authored strings name *this* show rather than the game, and the
operator can change them, per language, from the Screens Inspector:

| Node on the canvas | Edits | Default (en / ro) |
| --- | --- | --- |
| `idle.eyebrow`, every `*.header` | `idleEyebrow` | `YOUR TEXT GOES HERE` / `TEXTUL TĂU AICI` |
| `idle.tagline` | `idleTagline` | `Write your tagline` / `Scrie-ți sloganul` |
| `idle.status` | `idleStatus` | `AWAITING_GAME_START...` / `ÎN_AȘTEPTAREA_JOCULUI...` |
| `idle.session` | `sessionValue` | `2026 - 2027` |
| `teamOrder.title` | `teamOrderTitle` | `PLAYING SEQUENCE` / `ORDINEA DE JOC` |
| `teamOrder.row.*` | `teamDetailLabel`, `teamPointsLabel` | `REGION`, `CURRENT POINTS` / `REGIUNE`, `PUNCTE ACTUALE` |
| `chooseDomain.title` | `chooseDomainTitle` | `SELECT CATEGORY` / `ALEGE CATEGORIA` |
| `question.category`, `currentTeam.domain` | `domainLabel` | `DOMAIN` / `DOMENIU` |
| `scoreboard.title` | `scoreboardTitle` | `CURRENT STANDINGS` / `CLASAMENT ACTUAL` |
| `finalLeaderboard.title` | `finalLeaderboardTitle` | `TOURNAMENT CHAMPION` / `CAMPIONUL TURNEULUI` |

The list, the node map and the validator are `packages/contract/src/text.ts`.
The header row is the reason the eyebrow is edited from six nodes: the
header *is* the eyebrow, written once. Team names, domain names, the team on
the title, the difficulty figure and every number are derived and never
offered for editing.

**Where it lives.** `layout.text[language][key]`, in the recipe layout
document beside `nodes` and `screens`. Same debounce, same `rev`, same
`recipe_set_layout`, and the same push into `PresentationService::set_layout`
that makes a decor dial live on Stage mid-Play. On the wire it rides
`play-state.layout.text` (contract v8); Stage merges the block for
`play-state.language` in `resolveCopy` and reads nothing of the other.

**The Inspector.** Selecting a node that carries editable words shows a
*Text* section above the style fields:

```
Text
English words for this game. Empty means the built-in word;
the Game tab picks the language.
Eyebrow (every header)   [ HOPE CHALLENGE X AMiCUS        ] ↶
```

One `TextField` per key, an undo `IconButton` back to built-in, no
placeholder: the canvas draws the built-in word already, and a placeholder
would be a copy of Stage's tables inside Studio, which the design-system
boundary forbids. The count beside "Inspector" adds text overrides to node
overrides; *Reset every override* clears both, *Reset this screen* leaves
text alone (the eyebrow belongs to every screen).

**Overlays on the canvas.** The toolbar lists the seven screens and then
`Overlay · Token handoff` … `Overlay · Current team`. Picking one puts that
request on air over the last screen picked (`outcome` and `multiple
answers` take Question, where they mean something) and the canvas iframe —
`/stage/?viewer&hold` — draws it at rest: hold mode renders the sheet and
never starts the timeline, so nothing plays out and nothing is reported.
Control's Viewer does not set `hold`. An overlay has no node ids, so there
are no handles and the Inspector says so. Twelve tabs outgrow the toolbar's
line; the list scrolls in its own box rather than pushing the page sideways.

**Tests.** `packages/contract/src/layout.test.ts` (the block parses, trims,
drops unknown languages and keys; the node map), `apps/stage/src/copy/copy.test.tsx`
(`resolveCopy` lands titles in `screenTitle`; Stage draws the Romanian
override under `ro` and the table's word under `en`),
`apps/studio/src/pages/screens.test.tsx` (typing an eyebrow saves one
`recipe_set_layout` with `text.en.idleEyebrow` and nothing in `nodes`; the
canvas iframe carries `hold`; the tab list is seven screens then five
overlays).

### 16.6 Overlays on the canvas are drawn, not played (temporary)

**Could be improved in future versions.** On the Screens canvas an overlay
is a still picture of the request on air, and moving between an overlay and
a screen, or between two overlays, is a cut. Screen to screen still plays
the real base transition, as before P11.16.

**Why it is this way.** On Stage an overlay is a queue item with a timeline:
`OverlayLayer` keeps the request in local state so a live overlay survives
the host clearing `active` mid-animation, and only the timeline's completion
clears that copy. The canvas iframe never starts the timeline (hold mode), so
the copy was never cleared: the first overlay picked stayed mounted and
painted over every screen picked after it, and a second overlay was ignored
because every canvas overlay carries the same `runId`. Fixed in hold mode
only: the layer draws `state.overlay.active` directly, keyed on its kind, and
keeps no copy. Stage and Control's Viewer are untouched — they still queue,
play, and ack.

**What a better version would do.** Play each overlay's enter and exit on
the canvas so the operator previews the motion the audience will see, and
give overlay ↔ screen a real transition, without reporting `anim-complete`
to a host that is not listening. That needs a canvas-only timeline driver
beside `runOverlay`, which is more than this fix should carry.

`apps/stage/src/pages/hold.test.tsx` holds it down: an overlay is drawn and
then gone when the canvas returns to a screen; one overlay swaps for another
at the same `runId`; nothing is played or reported.

## 17. Incomplete questions, import, and a second Demo (P11.17)

The rule is `optimized_first_spec.md` §2.32 and it is the host's. A question
can now be in the library before it is ready for a show — typed in halfway, or
imported from a file that had no difficulties in it — and the operator finishes
it in the editor they already know. Nothing incomplete reaches a Play.

### 17.1 Five gaps, one spelling

| Gap | Reads |
| --- | --- |
| `stem` | the question has no text |
| `options` | fewer than two options |
| `correct` | no option is marked correct |
| `difficulty` | no difficulty is set |
| `domain` | the question sits in no **active** domain |

`crates/host/src/catalog/complete.rs` is the rule and it is pure:
`body_gaps(&Question)` returns the first four and `gaps(&Question,
in_active_domain)` adds the fifth. On a board the domain gap cannot arise — a
board question is a member of its board domain by construction — so the board
and the snapshot call `body_gaps` on the **effective** body (the recipe overlay
applied, §2.17), the way §15 compares the effective difficulty.

`Question::validate` keeps only the floor: stem **or** at least one option;
option ids unique; no option without text; difficulty, when set, 1–100.
`Question.difficulty` is `Option<u8>` (`number | null` on the wire). SQLite
keeps its `NOT NULL` column and `store.rs` maps `0 ↔ None` — `0` was never a
legal stored value, and that avoids rebuilding a table that `domain_questions`
references.

`apps/studio/src/host/question.ts` spells the same rule for display
(`questionGaps`, `acceptsQuestion`, `activeMemberIds`), the pattern of
`host/board.ts` and `host/session.ts`: the row icon, the filter and the
editor's live list read it; the host still refuses on its own.

**Enforcement, host side.** `check_board_difficulties` becomes `check_board`
and refuses, at the same two doors (`recipe_upsert`, `recipe_set_overlay`), a
selected question with a body gap as well as a difficulty clash — at
`recipe.<id>.board.<domain>.question.<qid>`. `build_snapshot` refuses one at
Load, because a question can become incomplete from outside the recipe (an
`Original` edit, or the editor). `preview_board` skips it and raises
`PreviewWarning::IncompleteQuestion`, so Game ▸ Rules says it before Load does.

### 17.2 The import document

One JSON file in the editor's shape. Every field but the list is optional:

```json
{
  "format": "questiongame.questions",
  "version": 1,
  "questions": [
    {
      "question": "Care este capitala Australiei?",
      "options": [
        { "text": "Canberra", "correct": true },
        { "text": "Sydney" },
        "Melbourne",
        "Perth"
      ],
      "difficulty": 50,
      "domains": ["Geografie"],
      "explanation": "Optional."
    }
  ]
}
```

- A bare top-level array of rows is accepted. `format`, when present, must be
  `questiongame.questions`; `version`, when present, must be `1`.
- An option is `{ "text", "correct"? }` or a bare string (a wrong option).
  `correct` defaults to `false`; several `true` make a multiple-answer question.
- `domains` is a list of names or codes (a single string is accepted).
- **Accepted**: the row has question text or at least one option with text.
  **Rejected**: anything else, or a row that is not an object. Everything
  between is *incomplete* with its gaps.
- **Ignored, and said so**: an unknown field (a typo like `dificulty` must not
  vanish silently), a value of the wrong type, a difficulty outside 1–100, an
  option with no text. The row is kept; the report lists what was dropped.
- **Refused whole**, nothing written: invalid JSON (with line and column), a
  wrong `format` / `version`, no row list, more than 2,000 rows.

### 17.3 One command, preview then commit

`catalog_import_questions { text, commit, defaultDomainId }` → `ImportReport`.

```ts
ImportReport { committed, rows: ImportRow[], newDomains: { name, code }[],
               counts: { complete, incomplete, duplicate, rejected } }
ImportRow    { index, status: 'complete' | 'incomplete' | 'duplicate' | 'rejected',
               stem, domains, gaps: QuestionGap[],
               ignored: { field, why: 'unknown' | 'wrong_type' | 'out_of_range' | 'empty' }[],
               reason: 'not_an_object' | 'no_content' | null }
```

`crates/host/src/catalog/import.rs` is a pure `plan(text, library, mint)`;
the service runs it with `commit: false` for the preview and again with
`commit: true` for the write, so the two cannot disagree. The write is one
`catalog_upsert_many`-style transaction: new domains, questions, then each
touched domain's membership (appended in file order, §4.1's sort key).

- **Domains** match an active domain by name or code, trimmed and
  case-insensitive. No match → a new domain, its code suggested the way
  `suggestDomainCode` does. Two spellings of one new name are one domain.
- **`defaultDomainId`** receives every row that names no domain. The dialog
  defaults it to the domain selected in the pane. An id that is not an active
  domain refuses the command.
- **Duplicates** — same stem and the same set of options with the same correct
  marks (trimmed, case-insensitive) as an active question or an earlier row —
  are skipped and counted.
- **Ids** are minted by the host: `q-<8 hex>`, options `<qid>-a`, `-b`, …,
  domains `dom-<8 hex>`. Rows are `origin = operator`.
- Studio-only: `guard` refuses it from Stage and from the Statistics window.

### 17.4 What the operator sees

**Import** (secondary, `import` icon) sits beside *New question* in the
Library header and in the empty state. It opens `ImportQuestionsDialog`:

```
Import questions
[ Choose a .json file ]  or paste below              [ Copy template ]
┌──────────────────────────────────────────────────────────────┐
│ { "questions": [ …                                           │
└──────────────────────────────────────────────────────────────┘
Questions without a domain go to   [ Geografie ▾ ]
─────────────────────────────────────────────────────────────────
42 complete · 7 incomplete · 3 duplicates · 1 rejected · 2 new domains
 #  Question                              Status
 1  Care este capitala Australiei?        Complete
 4  Cine a scris „Luceafărul"?            ⚠ No difficulty · No domain
 9  —                                     Rejected: no question and no options
                                        [ Cancel ]  [ Import 49 questions ]
```

The file is read in the webview (`<input type="file">` + `File.text()`, no
new plugin); the preview re-runs on every change of text or default domain.
A document-level refusal is an `InlineNotice` at `import`. On success the
dialog closes with a toast (*Imported 49 questions · 7 incomplete*).

**The mark.** An incomplete question carries a warning icon in its row's
leading slot, beside the difficulty (`—` when unset, and no band chip); the
tooltip names the gaps. A complete question carries nothing. The same icon
leads `QuestionDetail`, with the gaps listed under it.

**The filter.** An *Incomplete · n* toggle in the question-list toolbar,
applied to the selected domain; under *All domains* it is also the only way to
find questions with no domain. The toggle is chrome (`chrome.ts`
`libraryFilter`, session-only like the archive scope), so it survives opening
a question and coming back — the natural loop is *filter, open, fix, back,
next*. Empty with the filter on reads *No incomplete questions here*.

**Domain rows** show a warning count when the domain holds incomplete
questions; *All domains* counts every incomplete question.

**The editor.** Save needs the floor (question text or one option with text);
gaps never disable it, and a blank option row is dropped on save rather than
blocking it. While gaps remain, a warning line at the top lists them and
updates as you type; it goes when the last closes. The stem is no longer
marked required.
`DifficultyField` takes `null`: an empty number, a *Not set* chip in place of
the band, the slider parked and dimmed; the first touch of either sets it. A
new question still starts at 50.

**Game ▸ Board.** An incomplete member renders at 40% with its checkbox
disabled and the gaps as the reason (§4.2), unless it is already selected —
then it keeps the checkbox and shows the mark, so the board that Load would
refuse can be fixed. *Add domain* ticks one **complete** question per
difficulty.

### 17.5 A second Demo

`seed.rs` holds two documents, `Demo::English` (unchanged — ids, rows, the
10/20/30 walk) and `Demo::Romanian` (`seed-recipe-demo-ro`, rows `seed-ro-*`).
They share no row, so restoring one never rewrites the other.
`catalog_seed_demo { demo, mode }` and `catalog_seed_status { demo }` take
`demo: 'en' | 'ro'`, defaulting to `en`. Both are ordinary release-build
commands (`crates/app/src/lib.rs`), not dev harness.

*Demo (Română)*: teams *Roșu* / *Albastru*; game defaults plus `language:
'ro'` (§16); five domains, three questions each at 10 / 50 / 100, four
options, the first correct:

| | 10 | 50 | 100 |
| --- | --- | --- | --- |
| Istorie | În ce an a avut loc Marea Unire? **1918** · 1859 · 1877 · 1947 | Cine a realizat unirea din 1600? **Mihai Viteazul** · Ștefan cel Mare · Vlad Țepeș · Alexandru Ioan Cuza | În ce an și-a proclamat România independența? **1877** · 1859 · 1866 · 1881 |
| Geografie | Care este capitala României? **București** · Cluj-Napoca · Iași · Timișoara | Care este cel mai înalt vârf din România? **Moldoveanu** · Negoiu · Omu · Peleaga | Care este cel mai lung fluviu din Europa? **Volga** · Dunărea · Nipru · Rin |
| Științe | Care este formula chimică a apei? **H2O** · CO2 · O2 · NaCl | Care planetă este cea mai apropiată de Soare? **Mercur** · Venus · Marte · Pământ | Care este, aproximativ, viteza luminii în vid? **300.000 km/s** · 150.000 km/s · 30.000 km/s · 3.000.000 km/s |
| Biblie | Cine a construit arca? **Noe** · Moise · Avraam · David | Câți apostoli și-a ales Iisus? **12** · 7 · 10 · 40 | Cine a fost primul rege al lui Israel? **Saul** · David · Solomon · Samuel |
| Sport | Câți jucători are o echipă de fotbal pe teren? **11** · 9 · 10 · 12 | Cine a primit prima notă de 10 din istoria gimnasticii olimpice? **Nadia Comăneci** · Simona Amânar · Lavinia Miloșovici · Andreea Răducan | În ce an a câștigat Steaua București Cupa Campionilor Europeni? **1986** · 1984 · 1989 · 1991 |

Settings ▸ Library has one *Restore* row per Demo, each with its own
present · missing · edited line and its own overwrite confirm. First run's
sample step seeds **both** and loads the one the operator picks (*English* /
*Română*); *Skip* seeds neither.

### 17.6 Tests

- `crates/host/src/catalog/complete.rs`: every gap alone and together; the floor.
- `crates/host/src/catalog/import.rs`: the §2.32 matrix — question only,
  options only, neither (rejected), no difficulty, no domain, unknown domain
  (created once for two spellings), `defaultDomainId`, duplicate against the
  library and within the file, ignored fields listed, bad JSON with line and
  column, row cap.
- `crates/host/tests/catalog_service.rs` (memory *and* file): preview equals
  commit and writes nothing; a second import of one file is all duplicates; a
  file that cannot be read writes nothing; difficulty `None` round-trips; a
  board selecting an incomplete question is refused by both doors and by
  `build_snapshot`; the preview counts it. The write is one transaction because
  it is `catalog_upsert_many`, whose atomicity
  `a_bulk_upsert_is_one_transaction_and_an_illegal_row_writes_none_of_it`
  already holds.
- `seed.rs`: the Romanian document is valid, complete, 5 × 3 at 10/50/100,
  `language = ro`, shares no id with the English one; status and restore are
  per Demo.
- `apps/studio/src/host/question.test.ts`: the same gap matrix as the host.
- `QuestionEditor` saves an incomplete question and its gap line follows the
  draft; `LibraryPage` shows the icon only on incomplete rows (role and label,
  not presence) and the filter narrows the list; the import dialog previews
  then commits against the fake; `BoardSection` dims an incomplete member and
  keeps a selected one; Settings has two Restore rows; first run offers both.
- The fake (`host/fake.ts`) runs the same floor, the same board refusal and the
  same import report. A shell that stays legal only because the fake never
  refuses is the shell the app rejects (§15.3).

### 17.7 As built — departures worth knowing

- **Blank option rows are dropped, not refused.** The plan kept the editor's
  old rule that an empty option row blocks Save. A new question opens with two
  blank rows and a row cannot be removed below two, so that rule made *save the
  question text alone* impossible — the one thing §2.32 promised the editor.
  An empty row is now simply not an option yet.
- **The filter key is `libraryFilter`, not `questionFilter`.** `chrome.test.ts`
  refuses any store key that looks like Play state, and *question* is on its
  list. The key is named after the tab instead of loosening the tripwire.
- **`suggestDomainCode` moved to `host/domain.ts`**, so the fake's import can
  name a new domain without importing a molecule; `DomainForm` re-exports it.
  The host's `suggest_code` is pinned to the same numbers by a test
  (`IST_225`, `TII_812`).
- **The fake's English Demo was a different six questions** from the host's
  (`seed.rs`), although its header said it mirrored it. Both Demos now come
  from one table in `host/fake/seed.ts` that matches `seed.rs` stem for stem.
- **Two existing host tests encoded the old rule** — one option, or no correct
  mark, refused. They now assert the floor instead
  (`the_floor_is_refused_by_the_host_not_only_disabled_in_the_editor`), and
  the snapshot tests' hand-made twins got options so they still reach the
  clash they exist to test.

## 18. Production (P12)

### 18.1 The close guard

Studio's close button — the title bar's X, Alt+F4 — no longer ends the process
on the first press. The host holds the window open and emits
`close-requested`; `QuitGuard` (mounted beside the shell, so first run is
covered too) answers:

1. **An editor with unsaved changes** asks through its ordinary `DirtyGuard`
   dialog. The nav store's `askLeave()` hands the guard `QUIT_ROUTE`; *Save*
   then ends in a quit rather than a navigation, *Discard* quits, *Keep
   editing* sends `app_close_cancelled`.
2. **A game loaded in Control** asks once more in a `ConfirmDialog`
   (`severity="warning"`): *Quit questiongame?* — the Play is saved as it
   stands and resumes next time, and Stage closes with Studio. *Quit* sends
   `app_quit`; *Keep working* sends `app_close_cancelled`.
3. **Otherwise** Studio sends `app_quit` at once.

A **second press** of the close button while the question is open exits
regardless. That rule is the host's (`quit::QuitState`), so a Studio that has
stopped answering cannot keep the operator in. Never add a close path that
cannot be escaped this way.

### 18.2 Settings ▸ Data

The Data group opens with three `PathRow`s — the data folder (with *Reveal*),
`questiongame.log` and the performance log's folder — and keeps its two gated
actions. A third row, **Uninstall questiongame**, appears only when the host
reports an uninstaller beside the exe (`paths_get.uninstaller`), which is only
true for a copy the Windows installer put there. It follows the same arm →
confirm → pin shape as the other two, is disabled with *A Play is open* while a
game is loaded, and on confirm the host starts the uninstaller and quits. The
uninstaller's own *Delete the application data* box decides whether the
library goes too. *Remove generated data* now also clears the app's WebView2
browser storage.

### 18.3 Settings ▸ About

A fourth inner tab: **Monitors | Settings | Keyboard shortcuts | About**.
`AboutPanel` is four `SettingsGroup`s:

1. **questiongame** — the version and whether this is the installed or the
   dev build (`app_info`), and the app identifier under it.
2. **Updates** (P12.9) — what the app does and does not do about updates,
   the *Check for updates when questiongame starts* switch
   (`updates.check_on_start`), and *Check for updates*, which answers inline:
   *You have the latest release*, *questiongame X is available* with *Open
   release page*, or *Couldn't reach GitHub* — a sentence, not an error
   notice, because the operator just asked. The start-of-session check is a
   `update.available` info notice in the collector, with the same action.
3. **Licence** — a plain-language GPL-3.0-or-later summary, the GSAP §7
   additional permission, and the full `LICENSE` text.
4. **Third-party notices** — every library and font the build ships, with its
   licence.

The two long texts are files beside Studio (`dist/studio/notices/`, written by
`npm run notices`), fetched from `BASE_URL`. A dev server has none; the panel
then reads *Generated by release builds.* rather than drawing Studio's own
`index.html`. Long text is `Text as="pre"` in a scroll box of its own.

### 18.4 What's new (P12.10)

The first launch after an update opens **What's new**: a `Modal` with the
releases newer than the one the operator last closed it on, newest first,
each a short list of *title + one or two sentences*. It is written **for
operators, not developers** — what they can now do, what works better — and in
**every language the app speaks** (English, Română), with a `SegmentedField`
to switch; it opens in the language new games are made in
(`game_defaults.language`). Settings and buttons are named as Studio shows them.

- The notes are Studio copy (`copy/whatsNew.ts`), not a developer changelog.
  `whatsNew.test.ts` fails a release whose languages say different numbers of
  things, a Romanian cedilla, or a developer word.
- The host says only where the notes start (`whats_new_get`): the version last
  closed on (`app.last_seen_version`), or 1.0.1 for a library 1.0.1 left, or
  nothing for a library this build created (stamped silently).
- It never opens over a loaded game; it waits for `play-state` to go `null`.
  *Got it* records it as seen (`whats_new_seen`); Settings ▸ About ▸ *What's
  new* reopens this release's notes without recording anything.
- **Adding a release:** put its entry at the top of `WHATS_NEW`, in both
  languages, before tagging it.


## 19. questiongame Beta (P13.1)

questiongame Beta is a separate app with a library of its own. Studio says so twice: once, at first launch, and always, in the sidebar.

### 19.1 The welcome

- **When.** `App` renders `BetaWelcomePage` **before** first run, while `beta_welcome_get` answers `show: true` — a Beta build, an empty library (no operator, team, domain, question, asset, recipe or Play, archived ones included), and no `beta.welcome_seen` row. It latches like first run (`welcomeDone`), and until the host has answered `App` renders nothing, so first run cannot latch underneath it. A stable or dev build answers `show: false` and never sees it.
- **Frame.** `WizardLayout`, as first run: the brand is *questiongame Beta*, the step rail slot holds the language toggle (English · Română, the same `SegmentedField` and default as *What's new*), the body is one `Panel` — heading *A library of its own*, then the one sentence the design fixed — and the footer holds the choices.
- **Choices.** *Start empty* (`beta_welcome_done`) leads into first run. *Copy my stable library* (`beta_copy_stable_library`) is the primary action when a stable library is there; it brings the stable operator along, so first run does not follow and the shell opens — with *What's new* for the copied library, because the update check and *What's new* wait until the welcome is answered (`useUpdateCheckOnStart(enabled)`, `useWhatsNewOnStart(enabled)`). No stable library: only *Start empty*, as the primary action.
- **Refusals are inline**, not notices — the shell and its collector are not up yet. Stable running: *Close questiongame first, then copy.* with *Try again* (re-asks `beta_welcome_get`), Copy disabled with that reason. Any other failure names its cause and keeps *Start empty*. A press lands once (a ref, not the busy flag, which React has not re-rendered yet), and `beta.library_not_empty` counts as done — a copy that landed before a crash.
- After a copy every Studio query is invalidated: it is a different library.

### 19.2 The chip

`SidebarNav` reads `app_info.channel` and, on Beta, shows a `Chip` (`tone="accent"`, `variant="primary"`) reading **Beta** beside the app name — and centred under the toggle in the icon rail — named *questiongame Beta* for assistive tech. Never on Stage, never on stable or dev.

### 19.3 In a browser

`?fake&channel=beta` makes the fake host Beta (the chip); `?fake&firstrun&channel=beta` also starts from a truly empty library, which is when the welcome shows.

## 20. Library views — filters, sort, headers and pages (stable 1.1)

Design: `docs/superpowers/specs/2026-10-20-stable-1.1-library-views-design.md`.

**One model, four specs.** `host/listView.ts` is filter → sort → group → page, pure, over the whole list the host sends; `host/listSpecs.ts` declares what each tab offers; `host/useListView.ts` joins the model to the chrome store and owns the selection; `ListToolbar` and `LibraryList` draw it. A tab adds a filter by adding a `FilterDef` to its spec — nothing else changes.

| Tab | Filters | Sort | Group |
|---|---|---|---|
| Questions | difficulty band · difficulty range · answer type · completeness · domain (only under *All questions*) · origin · where (Beta 2.0) | difficulty · question · domains · changed · created | domain · difficulty band · answer type · completeness · where |
| Teams | played · where (Beta 2.0) | name · plays · last played · changed · created | played · where |
| Games | folder · tag · playing now | name · teams · questions · changed · created | folder · status |
| Operators | has a PIN · active operator | name · plays run · last active · created | — |

Every tab also has **Search** (uncapped: every match), **Status** (Active · Archived · All) and **Changed** (any time · today · last 7 days · last 30 days).

- **Filters** is a button with the count in force; its popover holds the tab's filters and *Changed*. The filters in force show as removable chips under the toolbar, with **Clear all**. AND across filters, OR within a multi-select.
- **Sort** is field + direction; in table view the column titles sort too (`aria-sort`). While Search has text, *Best match* is chosen; clearing Search gives back the sort before it, and Best match is never remembered.
- **Group** breaks the list under headers "{label} · {count}" (the count across every page), collapsible for the session. *No domain*, *No folder*, *Not set* come last. A question in several domains appears under each, noted *also in …*; pages count rows, and the footer adds the question count when the two differ.
- **Pages**: 100 by default (50 · 100 · 250 · All). Footer: "101–200 of 1,234 questions", previous / next, page numbers past three pages (`1 … 4 5 6 … 30`). Back to page 1 on any search, filter, sort, group or size change; never on an edit or an archive.
- **Remembered** per operator per tab: sort, group, page size. For the session: filters, search, page, collapsed groups — a fresh start shows the whole library.
- **Selection** holds questions, not rows. A filter or search change clears it; collapsing a group drops that group from it. The table's header checkbox selects the page; the bulk bar offers **Select all {n}** and says "{n} selected ({m} on this page)". Under Status *All* it offers **Archive {n} · Restore {m}**, each touching only the rows it fits.
- **Where the operator is**: back to page 1 on a scope change too (Status, the domain pane); the stored page follows the clamp when a list shrinks, so rows coming back do not jump them forward. Grouping by domain is offered only under *All questions* — inside one domain it would show its questions' *other* domains. A range filter is put the right way round, and is off once it spans 1–100. A sort picked mid-search is kept for the session; *Best match* can be picked again.
- **No table role.** Rows open records and groups carry headings, which a `table` could not hold; the column titles are buttons that say their state (`aria-pressed`, "Sort by Plays, ascending").
- **Empty states**: nothing at all → *empty* (with New) or *archivedEmpty*; every group folded → "{n} {noun} in collapsed groups"; nothing matching → *noResults* with **Clear search** and/or **Clear filters**; the Completeness filter alone at *Incomplete* with nothing left → *allComplete*.

## 21. Workspaces (Beta 2.0)

*Manage workspaces* draws the standard library list (§20) since P21.6: grid ·
table, column headings, the selection strip (*Archive* · *Restore* · *Move to
workspace group…*; the current workspace is never archived in bulk).

Design: `docs/superpowers/specs/2026-10-21-workspaces-design.md`. A workspace is one library of teams, domains, questions and games. The scope is the host's: every list Studio draws is already this workspace's. There is no shared library since beta.2 (`docs/superpowers/specs/2026-10-21-remove-shared-library-design.md`): a row reaches another workspace by copy or move.

- **The switcher** (`organisms/WorkspaceSwitcher`) is the first thing in the sidebar, above *Library*: the current workspace's name, a menu of the others by group (*Ungrouped* last; the current one checked), then *New workspace…* and *Manage workspaces…*. In the rail it is the initials, the name in a tooltip. While a game is loaded in Control it is disabled and says why.
- **Naming** (`pages/NameWorkspacePage`): a library whose workspace has no name opens on *Name your workspace* (work in it already) or *Create your first workspace* (empty), after the Beta welcome and before first run. One field, *Workspace name*, empty, **no placeholder**, *Continue* disabled until it holds a name. Nothing anywhere suggests one: every name dialog (`molecules/NameDialog`) starts empty or with the name being changed.
- **Manage workspaces** (`pages/WorkspacesPage`, route `{ tab: 'workspaces' }`): every workspace by group, archived ones flagged, with **Open · Rename · Move to group… · Duplicate… · Archive/Restore · Delete permanently…**. The current workspace cannot be archived; *Delete permanently* is for an archived one only, names the rows, games and Plays it removes, arms on the first press and asks the pin as its last frame (§14). Groups: **Rename · Move up · Move down · Delete** (its workspaces stay, ungrouped), and *New group*.
- **Copy to… · Move to…** are row actions on teams, domains, questions and games, and one menu, *Copy or move…*, in the bulk bar. Copying questions asks **Bring their domains** (a switch, on): each arrives in the target's copy of its domain, or in a new copy holding only these questions — the dialog names both — and with it off, in no domain. Every one opens the transfer dialog (`organisms/useTransfer`): the workspace to go to, how many were picked, how many more come along and how many are reused there — then the write. A refusal lists who still uses the row; a refused move offers **Copy instead**. The preview is the host's write rolled back (`transfer_preview`), so the dialog cannot promise what the write will not do.
- **Edits that follow their copies** (`organisms/usePropagatingSave`): saving a team, domain or question that has copies asks, in the editor's own frame, *Save here only* · *Also update {n} copies ({m} skipped)*, naming where the copies live and why any is skipped. A row never copied saves as before.
- **Statistics** has *All workspaces* beside *Include rehearsals*; off, it counts this workspace's Plays.
- **List views are per workspace** (`prefs.<op>.workspaceLists`; `lists` is the first workspace's, so a 1.x document carries over) and another workspace starts with a clean session view.

## 22. Domain groups, tags, bulk edits (Beta, P15)

Design: `docs/superpowers/specs/2026-10-21-groups-tags-bulk-design.md`. Organising only: no board, Stage or Play reads a group or a tag.

- **Domain groups…** (inside a domain, Domains & Questions toolbar) opens the domain's groups in order — *New group*, and on each *Rename · Move up · Move down · Delete group* with "*n* questions". Deleting says how many questions stay, ungrouped (or that it has none). A group name is typed (empty field, no placeholder). Its Rename and Delete dialogs stack over it; it stays open beneath them. A group's header in the list carries the same *Rename · Delete group* menu.
- **The list inside a domain** offers *Group: Domain groups* (headers in the operator's order, *No group* last) — the default when the domain has groups and the operator has not picked a grouping for the tab — and a *Domain group* filter. Under *All questions* neither exists.
- **Tags** everywhere on the tab: a *Tag* filter (any-of, ignoring case), *Group: Tag* (a question under each of its tags, *No tag* last), up to three tag chips on a row (`MeaningChip meaning="tag"`, then *+n*), and search finds a question by its tag.
- **Manage tags…** (toolbar): each tag with "*n* questions"; *Rename* (to a name that exists merges them) and *Delete tag*, each confirmed with the count.
- **The question editor**: `TagField` — chips with a remove button, Enter or a comma adds, Backspace on an empty field removes the last; tags already used are offered as the operator types (picking one with the mouse adds it, not the half-typed text), and nothing else is ever suggested; a pasted "a, b" is two tags; leaving the field adds what is in it, unless focus goes to Cancel; at 20 the field stays enabled and says so. Beside each domain the question is in, a *Group in {domain}* picker, saved with the memberships.
- **Edit…** in the bulk bar (before *Copy or move…*): *Tag… · Untag… · Group…* · *Add to domain… · Remove from domain · Set difficulty…* (*Group…* and *Remove from domain* only inside a domain). Each dialog asks for its one value and shows the host's preview — "Applies to *n* questions", "*m* already …", and for *Set difficulty* that a board holding two at one difficulty says so when the game loads. *Tag…* offers the tags already used and asks once typing pauses (200 ms). *Group…* says apart "already in that group" and "not in this domain". The last preview stands while the next is asked, so the counts never blank and *Apply* never goes disabled under the click; on a value changed under the click it asks again before it writes, and its toast says what was written. *Edit…* is not offered in the Archived scope.

## 23. Copy, import, the editor (Beta, beta.3)

Design: `docs/superpowers/specs/2026-10-21-beta3-copy-import-editor-design.md`.

- **A name used twice is said, never refused**: the team, domain and game name fields carry the description "Another {kind} in this workspace is named {name}." while the name matches (ignoring case and spaces) another active row; the transfer dialog says "Club already has a team Red. Both will be there." for a picked row that would arrive beside one.
- **The archive confirm names the games** that use the rows — "the game Friday", "the games A and B" — for one row or a whole selection, archived games not counted; with none, it is the plain confirm.
- **The question editor** asks *This row has copies* only when the question itself changed (text, options, difficulty, explanation, media, tags); a change of domain or group saves without asking. A refused save says why and leaves nothing half-saved.
- **Team colour**: a theme colour shows as a checked swatch, *Theme colour*; the hex field, *Colour code*, is then empty, `#RRGGBB` its placeholder.
- **The import preview**, under each row: *In History (HIS_100)* — "(new)" for a domain the import creates, and "the oldest of 2 named History" / "one of 2 named History" when two share a name — then *Tags: …*, and for a duplicate (status *Duplicate*) *Repeats "…"* or *Repeats row 4 of this file*.
- **Dialog footers wrap** inside the frame; an action never leaves it.

## 24. Games parity (Beta, beta.4)

Design: `docs/superpowers/specs/2026-10-21-beta4-games-parity-design.md`.

- **Pickers** (`organisms/PickerDialog`, a `Modal` `lg`; once something is ticked, only *Cancel* closes it — not Esc, not a click outside — and a refused *Apply* leaves it open with the ticks): *Add teams…* on the Roster, *Add domains…* and, on each domain card, *Choose questions…* on the Board. Each has Search · Filters · Sort · Group (no View, no Status), a *Select all* checkbox for the page with "*n* chosen", a checkbox on every group header (*Select all in {group}* — the whole group, every page), a checkbox per row, the page footer, and *Cancel* · *Apply* (Apply disabled until something changed). Every opening starts from the game and a clean view; ticks survive search, filters and pages. *Choose questions…* opens grouped by the domain's groups when it has them, with Difficulty and Tag filters; a row that cannot be chosen is disabled with its reason (incomplete, or its difficulty taken while repeats are off), and *Select all* skips those, taking the first of each difficulty in list order; the reason is also the row's second line, not only a tooltip. Unticking a group keeps a chosen row that could not be ticked again (an incomplete question), and a group with nothing it could tick has its checkbox off.
- **The cards**: a domain card lists only its chosen questions — text, incomplete mark, *Overridden*, the difficulty chip (opens the dialog), *Reset to original*, *Take off the board*. A row the library no longer has says so in words, never by id.
- **The difficulty dialog** (`molecules/DifficultyDialog`, `md`): the number field, the scope sentence, *Cancel* · *Apply to original* · *This game only*. The buttons are always pressable and judge the value when pressed — the field commits on blur, which the press causes; a whole number 1–100 or it says so; one press at a time. The value this game already asks closes *This game only* without a write, but *Apply to original* of it promotes it to the library, keeping the rest of this game's overrides (its own text stays). *Apply to original* on a row with copies asks *This row has copies* next. The difficulty chip's name says the value ("Difficulty of …: Hard · 80").
- **The Game page header**: *Archive* / *Restore*, then a *More actions* menu — *Duplicate* (opens the copy), *Copy to…*, *Move to…* (disabled while the game plays).
- **The Games list bulk bar**: *Archive n*, *Restore n*, *Copy or move…*, *Select all*, *Clear*. A playing game is left out of Archive (its count does not include it) and of Move — the menu's *Move to…* says so beneath it, and a toast says it again when pressed ("Season opener is playing, so it stays as it is.").
- **Plays** are *Play 1*, *Play 2*… by start time, the date beneath, the id as the tooltip.
- **A refused Load** is titled *This game cannot start yet.* and lands on the section that holds the problem (the Roster now shows its own); the collector opens only when that section is not the one in view. An inline notice never shows the routing path in its text.
- **Rules** warns first, by name, of what is archived and still on the game: "This game still uses what is archived: the team Green, the question “Who…”". Removing the team from the roster, or restoring it, clears the Roster's refusal.

## 25. The rest of the parity audits (Beta, beta.5)

Design: `docs/superpowers/specs/2026-10-21-beta5-the-rest-design.md`.

- **Copies** (Team and Question detail, a domain's edit form), a titled region: "A copy elsewhere" / "*n* copies elsewhere", each by workspace name with *Archived*, a line that saving can update them, and *Stop following its copies*. Nothing for a row never copied.
- **Question detail** shows *Tags* as chips (or *No tag*) and, under *In domains*, each domain with its domain group: "History · Ancient".
- ***Duplicate*** (Teams, Questions, a domain's menu; Teams and Questions bulk bars): toast "Duplicated *n* teams". The copy is a row of its own — no *Copies* — named "Red (copy)", then "Red (copy 2)"; a question keeps its text and the editor's twin note says so.
- **Statistics**: *Group by: Workspace* appears with *All workspaces* on.
- **Settings**: *Wipe Plays* and the Demo rows say "this workspace"; other workspaces are not touched.
- **Manage workspaces**: the library toolbar (Search · Sort · Group, Status) and list; grouped by *Workspace group* by default, *No workspace group* last; a workspace group's header has *Rename workspace group · Move up · Move down · Delete workspace group*; an empty workspace group is listed beneath, with the same menu.
- **Words**: *Workspace group* and *Domain group* everywhere, never a bare *group*; *Question tag* and *Game tag*; the bulk *Edit…* menu reads *Add question tag… · Remove question tag… · Set domain group… · Add to domain… · Remove from domain · Set difficulty…*.
- **Health**: "*n* references in the library point at nothing, or at another workspace." · *Repair…* → "Remove *n* broken references?" (only the references go) · *Remove them*. "Games here that would not load: *n*, *Friday* among them." · *Show games*. "Question tags spelled two ways: *n*." · *Use one spelling*.
- **Manage workspaces** rows read "3 teams · 4 domains · 40 questions · 2 games" under the name; **Statistics** reads "Plays in *Club* — or every workspace, with All workspaces." under its title.
- **The workspace switcher**, disabled while a game is loaded, is reached by Tab and read as "Workspace: {name}. Unload the game in Control to change workspace".

## 26. The interface pass (Beta, P20)

Design: `docs/superpowers/specs/2026-10-22-p20-interface-pass-design.md`; plan and test list: `docs/superpowers/plans/2026-10-22-p20-interface-pass.md`. Tweaks, not a redesign: the Board's *Choose questions…* picker (beta.4) was the model the maintainer liked — the same components, laid out so the eye can follow them. It has to hold for a library five years old (checked on the maintainer's Beta library: about 1,050 questions, 15 domains, a game with 569 questions on its board) and for a first evening with three questions. Screens, Control and Stage are unchanged except where the type scale reached them.

- **Type and theme.** The Studio type scale is emitted at last, and `studio-subheading` names a setting or a titled block (§2.3). Dark is dark gray, not black (§2.1).
- **The page rules** (§2.4): a 48rem reading column, a 22rem second column for related content, frames edge to edge, container queries, the second column following the first, nothing moving because something appeared, a name before its explanation, a summary before the detail.
- **Lists.** `ListArea` puts the toolbar on its own row and the opened row's panel under it; on Questions, Status no longer wraps under the toolbar when a row opens, and below 1280px the panel no longer covers it. `ListToolbar` keeps View · Status top right at every width; the Questions lead (the domain's name) truncates. The selection strip (`BulkBar`) is always there on Teams, Questions and Games, quiet at 0, so ticking, *Clear* or a filter never moves the list; grid view gains a *Select all* for the page. A question's difficulty is one `DifficultyChip` after its stem, the same pill as on the Board (§4.2).
- **Editors** (`EditorColumns`, `EditorActions`): the form at 48rem, a 22rem side from a 60rem page. Team: *Preview* (`TeamPreview`, the Studio mark and the Stage mark) and *Copies*. Question: *Where it is filed* (domains and their domain groups), *Question tags* and *Copies* beside the body. Operator: the PIN panel beside the form, saving on its own. The footer spans the page. The editor pages' unreachable `mode === 'view'` branches are gone — 1.1.1 sends every view to the list's aside.
- **Menus have section names** (§4.6): `ActionMenu` takes sections, draws each item's icon, and a disabled item says why under its name; the bulk *Edit…* and *Copy or move…* menus are drawn the same way, and the Group menu gained its *Group by* header.
- **Managers** (`ManagerDialog`, `PaneList`, `MemberList`): *Question tags…* and *Domain groups…* on Domains & Questions, *Folders and game tags…* on Games — the entries with their counts on the left, the chosen one on the right with its actions and its members (the first 100). *Merge into…* a domain group is one host write, `domain_group_delete { id, into }`: the members join the target, then the group goes, in one transaction; a group of another domain, or the group itself, is refused. *Show in list* filters the list to the entry and closes.
- **Folders and game tags, edited.** The model had them since P7 and nothing wrote them. The Game page's first panel is Name · Folder (`ComboField`: the workspace's folders offered, a new one typed) · Game tags (`TagField` in the game's words); the page header shows the folder and up to four game tags. The Games list shows the folder under the name and the game tags as chips; the row menu gains *Organise* (Folder…, Game tags…), the bulk bar an *Edit…* (*Folder*, *Game tags*). One host write, `recipe_bulk_edit { ids, edits: set_folder | tag | untag, preview }`, one transaction, refused whole: a folder trimmed and at most 60 characters, game tags cleaned like question tags (40 characters, 20 a game, one per spelling, written as the workspace already spells them); a rename is untag + tag in one call. Labels are organisation, not the show: they stay editable while the game plays.
- **Import is a workspace for the file** (`ImportQuestionsDialog`, §17.4). A wide dialog (80rem; once a file is in, a fixed height). The source in one line — the file and its rows, *Choose another file*, *Edit the text*, *Copy template*, *Questions without a domain go to* — then the summary, whose duplicate, rejected and incomplete counts are buttons that filter to them, then the rows in a `PickList` on the import spec: search; filters Status, Missing, Domain, Question tag, Creates a domain, Ignored fields, Skipped; sorts row, text, difficulty, status; grouped by status (duplicates and rejected first, complete last), domain, missing or question tag; pages of 100. Each row is ticked to import or left out — per row, group or page; a duplicate or a rejected row cannot be ticked and says why on its second line. A row opens beside the list (over it below a 64rem body) in `ImportRowForm`: what is wrong first, then its fields; *Apply*, *Apply and next*, *Back to the file's version*, *Leave this row out* / *Import this row*. Edits and skips go to the host as overrides of the file (`{ edits: [{ index, row }], skip: [index] }`) and the host still reads every row with its one reader, so the preview and the import cannot disagree; an override for a row not in the file refuses the import whole. New text drops every edit and skip with it. The template carries question tags, a multiple-answer row and an incomplete one; the dialog says media and domain groups are not read from a file; an ignored tags list says "more than 20 question tags, or one over 40 characters". Esc or a click outside does not drop a loaded file; *Cancel* does. Rows carry *Edited* and *Left out* chips.
- **The picker uses the width** (`PickerDialog`, `PickList`): 72rem and a fixed height, so filtering never moves the frame; the toolbar, the strip and the page footer stay put and only the rows scroll; a *Chosen* pane lists what is ticked in its order (the roster's play order, or the questions' easy→hard walk), each with a remove button; teams and domains run in two columns.
- **The Board** (`BoardSection`, `BoardDomainRow`): a header (the long hint only while the board is empty, the counts, *Add domains…*), *Allow repeated difficulties* as a setting row, the board's shape in a line, then one row per domain — handle, name and code, *n of m questions*, its difficulty span and the points it makes available (the host's `rules_preview`), *Choose questions…*, *Remove from board* — opened to its questions in walk order, difficulty first, *Reset to original* and *Take off the board* quiet until hovered or focused. A board of more than 40 questions or 4 domains opens closed, with *Open all · Close all*; a small one opens. `BoardBalance` lost its domain table; the closing shape hint is gone.
- **Rules and Settings.** Rules is grouped and titled as Settings groups it, with Settings' own controls and the duration in seconds; on a wide page *What these rules pay* sits beside it, sticky, its warnings compact notices and *What each setting does* a closed disclosure. Settings' inner tabs are as wide as their labels and the Settings tab has *On this page* beside its 48rem column (`SectionIndex`). `SettingRow`'s name is a sub-heading over a caption, and a `wide` row gives its control the full width. `DisabledReason block` stops shrinking a disabled field to its content. The Domains pane's rows are the name over a muted code, the count in one column.
- **Order is dragged** (`SortableList`, §5): the roster (its ↑/↓ buttons are gone), the Board's domains — the order Stage's ChooseDomain grid shows them in — and a question's options in the editor and the import row form.
- **Statistics is a picture first** (§13.2): Live's five tiles, the leaderboard ranked as the scoreboard ranks in team colours, three charts and the ledger last; All data's compact filter bar, summary strip, the chart before the table with its kind following Group by, and 50 rows then *Show all N*. The host orders days and difficulty bands naturally and names *No operator* and a Play's row. The Statistics window is full width and never asks `workspace_list`.
- **The look spec** (`e2e/specs/look.e2e.ts`) is the large-library check: skipped unless `E2E_LOOK_LIBRARY` names a library, it snapshots that file read-only (`e2e_library --copy-from`), plays `E2E_LOOK_PLAYS` (default 6) simulated Plays on the copy, and photographs every surface P20 changed at 1440 and 1100px into `e2e/.artifacts/look-p20-*.png`. A source inside `org.questiongame.desktop` or `org.questiongame.app` is refused: it reads a copy.

**As built — departures worth knowing**

- **The type scale fix changed every surface**, Control, Screens and Statistics included: they had run at 16px since P7 and now get the sizes the scale names. It is the size they were designed at; they were checked on the real app, not adjusted.
- **A label edit is a recipe write and takes a `rev`.** `recipe_bulk_edit` writes each changed game through the same `store::recipe_upsert` as every recipe write, so its `rev` advances once (the plan's pinned decision 1 said labels would not bump it; the build kept one rule for every recipe write). A preview rolls back and moves nothing. The Game page shows `rev` only as the tooltip of its folder chip — a game with no folder shows no `rev` at all.
- **Arrows stay where the list is not a show's order.** The Domain groups manager keeps *Move up* · *Move down* buttons, and the workspace group header its *Arrange* section; only the roster, the Board's domains and a question's options are dragged. A domain group's header in the Questions list offers *Domain group* (Rename) · *Danger zone* (Delete domain group) — no *Arrange*.
- **The managers count on the client.** *Question tags…* and *Folders and game tags…* read their counts from `tag_list` and the games, and write with `preview: false`; the bulk folder and game-tag dialogs say "Applies to *n* games" from the same count. The design asked for the host's preview before every write. *Folders and game tags…* draws no *and N more* line past 100 games.
- **The Chosen pane is hidden below a 52rem dialog body**, and *On this page* below a 60rem Settings column, rather than following their lists; the strip's count still says how many are chosen. The picker's page footer stays at the foot of `PickList`, under the rows, not in the dialog's footer beside *Cancel* · *Apply*: `PickList` is shared with the import dialog, whose footer carries its own count.
- **The Board's collapse rule is more than 40 questions or more than 4 domains** (the design's calls said 30). A domain's name on its row is a `studio-label`, and *Remove from board* is an icon button on the row, not a menu item.
- **The import dialog is 80rem**, not the design's 72rem, and fixes its height only once a file is in.
- **ECharts is handed rgb** (§13.2): HeroUI's oklch tokens broke its hover highlight — the hovered bar vanished. *By domain* stacks correct, partial and wrong; there is no "left" segment.
- **One surface** (P20.11, the maintainer's pick after trying both). The top bar, sidebar and status bar paint the page's background (`--chrome` in `studio.css`; `var(--surface)` gives them their own tone back) and every line the shell drew — under the top bar and the Control and Screens strips, over the status bar, beside and inside the sidebar — is `--chrome-line`, transparent: the lines had used two greys at two heights and never met. Settings sits on the status bar's row at its size (`SidebarItem size="sm"`). A hidden sidebar shows a solid gray bar only when the window's left edge is pointed at or focused, and a press brings it back expanded; it no longer slides in on hover, and while hidden it is `inert`. Editors lost their footer bar (§2.4 rule 3); `WizardLayout` (first run, the Beta welcome, *Name your workspace*) lost its two rules, its buttons under the step's fields.
- **Difficulty is one pill** (P20.10): `DifficultyChip` — `Easy · 20` — wherever a question is listed. On the Questions list it replaced the number column before the stem and the band chip after it; it is `RecordRow`'s `badge`, a column at the end of the question's area that stays when a narrow list hides the chips, and the first chip on a card. A chip never wraps or shrinks.
- **A compact strip** (P20.11): `[data-density="compact"]` in `studio.css` makes every HeroUI button and select inside it 28px with 12px text and 14px icons (HeroUI's smallest are 32 and 36px). Control's top strip opts in; nothing else changes size.
- **The dark scrollbar is 42%**, not HeroUI's 70%, which on a gray page was the brightest thing on screen (§2.1).
- **`MENU` carries three titles no menu draws yet**: *Play order*, *Question tag*, *Game tag*. The bulk *Copy or move…* section is *To another workspace*, not *Copy and move*.
