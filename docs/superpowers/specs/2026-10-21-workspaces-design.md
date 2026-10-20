# Beta 2.0: workspaces — design

*2026-10-21. Status: draft for approval. Release C of four (A channels ✓ → B stable 1.1 ✓ → **C Beta 2.0 workspaces** → D groups inside domains, bulk actions, tags). Beta only: built on `main`, never merged into `release/1.x`.*

The maintainer's words: workspaces and workspace groups; a local library per workspace plus a shared library; duplicate, copy, move, propagate edits, delete; a switcher at the top of the sidebar; **no prebuilt or suggested workspaces**; and at 2.0 → stable, each 1.x library is backed up and moved into **one workspace the user names, with no name suggested**. Asked what a workspace is *for*, they answered: it doesn't matter — the app offers tools, the operator names a workspace and uses it for whatever they need. Every decision below that is not in those sentences is the designer's call, marked *(call)*.

## Intent

Today questiongame holds one library. An operator who runs two quiz formats, two seasons, a client show and a classroom keeps them all in one pile, and every list, every board picker and every statistic mixes them. Workspaces let them keep separate libraries in one app — each with its own teams, domains, questions, games and Plays — while the things they want everywhere live once, in a **shared library** every workspace sees.

Success: an operator creates workspaces with names of their own, switches between them from the top of the sidebar, keeps a set of questions shared and the rest local, copies or moves a team, a domain, a question or a game from one workspace to another, changes a copied question once and chooses whether its copies follow, duplicates a whole workspace for next season, and archives one they are done with — and a 1.x library arrives intact as one workspace they named. Nothing is ever lost on the way.

## Goals

1. **Workspaces**: create (the operator types the name), rename, duplicate, archive, restore, delete permanently (archived only). Each holds its own teams, domains, questions, assets, games and Plays.
2. **Workspace groups**: named groups that organise the switcher; create, rename, reorder, delete (its workspaces move out, never with it).
3. **A shared library**: teams, domains and questions visible in every workspace; a row is *local* (one workspace) or *shared*.
4. **Copy and move** rows between workspaces and between local and shared, with references kept valid.
5. **Propagate edits**: a copy remembers what it was copied from; saving a change offers to apply it to the linked copies too.
6. **A switcher at the top of the sidebar**, never usable to change workspace during a show.
7. **Migration**: an existing library (Beta now, stable at 2.0) is backed up and becomes one workspace whose name the operator types on first launch.
8. The list views of 1.1 (filters, sort, headers, pages) work inside a workspace, with *where* (this workspace · shared) as a filter.

## Non-goals

- Several people or devices, sync, sharing over a network, per-workspace permissions or pins.
- Exporting or importing a workspace as a file (a later release; the library backup already covers recovery).
- Groups inside domains, new bulk edits (domain, difficulty), tags — release D. (Copy / move / share **are** offered for a selection here, because they are what workspaces are for.)
- Shared games: a game always belongs to one workspace *(call)*.
- Nested groups, a workspace in several groups *(call)*.

## Anti-goals

- **Any path that loses or damages a row**: migration, move, delete, duplicate. Every irreversible step is preceded by a library backup; a refusal changes nothing.
- A game, a board or a Play that points at a row the current workspace cannot see.
- Suggested names, sample workspaces, a workspace that appears without the operator creating it — the one exception is the migrated library, which waits for its name.
- Switching workspace, or deleting the one in use, while a game is loaded in Control.
- An edit silently changing other workspaces: propagation is always the operator's explicit choice.

## Constraints (from the repo)

- One SQLite file (`questiongame.sqlite3`), WAL, forward-only migrations on `user_version` (3 so far); `open_guarded` backs the file up before any migration. One writer connection inside `CatalogService`.
- Tables: `teams`, `domains`, `questions` (+ `question_options`), `assets`, `operators`, `recipes` (+ `recipe_teams`, `recipe_domains`, `recipe_questions`, `recipe_overlays`), `events`, `plays` (a projection), `globals`. No table has a library column today; `referenced_by` (`store.rs`) guards removals in Rust.
- Search is an in-RAM Tantivy index (`key, kind, id, archived, text`), rebuilt at open.
- The Demo seed uses fixed ids (`seed-…`, `seed-ro-…`), which two workspaces in one file would collide on.
- Studio's Query keys have no library prefix. Operators, shortcuts, control behaviour and update settings are about the person and the machine.
- No hard delete in v1 — this release introduces exactly one, for an archived workspace, behind a backup.

---

## 1. The model *(call: one file, a column — not one file per workspace)*

**One database, scoped rows.** A new table `workspaces` and a `workspace_id` on every library row. The shared library is **not** a workspace: it is `workspace_id IS NULL` on teams, domains, questions and assets. One file keeps every move, copy and duplicate a single transaction, one backup covers everything, and a board can hold local and shared questions without a cross-file reference — which a file per workspace would make impossible to keep valid.

| Row | Belongs to |
|---|---|
| team · domain · question · asset | one workspace, or shared (`NULL`) |
| game (recipe) and its roster / board / overlays / layout | one workspace, never shared |
| Play, events, statistics | the game's workspace |
| operator, pin | the app (global) |
| shortcuts, control behaviour, updates, the active operator | the app (global) |
| game defaults, the timer default | the workspace *(call: they seed new games, which are per workspace)* |

**What a workspace sees**: its own rows plus the shared ones. Everything that lists, searches, picks or counts is scoped this way, in the host — never by Studio filtering a full list.

**Reference rules** (enforced in the host, at every write, like the §2.31 board rule):
- A **shared domain** may hold only shared questions — otherwise another workspace would see a domain pointing at a question it cannot.
- A **local domain** may hold its own workspace's questions and shared ones.
- A **game** may use its own workspace's teams, domains and questions, and shared ones.
- A **team or question's asset** follows the row: a shared row needs a shared asset (making a row shared makes its asset shared).

## 2. Workspaces and groups

- **Create**: a name the operator types (required, ≤ 60 characters, unique among active workspaces, case-insensitive); optionally a group. It starts empty. The empty state offers *Load the Demo* into it, as first run does today *(call)*.
- **Rename**, **move to a group**, **reorder** inside its group.
- **Duplicate**: a new workspace with a name the operator types, holding copies of every local row and game — new ids, each copy linked to its source (§4) — but **no Plays** (a Play is a record of a show that happened) *(call)*. Shared rows are not copied; they are already shared.
- **Archive**: hidden from the switcher and every list, restorable; its rows are untouched. Refused while it is the current workspace with a game loaded.
- **Delete permanently**: only an archived workspace; a confirm that names it and counts what goes (rows, games, Plays); a library backup is taken first; then its local rows, games, Plays and events are removed in one transaction. Shared rows are never touched. The last remaining workspace cannot be deleted.
- **Groups**: a name (required, unique), an order; a workspace is in one group or none ("Ungrouped", last). Deleting a group moves its workspaces to Ungrouped.
- Workspaces and groups have ids that are never reused.

## 3. The switcher and switching

- **At the top of the sidebar**, above *Library*: the current workspace's name. Pressing it opens a menu — workspaces under their group headers (Ungrouped last), each with a check on the current one; then *New workspace…* and *Manage workspaces…*. In the icon rail it is the workspace's initials, with the name as tooltip.
- **Manage workspaces** is a page (sidebar ▸ switcher ▸ Manage), one list view (1.1's model) with groups as headers and the actions of §2 as row actions; groups are managed in the same page.
- **Switching** sets `current_workspace_id` (host truth, a global like `active_operator_id`), emits one `workspace-changed` event, and Studio drops every cached library query (keys gain the workspace id) and returns to the tab the operator was on, page 1. **Refused while a game is loaded in Control** — the switcher shows why (*Unload the game in Control first*). Stage is untouched.
- Each list view remembers its sort, group and page size per operator **per workspace** *(call)*.

## 4. Copy, move, share, propagate

Offered as row actions and, for a selection, in the bulk bar (Teams, Domains & Questions, Games):

- **Copy to…** another workspace: the rows picked are always new rows there (new ids). What they need comes along: a copied domain brings its local questions, a copied **game** its local roster, domains and questions, so the copy works there; references to shared rows stay as they are. A needed row that **already has an active copy in the target** (same family, below) is **reused** instead of copied again — copying a second domain that shares a question, or the same game twice, does not multiply that question *(call)*. Archived earlier copies are not reused.
- **Families**: every row copied from another, and every row copied from those, is in one **family** (`family_id`, set on the first copy and inherited). Siblings, parents and copies of copies are all one family — a season duplicated each year stays one family *(call)*.
- **Move to…** another workspace: the same rows, their `workspace_id` changed. A row moves **with the local rows it needs** — a domain with its local questions, a game with its local roster, domains and questions, its overlays and its Plays — so nothing that arrives points at a row the target cannot see. The move is **refused** if anything that stays behind still uses any of them (another local domain holding one of the questions, another game using one of the teams), naming each user, with *Copy instead*. Shared rows are never moved; they are already everywhere. *(call)*
- **Make shared** / **Make local** (to the current workspace): *Make shared* also makes shared the questions of a domain and the asset of a row (asked once, listing them). *Make local* is refused while another workspace uses the row, naming where.
- **Propagate edits**: saving a team, domain or question that has other rows in its family (in any workspace, active or archived) asks, in the editor's own confirm frame: *Save here only* · *Also update {n} copies* (with the workspaces named). Propagation copies the **body** (names, text, options, difficulty, colour, notes), never membership, archive state or a game's overlays. A copy edited since it was made is updated too — the operator chose to; there is no merge. *Stop following its copies* takes a row out of its family.
- **A copy the change would break is skipped, not forced** *(call)*: before the confirm, the host checks each copy's workspace — a difficulty that would put two questions at one difficulty on a board (§2.31), or an emptied field that would leave an incomplete question on a board (§2.32). The confirm then says *Also update {n} copies ({m} skipped: on a board in {workspace} it would …)*; the rest are updated in one transaction with the save. *Save here only* is unaffected.
- Every one of these is **one transaction**; a refusal changes nothing.

## 5. Migration

- **The schema step** (migration 4): creates `workspaces` and `workspace_groups`, adds `workspace_id` to teams, domains, questions, assets and recipes and `copied_from` to teams, domains, questions and recipes, and creates **one workspace with no name yet** holding every existing row (none shared). `open_guarded` has already backed the file up — the step needs no copy of its own, but a test proves the backup exists before the step runs.
- **The name**: until the migrated workspace has a name, Studio shows *Name your workspace* before anything else in the shell: one text field, empty, no suggestion, no placeholder name; *Continue* needs a name. The library is fully usable the moment it is named.
- **A brand-new install** has nothing to migrate and no workspace. The order is: Beta's welcome first (release A), then — on *Start empty* — *Create your first workspace* (typed name, as above), then first run. On *Copy my stable library* the copied library migrates and asks for its name instead. A workspace row does not count as content for the welcome's "empty library" check, so the order can never strand a typed name *(call)*.
- **Copy my stable library** (release A) still works: the copied 1.x library is migrated on open like any other and then asks for its name.
- **At 2.0 → stable**: the same migration runs on the stable library when stable updates to 2.0 — backed up, one workspace, named by the operator. Nothing in this release ships to stable.
- **Backups** *(call)*: the migration's backup is **kept out of the five-copy rotation** (`questiongame-pre-workspaces-<stamp>.sqlite3`, never pruned), because it is the one that matters most and later backups would otherwise push it out. *Delete permanently* also takes a backup, in the normal rotation. Copy, move, share and propagation do not: each is one transaction, and copy / move / share can be undone by doing the reverse; propagation overwrites only what the operator chose to, after a confirm that names it.
- **Asset files** *(call)*: a copied asset is a new row pointing at the **same file**; no file is duplicated. *Delete permanently* removes asset rows, never files — a file another workspace's row still points at would otherwise vanish. Files no row uses any more are left for *Remove generated data* (Settings ▸ Data).

## 6. Search, statistics, the Demo

- **Search** indexes a `scope` field (`ws:<id>` or `shared`) and every query filters to the current workspace plus shared.
- **Statistics** reads the current workspace's Plays; an *All workspaces* choice in its filter bar reads them all *(call)*.
- **The Demo** can be loaded into any workspace: its rows get ids derived from the workspace (`seed-<workspace>-…`), so two workspaces each hold their own Demo; *Restore Demo* works per workspace. The migrated workspace keeps the ids it already has.

## 7. The 1.1 list views

- A shared **Where** filter on Teams and Domains & Questions: *This workspace · Shared*, plus a **shared** chip on shared rows (added to §4.6's vocabulary).
- Group by *Where* on the same tabs.
- Domains & Questions: the domain pane shows local and shared domains, the shared ones marked.

## 8. Tests (Sonnet proposes the full list; these are the floor)

- **Migration**: a 1.0.2 library and a 1.1 library each migrate with every row present, byte-identical bodies, every reference intact, and a backup on disk *before* the step; a migration interrupted mid-way leaves the pre-migration file usable (transaction); the migrated workspace has no name until one is given.
- **Scoping**: no list, search, picker, statistic or snapshot in workspace A ever returns a row local to B (property test over generated workspaces and rows).
- **Reference rules**: every write path that could break them refuses — membership, board, overlay, make shared/local, move, copy, delete.
- **Copy/move/duplicate/delete** each in one transaction; a refusal leaves the file unchanged (snapshot compare).
- **Propagation**: only the body fields; only when chosen; archived copies included; the link survives a rename and is gone after *Stop following*.
- **Switching** refused with a game loaded; caches dropped; per-workspace list prefs.
- **e2e**: name the migrated workspace; create a second; copy a question into it; make a domain shared; switch; edit and propagate.

## Left to the builder

- Exact table and column names (`workspace_id`, `family_id`, the pinned backup's exact name).
- The switcher's and Manage page's layout (HeroUI as shipped, consistent with the shell).
- How Query keys carry the workspace (prefix vs clear-on-switch).
- Commit split and phase numbering on `main`.
