# P20 interface pass — implementation plan

> Executed natively (the maintainer's version workflow), then an Opus and a Sonnet review over the range; every finding fixed with a test.

**Goal:** the eleven interface items and the game tags and folders editor of `docs/superpowers/specs/2026-10-22-p20-interface-pass-design.md`.

**Architecture:** layout primitives first (type scale, `ListArea`, the always-on strip, `EditorColumns`), then each surface on them. Host changes are small and each mirrored in the fake host in the same commit: import overrides, `domain_group_delete { into }`, `recipe_bulk_edit`, statistics ordering and labels.

**Stack:** React 19, HeroUI v3.2.6 (`Dropdown.Section` + `Header`, `Disclosure`, `Meter`, `ComboBox`, `Modal`), Tailwind v4 container queries, `@dnd-kit/react` sortable, ECharts in `StatsChart.tsx` only; Rust host (`crates/host`), Tauri commands (`crates/app`).

**Spec:** `docs/superpowers/specs/2026-10-22-p20-interface-pass-design.md`. Maps of the code: the seven reader reports of 2026-10-22 (session scratchpad, `p20-map.txt`).

## Global constraints

- Atomic lint: pages → templates → organisms → molecules → atoms; organisms never import templates; molecules import nothing from `host/` (structural prop shapes).
- HeroUI v3 only; a controlled overlay starts at `.Backdrop`; a trigger is the button itself; size `Modal.Dialog`, not `Content`.
- Every operator-readable string in `copy/`; vocabulary per `03_CONTEXT.md` (*Question tag*, *Game tag*, *Domain group*, never a bare *group*/*tag*; *Archive*, never *delete*, except irreversible deletes).
- Keep every test hook: `data-list-header`, `data-list-body`, `data-detail-aside`, `data-record-row`, `data-list-toolbar`, `data-group-picker`, `data-groups-dialog`, `data-manage-tags`, `data-empty-group`, `data-copies`, `data-workspaces-page`, `data-workspace-switcher`, `data-lead`, `data-keep-draft`, `data-bulk-edit`, `data-stats-row`, `data-turn`, `data-operator-pin`.
- Exactly one *Save*, one *Select all* checkbox in table view, one textbox named *Name* per editor; menu item texts unchanged (e2e picks them by exact text); kebab aria-label stays *Open*.
- Statistics: read-only (no `useHostCommand`), one `stats_query`, ECharts only in `molecules/StatsChart.tsx` (literal `from 'echarts'`), `animation: false`, null metric = em dash.
- The import planner and `apps/studio/src/host/fake/import.ts` change together; every new or changed IPC → `npm run map`.
- A field that commits on blur must not eat a press: dialogs judge values on press.

## Review focus

1. A large library: 1,050 questions in one domain group grouping, 569 questions on one board, 15 domains in the side column — nothing renders unbounded (Board rows collapsed, managers cap members at 100, import pages of 100, Statistics tables cap at 50).
2. A tiny library: a first evening (3 questions, 1 game, no plays) — every new surface still reads (empty states, one-column editors, Board open by default).
3. Narrow window (1100 px, sidebar expanded): editors one column, the aside below the toolbar, the strip's actions scroll inside it, the picker's Chosen pane below its list.
4. Import with edits and skips, then the file text changed: overrides drop (indexes belong to the old file); a skipped row never counts as a duplicate's original.
5. Theme colours (`var(--state-*)`) in previews and charts: never printed, never handed raw to ECharts.

---

### Task 0 — the type scale  ☑ (done first)
`packages/design-studio/tokens/theme.css` `@theme static`, weights and tracking restated; `packages/design-studio/src/tokens.test.ts` compiles globals + tokens and fails on any `studio-*` variable not emitted.

### Task 1 — list layout: the toolbar row, the strip
**Files:** create `templates/ListArea.tsx`; modify `templates/LibraryTabLayout.tsx` (+`toolbar`), `organisms/ListToolbar.tsx`, `molecules/BulkBar.tsx`, `organisms/LibraryList.tsx`, `pages/LibraryPage.tsx`, `TeamsPage.tsx`, `GamesPage.tsx`, `OperatorsPage.tsx`.
**Interfaces:** `ListArea({ toolbar, children, aside?, onCloseAside? })` — toolbar row, then `relative flex` row of list + `DetailAside`. `BulkBarProps` gains `page?: { all: boolean; some: boolean; onChange(on: boolean): void }`; `count === 0` renders the quiet strip (`data-bulk-idle`), no `role="toolbar"`. `ListToolbar` renders `[left: lead, Search, Filters, Sort, Group][right: View, Status]`, the right cluster only when either is passed.
- Steps: tests (strip present at 0 and list body top unchanged after a tick — assert the strip element is the same node; grid shows a page checkbox, table does not duplicate it; the Questions toolbar is outside the aside's row) → implement → page tests → commit.

### Task 2 — editor pages
**Files:** create `molecules/EditorColumns.tsx`, `molecules/TeamPreview.tsx`; modify `templates/RecordPageLayout.tsx` (default fluid, `wide` 96rem), `molecules/EditorFooter.tsx` (`withSide`), `organisms/TeamEditor.tsx`, `QuestionEditor.tsx`, `OperatorEditor.tsx`, `molecules/DomainPicker.tsx`, `molecules/DomainForm.tsx`, `pages/TeamPage.tsx`, `QuestionPage.tsx`, `OperatorPage.tsx`.
**Interfaces:** `EditorColumns({ children, side?, sideLabel? })`; `TeamPreview({ name, shortCode, color })` (non-interactive; `var(...)` → hatched box + *Theme colour*); `EditorFooter({ …, withSide? })`.
- Steps: tests (the side column is an `aside` named by `sideLabel`; question side holds `[data-group-picker]` and the tag field; team preview shows the Stage letter and never a `var(` string; operator PIN panel is in the side when editing; one Save) → implement → commit.

### Task 3 — menu sections
**Files:** `molecules/ActionMenu.tsx` (sections, icons, `disabledReason`, `renderMenuSections`), `copy/index.ts` (`MENU`), every caller (Teams, Library, Games, Operators, DomainPane, GamePage, WorkspacesPage, LibraryPage group header, GroupsDialog/ManageTags kebabs), `organisms/useBulkEdit.tsx`, `organisms/useTransfer.tsx`.
**Interfaces:** `ActionSection { id; title; items: ActionItem[] }`; `ActionItem.disabledReason?: string | null`; `ActionMenu({ sections, onAction, label?, size? })`; `renderMenuSections(sections): ReactNode[]`.
- Steps: tests (headers render with titles from `MENU`; empty sections skipped; a disabled item shows its reason; item names unchanged) → implement → commit.

### Task 4 — managers
**Files:** create `molecules/ManagerDialog.tsx`, `molecules/PaneList.tsx`, `organisms/QuestionTagsManager.tsx`, `organisms/DomainGroupsManager.tsx`; retire `ManageTagsDialog.tsx`, `GroupsDialog.tsx` (keep `useGroupEditing`); host `domain_group_delete { into: Option<DomainGroupId> }` (`crates/host/src/catalog/groups.rs`, store, `crates/app/src/commands/groups.rs`), fake mirror.
**Interfaces:** `ManagerDialog({ isOpen, onClose, title, description?, list, detail, footer, dataAttr })`; `PaneList({ entries: {id,label,count,muted?}[], selectedId, onSelect, search? })`; `LibraryPage` passes `onShowInList(filter)`.
- Steps: host test (merge moves members into `into` and deletes in one transaction; refuses an `into` of another domain) → fake parity test → Studio tests (select a tag shows its questions; Merge into previews then writes; Show in list sets the filter and closes; *No domain group* entry) → commit.

### Task 5 — game tags and folders
**Files:** host `crates/host/src/catalog/recipe_labels.rs` (or `bulk.rs`): `recipe_bulk_edit(ids, edits, preview) -> BulkReport`, clean folder/tags; command in `crates/app/src/commands/catalog.rs`; fake mirror; atoms `ComboField.tsx`; `pages/GamePage.tsx` (Name · Folder · Game tags panel); `pages/GamesPage.tsx` (bulk Edit…, row *Organise*, manager button); `organisms/GameLabelsManager.tsx`; `organisms/useGameLabels.tsx`.
**Interfaces:** `RecipeEdit = { op: 'set_folder'; folder: string | null } | { op: 'tag'; tag: string } | { op: 'untag'; tag: string }`; `recipe_bulk_edit { ids, edits, preview }` → `BulkReport`.
- Steps: host tests (one transaction; rename = untag+tag keeps one; cleaning; preview writes nothing; refuses 21 tags) → fake parity → Studio tests (folder combobox offers existing folders and accepts a new one; game tag field; bulk Set folder writes once; manager rename folder) → commit.

### Task 6 — import
**Files:** host `crates/host/src/catalog/import.rs` (`ImportRowBody`, `ImportOverrides { edits, skip }`, `skipped`, `counts.skipped`, duplicates keep tags/domains), `service.rs` (`import_questions(…, &overrides, …)`), command args `edits`, `skip`; `host/fake/import.ts`; Studio `host/listView.ts` (`importQuestions` tab, optional `changedAt`), `molecules/ListControls.tsx` (`changed` optional), `host/listSpecs.ts` (`importSpec`), `organisms/PickList.tsx` (from PickerDialog), `molecules/ImportRowForm.tsx`, `organisms/ImportQuestionsDialog.tsx`, `host/queries.ts` (key with overrides), `copy/index.ts` (template, `fields`, ignored wording, summary skipped).
- Steps: host tests (an edit replaces the row before reading; a skip is reported and not written and not a duplicate's original; body round-trips) → fake parity → Studio tests (filter Duplicate; group by status first; skip a group; edit a row then import writes the edit; text change drops overrides; Esc does not drop a loaded file) → commit.

### Task 7 — the picker
**Files:** `organisms/PickerDialog.tsx` (wide, Chosen pane), `organisms/PickList.tsx` (shared), `copy` (`PICKER.chosenTitle`…).
**Interfaces:** `PickerDialogProps` gains `chosenOrder?: (ids) => ids` and `chosenRow?: (id) => PickerRow` (questions: by difficulty).
- Steps: tests (Chosen pane lists ticked rows in order with remove; questions sorted by difficulty; existing beta4 picker tests pass) → commit.

### Task 8 — Board, Rules, Settings, Domains pane
**Files:** `packages/text/src/index.ts` + `tokens/theme.css` (`studio-subheading`); `atoms/Tooltip.tsx` (`DisabledReason block`) and the field atoms passing it; `molecules/SettingRow.tsx` (subheading name, `wide`); `organisms/BoardSection.tsx`, `molecules/BoardBalance.tsx` (no domain table), `molecules/BoardDomainRow.tsx`; `organisms/RulesSection.tsx` (SettingsGroups, Settings' controls), `organisms/RulesPreviewPanel.tsx` (subheadings, notices, effects disclosure), `pages/GamePage.tsx` (Rules side by side, details panel, rev tooltip); `templates/SettingsLayout.tsx` (tabs w-fit, `aside`), `molecules/SectionIndex.tsx`; `organisms/DomainPane.tsx`.
**Interfaces:** `BoardDomainRow({ name, code, chosen, total, span, points, warn?, isOpen, onToggle, actions, children })`; `SettingRow({ …, wide? })`; `SectionIndex({ entries: {id,title}[] })`; `SettingsLayout({ …, aside? })`.
- Steps: tests (a board of >40 questions or >4 domains opens collapsed with *Open all*; the demo board opens; each domain row shows *n of m questions*, span and points from the preview; *Choose questions…*, *Remove from board* and *Difficulty of …* reachable; the repeats switch keeps its name; Rules groups render with Settings' titles and `[data-effect]` rows stay mounted; the timer duration is in seconds; an inert slider is not shrunk — `DisabledReason block` renders `w-full`) → commit.

### Task 9 — drag and drop
**Files:** create `molecules/SortableList.tsx`; modify `organisms/RosterSection.tsx` (handle replaces ↑/↓), `organisms/BoardSection.tsx` (domain order), `organisms/QuestionEditor.tsx` + `molecules/OptionRow.tsx` (option order, draft only).
**Interfaces:** `SortableList({ ids, onReorder(next): Promise<boolean> | void, disabledReason?, label, renderRow(id, { index, handleRef, isDragging }) })` — optimistic order until `ids` changes identity; a refused write restores.
- Steps: tests (the reorder function: `move` result written once; a refused write restores; frozen → handles disabled with the reason; the roster still has *Remove from roster*) → commit.

### Task 10 — Statistics
**Files:** `molecules/StatsChart.tsx` (`kind`), `atoms/MeterBar.tsx`, `molecules/StatCard.tsx` (`detail`, `meter`), `molecules/StatsTable.tsx` (`bars`, cap), `molecules/StatsCards.tsx` (cap), `molecules/StatsFilterBar.tsx` (*More options* disclosure), `organisms/LiveStats.tsx`, `organisms/AllDataStats.tsx`, `pages/StatisticsPage.tsx` (window full width; cache-only workspace names), `templates/SettingsLayout.tsx` (`full`), host `crates/host/src/stats.rs` (ordinal order for day/difficulty; operator fallback), `catalog/service.rs` (`relabel` Play rows), `host/devFake.ts` (dimension-aware canned answer).
- Steps: host tests (day rows chronological; difficulty rows ascending; Play label "{game} · {date}"; no-operator row) → Studio tests (Live tiles; leaderboard ranked by score; the ledger still renders its rows; difficulty query added; All data summary strip; More options holds the rehearsals checkbox; the window asks no `workspace_list`) → commit.

### Task 11 — the look spec
**Files:** `e2e/specs/look.e2e.ts` (skips unless `E2E_LOOK_LIBRARY`), `e2e/support/folders.ts` (`SEEDS` entry `--copy-from`), `e2e/support/app.ts` (`shot`, `pick`), `crates/host/examples/e2e_library.rs` (`--copy-from`, done), a `--simulate-plays` mode for Statistics data.
- Steps: run against the copy of the Beta library at 1440 and 1100; read every screenshot; fix what looks wrong.

### Task 12 — docs and notes
`05_STUDIO_DESIGN.md` §2.4 principles, §4.1/4.2/4.4/4.6 catalog and vocabularies, §26; `docs/as-built/studio.md` and `host.md`; `04_ROADMAP.md` P20; `history.md`; `03_CONTEXT.md` (Folder); `copy/whatsNew.ts` 2.0.0-beta.6 (EN + RO); CLAUDE.md status line; `npm run map`.


---

## Test list (Sonnet)

Written 2026-10-22 against the tree at `0b93bb6` (P20.2) plus the first host tests of Task 4. Tests marked ✓ were already in the tree when this list was written: keep them, do not duplicate them. Everything else is written **before** its implementation (tdd): run it, see it fail for the reason given under *RED first*, then build. Vitest + Testing Library against the fake host; roles and accessible names over classes; jsdom applies no CSS, so a class is asserted only where the class **is** the rule (marked *class is the rule*). Geometry (what sits where, how wide, how tall) is asserted in the real app by Task 11, not here.

### Legend, helpers, pinned decisions

- **R** = `apps/studio/src/pages/p20.test.tsx` (route level; reuses its `at(route)`, `fake`, `demoLibrary()`, `demoRecipe()`). **R-sort** = `apps/studio/src/pages/p20-sort.test.tsx` (route level, with `vi.mock('@dnd-kit/react')`; a separate file so the mock never touches the other P20 tests). **Fake** = `apps/studio/src/host/fake/p20.test.ts` (the fake host's parity with `crates/host`, in the style of `fake/import.test.ts`). **I** = `crates/host/tests/p20.rs` (integration, `CatalogService::open(CatalogLocation::Memory)`, `const NOW: u64 = 1_790_000_000_000`, the helpers of `tests/bulk.rs`). **U** = the `#[cfg(test)]` module of the Rust file named.
- Helpers to write once at the top of `p20.test.tsx` (no new test infrastructure): `calls(name)` = `fake.calls.filter(c => c.name === name)`; `isDisabled(el)` = `el.disabled || el.getAttribute('aria-disabled') === 'true'` (as `beta4.test.tsx`); `sectionsOf(menu)` = for each `[role="group"]` in an open menu, `[title, labels]` where the title is the text of the element its `aria-labelledby` names and each label is the text of the element a `menuitem`'s own `aria-labelledby` names (so a description under the name never leaks into the name); `rowKebab(rowText)` = the `Open` button inside the row whose text matches (the kebab's aria-label stays `Open`, `Actions: {name}` on Workspaces); `previewedFirst(name)` = the first call of `name` has `args.preview === true`, a later call has `preview === false`, and the two have equal arguments apart from `preview`.
- Copy: tests import constants from `@/copy` (`LIST`, `MENU`, `GROUPS_TAGS`, `PICKER`, `IMPORT`, `STATS`, `GAME`, `RULES`, `PREVIEW`, `TRANSFER`, `WORKSPACE`) wherever one exists, and use the literal where the spec fixes the words (*Leading*, *Questions*, *Accuracy*, *Round*, *Fastest lock*, *No operator*, *Theme colour*, *Chosen*, *Preview*, *Where it is filed*, *Show in list*, *Use this spelling*, *Open all*, *Close all*, *Show all*, *More options*, *On this page*, *Change file*, *Edit text*, *Copy template*, *Apply and next*, *Back to the file’s version*, *Skip this row*, *No domain group*, *Set folder…*, *Clear folder*, *Add game tag…*, *Remove game tag…*, *Folder…*, *Game tags…*). A new constant is named where a test first needs it; the literal is the implementer’s, the vocabulary rules of `03_CONTEXT.md` bind it.
- **Gate, not tests:** the data hooks the plan keeps (`data-list-header`, `data-list-body`, `data-detail-aside`, `data-record-row`, `data-list-toolbar`, `data-group-picker`, `data-groups-dialog`, `data-manage-tags`, `data-empty-group`, `data-copies`, `data-workspaces-page`, `data-workspace-switcher`, `data-lead`, `data-keep-draft`, `data-bulk-edit`, `data-stats-row`, `data-turn`, `data-operator-pin`) are read by existing Studio tests and the e2e specs; those suites passing unchanged is the check, so no separate “the hook exists” test is written. New hooks this list asks for: `data-bulk-strip`/`data-bulk-idle` (✓ in the tree), `data-stats-kind` on `[data-stats-chart]`, `data-stats-bar` on a table bar, `dataAttr` on `ManagerDialog`.
- **Pinned decisions** (the spec is silent; each is pinned by a test below so it is a choice, not an accident — object in review, not in code):
  1. A game’s **labels (folder, game tags) never bump `rev`** and are written by `recipe_bulk_edit` from the Game page too (`recipe_upsert` is the name/rules write). A Play records the rev it ran; labels are not rules. (T5-H8, T5-S2)
  2. An import **edit whose `index` is not a row of the file** refuses the import whole; a stale override must never be silently applied to another row. (T6-H4)
  3. **Skipping a duplicate or a rejected row is a no-op** (their status stands, `skipped` stays false); **skipped rows leave `counts.complete/incomplete`** and are counted in `counts.skipped`. (T6-H5, T6-H6)
  4. The **Chosen pane and a manager’s member list are capped at 100 lines** with “and N more”; the picker’s Chosen pane too (Review Focus 1). (T4-S11, T7-5)
  5. The look spec **refuses a library source inside the live data folders** (`org.questiongame.desktop`, `org.questiongame.app`): it reads a copy. (T11-U2)
  6. A hidden filter is never invisible: the closed **More options** button carries a count when anything inside it is not at its default. (T10-C7)

---

### Task 1 — list layout: the toolbar row, the strip

Already in the tree: ✓ **R** *on Questions the toolbar is not in the row the aside opens in* · ✓ **R** *on Teams too* · ✓ `ListControls.test.tsx` *BulkBar is a quiet strip at 0: it says so, offers nothing to press, and is no toolbar* · ✓ *BulkBar draws the page checkbox it is given* · ✓ `LibraryList.test.tsx` *the strip is there before anything is ticked, and the same element after* · ✓ *grid view has a Select all for the page, table view still has exactly one*.

- **T1-1** `apps/studio/src/templates/ListArea.test.tsx` · *the toolbar is its own row; the list and the aside share the row below it*
  Setup: `render(<ListArea toolbar={<div data-testid="tb" />} aside={<p>Panel</p>} onCloseAside={fn}><p>List</p></ListArea>)`.
  Assert: the `complementary` named `LIST.detail` (`Details`) has a `parentElement` that contains `List` and does **not** contain `tb`; `tb` precedes that row in document order; `Close details` calls `fn` once. Without `aside`: no `complementary`, the toolbar still renders. Without `toolbar`: the list is the first child (no empty wrapper).
- **T1-2** **R** · *the aside’s row never holds the toolbar on any tab that opens a row* (`describe.each` Teams `{tab:'teams',id:'team-alpha',mode:'view'}`, Operators `{tab:'operators',id:'op-andy',mode:'view'}`, Questions `{tab:'library',questionId:'q-h1',mode:'view'}`). Extends the two ✓ above to Operators; Games opens a page, not an aside, so it is not in the table.
  Assert: for each, `aside.parentElement.contains(document.querySelector('[data-list-toolbar]'))` is false.
- **T1-3** **R** · *Status stays inside the toolbar with a row open*
  Setup: Questions with `q-h1` open.
  Assert: `within(toolbar).getByRole('tablist', { name: 'Archive scope' })` exists, and it is not inside the aside’s row. (Principle 6: the thing that used to wrap under the toolbar when a row opened.)
- **T1-4** **R** · *there is one toolbar and one searchbox with a row open* (guards a doubled toolbar from the layout change).
  Assert: `getAllByRole('searchbox')` has length 1 on Teams, Operators and Questions with a row open.
- **T1-5** `apps/studio/src/organisms/ListToolbar.test.tsx` (a `Harness` over `useListView`, as `LibraryList.test.tsx`) · *View and Status are one cluster apart from Search, and the cluster exists only when one of them is passed*
  Assert, both passed: `radiogroup /View/` and `tablist 'Archive scope'` share one `parentElement`, and it does not contain the `searchbox`; document order is Search · Filters · Sort · Group · View · Status (the order `list-toolbar.test.tsx` already pins, kept). Neither passed (the picker’s use): no `radiogroup`, no `tablist`, and the row that holds the left group has no second child (no empty cluster).
  RED first: the pre-P20 toolbar had a single flex row; the cluster assertion fails until the split exists.
- **T1-6** **R** · *the Questions lead is one truncating line*
  Setup: Questions with *All questions*; then a domain whose name is 60 characters.
  Assert: the lead text (`DOMAIN.all`, then the long name) carries `Text`’s `truncate` — an inline style with `text-overflow: ellipsis` and `white-space: nowrap` (`getAttribute('style')`; `Text` has no `truncate` class), and its parent can shrink (`min-w-0`, *class is the rule*).
- **T1-7** `molecules/ListControls.test.tsx` (BulkBar) · *the strip is the same element at 0 and at 1, and the attributes do the changing*
  Setup: `const { container, rerender } = render(<BulkBar count={0} onPage={0} .../>)`, `const strip = container.firstElementChild`; `rerender(<BulkBar count={1} onPage={1} archive={{count:1, run}} .../>)`.
  Assert: `container.firstElementChild` is `strip`; it now has `role="toolbar"` named `Bulk actions` and no `data-bulk-idle`; back to `count={0}`: still the same node, `data-bulk-idle` back, no `toolbar` role.
  RED first: the ✓ tests prove presence in `LibraryList`; this one pins identity at the molecule, where a different root element would silently remount.
- **T1-8** same file · *both states are one height* — `h-11` is in the class list at 0 and at 2 (*class is the rule*: the 56px jump is a height).
- **T1-9** same file · *selected: the count and Clear never shrink, the actions scroll inside the strip*
  Assert: the element holding `2 selected` and the `Clear` button (or its wrapper) have `shrink-0`; the element holding `Archive 2` has `overflow-x-auto` and `min-w-0` (*class is the rule*; Review Focus 3).
- **T1-10** same file · *idle with a `page` prop shows the page checkbox; without it none*
  Assert: `count={0} page={{all:false, some:false, onChange}}` → `checkbox 'Select all'`, unchecked, click → `onChange(true)`; `some: true` → `(input as HTMLInputElement).indeterminate` is true; no `page` → `queryByRole('checkbox')` null.
- **T1-11** `organisms/LibraryList.test.tsx` · *a filter that clears the selection leaves the strip in place, reading 0 selected*
  Setup: `Harness` with five rows, tick `Select t0000`, then `act(() => useChromeStore.getState().setListState('teams', { filters: { big: true } }))` (the spec’s `big` toggle hides every row).
  Assert: `[data-bulk-strip]` is the same node as before; its text is `0 selected`; no `toolbar` role.
- **T1-12** same file · *a list with no `bulk` has no strip* — `Harness` without `bulk`: `[data-bulk-strip]` is null (Operators has no bulk actions).
- **T1-13** same file · *an empty grid shows the strip and no page checkbox* — `items=[]`, `layout="grid"`: `0 selected` is there, `queryByRole('checkbox', { name: 'Select all' })` is null.
- **T1-14** same file · *the strip precedes the list body and ticking does not change what is between them* — before and after `Select t0000`: `document.querySelector('[data-list-body]').previousElementSibling` is the strip (the ✓ test asserts it once at 0; assert it again at 1 and after *Clear*).
- **T1-15** **R** · *the strip is on Teams, Questions and Games from the first paint; Operators has none*
  Assert: after `at({tab})` and the first row, `[data-bulk-strip]` exists with `0 selected` on `teams`, `library`, `games`; on `operators` it is null.
- **T1-16** **R** · *opening and closing a row remounts neither the toolbar, the strip nor the list* (principle 6)
  Setup: `at({tab:'teams'})`; keep `toolbar = [data-list-toolbar]`, `strip = [data-bulk-strip]`, `body = [data-list-body]`; `await act(() => go({tab:'teams', id:'team-alpha', mode:'view'}))`, wait for the aside; then click `Close details`.
  Assert: all three are the same nodes (`toBe`) after opening and after closing.
  RED first: the strip does not exist before P20 (this fails on the strip); keep it as a regression for the other two.

---

### Task 2 — editor pages

Already in the tree: ✓ **R** *a new team shows its preview beside the form* (`Preview`, `stage-letter`) · ✓ *a theme colour previews as Theme colour, never as its token* · ✓ *a question is filed beside its body* (`Where it is filed`) · ✓ *an operator’s pin sits beside the form* (`Pin`) · ✓ *a new operator has no side column*.

- **T2-1** `apps/studio/src/molecules/EditorColumns.test.tsx` · *without `side` it is one column and draws no aside*
  Assert: `render(<EditorColumns><p>Main</p></EditorColumns>)` → `queryByRole('complementary')` null; `Main` present. `side={null}` behaves the same (no empty column).
- **T2-2** same · *with `side` the aside is named by `sideLabel`, follows the main column in the document, and holds none of it*
  Assert: `getByRole('complementary', { name: 'Preview' })` contains the side content and not `Main`; `Main.compareDocumentPosition(aside) & Node.DOCUMENT_POSITION_FOLLOWING` (Principle 5 and Review Focus 3: below the threshold the side follows).
- **T2-3** same · *source guard — container queries, never viewport breakpoints* (principle 4)
  Setup: `import.meta.glob(['../molecules/EditorColumns.tsx','../molecules/TeamPreview.tsx','../molecules/EditorFooter.tsx','../templates/RecordPageLayout.tsx','../templates/ListArea.tsx'], { query: '?raw', import: 'default', eager: true })`.
  Assert: `EditorColumns.tsx` contains `@container`; none of the five matches `/\b(sm|md|lg|xl|2xl):/`. (`DetailAside` keeps its documented 1280px media query and is not in the list.)
- **T2-4** `apps/studio/src/templates/RecordPageLayout.test.tsx` · *the default column fills the page; `wide` is 96rem; neither is `max-w-3xl`* (*class is the rule*)
  Assert: the column element (`container.querySelector('.w-full')`) has no `max-w-3xl` by default; with `width="wide"` it has `max-w-[96rem]`.
- **T2-5** `apps/studio/src/molecules/EditorFooter.test.tsx` · *Cancel then Save, one Save, Cancel inside `data-keep-draft`*
  Assert: DOM order Cancel → Save; exactly one `button` named `Save`; `Cancel` has `closest('[data-keep-draft]')`; `canSave={false}` disables Save; `isSaving` disables Cancel; `saveLabel` replaces the Save text; the root has `-mx-6` (its border runs edge to edge, principle 3; *class is the rule*). The same assertions with `withSide`.
- **T2-6** `apps/studio/src/molecules/TeamPreview.test.tsx` · *Stage shows one letter in the colour box and the name in capitals; Studio shows the short code*
  Setup: `<TeamPreview name="Zulu Crew" shortCode="ALPHA" color="#2563eb" />`.
  Assert: `getByTestId('stage-letter').textContent === 'A'` (the **short code’s** first character, as Stage’s `TeamMark` takes it, not the name’s `Z`); the text `ZULU CREW` is in the DOM (upper-cased in the string, so a reader and a test see what Stage shows); the Studio mark reads `ALP`.
- **T2-7** same · *a theme colour is a hatched neutral box captioned “Theme colour”, never its token* (Review Focus 5)
  Assert: with `color="var(--state-incorrect)"`: `getByText(TEAM.themeColour)` present; `container.innerHTML` does not contain `state-incorrect`; with `#2563eb` the mark carries that colour (an element whose `style` contains `rgb(37, 99, 235)`).
- **T2-8** same · *an empty draft renders without a crash and without “undefined”* — `<TeamPreview name="" shortCode="" color="#111827" />`: no throw, `container.textContent` has no `undefined`.
- **T2-9** same · *the preview is not interactive* — `queryAllByRole('button')` and `queryAllByRole('textbox')` are empty.
- **T2-10** **R** · *a team’s Name, Short code, Colour and Notes stay in the main column; the aside holds only the preview and Copies*
  Setup: `at({tab:'teams', id:'team-alpha', mode:'edit'})`.
  Assert: `within(aside).queryAllByRole('textbox')` is empty; `getAllByRole('textbox', { name: /^Name/ })` has length 1; `getAllByRole('button', { name: /^Save/ })` has length 1.
- **T2-11** **R** · *the preview follows the short code too* — type `zed` in `Short code`: `getByTestId('stage-letter').textContent === 'Z'` (the ✓ test covers the name).
- **T2-12** **R** · *Copies sit in the team’s aside; a team never copied has none*
  Setup: as `beta5.test.tsx` (a copy `team-alpha-2`, `fake.families.set(...)` for both), edit `team-alpha`.
  Assert: `aside.querySelector('[data-copies]')` exists; for `team-bravo` (never copied) `document.querySelector('[data-copies]')` is null.
- **T2-13** **R** · *a question’s main column holds Options, Difficulty and Explanation; the aside holds domains, domain groups, question tags and Copies — in that order*
  Setup: `at({tab:'library', questionId:'q-h1', mode:'edit'})`, `q-h1` given a family copy as `beta4.test.tsx` does.
  Assert: `within(aside).queryByRole('textbox', { name: /^Explanation/ })` null and `/^Question$/` null (✓ partly); the `Question tags` textbox, `[data-group-picker]` (when the domain has groups) and `[data-copies]` are inside the aside, and `[data-copies]` follows the tag field in document order; `getAllByRole('button', { name: /^Save/ })` has length 1.
- **T2-14** **R** · *the group select and the tag field keep working from the side column* — the existing `groups-tags.test.tsx` flows (`E1 E2 E7 E10`, *a domain taken off in the editor forgets its group*) pass **unchanged**; they find `[data-group-picker="d1"] select` and `Question tags` through `document`, so they are the gate for the move.
- **T2-15** `apps/studio/src/molecules/DomainPicker.test.tsx` · *one column in a narrow container, two where there is room; 15 domains list as 15 checkboxes before Create* (Review Focus 1)
  Assert: the checkbox grid has `grid-cols-1` and an `@…:grid-cols-2` variant, and no bare `grid-cols-2` (*class is the rule*); with 15 domains `getAllByRole('checkbox')` has length 15 and the `Create` button follows the last in document order.
- **T2-16** `apps/studio/src/molecules/DomainForm.test.tsx` · *the compact form stacks name and code in a narrow container* — the same class assertion on its grid.
- **T2-17** **R** · *the PIN panel saves on its own, and Save stays off*
  Setup: `at({tab:'operators', id:'op-andy', mode:'edit'})` (no PIN yet; `op-guest` already has one), set a PIN in the panel (the panel’s own flow, labels from `SETTINGS`).
  Assert: `calls('operator_set_pin')` has one call; `calls('catalog_upsert')` is empty; the footer `Save` is disabled (the form is not dirty).
- **T2-18** **R** · *no `mode === 'view'` branch is left in the three editor pages, and a view route lands on the list’s aside*
  Assert: the raw source of `TeamPage.tsx`, `QuestionPage.tsx`, `OperatorPage.tsx` (`?raw` glob) does not contain `mode === 'view'`; `at({tab:'teams', id:'team-alpha', mode:'view'})` renders `complementary 'Details'` (1.1.1 behaviour kept).
- **T2-19** **R** · *a tiny library: a one-team library opens the new-team editor as one useful column* (Review Focus 2)
  Setup: `fake` seeded with one team, no games.
  Assert: `at({tab:'teams', mode:'new'})`: the `Preview` aside exists and shows the placeholder (no `undefined`), `Save` is disabled until Name is typed.

---

### Task 3 — menu sections

Already in the tree: ✓ **R** *a team’s row menu groups its items under Team, Copy and move, and Status* · ✓ *a disabled item says why under its name* (Operators, `Make active`) · ✓ *the bulk Edit… menu is sectioned*.

- **T3-1** `apps/studio/src/molecules/ActionMenu.test.tsx` · *sections draw one titled group each, in order, with the items in order*
  Setup: `ActionMenu` with `[{id:'row',title:'Question',items:[Open,Edit]},{id:'cm',title:'Copy and move',items:[Duplicate]},{id:'st',title:'Status',items:[Archive]}]`; click the kebab (`Open`).
  Assert: `sectionsOf(menu)` equals `[['Question',['Open','Edit']],['Copy and move',['Duplicate']],['Status',['Archive']]]`.
- **T3-2** same · *an empty section draws no header and no separator* — add `{id:'x', title:'Arrange', items:[]}`: no `Arrange` text; `menu.querySelectorAll('[role="separator"]').length` equals the rendered sections minus one.
- **T3-3** same · *an item with an icon draws it; an item without draws none* — the `menuitem` contains an `svg` when `icon` is given and none otherwise.
- **T3-4** same · *a disabled item says why under its name, keeps its exact name, and cannot be chosen*
  Setup: `{id:'move', label:'Move to…', isDisabled:true, disabledReason:'This game is playing'}`.
  Assert: `getByRole('menuitem', { name: 'Move to…' })` (exact: e2e picks by exact text) has `aria-disabled="true"`; the element named by its `aria-describedby` has the text `This game is playing`; clicking it does not call `onAction`.
- **T3-5** same · *a `disabledReason` disables the item even without `isDisabled`* — and the pure `disabledIds(sections)` returns exactly the ids that are `isDisabled` or carry a reason. A plain `description` (not a reason) shows under an enabled item.
- **T3-6** same · *`onAction` receives the item’s id, across sections; the kebab says `Open` by default and `label` overrides it* (Global constraint: kebab `aria-label` stays `Open`).
- **T3-7** `apps/studio/src/copy/menu.test.ts` · *the vocabulary rules, on the table itself*
  Assert: no value of `MENU` equals (case-folded) a known item label (`LIST.open|edit|duplicate|archive|restore`, `TRANSFER.copyTo|moveTo|unfollow`, `GROUPS_TAGS.rename|moveUp|moveDown`, `WORKSPACE.open|rename|duplicate`); no `MENU` value other than `danger` matches `/delete/i`.
- **T3-8** **R** · *every row menu follows the §4.6 table* (`describe.each`, one `it` per surface; open the first row’s kebab):
  - Teams row → `Team` [Open, Edit] · `Copy and move` [Duplicate, Copy to…, Move to…] · `Status` [Archive]
  - Questions row → `Question` [Open, Edit] · `Copy and move` [Duplicate, Copy to…, Move to…] · `Status` [Archive]
  - Domain row (inside the pane’s `listbox`) → `Domain` [Edit] · `Copy and move` [Duplicate, Copy to…, Move to…] · `Status` [Archive]
  - Games row → `Game` [Open] · `Copy and move` [Duplicate, Copy to…, Move to…] · `Status` [Archive] (Task 5 inserts `Organise` between Game and Copy and move)
  - Operators row → `Operator` [Open, Edit, Make active] · `Status` [Archive]
  - Workspaces row (kebab `Actions: {name}`, a workspace made non-current) → `Workspace` [Open, Rename, Move to workspace group…] · `Copy and move` [Duplicate…] · `Status` [Archive] · `Danger zone` [Delete permanently…]
  Assert for each: `sectionsOf(menu)` equals the list; no title equals any item label in the same menu; an item matching `/delete/i` is only ever under `Danger zone`; `Archive`/`Restore` are only under `Status`. The item order inside equals the pre-P20 flat order (the e2e picks by exact text: no label changed).
- **T3-9** **R** · *a copy shows `Stop following its copies` under Copy and move; a never-copied row does not* — Teams with the family seed of `beta5.test.tsx`.
- **T3-10** **R** · *an archived row’s menu: Edit disabled with a reason, Status offers Restore* — archive `team-delta` via the fake, switch to the Archived scope, open its kebab: `Edit` has `aria-disabled`, `sectionsOf` ends `['Status',['Restore']]`.
- **T3-11** **R** · *the playing game’s menu: Move to… and Archive are disabled, each with a reason line* — `receivePlayState` with `recipeId: 'recipe-demo'` as `beta4.test.tsx` does; open the Games row: both items `aria-disabled`, each with a non-empty description, `Duplicate` and `Copy to…` enabled.
- **T3-12** **R** · *the active operator can neither be made active again nor archived, and says why* — extends the ✓ `Make active` test: `Archive` is disabled with the `OPERATOR.activeNotArchived` text.
- **T3-13** **R** · *an archived workspace’s menu: Restore under Status, Delete permanently… enabled under Danger zone; a loaded game disables Delete with its reason*
  Setup: `beta5.test.tsx`’s archived `Old season`; then `receivePlayState` a loaded game.
  Assert: archived: `Status` [Restore], `Danger zone` [Delete permanently…] enabled; with a game loaded: that item is `aria-disabled` and described.
- **T3-14** **R** · *group header menus: the group’s kind · Arrange · Danger zone*
  Setup: (a) Questions inside `dom-history` with a domain group `Wars` holding `q-h1` and a second group `Medieval`; header kebab `Domain group: Wars`. (b) Workspaces with a workspace group (`beta5.test.tsx`’s `Past seasons`), kebab `Actions: Past seasons`.
  Assert: (a) `[['Domain group',['Rename']],['Arrange',['Move up','Move down']],['Danger zone',['Delete domain group']]]`, `Move up` disabled on the first group, `Move down` on the last; (b) `[['Workspace group',['Rename workspace group']],['Arrange',['Move up','Move down']],['Danger zone',['Delete workspace group']]]`.
  RED first: the domain group header today offers only Rename and Delete in a flat menu.
- **T3-15** **R** · *the bulk Edit… menu for Questions: exact items per section, and “inside a domain” items only inside a domain*
  Assert: under All questions: `Question tags` [Add question tag…, Remove question tag…] · `Domains` [Add to domain…] · `Difficulty` [Set difficulty…]; inside `dom-history`: `Domains` also has `Set domain group…` and `Remove from domain`. (The ✓ test asserts the titles; this one pins the items — the old `E15` test’s negative assertions must still hold.)
- **T3-16** **R** · *the bulk Copy or move… menu is sectioned and keeps `Copy to…` / `Move to…`* — select a team: menu opens with a `Copy and move` title (`MENU.copyMove`) and the two items; the button is still named `Copy or move…`.

---

### Task 4 — managers (question tags, domain groups)

**Existing tests that change** (`groups-tags.test.tsx`; port, do not delete): *E33 Manage tags lists counts and renames through the host* → T4-S12 + T4-S14 (the dialog is a `dialog`, not an `alertdialog`; a tag is an `option` in the list, not a `Question tag: Christmas` button; Rename is a button in the detail, not a menu item) · *a merge says what it merged into and how many changed* → T4-S15 · *the Groups dialog creates a group by its typed name* → T4-S2 · *the Groups dialog stays open under its New domain group* → keep with the `[data-groups-dialog]` hook now supplied by `ManagerDialog`’s `dataAttr` · *a domain group header offers Rename and Delete* stays (T3-14). The e2e (`groups-tags.e2e.ts`) presses `Domain groups…`, `New domain group`, `Create`, `Close`: those texts stay.

Host — `crates/host/tests/p20.rs` (fixtures as `tests/groups_tags.rs`: `setup()` = `d1` History holding `q1 q2 q3`; `domain_group_create`, `put_in`, `group_of`). ✓ H1–H4 are already in that file under other names (`merging_a_domain_group_moves_its_questions_and_deletes_it_in_one_write`, `a_merge_into_another_domains_group_is_refused_and_changes_nothing`, `a_merge_into_itself_is_refused`, `deleting_without_a_target_still_leaves_the_questions_ungrouped`); check them against the assertions below (the other-workspace refusal, a missing `into`, `updated_at`, member order) and add what they lack — do not write them twice.

- **T4-H1** I · `merging_a_group_moves_its_members_into_the_other_and_removes_it`
  Setup: groups `romans`, `wars` in `d1`; `q1`,`q2` in romans, `q3` in wars.
  Assert: `domain_group_delete(&romans.id, Some(&wars.id), NOW)` returns `Ok(DomainId "d1")`; `domain(&c,"d1").groups` is `["Wars"]`; `group_of` for `q1 q2 q3` is `Some(wars.id)`; the members’ `sort_key`s are still `0 1 2`; the domain’s `updated_at` is `NOW`.
  RED first: `domain_group_delete` takes no `into` today (does not compile).
- **T4-H2** I · `deleting_without_into_leaves_the_members_in_no_group` — `None`: members of the deleted group have `group_id None`, the other group untouched (the pre-P20 behaviour, kept).
- **T4-H3** I · `into_must_be_a_group_of_the_same_domain_and_a_refusal_changes_nothing`
  Setup: `d2` Science with its own group `labs`; and a group in a second workspace (`workspace_create`, a domain there).
  Assert: `Some(&labs.id)` and the other workspace’s group each give `Err` (readable text, not a panic); afterwards `romans` still exists and `q1`,`q2` are still in it.
- **T4-H4** I · `into_cannot_be_the_group_itself_or_a_group_that_does_not_exist` — both `Err`; nothing deleted, nothing moved.

Fake — `Fake` (the mirror of H1–H4; `createFakeHost()`, `fake.domainGroups`, `fake.invoke('domain_group_delete', …)`):

- **T4-F1** *`domain_group_delete { id, into }` moves the members and removes the group* (H1) · **T4-F2** *without `into` the members go to no group* (H2) · **T4-F3** *an `into` of another domain, of the group itself, or unknown rejects with `{ code: 'catalog', message: …no such group… }` and changes nothing* (H3, H4).

`PaneList` and `ManagerDialog` — beside the components:

- **T4-U1** `apps/studio/src/molecules/PaneList.test.tsx` · *a listbox of entries, each with its label and count; the selected one says so; a press selects*
  Assert: `getByRole('listbox')`; `getByRole('option', { name: /^Antiquity.*2/ })` has `aria-selected="true"` when `selectedId` is its id; click another → `onSelect(id)`; a `muted` entry (the *No domain group* one) still selects.
- **T4-U2** same · *search appears only when the list is long, filters case- and accent-folded, and says when nothing matches*
  Assert: 3 entries → no `searchbox`; 30 entries → `searchbox`; typing `rom` keeps only matching options; a query with no hit shows the empty line and no options.
- **T4-U3** same · *A–Z and Most used* — a `radiogroup` with `A–Z` (default) and `Most used`; the second orders by count descending, ties A–Z; the selection survives the re-order.
- **T4-U4** same · *1,000 entries render a bounded list* (Review Focus 1) — `getAllByRole('option').length` is under 300 (virtualised or capped), and a search for the 900th entry’s label finds it.
- **T4-U5** `apps/studio/src/molecules/ManagerDialog.test.tsx` · *a wide dialog: the list slot, then the detail slot (in that order), a footer, and the hook*
  Setup: `<ManagerDialog isOpen onClose={fn} title="Manage tags" list={<ul/>} detail={<p/>} footer={…} dataAttr="data-manage-tags" />`.
  Assert: `getByRole('dialog', { name: 'Manage tags' })`; `dialog.querySelector('[data-manage-tags]')` exists; list precedes detail in document order (Review Focus 3); Esc calls `onClose`.

Studio — **R**, library `demoLibrary()` plus the tags/groups each test sets:

- **T4-S1** *Domain groups… opens a wide dialog: the open domain’s groups with counts, the first selected, its questions in the detail*
  Setup: `fake.domainGroups.set('dom-history', [{id:'g-a', domainId:'dom-history', name:'Antiquity', sortKey:0}, {id:'g-m', …name:'Modern', sortKey:1}])`; `q-h1`,`q-h2` get `groupId: 'g-a'`; `at({tab:'library', domainId:'dom-history'})`; press `Domain groups…`.
  Assert: `dialog` named `GROUPS_TAGS.groupsTitle('History')`; options `Antiquity` (2), `Modern` (0), `No domain group` (2); `region 'Antiquity'` is the detail and lists `q-h1`’s and `q-h2`’s stems; it says `GROUPS_TAGS.memberCount(2)`.
- **T4-S2** *New domain group still creates by its typed name* (port) — `New domain group` → field `Domain group name` empty → type ` Romans ` → `Create` → `fake.domainGroups.get('dom-history')` has `Romans` (trimmed) and it is now selected.
- **T4-S3** *Rename… writes through the host and the list follows* — `Rename…` → `Domain group name` prefilled `Antiquity` → `Battles` → `Save` → `calls('domain_group_rename')` one call; option `Battles` replaces `Antiquity`.
- **T4-S4** *Move up / Move down reorder the groups; the first cannot go up and the last cannot go down* — click `Move down` on Antiquity: `domain_group_reorder` with `order: ['g-m','g-a']`; list order follows; `Move up` on the first and `Move down` on the last are `isDisabled`.
- **T4-S5** *Merge into… asks for a group, says how many questions move, and writes `domain_group_delete { id, into }` once*
  Assert: select Antiquity → `Merge into…` → a select offering **only** `Modern` (not itself, not *No domain group*) → a line naming `2` questions and `Modern` → confirm → `calls('domain_group_delete')` has exactly one call with `{ id: 'g-a', into: 'g-m' }`; `Antiquity` is gone, `Modern` counts 2.
- **T4-S6** *Delete domain group keeps the questions, in no group, and says so first* — confirm text is `GROUPS_TAGS.deleteGroupBody(2)`; the call has `{ id }` and no `into` (`args.into` undefined or null); `No domain group` now counts 4.
- **T4-S7** *Show in list closes the manager and filters Questions to that group* — `useChromeStore.getState().listState.library?.filters.group` equals `['g-a']`; `queryByRole('dialog')` null; only `q-h1`/`q-h2` rows are in the list.
- **T4-S8** *the “No domain group” entry has Show in list and nothing else* — select it: `Show in list` present (filters `['~none']`); `Rename…`, `Move up`, `Move down`, `Merge into…`, `Delete domain group` absent.
- **T4-S9** *a domain without groups says so and still offers New domain group* (Review Focus 2) — `GROUPS_TAGS.noGroupsYet` visible, `New domain group` enabled, no crash.
- **T4-S10** *the manager follows a change made elsewhere* — `fake.emit('catalog-changed', …)` after renaming a group through `fake.invoke`: the option shows the new name; if the selected group is deleted from outside, the selection falls to the first entry.
- **T4-S11** *members are capped at 100 lines, then “and N more” and Show in list* (Review Focus 1) — 130 questions in one group (`fake.seed` of 130 questions + domain membership): `within(detail).getAllByRole('listitem').length === 100`, text `/30 more/`, `Show in list` present.
- **T4-S12** *Manage tags… lists the tags with counts, A–Z, the first selected, its questions in the detail*
  Setup: `q-h1` tags `['Rome','Roads']`, `q-h2` `['Rome']`; `at({tab:'library'})`; press `Manage tags…`.
  Assert: `dialog 'Manage tags'`; options `Roads` (1), `Rome` (2) in that order; `region 'Roads'` shows `q-h1`’s stem; click `Rome` → the region shows both stems and `GROUPS_TAGS.carried(2)`.
- **T4-S13** *Most used orders by count, ties A–Z* — pick `Most used`: `Rome`, `Roads`.
- **T4-S14** *Rename… is previewed, then written* (port of E33) — `Rename…` → `New name` → `Xmas` → `Save`; `previewedFirst('tag_rename')`; every question that carried the tag now carries `Xmas`.
- **T4-S15** *renaming onto an existing tag is a merge and says what it merged* (port) — `Xmas` → `christmas`: `toast.success` called with `GROUPS_TAGS.mergeNote('Christmas', 1)`.
- **T4-S16** *Merge into… picks the other tag from a list and previews what changes* — select `Xmas`, `Merge into…`, choose `Christmas`: the preview line is `GROUPS_TAGS.applyTo(n)` before the confirm; confirm → `tag_rename { from:'Xmas', to:'Christmas' }`, preview then write; one entry remains.
- **T4-S17** *Delete question tag previews “It comes off N questions” and then writes* — `previewedFirst('tag_delete')`; the confirm body is `GROUPS_TAGS.deleteTagBody(2)`; the tag is off both questions.
- **T4-S18** *Show in list closes the manager and filters Questions by that tag* — `listState.library.filters.tag` equals `['rome']` (folded); the chip `Question tag: Rome` is shown; the dialog is gone.
- **T4-S19** *two spellings of one tag: each spelling is listed with its count and a Use this spelling button; one spelling lists none*
  Setup: `q-h1` `['Xmas']`, `q-h2` `['xmas']`, `q-h3` `['XMAS']`.
  Assert: select the tag: spellings `Xmas`, `xmas`, `XMAS` each with `1`; press `Use this spelling` next to `xmas` → `previewedFirst('tag_rename')` with `{ from, to: 'xmas' }`; afterwards all three questions carry `xmas`. With only one spelling in the library, no `Use this spelling` button exists.
- **T4-S20** *1,000 tags render a bounded list and are found by search* (Review Focus 1) — seed 1,000 distinct tags over a few questions; `getAllByRole('option').length < 300`; searching the 900th finds it.
- **T4-S21** *a tag’s members are capped at 100 lines with “and N more”* (Review Focus 1) — 130 questions tagged `Big`: 100 `listitem`s, `/30 more/`, `Show in list`.
- **T4-S22** *no tags yet* (Review Focus 2) — empty tag list: `GROUPS_TAGS.noTagsYet` is shown, no options, no actions.
- **T4-S23** *a refused write keeps the manager open and puts the reason on the notice stack* — wrap `fake.invoke` so `tag_rename` rejects (as `beta4.test.tsx` does for `recipe_set_membership`); the dialog stays, the entry keeps its old name, `useNoticeStore.getState().notices.length > 0`.

---

### Task 5 — game tags and folders

Host — `crates/host/tests/p20.rs`. Fixtures: `game(c, id, name, folder: Option<&str>, tags: &[&str])` = `Recipe::new(id, name, GameSettings::default())` with `folder`/`tags` set, `c.recipe_upsert(&r, NOW)`. API under test: `c.recipe_bulk_edit(&ids, &edits, write, NOW)` with `RecipeEdit::{SetFolder{folder: Option<String>}, Tag{tag}, Untag{tag}}`, reporting `changed`/`unchanged` ids.

- **T5-H1** I · `set_folder_sets_it_on_every_selected_game_and_reports_who_changed` — `g1` None, `g2` `Finals`, `g3` None; `[SetFolder Some "Finals"]` over all: changed `g1 g3`, unchanged `g2`; all three read `Finals`.
  RED first: no `recipe_bulk_edit` (does not compile).
- **T5-H2** I · `clearing_the_folder_changes_only_the_games_that_have_one` — `[SetFolder None]`: changed = those with a folder; all `None` afterwards.
- **T5-H3** I · `a_folder_is_trimmed_not_empty_and_at_most_sixty` — `"  Finals "` stores `Finals`; `"   "` is `Err`; 61 characters is `Err`; 60 is `Ok`.
- **T5-H4** I · `tag_adds_once_ignoring_case_and_untag_ignores_case` — `g1` has `Finals`, `g2` none: `[Tag "finals"]` leaves `g1` unchanged, `g2` gets `Finals` (the spelling in view); `[Untag "FINALS"]` removes it from both and keeps their other tags.
- **T5-H5** I · `tags_are_cleaned_like_question_tags_and_a_full_game_refuses_the_batch`
  Assert: `" Semis "` stores `Semis`; an empty tag is `Err`; a 41-character tag is `Err`; with `gFull` at 20 tags and `gOk` at 0, `[Tag "new"]` over both is `Err` and `gOk` still has no tags (refused whole).
- **T5-H6** I · `a_rename_is_untag_then_tag_in_one_call_and_a_game_with_both_keeps_one` — `gA [demo]`, `gB [demo, showcase]`: `[Untag "demo", Tag "Showcase"]` over `gA gB`: each ends with exactly one tag, `showcase` (the spelling in view); none has `demo`.
- **T5-H7** I · `preview_writes_nothing_and_the_write_is_one_transaction` (written as three `#[test]`s: the preview, a missing id, nothing selected / a repeated id)
  Assert: `write: false` returns the same report as the later `write: true`, and `recipe_get` is unchanged after it; `[g1, "missing"]` with `write: true` is `Err` and `g1` is unchanged; `ids = []` is `Err` (“nothing is selected”); a repeated id counts once.
- **T5-H8** I · `labels_do_not_bump_rev` (pinned decision 1) — `rev` is the same before and after; `updated_at` is `NOW` for changed games and unchanged for the others.
- **T5-H9** I · `search_finds_a_game_by_its_new_folder_and_tag` — after the write, `catalog_search` for the folder name returns the game (the index is rebuilt, as after a question bulk edit).
- **T5-G1** `crates/app/src/commands/groups.rs` (or the file that holds the new command) · U · *only Studio may relabel games* — add `recipe_bulk_edit` to the list in `only_studio_may_organise_the_library`: `guard::allow("stage", …)` and `guard::allow("stats", …)` are `Err`.

Fake — `Fake`:

- **T5-F1** *`recipe_bulk_edit` set/clear folder, tag, untag with the host’s report* (H1, H2, H4) · **T5-F2** *cleaning and the 20-tag refusal are the host’s* (H3, H5) · **T5-F3** *rename in one call keeps one tag; preview writes nothing; a missing id rejects whole; `rev` is unchanged* (H6, H7, H8). The fake emits `catalog-changed { kind:'recipe' }` once per written batch.

Atoms and molecules:

- **T5-U1** `apps/studio/src/atoms/ComboField.test.tsx` · *a free-text field that offers values: filters the offers, takes an offer, accepts a new value on Enter and on leaving, and reports what is typed before it commits*
  Assert: typing `Fin` shows `Finals` and hides `Season 3`; choosing `Finals` calls `onChange('Finals')`; typing `Semis` + Enter calls `onChange('Semis')`; leaving the field with text commits it **unless** focus goes to a `data-keep-draft` control; emptying and leaving calls `onChange(null)`; `onInputChange` is called on every keystroke (so a dialog’s Apply sees a value that has not blurred yet — Global constraint: *a field that commits on blur must not eat a press*).
- **T5-U2** `apps/studio/src/molecules/TagField.test.tsx` (extend) · *the same field in the game’s words says Game tags and never Question tags*
  Setup: the wording the implementation adds to `TagField` for games.
  Assert: the field is named `Game tags`; a chip’s remove button names the *game tag*; the offered group names game tags; `container.textContent` has no `/question/i`.

Studio — **R**:

- **T5-S1** *the Game page’s first panel is Name · Folder · Game tags, in that order, each with its value*
  Setup: `at({tab:'games', id:'recipe-demo', section:'roster'})`.
  Assert: `textbox 'Name'` = `Season opener`; `combobox 'Folder'` = `Season 3`; chips `demo`, `four teams`; document order Name < Folder < tags; one `textbox` named `Name`.
- **T5-S2** *Folder offers the workspace’s folders and accepts a new one, writing through `recipe_bulk_edit`* (pinned decision 1)
  Setup: seed a second game `Finals night` with folder `Finals`.
  Assert: opening the combobox offers `Finals` and `Season 3` (distinct, A–Z); typing `Semis` + Enter writes `calls('recipe_bulk_edit')` once with `{ ids: ['recipe-demo'], edits: [{ op: 'set_folder', folder: 'Semis' }], preview: false }`; `calls('recipe_upsert')` is empty; the field reads `Semis`.
- **T5-S3** *leaving the Folder field unchanged writes nothing; emptying it clears the folder* — blur without a change: no `recipe_bulk_edit`; clear + blur: `set_folder` with `folder: null`.
- **T5-S4** *a folder is capped at 60 characters in the field* — the input has `maxLength` 60.
- **T5-S5** *Game tags: Enter adds, the chip’s button removes, and the tags the workspace’s games already use are offered*
  Assert: typing `fin` offers `finals` (from the second game) in the offered group; Enter on `Semis` writes `edits: [{ op: 'tag', tag: 'Semis' }]`; removing `demo` writes `[{ op: 'untag', tag: 'demo' }]`; no `recipe_upsert`.
- **T5-S6** *the Game page never says Question tag or a bare tag* — `queryByText(/Question tag/)` null on the page; the field label is `Game tags`.
- **T5-S7** *labels stay editable while the game plays; the name does not* (pinned decision 1)
  Setup: `receivePlayState({ …, status:'playing', operator:{ recipeId:'recipe-demo', … } })` as `beta4.test.tsx`.
  Assert: `textbox 'Name'` is disabled with the frozen reason; the Folder combobox and the Game tags field are **not** disabled and a change writes.
- **T5-S8** *a refused label write puts the old value back and says why* — wrap `fake.invoke` so `recipe_bulk_edit` rejects with `a game has at most 20 game tags`: the field returns to its old value (folder `Season 3`), the reason is on the notice stack.
- **T5-S9** *Games bulk Edit… is offered with a selection, sectioned Folder and Game tags*
  Setup: a second game `Second show`; `at({tab:'games'})`; tick both (`Select Season opener`, `Select Second show`).
  Assert: button `Edit…`; `sectionsOf(menu)` equals `[['Folder',['Set folder…','Clear folder']],['Game tags',['Add game tag…','Remove game tag…']]]`; under the Archived scope the button is absent.
- **T5-S10** *Set folder… previews “Applies to 2 games.” and writes once, and Apply reads a value that has not blurred yet*
  Assert: the dialog has a `Folder` combobox (offering `Season 3`); `fireEvent.change` to `Finals` and **press Apply without a blur**; `previewedFirst('recipe_bulk_edit')`, the preview line `Applies to 2 games.`, exactly one write with both ids and `[{ op:'set_folder', folder:'Finals' }]`; both games read `Finals`; the toast says done.
- **T5-S11** *Clear folder is disabled with a reason when no selected game has a folder* — select only `Second show` (no folder): the item is `aria-disabled` and described.
- **T5-S12** *Add game tag… previews how many already have it; Remove game tag… offers only tags the selection carries* — after selecting both games: Remove offers `demo` and `four teams` and nothing else; Add `demo` shows the host’s `unchanged` count as a line in the wording of `GROUPS_TAGS.already` (`1 already tagged demo`), in the game’s vocabulary.
- **T5-S13** *the playing game is included in a label edit, with no “left out” notice* — select the playing game and another: Set folder says `Applies to 2 games.`; `GAME.leftOutPlaying` text is not shown (it is for Archive).
- **T5-S14** *the Games row menu has Organise between Game and Copy and move, and its items open the label dialogs*
  Assert: `sectionsOf` = `Game` [Open] · `Organise` [Folder…, Game tags…] · `Copy and move` [Duplicate, Copy to…, Move to…] · `Status` [Archive]; `Folder…` opens a dialog with a `Folder` combobox for that game; `Game tags…` opens a dialog with the Game tags field.
- **T5-S15** *the manager lists folders and game tags with counts and shows the chosen one’s games*
  Setup: second game `Finals night` folder `Finals`, tags `[demo]`; press the Games tab’s manager button (its label is the implementation’s copy).
  Assert: options `Season 3` (1), `Finals` (1), `demo` (2), `four teams` (1); the detail names the entry and lists its games (`Board`-style lines); a folder shows `Rename…` and `Empty folder` only; a game tag shows `Rename…`, `Merge into…`, `Delete game tag`.
- **T5-S16** *renaming a folder is previewed and sets the folder of its games* — `Rename…` `Season 3` → `Season 4`: `previewedFirst('recipe_bulk_edit')`, ids = the games in that folder, `[{ op:'set_folder', folder:'Season 4' }]`; the list shows `Season 4`.
- **T5-S17** *Empty folder clears it from its games after a confirm that counts them; the folder leaves the list* — `[{ op:'set_folder', folder: null }]` over its games.
- **T5-S18** *renaming a game tag is untag + tag in one call; renaming onto an existing tag keeps one; Delete game tag is untag only* — `edits` are `[{untag:'demo'},{tag:'Showcase'}]`, ids = the games that carry `demo`; delete: `[{op:'untag', tag:'demo'}]` after a confirm naming the count.
- **T5-S19** *Show in list closes the manager and filters Games* — `listState.games.filters.folder` equals `['Season 3']` / `.tag` equals `['demo']`; the dialog is gone.
- **T5-S20** *no folders and no game tags yet* (Review Focus 2) — a library whose only game has neither: the manager says so, with no options and no crash.

---

### Task 6 — import questions

**Existing tests that change** (`ImportQuestionsDialog.test.tsx`; port, do not delete): *previews what the file would do* — the summary line `1 complete · 1 incomplete · 1 rejected · 1 new domain` becomes count **buttons** (`1 complete`, `1 incomplete`, `1 rejected`) and the new-domain line; the gaps line, `In Geografie (new)` and the rejected reason stay as row lines · *names the tags and what a duplicate repeats* — a duplicate now keeps its tags, so `Tags: Rome` appears **twice**: use `findAllByText('Tags: Rome')` (length 2) · *writes the plan on Import, and closes* and *says why a file cannot be read* stay as they are.

Host — the planner, `crates/host/src/catalog/import.rs` module tests (U). Extend the module’s `run(text, questions, domains, default)` helper with an `overrides` argument (`ImportOverrides::default()` for the existing tests). Shapes: `ImportOverrides { edits: Vec<ImportEdit { index, row: serde_json::Value }>, skip: Vec<usize> }`; `ImportRow` gains `body: ImportRowBody` and `skipped: bool`; `ImportCounts` gains `skipped`.

- **T6-H1** U · `an_edit_replaces_the_row_before_it_is_read`
  Setup: `[ { "question": "Q?" } ]`, the `geo()` domain; edit `{ index: 1, row: { question:"Q?", options:[{text:"A",correct:true},"B"], difficulty:30, domains:["Geografie"] } }`.
  Assert: row 1 is `Complete` with no gaps; the written question has `difficulty Some(30)`, two options, and lands in `dom-geo`; `counts` is `(1,0,0,0)`.
  RED first: no `overrides` parameter (does not compile).
- **T6-H2** U · `an_edit_goes_through_the_one_reader` — an edit row `{ "dificulty": 10, "difficulty": 150 }` lists `dificulty` (unknown) and `difficulty` (out_of_range) in `ignored` and leaves the difficulty `None`: the preview and the import cannot disagree about what a field means.
- **T6-H3** U · `an_edit_can_make_a_rejected_row_importable` — `[ { "difficulty": 10 } ]` is `Rejected`; with an edit adding `"question": "Now?"` it is `Incomplete`, written, and `counts.rejected` is 0.
- **T6-H4** U · `an_edit_for_a_row_that_is_not_in_the_file_refuses_the_import` (pinned decision 2) — indexes 0 and 3 on a two-row file each give `Err` whose text starts `import: ` and names the row; the same through the service for the preview (no write).
- **T6-H5** U · `a_skipped_row_is_reported_not_written_and_leaves_the_counts`
  Setup: three complete rows, the second naming a domain `Istorie` that does not exist; `skip: [2]`.
  Assert: row 2 has `skipped == true` and still `status Complete`; `counts` is `complete 2, skipped 1`; `plan.questions.len() == 2`; `report.new_domains` is empty (a skipped row creates no domain) and no member is appended for it.
- **T6-H6** U · `skipping_a_duplicate_or_a_rejected_row_changes_nothing` (pinned decision 3) — rows `[A, A, {difficulty:10}]`, `skip: [2, 3]`: statuses `Complete, Duplicate, Rejected`, every `skipped == false`, `counts.skipped == 0`.
- **T6-H7** U · `a_skipped_row_is_never_a_duplicates_original` (Review Focus 4) — rows `[A, A]`: with `skip: [1]` row 2 is `Complete`, `duplicate_row None`, `duplicate_of None`, and is the one written; with no skip row 2 is a `Duplicate` of row 1. A skipped row also does not hide a later row that repeats a **library** question (still a duplicate of the library one).
  RED first: skipping does not exist; the first assertion fails by construction.
- **T6-H8** U · `an_edit_that_repeats_an_earlier_row_makes_it_a_duplicate_of_it` — edits take part in the duplicate check: row 2 edited to equal row 1 is `Duplicate`, `duplicate_row Some(1)`.
- **T6-H9** U · `a_duplicate_keeps_its_tags_and_domains_and_creates_no_domain` — rows `[A with tags ["Rome"], domains ["Geografie"]; the same again]`: row 2 is `Duplicate` with `tags ["Rome"]` and `domains ["Geografie"]`; `new_domains` is unchanged by it.
- **T6-H10** U · `every_row_carries_its_body_as_read`
  Setup: `{ "question": "  Q?  ", "options": [{"text":"A","correct":true},"B"], "difficulty":30, "domains":["geografie"], "explanation":" why ", "tags":[" Rome ","rome"], "zeta":1 }`.
  Assert: `body.stem "Q?"`, `body.options [("A",true),("B",false)]`, `body.difficulty Some(30)`, `body.domains ["geografie"]` (as written, not resolved), `body.explanation Some("why")`, `body.tags ["Rome"]`; `zeta` is only in `ignored`. A rejected row has a body with an empty stem and no options; a duplicate has its body.
- **T6-H11** U · `a_rows_own_body_fed_back_as_an_edit_changes_nothing` (round trip) — for a file of one complete, one incomplete and one duplicate row: the plan with each non-rejected body (turned back into a file row) as an edit has the same `status`, `gaps`, `landing`, `tags`, `domains`, `counts` and written questions as the plan with no edits.
- **T6-H12** I · `a_preview_with_overrides_reports_exactly_what_the_commit_writes` — `import_questions(text, false, None, &ov, NOW)` and `(…, true, …)` have equal `rows` and `counts` (only `committed` differs); the library then holds the edited question and not the skipped one.
- **T6-H13** I · `a_preview_with_overrides_writes_nothing` — question and domain counts unchanged after `commit: false` with edits and skips; and `commit: true` with an empty `ov` behaves exactly as before P20.

Fake — `apps/studio/src/host/fake/import.test.ts` (extend; “the same cases as `import.rs`”): one `it` per H1–H11 with the same fixtures, through `planImport(text, library, defaultDomainId, overrides, mint)`; plus the template and copy tests below.

- **T6-F1** *the template names every field a file can carry, and a second, incomplete row shows the floor* — `JSON.parse(IMPORT.template).questions[0]` has every key of `ROW_FIELDS` (`question options difficulty domains explanation tags`); `questions[1]` has only `question`; `planImport(IMPORT.template)` gives `['complete','incomplete']` with `ignored` empty on both.
- **T6-F2** *an ignored tags list says what is wrong with tags; an out-of-range difficulty still says 1–100* — `IMPORT.ignored({ field:'tags', why:'out_of_range' })` contains `more than 20 question tags` and `40 characters` and not `1–100`; `{ field:'difficulty', why:'out_of_range' }` contains `1–100`.
  RED first: both say `outside 1–100` today.

List model — beside the code:

- **T6-L1** `apps/studio/src/host/listView.test.ts` · *a spec without `changedAt` ignores the Changed filter, and the import list is a valid tab* — `listView(items, specWithoutChangedAt, { …STATE, changed: '7d' })` returns every row and does not throw; `'importQuestions'` is accepted as `LibraryTab`.
- **T6-L2** `apps/studio/src/molecules/ListControls.test.tsx` · *a FilterMenu without `changed`/`onChanged` draws no Changed control* — `queryByText('Changed')` is null in the popover.
- **T6-L3** `apps/studio/src/host/listSpecs.test.ts` · *the import list offers exactly its filters, sorts and groups* — filter ids `['status','missing','domain','createsDomain','tag','ignored','skipped']` (labels `Status`, `Missing`, `Domain`, `Creates a domain`, `Question tag`, `Ignored fields`, `Skipped`), sort ids `['row','text','difficulty','status']`, group ids `['status','domain','missing','tag']`, `defaults` `{ sort:{ id:'row', desc:false }, group:'status', pageSize:100 }`.
- **T6-L4** same · *each filter reads the right field* — over a small `ImportItem[]` (row + `skipped`): `status` keeps a status; `missing` keeps rows whose `gaps` include it; `domain` keeps rows landing in that name; `createsDomain` keeps rows whose `landing` has `(new)`; `tag` is any-of and case-folded; `ignored` keeps rows with `ignored.length > 0`; `skipped` keeps skipped rows.
- **T6-L5** same · *grouping and sorting* — by status the order has `complete` last; by domain a row in two domains is under both and `No domain` is last; by missing a row with two gaps is under both and `Nothing missing` is last; by tag `No tag` is last; sort by difficulty puts “no difficulty” last in both directions; sort by row is numeric (`10` after `9`).
- **T6-L6** `apps/studio/src/host/queries.test.tsx` · *`useImportPreview` is keyed by text, default domain and overrides* — two renders with deep-equal `{ edits, skip }` share one `catalog_import_questions` call; changing `skip` asks again; the call’s args are `{ text, commit:false, defaultDomainId, edits, skip }`.

`ImportRowForm` — `apps/studio/src/molecules/ImportRowForm.test.tsx`:

- **T6-M1** *what is wrong comes first* — the gaps line and each ignored field precede the `Question` textbox in document order.
- **T6-M2** *every field a file can carry is a control* — `Question`, `Option A…`, a `Correct` checkbox per option, `Add option`, `Difficulty`, `Question tags` (a `TagField`), one checkbox per domain (the library’s and the file’s new ones, the new ones marked), `Explanation`.
- **T6-M3** *Apply is off until something changed, and hands back a file-shaped row* — `Apply` disabled at first; after a change `onApply` is called once with `{ question, options:[{text,correct}], difficulty, domains:[names], explanation, tags }`; a blank option row is dropped (the question editor’s rule); with no `onNext` there is no `Apply and next`.
- **T6-M4** *Back to the file’s version* is disabled when the row has no edit and calls `onRevert` when it has; *Skip this row* calls `onSkip`.

Dialog — `apps/studio/src/organisms/ImportQuestionsDialog.test.tsx` (extend; the file’s `draw`, `paste`, `submit`, `FILE`; add `rows(n, shape)` to build bigger files):

- **T6-D1** *before a file the dialog is the picker: choose a file, the paste box, the template, and what a file cannot carry* — `IMPORT.choose`, the `Or paste the file` textarea and `Copy template` are there; the line `IMPORT.cannotCarry` mentions media and domain groups; there is no source strip.
- **T6-D2** *once a file is in, a source strip replaces the big box* — after `paste(FILE)`: buttons `Change file`, `Edit text`, `Copy template`; the select `Questions without a domain go to`; the strip says the row count (`3 rows`); `queryByLabelText('Or paste the file')` is null. A chosen file shows its name (build a `File` named `questions.json` and give it `text: async () => FILE`, since jsdom’s `Blob.text` is not relied on).
- **T6-D3** *Edit text brings the box back with the text, and changing it plans again* — press it: the textarea holds `FILE`; changing it asks a new preview.
- **T6-D4** *the summary’s counts are buttons that filter to that status; pressing again clears* — `1 incomplete` → only `Doar textul?` remains, a `Status: Incomplete` chip is shown; press again → all rows.
- **T6-D5** *rows are grouped by status, problems first, Complete last, each header with its count* — headings include `Incomplete · 1`, `Rejected · 1`, `Complete · 1` and `Complete` is the last of them.
- **T6-D6** *a complete or incomplete row has a ticked checkbox; a duplicate or rejected row cannot be ticked and says why on its second line* — file with a repeat: the duplicate’s and the rejected row’s checkboxes are absent or `isDisabled`; `Repeats row 1 of this file` and `Rejected: no question and no options` are shown under their stems.
- **T6-D7** *unticking a row skips it: the next preview carries `skip`, the summary counts it, Import counts what is left* — untick `Capitala Australiei?`: the last `catalog_import_questions` call has `skip: [1]`; a `1 skipped` button appears; `Import 1 question` is the submit.
- **T6-D8** *a group’s header checkbox skips or includes the whole group* — 41 incomplete + 2 complete rows: the checkbox named `/41 incomplete/` skips 41 rows (`skip` has 41 indexes), the summary says `41 skipped`, the submit says `Import 2 questions`; press again → `skip: []`.
- **T6-D9** *the page checkbox skips only its page* — 120 complete rows (pages of 100): untick `Select all`: `skip` is rows 1–100; page 2 rows are still ticked; the submit says `Import 20 questions`.
- **T6-D10** *250 rows render a page of 100* (Review Focus 1) — exactly 100 row checkboxes are in the document and the footer says `1–100 of 250`.
- **T6-D11** *a row opens an editor beside the list that starts with what is wrong* — press `Doar textul?`: `complementary 'Row 2'`; the gaps line precedes the `Question` textbox; a row with `"zeta": 1` lists `zeta: unknown field, ignored`; the four buttons `Apply`, `Apply and next`, `Back to the file’s version`, `Skip this row` are there.
- **T6-D12** *Apply sends the edit as an override of the file; the row becomes what the edit says; Import then writes the edit*
  Assert: after filling two options (one correct), difficulty 30 and the domain `Geografie`, `Apply`: the last preview call’s `edits` matches `[{ index: 2, row: { question:'Doar textul?', difficulty:30 } }]` with two options, the first `correct: true`; the summary reads `2 complete`; pressing Import sends `commit: true` with the same `edits`, and the library then holds `Doar textul?` with difficulty 30, two options, in `Geografie`.
- **T6-D13** *the editor offers the library’s domains and the file’s new ones* — the checkboxes include `History`, `Technology`, `Sport` and `Geografie` (marked new); ticking `History` puts `History` in the override’s `domains`.
- **T6-D14** *Apply and next opens the next row in the list’s order; the last row has none* — three incomplete rows: edit row 1, `Apply and next` → `complementary 'Row 2'`; on row 3 the button is absent.
- **T6-D15** *Back to the file’s version drops the override* — after Apply, reopen the row, press it: the next preview has `edits: []` and the row is incomplete again; on an unedited row the button is disabled.
- **T6-D16** *Skip this row skips it and moves on* — the override list is untouched, `skip` gains the index, the row’s checkbox is unticked.
- **T6-D17** *changing the text drops every edit and skip before the next plan is asked* (Review Focus 4)
  Setup: edit row 2 and skip row 1, then `paste(FILE_2)`.
  Assert: every `catalog_import_questions` call whose `text` is `FILE_2` has `edits: []` and `skip: []` (never the old overrides with the new text); no skipped count in the summary; the editor is closed.
  RED first: the preview keeps `placeholderData`, so a fix that clears overrides in an effect would send one stale call; this fails until they are dropped with the text, in the same state update.
- **T6-D18** *a skipped row is never a duplicate’s original* (Review Focus 4, in Studio) — a file `[A, A]`: row 2 is a duplicate; untick row 1 → row 2 becomes complete and ticked; Import writes one question.
- **T6-D19** *Esc and a press outside do not drop a loaded file; Cancel does; with no file Esc closes*
  Setup: `draw(onOpenChange)` with the spy; paste a file.
  Assert: `fireEvent.keyDown(dialog, { key:'Escape' })` and a press on the Backdrop never call `onOpenChange(false)`; `Cancel` does; with an empty box Esc does.
  RED first: today `onOpenChange={(open) => (open ? … : close())}` closes on both.
- **T6-D20** *Filters offers the seven import filters; search finds a row by its text* — `Filters` popover lists `Status`, `Missing`, `Domain`, `Creates a domain`, `Question tag`, `Ignored fields`, `Skipped`; typing `Doar` leaves one row.
- **T6-D21** *a rejected row can be opened and fixed* — open the rejected row, type a question, `Apply`: it becomes incomplete, ticked, and the summary changes (`0 rejected`).
- **T6-D22** *a first evening: a three-row file opens with every group expanded and nothing hidden* (Review Focus 2) — all three stems are visible without a press.
- **T6-D23** *a refusal still shows its reason and offers nothing* — `paste('{ nope')`: the reason text, `Import 0 questions` disabled, no strip of counts (✓ the existing test stays).

---

### Task 7 — the picker

Gate (not new tests): `beta4.test.tsx` *Add teams…* and *Choose questions…*, and `BoardSection.test.tsx`, pass **unchanged** — *select all in a group takes one question per difficulty*, *a group past one page is selected whole*, *Cancel writes nothing*, *a refused Apply keeps the picker open with its ticks*, *a search that hides the chosen teams keeps them*. Run them first.

New — `apps/studio/src/organisms/PickerDialog.test.tsx` (a harness over `pickTeamsSpec` and four teams, `onApply` a spy), and `BoardSection.test.tsx` for the question picker:

- **T7-1** *the Chosen pane lists what is ticked, in order, numbered for teams*
  Setup: `initial=['team-bravo','team-alpha']`, open.
  Assert: `region` named `/Chosen/` lists `1 Bravo`, `2 Alpha`; ticking Charlie adds `3 Charlie`.
- **T7-2** *a remove button per chosen row unticks it, keeps the rest in order, and the list follows* — `Remove Bravo`: the Bravo checkbox is unchecked, the pane reads `1 Alpha`; `Apply` → `onApply(['team-alpha'])`.
- **T7-3** *the pane says when nothing is chosen* (Review Focus 2) — `initial=[]`: `PICKER.noneChosen`, and Apply is disabled.
- **T7-4** *questions: the pane shows the easy→hard walk with each difficulty, and Apply still writes tick order* (`BoardSection.test.tsx`)
  Setup: History with `q-easy-a` 20, `q-easy-b` 20, `q-hard` 60; tick `Hard one?` then `Easy A?`.
  Assert: the pane lists `Easy A?` before `Hard one?` with the chips `Easy · 20`, `Medium · 60` (60 is in the medium band); the write is `questionIds: ['q-hard','q-easy-a']` (the snapshot re-sorts; the pane is for the eye).
- **T7-5** *the pane is bounded* (Review Focus 1, pinned decision 4)
  Setup: a Bible domain of 1,050 questions in the group `Old`, the game allowing repeats; `Select all in Old`.
  Assert: `PICKER.chosen(1050)` is shown; the pane has at most 100 `listitem`s and says `/950 more/`.
- **T7-6** *the Chosen pane follows the list in document order* (Review Focus 3) — `list.compareDocumentPosition(pane) & FOLLOWING`.
- **T7-7** *the toolbar and the page footer are outside the scrolling rows* — `list.closest('.overflow-y-auto')` exists and contains neither `[data-list-toolbar]` nor the footer text (*class is the rule*).
- **T7-8** *the page footer joins Cancel · Apply* — the lowest common ancestor of the page-size control and the `Apply` button is not the dialog element itself (it is the dialog’s footer).
- **T7-9** *filtering to nothing keeps the frame* — search `zzz`: the scroll area is the same node (`toBe`), the empty state is inside it, the toolbar and the Chosen pane (with its ticks) are still there.
- **T7-10** *short rows run in two columns, tall rows in one* — the teams and domains lists carry a `grid-cols-2` variant; the questions list does not (*class is the rule*).
- **T7-11** *a blocked row’s reason is its second line, one line, the whole reason reachable* (`BoardSection.test.tsx`) — the twin `Easy B?`: the reason is an element after the title (not inside it) with inline ellipsis; `getByLabelText(reason)` (the `DisabledReason` wrapper) exists.
- **T7-12** *Esc and a press outside keep ticks* — after a tick, Esc and a Backdrop press do not call `onClose`; `Cancel` does.

---

### Task 8 — the Board, Rules and Settings are easier to read

Note for every assertion on type: `Text` writes its role as an inline style (`font-size: var(--text-studio-…)`), so a role is checked with `el.getAttribute('style')`, e.g. `toContain('--text-studio-subheading')`; `truncate` is also inline (`text-overflow: ellipsis`), never a class.

Type scale

- **T8-1** `packages/text/src/index.test.ts` · *`studio-subheading` is a variant between the section heading and body text* — it is in `TEXT_VARIANTS`; `variantTokens('studio-subheading')` is `{ size: 'var(--text-studio-subheading)', weight: 'var(--font-weight-medium)', … }`; its index is after `studio-heading` and before `studio-body`.
- **T8-2** `packages/design-studio/src/tokens.test.ts` (✓ exists and already fails on any `studio-*` variable not emitted) · *the sub-heading is emitted and reads as body size at medium weight* — add: `--text-studio-subheading` is declared in the compiled CSS and resolves like `--text-studio-body` (14px); `--text-studio-heading` is larger (18px). The name stands out by weight, not by size.
  RED first: the first run fails on the missing `--text-studio-subheading` before `theme.css` has it.

`SettingRow` and `DisabledReason`

- **T8-3** `apps/studio/src/molecules/SettingRow.test.tsx` · *the name is a sub-heading, the description a muted caption, the reason a warning caption* (principle 7)
  Assert: the label element’s style contains `--text-studio-subheading`; the description’s `--text-studio-caption` and `var(--muted)`; with `disabled={{ key:'k', reason:'frozen' }}` the line `FIELD.frozen` follows the description with `var(--warning)`.
- **T8-4** same · *a `wide` row gives its control the full width* — without `wide` the grid class has the `20rem` control column (`minmax(0,20rem)`); with `wide` it does not, and the control wrapper spans (`col-span-full` or the one-column grid) (*class is the rule*).
- **T8-5** `apps/studio/src/atoms/Tooltip.test.tsx` · *`DisabledReason block` stops shrinking a disabled field to its content*
  Assert: `<DisabledReason reason="why" block>` — the `group` named `why` has `w-full` and not `inline-flex`; without `block` it is `inline-flex` without `w-full`; no reason renders the children bare (no wrapper).
  RED first: there is no `block` prop; the inert *Speed weight* slider was 24px wide because of this.
- **T8-6** `apps/studio/src/atoms/fields.test.tsx` (new) · *the fields that stretch pass `block`; a switch and a checkbox do not* — a disabled `SliderField`, `SegmentedField`, `SelectField`, `NumberField`, `TextField` each give a `group` wrapper with `w-full`; a disabled `SwitchField` and `CheckboxField` do not (a stretched switch would turn the whole row into its hit target).

Board — `apps/studio/src/organisms/BoardSection.test.tsx` (its fixtures: History with `q-easy-a`/`q-easy-b` at 20 and `q-hard` at 60) and `apps/studio/src/molecules/BoardDomainRow.test.tsx`. A helper `bigBoard(domains, perDomain)` seeds complete questions with distinct difficulties `1…perDomain`, a recipe whose board holds them all.

- **T8-B1** `BoardDomainRow.test.tsx` · *a row says its name, code, “n of m questions”, difficulty span and points; open, it shows its questions; closed, it mounts none*
  Setup: `<BoardDomainRow name="History" code="HIS_204" chosen={3} total={4} span="20–70" points={1350} isOpen={false} onToggle={fn} actions={<button>Act</button>}><p data-testid="kids" /></BoardDomainRow>`.
  Assert: the disclosure `button` named `/History/` has `aria-expanded="false"` and calls `onToggle`; `3 of 4 questions`, `20–70` and `/1[ ,.]?350/` are in the row; `queryByTestId('kids')` is null closed and present with `isOpen`; `Act` is reachable in both states; the name’s style contains `--text-studio-subheading`; `warn` draws a warning mark with its text as its name.
- **T8-B2** `BoardSection.test.tsx` · *a small board opens; there is no Open all*
  Assert: the History board (3 questions, one domain) shows `Easy A?` without a press; `queryByRole('button', { name: 'Open all' })` is null.
- **T8-B3** same · *a board of more than 40 questions opens collapsed, with Open all · Close all* — 45 questions in one domain: no `button` named `/^Difficulty of /`; `Open all` and `Close all` are there; `Open all` shows 45 `Difficulty of …` buttons; `Close all` hides them again.
- **T8-B4** same · *the rule is “more than”: exactly 40 questions in 4 domains open; 41, or 5 domains, collapse* (boundary) — 4 × 10 → open; 4 domains with 41 → collapsed; 5 × 2 → collapsed.
- **T8-B5** same · *each row’s numbers are the host’s: “n of m questions”, the span, the points available* — the demo board: `History` row shows `3 of 4 questions`, `20–70`, and the points from `rules_preview` (`1350`); `Technology` `2 of 2 questions`, `15–60`, `750`. The code (`HIS_204`) is beside the name.
- **T8-B6** same · *the questions of an open row are in walk order: difficulty first, easy to hard* — board `[q-h3 (overlay 70), q-h1 (20), q-h2 (45)]`: the `Difficulty of …` buttons read `20`, `45`, `70` top to bottom.
- **T8-B7** same · *Choose questions…, Remove from board and Difficulty of … are all reachable, and Remove from board is a menu item with the exact text the e2e presses*
  Assert: `Choose questions…` is a `button` in each row; the row’s menu contains a `menuitem` named exactly `Remove from board` and choosing it writes `recipe_set_membership` with that domain gone and the other board entry unchanged; `Difficulty of Which empire…` still opens the dialog (the 1.1.1 tests pass unchanged).
- **T8-B8** same · *the reset and remove buttons are quiet until the row is hovered or focused, and stay reachable*
  Assert: `getByRole('button', { name: GAME.reset })` (for the overlaid `q-h3`) and `GAME.removeQuestion` exist by role; their wrapper has `opacity-0` with a `group-hover:` and a `focus-within:` variant that restores it (*class is the rule*).
- **T8-B9** same · *the repeats switch is a setting row like the others, and keeps its name* — `switch` named `/allow repeated difficulties/i` (the three existing tests pass unchanged); its label’s style contains `--text-studio-subheading`; the hint is a caption.
- **T8-B10** same · *the header: the full explanation only while the board is empty* — a board with no domains shows `GAME.boardHint` and `EmptyState`; with domains `queryByText(GAME.boardHint)` is null and a one-line hint is shown; the counts read `2 domains · 5 questions`.
- **T8-B11** same · *the closing shape hint is gone* — `queryByText(GAME.shapeHint)` is null.
- **T8-B12** `apps/studio/src/molecules/BoardBalance.test.tsx` · *the shape chip, its hint and the aligned rung table stay; the domain table is gone*
  Assert: for `ragged`, `uniform`, `aligned`: the chip text (`PREVIEW.board.ragged(2,3)` …) is shown; `aligned` still has its rung table (`getByRole('table', { name: PREVIEW.board.title })`); in all three `queryByRole('table', { name: PREVIEW.board.domain })` is null and there is no `[data-domain]` row inside `BoardBalance`; `empty` shows `PREVIEW.board.empty`.
  RED first: the domain table is drawn today.
- **T8-B13** `BoardSection.test.tsx` · *frozen: every editing control is off with the reason; opening and closing rows is not editing* — `frozenReason='Playing — game rules are frozen'`: `Choose questions…`, the repeats switch, the row menu’s `Remove from board`, and the difficulty buttons are disabled; `Open all` / `Close all` and each row’s disclosure still work.
- **T8-B14** **R** · *a first evening: the demo board (2 domains, 5 questions) opens with its questions visible* (Review Focus 2) — `at({tab:'games', id:'recipe-demo', section:'board'})`: `Which empire built the road network…` is visible without a press.
- **T8-B15** `BoardSection.test.tsx` · *a 569-question board opens collapsed and mounts no question line* (Review Focus 1) — eight domains of about 71 questions (difficulties `1…71`, 569 in all): no `Difficulty of …` button; the header counts `8 domains · 569 questions`; `Open all` is there.

Rules — `apps/studio/src/organisms/RulesSection.test.tsx` (its three describe blocks pass unchanged: bands/linear/speed keys, effects states, the Stage language):

- **T8-R1** *the rows are grouped and titled as Settings groups them, in this order* — `getByRole('region', { name })` for `Award`, `Turn`, `Judging`, `Timer`, `Reveal`, `Stage language`, each following the previous in document order; no `Control`, `Audio`, `Library`, `Data`.
- **T8-R2** *the award mode is the segmented control Settings uses* — `radiogroup 'Award mode'` with radios `Flat`, `By difficulty`, `Lock speed`; `By difficulty` is checked for the demo recipe; pressing `Flat` writes `recipe_set_settings` with `settings.scoring.mode === 'flat'` and the rest of the document intact; there is no `combobox` named `Award mode`.
- **T8-R3** *the weight is a slider with Settings’ bounds, and an inert one says why and keeps its width* — `slider 'Speed weight'` has `aria-valuemin 0`, `aria-valuemax 2`; with an effect `{ key:'scoring.speed_weight', reason:'inert', detail:'lock speed is off' }` (wrap `fake.invoke('rules_preview')` to add it) the slider is disabled, `FIELD.inert('lock speed is off')` is under the name, and the `DisabledReason` wrapper is `w-full`.
- **T8-R4** *the consecutive cap is an optional number* — `switch 'Cap after consecutive correct'` is off for `null`; turning it on writes `turn.max_consecutive_correct: 1`; setting the number to 3 writes 3; turning it off writes `null`.
- **T8-R5** *the bonus has visible labels* — turn on the bonus switch: `getByText('After')` and `getByText('Award')` are visible text (not just hidden labels); defaults write `bonus_after_consecutive: { count: 3, award: 10 }`.
- **T8-R6** *the timer is a three-way choice* — `radiogroup 'Timer'` with `Inherit…`, `On`, `Off`; `Off` writes `timer.enabled: false`, `Inherit…` writes `null`; the Inherit label shows the all-games default.
- **T8-R7** *the duration is in seconds* — a recipe with `duration_ms: 45000`: `textbox 'Duration'` reads `45s`, never `45000` or `ms`; `RULES.timerDurationHint` no longer says “Milliseconds”; typing `60` and leaving writes `timer.duration_ms: 60000`.
- **T8-R8** *Reveal is four segmented controls with Operator / Auto, in a wide row* — four radiogroups named by channel, `Operator` checked; pressing `Auto` writes `reveal.<channel>: 'auto'`.
- **T8-R9** *frozen: every rules row is off with the frozen reason; Reveal and Stage language stay live* — `frozenReason` set: `switch 'Partial credit'` is disabled and `FIELD.frozen` is under its name; the Stage language radios and the Reveal radios are enabled and write.
- **T8-R10** *an inert key explains itself under its name* — with the `flat_points` effect inert (the fake’s default) and mode `Flat` chosen: `FIELD.inert(…)` is shown under `Points per correct answer`.
- **T8-R11** `RulesSection.test.tsx` (preview panel) · *the effects table is a closed disclosure whose rows stay in the page*
  Assert: a `button` named `PREVIEW.effects.title` has `aria-expanded="false"`; `document.querySelectorAll('[data-effect]').length === 14` while closed (the three existing state tests keep passing); `queryByRole('table', { name: PREVIEW.effects.title })` is null while closed (hidden), present after pressing it.
- **T8-R12** same · *the preview’s inner titles are sub-headings* — the elements with `PREVIEW.timer.title`, `PREVIEW.matrix.title` and `PREVIEW.effects.title` have `--text-studio-subheading`; `PREVIEW.title` stays the section heading.
- **T8-R13** same · *warnings are compact notices* — with the demo’s `raggedBoard` warning: `within(document.querySelector('[data-preview-warnings]')).getAllByRole('alert')` has length 1 and shows `PREVIEW.warning(…)`.
- **T8-R14** **R** · *Rules and “What these rules pay” sit side by side: the preview is a complementary after the rules, only on the Rules section*
  Assert: on `section:'rules'` `getByRole('complementary', { name: PREVIEW.title })` follows the `Award` region in document order; on `roster`/`board`/`plays` it is not in the document.

Settings

- **T8-S1** `apps/studio/src/molecules/SectionIndex.test.tsx` · *a nav of the groups; a press scrolls its section into view*
  Setup: `Element.prototype.scrollIntoView = vi.fn()`; sections with ids in the document; `<SectionIndex entries={[{id:'settings-award', title:'Award'}, …]} />`.
  Assert: `navigation 'On this page'` has one control per entry in order; pressing `Timer` calls `scrollIntoView` on `#settings-timer`; no entries renders nothing.
- **T8-S2** `apps/studio/src/templates/SettingsLayout.test.tsx` · *an aside sits after the column and sticks; without one the layout is one column*
  Assert: with `aside` a `complementary` follows the column in document order and has `sticky`; without it none; the form column is `max-w-3xl` (48rem).
- **T8-S3** **R** · *the Settings tab shows an On this page index of its nine groups; other inner tabs show none*
  Assert: `at({tab:'settings', inner:'settings'})`: `navigation 'On this page'` lists `Award, Turn, Judging, Timer, Reveal, Control, Audio, Library, Data`, each target id (`settings-award` …) exists; on `inner:'monitors'`, `'shortcuts'`, `'about'` the navigation is absent.
- **T8-S4** **R** · *Settings rows read name before explanation* — the `Award mode` label’s style contains `--text-studio-subheading` and its description’s `--text-studio-caption`.

Domains pane and Game page

- **T8-D1** **R** · *a domain row is the name over a muted code, with the count apart* — in the pane’s `listbox`, the `History` option: the name and `HIS_204` share one column container (`flex-col`) with the name first; the code’s style has `var(--muted)`; the count `4` is outside that container.
- **T8-G1** **R** · *`rev` leaves the title and lives in a tooltip on it* — `at({tab:'games', id:'recipe-demo'})`: `queryByText('rev 4')` is null; hovering/focusing the title shows a tooltip with `rev 4`.
- **T8-G2** **R** · *the folder and game tags show under the title* — `Season 3`, `demo`, `four teams` are in the page header region, after the title and before the Roster panel in document order.

---

### Task 9 — drag and drop

`SortableList` is tested through the mocked provider: `vi.mock('@dnd-kit/react', …)` has `DragDropProvider` keep its latest `onDragEnd` in a module variable and render its children; `vi.mock('@dnd-kit/react/sortable', …)` has `useSortable` return `{ ref: () => {}, handleRef: () => {}, isDragging: false }`; a drop is simulated with `dropHandler({ canceled: false, operation: { source: { id: 'a' }, target: { id: 'c' } } })` — the event shape `GamePanel.tsx` already reads. If the implementation reorders with `move()` from `@dnd-kit/helpers`, build the event that helper reads instead; the assertions below do not change. The keyboard path (Space lifts, arrows move, Space drops, Esc cancels) needs layout jsdom does not have: it is checked once in the real app (T11-E5).

- **T9-1** `apps/studio/src/molecules/SortableList.test.tsx` · *rows draw in `ids` order, each given its index, a handle ref and its drag state; the list is named*
  Assert: `renderRow` spy called with `(id, { index, handleRef, isDragging: false })` in order; `getByRole('list', { name: 'Teams' })`.
- **T9-2** same · *a drop calls `onReorder` once with the new order and the list shows it at once*
  Setup: `ids=['a','b','c']`, `onReorder` returns a pending promise; drop `a` on `c`.
  Assert: `onReorder` called once with `['b','c','a']`; the rows already read `b c a` before the promise settles.
- **T9-3** same · *a refused write puts the order back* — `onReorder` resolves `false` → rows read `a b c` again; a **rejected** promise restores too, with no unhandled rejection.
- **T9-4** same · *without a promise the new order stands until `ids` changes identity* — `onReorder` returns `void`: rows stay `b c a`; `rerender` with a new `ids` array (the host’s change) shows that array’s order.
- **T9-5** same · *a second drop is computed from the order on screen, not from stale `ids`* — drop `a` on `c`, then `b` on `a` before `ids` changes: the second call is `['c','a','b']`.
- **T9-6** same · *a cancelled drop, a drop on itself and a drop with no target write nothing* — `canceled: true`; `source.id === target.id`; `target: null`: `onReorder` never called, order unchanged.
- **T9-7** same · *with a `disabledReason` the handles are off and say why, and a drop does nothing* — handles `isDisabled`; `getByLabelText(reason)` exists (`DisabledReason`); even a forced `dropHandler(…)` does not call `onReorder`.
- **T9-8** **R-sort** · *the roster has a drag handle per team instead of the arrows; Remove from roster stays*
  Assert: `queryByRole('button', { name: GAME.moveUp })` and `GAME.moveDown` are null; four handles (`/reorder.*Alpha/i`, …); four `Remove from roster` buttons.
  RED first: the ↑/↓ buttons exist today.
- **T9-9** **R-sort** · *a drop on the roster writes `recipe_set_membership` once, with the new team order and the same board* — drop Alpha on Charlie: `calls('recipe_set_membership')` has one call with `teams: ['team-bravo','team-charlie','team-alpha','team-delta']` and `board` equal to the recipe’s; after the change event the rows read that order.
- **T9-10** **R-sort** · *the roster order shows at once and goes back if the host refuses* — wrap `fake.invoke` so `recipe_set_membership` is a pending promise, then reject it: the rows reorder before the answer and return after it; a notice is raised.
- **T9-11** **R-sort** · *a playing game freezes the roster’s handles with the reason* — `receivePlayState` for `recipe-demo`: handles disabled, `getByLabelText(GAME.frozenBanner)`; a forced drop writes nothing.
- **T9-12** **R-sort** · *the Board’s domain rows are dragged; a drop reorders `board` and keeps every domain’s questions* — drop Technology on History: one `recipe_set_membership` with `board[0].domainId === 'dom-tech'`, each entry’s `questionIds` unchanged, `teams` unchanged; frozen disables the handles.
- **T9-13** `crates/host/tests/p20.rs` · I · `the_boards_domain_order_is_the_order_stage_gets` — a recipe whose board lists `[dom-b, dom-a]` builds a snapshot whose `domains` ids are `[dom-b, dom-a]` (what “dragged into the order Stage’s ChooseDomain grid shows them” relies on; `stage_contract.rs` pins the snapshot → play-state mapping).
- **T9-14** **R-sort** · *a question’s options are dragged in the editor’s draft only; the correct tick follows its option; the letters follow position*
  Setup: `at({tab:'library', questionId:'q-h1', mode:'edit'})`; drop `Option A` (Roman, correct) on `Option C`.
  Assert: the option texts read `Ottoman, Persian, Roman, Mongol`; the `Correct` tick is on `Roman` (now third); the letter column reads `A B C D` by position; `calls('catalog_upsert_many')`, `calls('catalog_upsert')` and `calls('catalog_upsert_propagating')` are all empty.
- **T9-15** **R-sort** · *the reorder makes the draft dirty, and Save writes the new order with the option ids kept* — `Save` is enabled after the drop; pressing it writes `options` in the new order with the same ids; before that a navigation away asks (`DirtyGuard`), and *Cancel* leaves the library as it was.
- **T9-16** **R-sort** · *adding, removing and the two-option floor still work after a drop* — `Add option` appends at the end; a question with two options still has `Remove option` disabled; a blank row can be dragged and is dropped on save.

---

### Task 10 — Statistics is a picture first

**Existing tests that change** (`statistics.test.tsx`; port, do not delete): *scopes the Live view…* — the sorted `groupBy` list becomes `['difficulty','domain','team']` · the three tests that click `Include rehearsals` (*asks All data for the dimension the operator picked*, *drops its filters when the workspace changes*) press **More options** first. The source guards (*imports no write, anywhere*, *keeps ECharts in the one molecule*) and the READS allow-list (`workspace_list` stays allowed **in the main window**) are unchanged and are the safety net for this task.

Helper for the Studio tests (in `p20.test.tsx`): `serveStats(fake, { team, domain, difficulty, day })` wraps `fake.invoke` so a `stats_query` answers the rows given for its `groupBy`, with `values` filled **by the metric names the query asked for** (`values = query.metrics.map(m => row.by[m] ?? null)`), so no test depends on the order Studio requests metrics in; `detail > 0` answers `FAKE_LEDGER`. A Play is `openPlay`-shaped (copy it from `statistics.test.tsx`; do not export it from there).

Host — `crates/host/src/stats.rs` module tests (U; the module’s `log(...)` builds turns; set `at_ms` and `difficulty` on the facts directly, `base = 1_756_944_000_000` is 2025-09-04T00:00Z):

- **T10-H1** U · `day_rows_are_chronological_not_ordered_by_the_first_metric`
  Setup: three turns on 2025-09-06, two on 2025-09-05, one on 2025-09-04; `group_by: Day`, default metrics.
  Assert: row keys are `["2025-09-04","2025-09-05","2025-09-06"]`.
  RED first: rows sort by the first metric descending, so the list reads `06, 05, 04`.
- **T10-H2** U · `difficulty_rows_ascend_by_band_not_by_string_or_by_the_first_metric` — difficulties `[100, 10, 30, 20, 20]`: keys `["10","20","30","100"]`, labels `["1–10","11–20","21–30","91–100"]` (string order would put `100` second).
  RED first: ordered by turns today.
- **T10-H3** U · `team_rows_keep_their_order_and_a_limit_keeps_the_top` (regression guard) — `group_by: Team` is first metric descending with the label breaking ties; `limit: Some(1)` keeps the leader.
- **T10-H4** U · `a_turn_with_no_operator_is_no_operator_not_a_teams_name` — facts without `operator_id` grouped `Operator`: one row, key `""`, label `No operator`; with one fact carrying `op-1` there are two rows and `op-1`’s keeps its key.
  RED first: the empty label is filled from `team_name` by `Group::push`, so the row reads `Red`.
- **T10-H5** I · `the_catalog_leaves_no_operator_alone_and_names_a_real_one` — through `stats_query`: the `No operator` row is not overwritten by the relabel; a row for an existing operator is relabelled to its display name.
- **T10-H6** I · `a_play_row_is_labelled_with_its_game_and_date`
  Setup: `beta5.rs`’s Play (seed the demo, `build_snapshot`, one revealed turn) played with real timestamps (`play_load(snapshot, T)` … with `T = 1_757_160_000_000`).
  Assert: `group_by: Play` has one row whose label is `<game name> · 2025-09-06`; renaming the game changes the label (the catalog name wins, as for teams).
  RED first: the label is the play id.
- **T10-H7** I · `ordering_survives_the_service` — `stats_query` with `group_by: Day` and `Difficulty` over two Plays on different days keeps the chronological / ascending order after `relabel`.
- **T10-G1** `crates/app/src/guard.rs` · U · `statistics_may_only_read` (extend its refused list) — add `"workspace_list"` and `"workspace_counts"`: `allow(STATS, …)` is `Err`. This is the contract T10-W1 depends on; it passes already, which is the point.

Fake and dev fake

- **T10-F1** `Fake` · *the fake answers a canned result per dimension when one is set, and the single canned result otherwise* (the property is the implementation’s, e.g. `fake.statsBy`): `stats_query` with `groupBy:'domain'` returns the domain answer, with an unset dimension the old `fake.stats`; `detail` still gates the ledger.
- **T10-F2** `apps/studio/src/host/devFake.test.ts` · *the `?fake` demo answers every dimension the tab asks for, consistently* — for `team`, `domain`, `difficulty`, `day`: `groupBy` matches, rows are non-empty, the sum of the first metric over rows equals the totals’ first value; difficulty keys ascend numerically; day keys ascend.

Atoms and molecules

- **T10-C1** `apps/studio/src/atoms/MeterBar.test.tsx` · *a labelled meter that never overflows* — `role="meter"` named by `label`, `aria-valuemin 0`, `aria-valuemax`, `aria-valuenow`; the fill’s inline width is `25%` for `1 of 4`; `value > max` clamps to `100%`; `max = 0` gives `0%` and no `NaN`.
- **T10-C2** `apps/studio/src/molecules/StatCard.test.tsx` · *a card is a group named by its label, with a value, an optional detail and an optional meter*
  Assert: `getByRole('group', { name: 'Accuracy' })` holds the value; `detail="Beta"` is shown under it; `meter={{ value: 5, max: 12 }}` draws `meter` with `aria-valuenow 5`, `aria-valuemax 12`; without `meter` none; with `animate` the value still renders as text.
- **T10-C3** `apps/studio/src/molecules/StatsTable.test.tsx` · *the table shows 50 rows, then “Show all N”; the totals row stays*
  Setup: a result of 120 rows. Assert: `tbody` has 50 `[data-stats-row]`, the totals row `__totals` is present, `Show all 120` is a button; pressing it shows 120 and the button goes. With 50 rows or fewer there is no button.
- **T10-C4** same · *with `bars`, the first metric is drawn as a bar in proportion to the largest row; a null draws none* — each row has `[data-stats-bar]` with an inline width (largest `100%`); a row whose first value is null has no bar (an em dash, not a zero-width bar); the totals row has none.
- **T10-C5** `apps/studio/src/molecules/StatsCards.test.tsx` · *cards cap at 50 with “Show all N” too* — 120 rows: 50 `[data-stats-row]` cards and the button.
- **T10-C6** `apps/studio/src/molecules/StatsFilterBar.test.tsx` · *the bar is one compact row; Columns, Include rehearsals and All workspaces are under More options*
  Assert: Time, Game, Team, Domain, Verdict, Group by are controls of the bar; `queryByRole('checkbox', { name: STATS.filters.rehearsals })` is null and `More options` has `aria-expanded="false"`; pressing it shows `Include rehearsals`, `All workspaces` and the Column checkboxes; `Clear filters` is still on the bar.
- **T10-C7** same · *a closed More options says when something inside it is set* (pinned decision 6) — `filter.includeRehearsal: true` → the closed button’s name carries `1`; at defaults it does not.
- **T10-C8** `apps/studio/src/templates/SettingsLayout.test.tsx` · *`width="full"` puts no maximum on the column; `wide` and `form` keep theirs* — `full`: no `max-w-*` on the column; `wide`: `max-w-6xl`; `form`: `max-w-3xl` (*class is the rule*).

`StatsChart` — `apps/studio/src/molecules/StatsChart.test.tsx` (new). Setup once: `vi.mock('echarts', () => ({ init: () => ({ setOption, resize: vi.fn(), dispose }) }))` with `setOption`/`dispose` spies; `Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 640 })` and a stub `ResizeObserver`, so the chart is created in jsdom; `option()` = the last `setOption` argument. Prop names for the colours and the extra series are the implementation’s; the assertions are on the option object.

- **T10-K1** *`ranking` draws a bar per row, largest first, at most 12, and says the rest are in the table* — 15 rows: `series[0].data.length === 12`, values descending, the note `STATS.chart.topOf(12, 15)`; 8 rows: no note.
- **T10-K2** *`verdicts` stacks correct, partial and wrong per category* — three series sharing one `stack`, named `Correct`, `Partial`, `Wrong`; categories in the order given.
- **T10-K3** *`timeline` is a line over the days as given, not re-sorted by value* — `series[0].type === 'line'`; `xAxis.data` equals the row labels in input order.
- **T10-K4** *`bands` keeps the band order* — categories `1–10 … 91–100` in input order, bar series.
- **T10-K5** *`race` is one line per team, each ending at its team’s total* — from a ledger of turns (`teamId`, `points + bonus`, `atMs`): one series per team named by the team, cumulative, the last value equal to that team’s `points`.
- **T10-K6** *`bars` is the old default* — a bar per row for `metricIndex`, a line for `groupBy: 'day'`; a row whose metric is `null` is not in the data (never a zero).
- **T10-K7** *a theme colour never reaches ECharts; a literal colour passes through* (Review Focus 5) — colours `{ 'team-a': 'var(--state-correct)', 'team-b': '#2563eb' }`: `JSON.stringify(option())` does not contain `var(` and does contain `#2563eb`.
- **T10-K8** *axis text is muted from `--muted`, which exists* — the `StatsChart.tsx` source (`?raw`) does not contain `--foreground-muted` and does contain `--muted`; `axisLabel.color` is a non-empty string.
  RED first: it reads `--foreground-muted`, a token that does not exist, so it always falls back to `#666`.
- **T10-K9** *options are memoised: re-rendering with the same props does not call `setOption` again* — three `rerender`s with an identical `result` leave `setOption.mock.calls.length === 1`; a new `result` makes it 2.
  RED first: `points` is rebuilt every render and sits in the effect’s dependencies, so the chart is re-drawn on every render.
- **T10-K10** *no animation, a null is an em dash, one dispose* — `option().animation === false`; `option().tooltip.valueFormatter(null)` is `—`; unmounting calls `dispose` once; with `clientWidth` 0 `init` is not called and the panel still renders its label.

Live — **R**

- **T10-L1** *the tiles say what they mean* (`StatCard` groups named `Leading`, `Questions`, `Accuracy`, `Round`, `Fastest lock`; Beta leads with 90 though Alpha has more turns)
  Assert: `Leading` shows `Beta` and `90`; `Questions` shows `7 / 12` (7 issued, 5 left) with a meter now 7 max 12; `Accuracy` shows `57%` with a meter 57; `Round` shows `2` and the holder `Alpha`; `Fastest lock` shows `8.4s` for 8400 ms.
- **T10-L2** *an accuracy that is null is an em dash with no meter; a lock that is null is an em dash; a free token says so* — `Accuracy` shows `—` and `queryByRole('meter', { name: 'Accuracy' })` is null; `Fastest lock` `—`; with `currentTeamId: null` the `Round` tile shows no holder name.
- **T10-L3** *the leaderboard ranks as the scoreboard ranks, not by turns* — Alpha 4 turns, 20 points, rank 2; Beta 3 turns, 90 points, rank 1: the `[data-stats-row]` rows read Beta, Alpha; the rank cells read `1`, `2`.
- **T10-L4** *ties rank 1, 1, 3, in ring order* — Alpha 50, Bravo 50, Charlie 20: rows Alpha, Bravo, Charlie with ranks `1`, `1`, `3`.
- **T10-L5** *each leaderboard row is in its team’s colour* — a team with `color: '#2563eb'`: an element in its row has that colour in its inline style (`rgb(37, 99, 235)`).
- **T10-L6** *Live asks for team (with the ledger once), domain and difficulty* — sorted `groupBy` is `['difficulty','domain','team']`; every query has `filter.playIds === ['play-1']` and `includeRehearsal: true`; exactly one query has `detail > 0` and it is `team`; the team query’s metrics include `fastest_lock_ms`, the domain query’s include `correct`, `partial`, `incorrect`.
- **T10-L7** *three charts, in this order: score over turns, by domain, by difficulty* — `[data-stats-chart]` carries `data-stats-kind`: `race`, `verdicts`, `bands`, in that document order.
- **T10-L8** *the award ledger is last, and its working is closed* — `[data-award-ledger]` follows every chart; `switch 'Show working'` is off; `PREVIEW.ledger.base` is not a column until it is switched on; the rows (`[data-turn]`) are there with `aria-expanded="false"`; the three ✓ ledger tests still pass.
- **T10-L9** *a Play with no resolved turn reads without NaN* (Review Focus 2) — empty rows and zero totals: no `NaN`, `undefined` or `Infinity` in `document.body.textContent`; the leaderboard still lists the Play’s teams with em dashes; charts say `STATS.chart.none`.
- **T10-L10** *no Play open: only the pointer to Control* (✓ exists) — and no tiles, no charts, no queries.

All data — **R**

- **T10-A2** *the summary strip: Plays, Turns, Accuracy, Points* — with the canned result: groups `Plays` `1`, `Turns` `7`, `Accuracy` `57%`, `Points` `110`.
- **T10-A3** *the chart comes before the table, and a picker chooses what it draws* — `img 'Statistics chart'` precedes `table 'Statistics results'` in document order; the picker (`STATS.chart.metric`) offers the chosen Columns; choosing `Points` changes the chart panel’s caption from `Turns` to `Points`.
- **T10-A4** *the chart kind follows what is grouped* — `data-stats-kind`: `team` → `ranking`, `domain` → `ranking`, `day` → `timeline`, `difficulty` → `bands`; `team` with the `Correct` and `Wrong` columns on → `verdicts`.
- **T10-A5** *a table of 120 rows shows 50 and “Show all 120”; the card view too* (Review Focus 1) — through the page, both views.
- **T10-A6** *no resolved turn: the empty state, no chart, no summary* (Review Focus 2) — `STATS.empty.body` is shown; no `img 'Statistics chart'`; no `Plays` group.
- **T10-A7** *the filters still work behind More options* — the three ported tests; `includeRehearsal` reaches the query; a workspace switch resets it.

Window and tab — **R**

- **T10-W1** *the Statistics window asks no `workspace_list`*
  Setup: `window.history.pushState({}, '', '/?stats')` (and `replaceState({}, '', '/')` in `afterEach`), render `<App />`, wait for the first `stats_query`.
  Assert: `calls('workspace_list')` is empty; `[data-stats-window]` is on the page.
  RED first: `StatisticsPage` calls `useWorkspaces()` for the line under its title, and the host refuses that command to this window (T10-G1).
- **T10-W2** *the window is full width; the tab keeps a bounded column* — `[data-stats-window] [data-layout="settings"]` has no element with `max-w-6xl`; in the tab it does.
- **T10-W3** *the tab still names the workspace it counts, from the cache, and follows a rename* — `Plays in <name>` (✓ the beta.5 test) and, after `fake.invoke('workspace_rename', …)`, the new name; `calls('workspace_list').length` after opening Statistics equals the count before it (the page does not fetch).

---

### Task 11 — the look spec

The unit tests cannot see geometry, so this task’s tests are two: a node unit test for the helper that decides which library the look run may read, and the look spec itself, whose steps are **assertions with numbers**, not only screenshots. Screenshots (`e2e/.artifacts/look-p20-<page>-<width>.png`) are read by a person after the assertions pass.

- **T11-U1** `e2e/support/folders.test.ts` · *`look.e2e.ts` is a known spec, seeded from the copy the environment names* — `seedFor('/x/e2e/specs/look.e2e.ts', { E2E_LOOK_LIBRARY: 'C:\\copy\\q.sqlite3' })` equals `['--copy-from', 'C:\\copy\\q.sqlite3']`; without the variable it returns `[]` (the spec skips, but the lookup must not throw `unknown` as it does for an unlisted spec).
- **T11-U2** same · *the look source is a copy, never a live data folder* (pinned decision 5) — `assertLookSource` throws for any path under `org.questiongame.desktop`, `org.questiongame.app` or `org.questiongame.e2e`, for a relative path and for one containing `..`; it accepts a path under a temp folder.
- **T11-U3** same · *the `.sqlite3` and its `-wal` are copied together* — `lookSourceFiles('C:\\copy\\q.sqlite3')` names `q.sqlite3` and `q.sqlite3-wal` (and `-shm`, if present).
- **T11-E1** `e2e/specs/look.e2e.ts` · *skips unless `E2E_LOOK_LIBRARY` is set* — the run without the variable reports the spec skipped, never failed (`npm run e2e` on a machine without the maintainer’s copy is unchanged).
- **T11-E2** *no page scrolls sideways at 1440 and 1100 (sidebar expanded)* — for Teams, Questions, Games, Operators, Game ▸ Roster / Board / Rules, Settings, Statistics: `document.documentElement.scrollWidth <= window.innerWidth`.
- **T11-E3** *an opened row never moves the toolbar, and Status stays top right* — Questions with the copy’s 1,050 questions: the toolbar’s `getBoundingClientRect().height` and `.top` are equal before and after opening a row (±1px); its bottom is above the aside’s top; the `Archive scope` tablist’s right edge is within 8px of the toolbar’s right edge, at both widths.
- **T11-E4** *ticking a row moves nothing* — Teams: the strip’s height and the list body’s `top` are equal before and after one tick and after *Clear*; at 1100 with a row open the strip’s right edge is not past the aside’s left edge.
- **T11-E5** *the keyboard reorders*: roster handle focused, `Space`, `ArrowDown`, `Space` → the order changed in the app and one `recipe_set_membership` ran; `Space`, `ArrowDown`, `Escape` → unchanged. The same on a Board domain row.
- **T11-E6** *editors use the width* — at 1440 the team editor’s aside is to the right of the main column (`aside.left >= main.right`) with the same top; at 1100 it is below (`aside.top >= main.bottom`); the sticky footer’s box equals the scroll container’s box (edge to edge) and Save’s right edge is within 1px of the content’s right edge; the question editor’s main column is at most 48rem wide.
- **T11-E7** *Settings rows keep their label and control together* — at 1440 the distance from a row’s label left edge to its control’s right edge is at most 48rem; *On this page* is to the right of the column and its `position` is `sticky`.
- **T11-E8** *the picker uses the window and does not jump* — `Choose questions…` on the copy’s largest domain: the dialog is at least `min(72rem, window − margins)` wide; its height is identical before and after a search that empties the list; at 1100 the Chosen pane is below the list; Cancel and Apply are visible without scrolling the dialog.
- **T11-E9** *the Board of the copy library opens collapsed and is usable* — 569 questions: no `Difficulty of …` button before `Open all`; `Open all` is displayed within 3 seconds of opening the section; each domain row’s numbers match the Rules preview.
- **T11-E10** *Import is a workspace* — a 2,000-row file: the dialog is wide, the list shows 100 rows, the editor opens beside the list at 1440 (`editor.left >= list.right`) and over it at 1100 (rectangles overlap); Esc does not close it.
- **T11-E11** *Statistics from simulated Plays* — after `e2e_library --simulate-plays`: All data shows at least 3 Plays on at least 2 days; the chart’s top is above the table’s; the table has at most 50 rows; Live (with a Play loaded and played) shows the five tiles and three charts.
- **T11-E12** *the type scale reached the real build* — computed styles in the app: a `Settings` row name is 14px / weight 500, its description 12px, a page title 20px, a section heading 18px (the §0 bug was invisible to every unit test).
- **T11-E13** *the source library is untouched* — the copy’s `.sqlite3` and `-wal` have the same size and mtime before and after the run.

---

### Task 12 — gates (no new tests)

`npm run map:check` passes (every new or changed IPC: `recipe_bulk_edit`, `domain_group_delete { into }`, `catalog_import_questions { edits, skip }`); `copy/whatsNew.test.ts` passes with the 2.0.0-beta.6 entry in English and Romanian; `npm run lint` (atomic boundaries, the ECharts-only-in-`StatsChart.tsx` rule, `design-stage`/`design-studio` separation); `npm test`, `npm run test:host`, `npm run test:app`, `npm run lint:host`, `npm run lint:app`, then the look run against the copy at 1440 and 1100.

---

### Counts per task

| Task | Rust (U / I) | Fake / dev fake | Studio unit (atoms, molecules, organisms, templates, packages) | Studio route (R, R-sort) | e2e / node | New | Already in tree |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 0 | 0 | 10 | 6 | 0 | **16** | 6 |
| 2 | 0 | 0 | 11 | 8 | 0 | **19** | 5 |
| 3 | 0 | 0 | 7 | 9 | 0 | **16** | 3 |
| 4 | 4 | 3 | 5 | 23 | 0 | **35** | 4 (the host tests) |
| 5 | 10 (9 host + the app guard) | 3 | 2 | 20 | 0 | **35** | 0 |
| 6 | 13 | 2 | 33 (6 list model and query, 4 row form, 23 dialog) | 0 | 0 | **48** | 0 |
| 7 | 0 | 0 | 12 | 0 | 0 | **12** | 0 |
| 8 | 0 | 0 | 35 | 7 | 0 | **42** | 0 |
| 9 | 1 | 0 | 7 | 8 | 0 | **16** | 0 |
| 10 | 8 (7 host + the app guard) | 2 | 18 | 19 | 0 | **47** | 0 |
| 11 | 0 | 0 | 0 | 0 | 16 (3 node, 13 e2e) | **16** | 0 |
| **All** | **36** | **10** | **140** | **100** | **16** | **302** | **18** |

(The counts are of the test ids above; the Fake mirrors of T6-H1–H11 are one `it` each and are not renumbered. Re-count when a test is split during the build.)

### RED-first index (run these first; each must fail for the reason given before the build starts)

| Test | Fails today because |
| --- | --- |
| T1-7, T1-16 | `BulkBar` returned `null` at 0, so the strip is a different node when it appears |
| T1-5 | one flex row holds Search and Status; there is no right cluster |
| T2-6, T2-7 | there is no `TeamPreview` |
| T3-14 | the domain group header menu is flat: Rename and Delete only |
| T4-H1 | `domain_group_delete` takes no `into` |
| T5-H1 | there is no `recipe_bulk_edit` |
| T6-H7 | skipping does not exist; a repeated row is always a duplicate |
| T6-F2 | the ignored-tags wording says `outside 1–100` |
| T6-D17 | the preview keeps `placeholderData`; overrides would outlive their text |
| T6-D19 | the dialog closes on Esc and on a press outside with a file loaded |
| T8-5, T8-6 | `DisabledReason` has no `block`; the inert slider shrank to 24px |
| T8-B12 | `BoardBalance` still draws the domain table |
| T10-H1, T10-H2 | day and difficulty rows are ordered by the first metric |
| T10-H4 | a turn without an operator takes the team’s name as its label |
| T10-H6 | a Play row is labelled by its id |
| T10-K8 | the chart reads `--foreground-muted`, which does not exist |
| T10-K9 | the chart’s effect depends on an array rebuilt every render |
| T10-W1 | the Statistics page asks `workspace_list`, which that window may not |
