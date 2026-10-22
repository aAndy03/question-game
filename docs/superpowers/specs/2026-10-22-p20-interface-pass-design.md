# P20: the interface pass (Beta)

Status: design, 2026-10-22. `main` only, no version bump and no tag (the maintainer's word). Scope: the maintainer's list of 2026-10-22 — eleven interface items — and the game tags and folders editor the beta.5 audit left open. Checked on the maintainer's Beta library (≈1,050 questions, 15 domains, the *Demo (Română)* game with 569 questions on its board), copied into the e2e build's folder.

## Intent

Tweaks, not a redesign. The Board's *Choose questions…* picker (beta.4) is the model the maintainer liked: the same components, the same look, laid out so the eye can follow it. The design has to hold for a library five years old and for a first evening with three questions — a middle ground, never a layout that only works at one end. Screens, Control and Stage are out of scope except where a shared fix touches them (§0).

## The principles (they go into `05_STUDIO_DESIGN.md` §2.4, binding for every page)

1. **A reading column is at most 48rem.** Inside it a row keeps its label and its controls together. A wider window never stretches a row: the maintainer's "name on the right, switch on the left margin" is the thing to avoid.
2. **Extra width is a second column of related content** — a preview, where the record is filed, a summary, what the page's settings pay — 22rem like the detail aside and the Screens inspector. A page with nothing for it stays one column.
3. **A page's frame spans the page.** A sticky footer or a header rule runs edge to edge; its buttons line up with the content's right edge.
4. **Widths are container queries** (`@container/…`), never viewport breakpoints: the sidebar is 240, 56 or 0 px.
5. **Below the threshold the second column follows the first**, in reading order; nothing needed to finish the task is hidden.
6. **Nothing moves because something appeared.** A strip that can appear is always there (quiet when empty); a panel that opens starts below the toolbar, never beside it.
7. **A name reads before its explanation.** A setting's or field's name is the strongest text in its row; its description is smaller and muted.
8. **Summary first, detail on demand.** A long section opens on its counts and ranges; its rows are a press away (a disclosure), open by default only when they are few.

## What changes

### 0. The Studio type scale was never emitted (found on the way)

`packages/design-studio/tokens/theme.css` declared the type roles (`--text-studio-title`, `-heading`, `-body`, `-caption`, `-mono` and their line heights) in `@theme inline`. Tailwind v4 emits a theme variable only when a utility uses it; `Text` reads them from an inline style, which Tailwind cannot see — so every role but `label` resolved to nothing and fell back to the inherited 16px. Every title, heading, body line and caption in Studio has been 16px since P7, while labels were 12px: the "name smaller than its description" in Rules and Settings, the flat Board, list rows whose meta outweighs the question. **Fix:** `@theme static` (always emitted), plus `--tracking-normal`, which `Text` also reads. **Guard:** a node test compiles Studio's CSS with Tailwind and asserts every variable a `studio-*` variant reads has a value. This touches Control, Screens and Statistics too — it is the size they were designed at, and they are checked on the real app.

### 1. Editor pages use the width (New team, New question, Edit operator)

- `RecordPageLayout`'s default drops `max-w-3xl`; the column fills the page. `wide` (the Game page) becomes 96rem.
- New molecule **`EditorColumns { children, side?, sideLabel? }`**: a container; one 48rem column, or — from a 60rem container and only when `side` is given — 48rem + 22rem side. Below, the side follows the main column.
- **`EditorFooter`** spans the page (border edge to edge) and lines Cancel · Save up with the content (`withSide`).
- **Team**: main = the current panel (Name; Short code | Colour; Notes). Side = **Preview** (`TeamPreview`: the mark as Studio rows show it, and as Stage shows it — one letter in the colour box, the name in capitals; a theme colour is a hatched neutral box captioned *Theme colour*, never the `var(…)` token) and, when editing, *Copies*.
- **Question**: main = gaps and refusals, then Question · Options · Difficulty · Explanation. Side = **Where it is filed** (domains, domain groups) and **Question tags**, then *Copies*. `DomainPicker` and `DomainForm` measure their container (one column in the side, two where there is room).
- **Operator**: main = Display name; side (edit) = the PIN panel, which saves on its own and no longer sits above Save.
- The unreachable `mode === 'view'` branches of Team/Question/Operator pages go (1.1.1 sends every view to the list's aside).

### 2. The opened row's panel starts below the toolbar (Domains & Questions)

New template **`ListArea { toolbar, children, aside?, onCloseAside? }`**: the toolbar on its own row, then the list and the aside side by side. `LibraryTabLayout` takes `toolbar` and uses it; Domains & Questions uses it as its second pane. Status (*Active · Archived · All*) never wraps under the toolbar when a row opens; below 1280px the aside no longer covers the toolbar. `ListToolbar` splits into a wrapping left group (lead · Search · Filters · Sort · Group) and a fixed right cluster (View · Status), so Status stays top right at every width; DOM order is unchanged. The Questions lead (the domain's name) truncates.

### 3. The selection strip is always there

`BulkBar` no longer mounts on the first tick: on every tab with bulk actions it is always shown. Empty, it is quiet — no fill, a dashed hairline, "0 selected" and, in grid view, the page's *Select all* checkbox (grid had none); selected, it is today's bar. The list never moves on select, *Clear*, or a filter that clears the selection. The actions scroll inside the strip rather than run under the aside; the label and *Clear* never shrink.

### 4. Import questions: a workspace for a file

- Wide dialog (72rem, height follows the content up to the window). Once a file is in: a source strip (file name and row count · *Change file* · *Edit text* · *Copy template* · *Questions without a domain go to*), the summary, then the rows on the **list-view model** — search, Filters (Status, Missing, Domain, Creates a domain, Question tag, Ignored fields, Skipped), Sort (row, text, difficulty, status), Group (status — the default, problems first —, domain, missing, question tag), pages of 100. The summary's counts are buttons that filter to that status.
- **Include or skip** per row (checkbox), per group (header checkbox: "skip all 41 incomplete") and per page. Duplicates and rejected rows cannot be ticked, their reason as the row's second line.
- **Edit a row in the dialog**: opening a row shows it beside the list (over it when narrow): its gaps and ignored fields, then question, options, difficulty, question tags, domains (existing and the file's new ones), explanation — *Apply*, *Apply and next*, *Back to the file's version*, *Skip this row*. Edits and skips travel to the host as overrides of the file (`edits: [{ index, row }]`, `skip: [index]`); the host still reads every row with the one reader, so the preview and the import cannot disagree.
- The host report gains each row's **body** (as read), `skipped`, `counts.skipped`; a duplicate keeps its tags and domains.
- The **template** names every field the file can carry (tags added; a second, incomplete row shows the floor) and the dialog says which question fields a file cannot carry (media, domain groups).
- Fix: an ignored tags list says "more than 20 question tags, or one over 40 characters", not "outside 1–100".
- Esc or a click outside does not drop a loaded file; *Cancel* does.

### 5. Menus have section names

`ActionMenu` takes **sections** (`{ id, title, items }`), draws each item's icon, and a disabled item says why under its name. The bulk *Edit…* and *Copy or move…* menus use the same sections. The vocabulary is fixed in `05_STUDIO_DESIGN.md` §4.6:

| Menu | Sections |
| --- | --- |
| Team, Question row | *Team* / *Question* (Open, Edit) · *Copy and move* (Duplicate, Copy to…, Move to…, Stop following its copies) · *Status* (Archive / Restore) |
| Domain row | *Domain* (Edit) · *Copy and move* · *Status* |
| Game row | *Game* (Open) · *Organise* (Folder…, Game tags…) · *Copy and move* · *Status* |
| Operator row | *Operator* (Open, Edit, Make active) · *Status* |
| Workspace row | *Workspace* (Open, Rename, Move to workspace group…) · *Copy and move* (Duplicate…) · *Status* · *Danger zone* (Delete permanently…) |
| Bulk *Edit…* (questions) | *Question tags* · *Domains* · *Difficulty* |
| Bulk *Edit…* (games) | *Folder* · *Game tags* |
| Group headers, managers | the group's kind · *Arrange* (Move up, Move down) · *Danger zone* (Delete …) |

A section title never repeats an item's text; "delete" words only in *Danger zone*.

### 6. Managers for question tags, domain groups, folders and game tags

One molecule, **`ManagerDialog`**: a wide dialog with a list on the left (search when long, counts, A–Z / Most used) and the chosen entry on the right — its name, how many it holds, its actions, and its members as Board-style lines (the first 100, then *Show in list*).

- **Question tags**: Rename…, Merge into…, Delete question tag, *Show in list* (filters the Questions list), spelling variants with *Use this spelling*. Every write is previewed first (the host's `preview`).
- **Domain groups** (of the open domain): Rename…, Move up/down, Merge into… (host: `domain_group_delete { into }`, one transaction), Delete, *Show in list*; a *No domain group* entry with its count.
- **Folders and game tags** (Games tab, new): the same, over the games: rename a folder, empty it, rename / merge / delete a game tag, *Show in list*.

### 7. The question picker uses the width

`PickerDialog` grows to the window (72rem wide, a fixed height so filtering never makes the frame jump) and pins its chrome: the toolbar and the page footer stay put, only the rows scroll; the page footer joins Cancel · Apply in the dialog footer. A **Chosen** pane sits beside the list: what is ticked, in order — for teams the play order, for questions the easy→hard walk with each difficulty — each with a remove button. Rows are one line (a blocked row's reason is its second line, truncated, whole in the tooltip); short rows (teams, domains) run in two columns. The list body is extracted as **`PickList`** and shared with the import dialog.

### 8. The Board, Rules and Settings are easier to read

- **A sub-heading role**, `studio-subheading` (14px medium), between the section heading (18px) and body text: setting names, the titles inside a section, a domain's name on the Board.
- **Board**: a header panel (title, a one-line hint — the full explanation only while the board is empty —, counts, *Add domains…*, and *Allow repeated difficulties* drawn as a `SettingRow` like every other setting), then **one list of domains**: each row is its name, code, *n of m questions*, difficulty span, points available (the LadderTable's numbers, from the host), *Choose questions…* and a menu (Remove from board); open, its questions in walk order (difficulty first, in a fixed column), the reset and remove buttons quiet until the row is hovered or focused. A big board (more than 40 questions or 4 domains) opens collapsed, with *Open all · Close all*; a small one opens. Domain rows are dragged into the order Stage's ChooseDomain grid shows them. `BoardBalance` keeps the shape chip, its hint and the aligned rung table; its domain table is gone (the rows carry its numbers). The closing shape hint goes (it repeated the switch and the picker).
- **Rules**: the rows are grouped and titled as Settings groups them (Award · Turn · Judging · Timer · Reveal · Stage language), each key with **the control Settings uses** (segmented award mode, the weight slider, the optional cap, labelled bonus, a three-way timer, the duration in seconds — not milliseconds), every row with the host's disabled reason. On a wide page *What these rules pay* sits beside them, sticky; its inner titles are sub-headings, its warnings compact notices, and *What each setting does* a closed disclosure (rows kept in the page).
- **Settings**: the tabs as wide as their labels, the column 48rem, and on the Settings tab a sticky *On this page* index of the groups beside it.
- `SettingRow`: the name is a sub-heading, the description a caption (principle 7); a `wide` row (Reveal, the cue map, the band table) gives its control the full width. `DisabledReason` stops shrinking a disabled field to its content (the inert *Speed weight* slider was 24px wide).
- The Domains pane's rows: the name over a muted code, the count aligned.
- The Game page: `rev` leaves the title (a tooltip on it); folder and game tags show under the title.

### 9. Statistics is a picture first

- **Live**: KPI tiles that say what they mean (*Leading* with the team, *Questions* played / total with a meter, *Accuracy* with a meter, *Round* with who holds the token, *Fastest lock*); a **leaderboard** in team colours (ranked as the scoreboard ranks, not by turns); **score over turns** (one line per team, ending at its score); **by domain** stacked correct / partial / wrong / left; **by difficulty**; the award ledger last, its working closed.
- **All data**: the filters compact (*More options* holds Columns, rehearsals, all workspaces); a summary strip (Plays, Turns, Accuracy, Points); the chart before the table with a metric picker — ranking for categories (top 12, the rest in the table), a timeline for days, bands for difficulty, verdicts when correct and wrong are columns; the table and cards show 50 rows, then *Show all*.
- `StatsChart` (still the only ECharts file) gains a closed `kind`: `ranking · verdicts · timeline · bands · race · bars`; team colours resolved before ECharts sees them; muted axis text from `--muted` (it read a token that does not exist); options memoised.
- Host: day and difficulty rows in key order (they were ordered by the first metric); a Play row is labelled "{game} · {date}"; a turn with no operator is *No operator*, not a team's name.
- The Statistics window: full width, and no `workspace_list` call (the window may not ask it).

### 10. Lists you order are dragged

One molecule, **`SortableList`** (`@dnd-kit/react` sortable, as Control's ring): a handle per row, the others slide aside as it moves, the drop writes the new order once (optimistic until the host's change arrives; a refusal puts it back). The keyboard works on the handle (Space lifts, arrows move, Space drops, Esc cancels). Used by the **roster** (the handle replaces the ↑/↓ buttons; *Remove from roster* stays a button), the **Board's domains**, and a question's **options** in the editor (the draft only, until Save).

### 11. Game tags and folders, edited

- The Game page's first panel: **Name · Folder · Game tags** (Folder is a combobox of the workspace's folders that accepts a new one; Game tags is the tag field with the workspace's game tags offered). Labels are organisation, not part of the show: they stay editable while the game plays.
- Games tab: bulk *Edit…* (*Folder*: Set folder…, Clear folder; *Game tags*: Add game tag…, Remove game tag…), the row menu's *Organise*, and the manager (§6).
- Host: `recipe_bulk_edit { ids, edits, preview }` with `set_folder | tag | untag`, one transaction; folders and game tags cleaned like question tags (trimmed, at most 20 tags of 40 characters, a folder of 60).

## Non-goals

No change to Control, Screens or Stage beyond §0. No domain groups or media in the import file (a format change, the maintainer's call). No team × domain heatmap (it needs a second grouping in `stats_query`). No *Import anyway* for a duplicate.

## Calls I made

- The selection strip is always present (§3) rather than turning the header row into it: one mechanism for table and grid, and the grid gets a *Select all* it lacked. Cost: one row of height on the three bulk tabs.
- Board domains collapse by default above 30 questions.
- Labels (folder, game tags) stay editable while a game plays.
- No large `?fake` library: the maintainer's Beta library, copied into the e2e build, is the large library (`e2e_library --copy-from`, read-only on the source, and `look.e2e.ts`).
