# Beta 2.0 — workspaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Several named libraries (workspaces, in groups) and a shared library inside one questiongame Beta, with copy, move, share, propagate, duplicate, archive and delete, a switcher at the top of the sidebar, and a 1.x library migrated into one workspace the operator names.

**Architecture:** One SQLite file. Migration 4 adds `workspaces`, `workspace_groups`, a `workspace_id` on library rows (`NULL` = shared) and a `family_id` for copies. `CatalogService` holds the current workspace and scopes every read and write to *current ∪ shared*; the reference rules are checked in the host at every write. Studio keys its queries by workspace and reads the current workspace from the host.

**Tech Stack:** Rust (rusqlite, Tantivy, proptest), Tauri 2, React 19 + HeroUI v3, vitest, WebdriverIO.

**Spec:** `docs/superpowers/specs/2026-10-21-workspaces-design.md`

**Tests:** `docs/superpowers/plans/2026-10-21-workspaces-tests.md` (Sonnet's list with decisions; each task names its ids).

## Global Constraints

- Branch `main` only (Beta). Nothing here merges into `release/1.x`. Phases `P14.0` (schema, scoping, workspaces), `P14.1` (copy, move, share, propagate), `P14.2` (Studio), `P14.3` (e2e, docs).
- Migrations are forward-only; migration 4 is the fourth entry of `MIGRATIONS`. A library opened by a build without it must refuse a library with it (`SchemaTooNew`, unchanged).
- The pre-workspaces backup is named `questiongame-pre-workspaces-<stamp>.sqlite3` and `backup::prune` never touches it.
- Workspace and group names: required, trimmed, ≤ 60 characters, unique among **active** ones, case-insensitive. No suggested name anywhere, no placeholder text that reads as a name.
- Every list, get, search, picker, snapshot, preview and statistic is scoped *current ∪ shared* **in the host**. A row local to another workspace is `NotFound` to `catalog_get`.
- Reference rules (host, every write): a shared domain holds only shared questions; a local domain holds its own and shared questions; a game uses its own and shared teams, domains, questions; a shared team or question has a shared (or no) asset.
- Copy, move, share, make-local, propagate, duplicate and delete-permanently are each **one transaction**; a refusal changes nothing (file compare in tests).
- Operators, shortcuts, control behaviour, updates and `active_operator_id` stay global. `game_defaults` and the timer default become per workspace (stored in `workspaces.settings_json`).
- Switching workspace, archiving or deleting the current one is refused while a Play is loaded (`play.get_state().is_some()`).
- Every new command is Studio-only (`guard`), in `packages/contract` `COMMAND_GROUPS` and `generate_handler!`; `npm run map` with `mismatches: []`.
- HeroUI v3 as shipped (`heroui-react` skill first). Studio copy in `copy/`.
- Commit per task with docs, co-author line; ask before pushing.

## Review Focus

1. **A 1.x library with an open Play at upgrade** — the Play resumes in the migrated workspace, its recipe scoped there. Test `migration keeps an open play resumable` (Task 1).
2. **A board that already mixes rows once two workspaces exist** — a recipe written before the split references only its own rows; after copy/move no recipe references another workspace's local row. Property test `no recipe in A references a B-local row` (Task 2).
3. **Seed ids colliding** — loading the Demo into a second workspace must not overwrite the first's. Test `two workspaces each hold their own Demo` (Task 2).
4. **Delete permanently while another workspace's game uses a shared row** — the shared row stays. Test `delete permanently never touches shared rows` (Task 3).
5. **Studio showing a stale workspace's rows after a switch** — every library query refetches. Test `switching drops every library query` (Task 7).

---

## P14.0 — schema, scoping, workspaces

### Task 1: Migration 4 and the model

**Files:** Modify `crates/host/src/catalog/{db.rs,backup.rs,model.rs,mod.rs}`; tests in `crates/host/tests/upgrade.rs`.

**Interfaces — Produces:**
```rust
pub struct WorkspaceId(String);  pub struct WorkspaceGroupId(String);   // id newtypes like TeamId
pub struct Workspace { pub id: WorkspaceId, pub name: Option<String>, pub group_id: Option<WorkspaceGroupId>, pub sort_key: i64, pub settings: Option<serde_json::Value>, pub created_at: u64, pub updated_at: u64, pub archived_at: Option<u64> }
pub struct WorkspaceGroup { pub id: WorkspaceGroupId, pub name: String, pub sort_key: i64, pub created_at: u64, pub updated_at: u64 }
// Team, Domain, Question, Asset gain `pub shared: bool` (#[serde(default)]) and `pub family_id: Option<String>` (#[serde(default)])
// Recipe gains `pub family_id: Option<String>`
pub const META_CURRENT_WORKSPACE: &str = "workspace.current";
pub const PRE_WORKSPACES_PREFIX: &str = "questiongame-pre-workspaces-";
```
Migration 4 SQL: `CREATE TABLE workspace_groups(id PK, name, sort_key, created_at, updated_at)`; `CREATE TABLE workspaces(id PK, name NULL, group_id NULL REFERENCES workspace_groups(id) ON DELETE SET NULL, sort_key, settings_json NULL, created_at, updated_at, archived_at NULL)`; `ALTER TABLE teams|domains|questions|assets|recipes ADD COLUMN workspace_id TEXT NULL`; `ADD COLUMN family_id TEXT NULL` on teams, domains, questions, recipes; indexes `<table>_by_workspace`. Then, **only if any row exists** in teams, domains, questions, assets, recipes or plays: insert workspace `ws-1` with `name NULL` and set `workspace_id = 'ws-1'` on every row, and set global `workspace.current = "ws-1"`. The pre-migration backup: `open_guarded` writes it under `PRE_WORKSPACES_PREFIX` when the pending migration includes step 4; `prune` skips names with that prefix.

- [ ] **Step 1: Failing tests** in `upgrade.rs`: `migration 4 puts every row into one unnamed workspace` (a 1.0.2-shaped file via `CatalogService::open` before the step — build it by opening with a 3-step schema helper — then `open_file`: counts per table equal, every row's `workspace_id = ws-1`, `workspaces` has one row with `name IS NULL`, `workspace.current = ws-1`); `an empty library creates no workspace`; `the pre-workspaces backup exists before the step and is never pruned` (seven later opens with version changes → the pinned file still there, normal backups at 5); `migration keeps an open play resumable` (Review Focus 1); `a library from the future is still refused`.
- [ ] **Step 2:** `cargo test -p questiongame-host --test upgrade` → FAIL.
- [ ] **Step 3:** Implement (store reads/writes the new columns; `shared = workspace_id IS NULL` for library kinds).
- [ ] **Step 4:** → PASS; `npm run test:host` all green.
- [ ] **Step 5:** Commit `P14.0: migration 4 — workspaces, groups, a workspace on every library row`.

### Task 2: Scoping the catalog to *current ∪ shared*

**Files:** Modify `crates/host/src/catalog/{service.rs,store.rs,search.rs,seed.rs,snapshot.rs,import.rs}`; tests `crates/host/tests/workspaces.rs` (new), existing `catalog_service.rs` keep passing.

**Interfaces — Produces:**
```rust
impl CatalogService {
    pub fn current_workspace(&self) -> Option<WorkspaceId>;          // None only on a library with no workspace
    // every catalog_list / catalog_get / catalog_search / recipe_list / recipe_get / play_list / stats_query /
    // build_snapshot / preview_board / seed_demo / seed_status / import_questions: scoped to current ∪ shared
}
pub enum CatalogError { ..., WrongWorkspace { kind: CatalogKind, id: String }, NoWorkspace, ScopeRule { rule: &'static str, detail: String } }
```
New rows land in the current workspace unless `shared: true`. An upsert of an existing row never changes its workspace (only Task 4's operations do). `catalog_get` of another workspace's local row → `NotFound`. Search adds a STRING field `scope` (`ws:<id>` | `shared`) and a Must clause (`scope = ws:<current>` OR `shared`). The Demo's ids are `seed-<ws>-…` when the current workspace is not the migrated `ws-1` (which keeps its existing `seed-…` ids); `seed_status` counts per workspace. `stats_query` gains `filter.all_workspaces: bool` (default false). Reference rules enforced in `domain_upsert` (members) and `recipe_upsert`/`recipe_set_membership` (roster, board) → `ScopeRule`.

- [ ] **Step 1: Failing tests** in `workspaces.rs` (helper creates two workspaces through Task 3's API — write Task 3's `workspace_create` stub first or seed rows with SQL in the test): `rows are visible in their own workspace and shared rows in both`; `catalog_get of another workspace's local row is NotFound`; `search returns current and shared hits only`; `a shared domain refuses a local question`; `a game refuses a team local to another workspace`; `two workspaces each hold their own Demo` (Review Focus 3); proptest `no list, search, snapshot or stats in A returns a B-local row` (generated workspaces, rows, shares); `no recipe in A references a B-local row` (Review Focus 2).
- [ ] **Step 2:** `cargo test -p questiongame-host --test workspaces` → FAIL.
- [ ] **Step 3:** Implement. `CatalogService` holds `current: Mutex<Option<WorkspaceId>>`, read from the global at open; every `store` list/get takes `ws: Option<&WorkspaceId>` and adds `AND (workspace_id = ?ws OR workspace_id IS NULL)`.
- [ ] **Step 4:** → PASS; `npm run test:host` green (existing tests run on a library whose single workspace is current).
- [ ] **Step 5:** Commit `P14.0: the catalog sees the current workspace and the shared library, nothing else`.

### Task 3: Workspaces and groups — the host verbs

**Files:** Create `crates/host/src/catalog/workspace.rs`; Modify `service.rs`, `mod.rs`; Create `crates/app/src/commands/workspace.rs`; Modify `crates/app/src/{lib.rs,guard.rs,emit.rs,commands/mod.rs}`, `packages/contract/src/commands.ts` (+ events); tests in `workspaces.rs` and `crates/app` unit tests.

**Interfaces — Produces** (`CatalogService`):
```rust
pub fn workspace_list(&self) -> CatalogResult<(Vec<Workspace>, Vec<WorkspaceGroup>)>;            // archived included, flagged
pub fn workspace_create(&self, name: &str, group: Option<&WorkspaceGroupId>, now: u64) -> CatalogResult<Workspace>;
pub fn workspace_rename(&self, id: &WorkspaceId, name: &str, now: u64) -> CatalogResult<()>;    // also names the migrated one
pub fn workspace_set_group(&self, id: &WorkspaceId, group: Option<&WorkspaceGroupId>, sort_key: i64, now: u64) -> CatalogResult<()>;
pub fn workspace_duplicate(&self, id: &WorkspaceId, name: &str, now: u64) -> CatalogResult<Workspace>;   // local rows + games, no Plays, families set
pub fn workspace_archive(&self, id: &WorkspaceId, now: u64) -> CatalogResult<()>;
pub fn workspace_restore(&self, id: &WorkspaceId, now: u64) -> CatalogResult<()>;
pub fn workspace_delete(&self, id: &WorkspaceId, backup: &OpenOptions) -> CatalogResult<DeleteReport>; // archived only, backup first, not the last
pub fn workspace_switch(&self, id: &WorkspaceId) -> CatalogResult<()>;                            // active only; rebuilds nothing but `current`
pub fn group_create / group_rename / group_reorder / group_delete(...)                            // delete moves workspaces to ungrouped
pub struct DeleteReport { pub rows: usize, pub games: usize, pub plays: usize, pub backup: PathBuf }
```
Commands (app): `workspace_list`, `workspace_create`, `workspace_rename`, `workspace_set_group`, `workspace_duplicate`, `workspace_archive`, `workspace_restore`, `workspace_delete` (pin-gated like `wipe_plays`), `workspace_switch`, `workspace_group_create|rename|reorder|delete`. Each refuses a loaded Play where it touches the current workspace (switch, archive-current, delete). Emits `workspace-changed { current, workspaces, groups }` to `main` and `stats`, and the existing `catalog-changed` / `recipe-changed` after a switch. `catalog::WorkspaceSettings` (game defaults, timer) read by `FlagService` from the current workspace when a recipe is created.

- [ ] **Step 1: Failing tests:** names (empty, 61 chars, duplicate case-insensitive, an archived name reusable); `duplicate copies local rows and games with families and no Plays`; `archive hides a workspace and restore brings it back`; `delete permanently is refused for an active workspace, the last one, and while loaded`; `delete permanently never touches shared rows` (Review Focus 4) and leaves a backup and removes events of its Plays; `deleting a group moves its workspaces to Ungrouped`; `switch is refused while a Play is loaded`; guard: `stage` and `stats` may call none of them.
- [ ] **Step 2:** → FAIL. **Step 3:** Implement. **Step 4:** `npm run test:host && npm run test:app` → PASS; `npm run map` mismatches empty.
- [ ] **Step 5:** Commit `P14.0: workspaces and groups — create, rename, duplicate, archive, delete, switch`.

## P14.1 — copy, move, share, propagate

### Task 4: Copy, move, make shared, make local

**Files:** Create `crates/host/src/catalog/transfer.rs`; Modify `service.rs`; Create commands in `commands/workspace.rs`; tests `crates/host/tests/transfer.rs`.

**Interfaces — Produces:**
```rust
pub struct Selection { pub teams: Vec<TeamId>, pub domains: Vec<DomainId>, pub questions: Vec<QuestionId>, pub recipes: Vec<RecipeId> }
pub struct TransferReport { pub created: Vec<(CatalogKind, String)>, pub reused: Vec<(CatalogKind, String)>, pub moved: Vec<(CatalogKind, String)> }
pub fn catalog_copy_to(&self, sel: &Selection, target: &WorkspaceId, now: u64) -> CatalogResult<TransferReport>;
pub fn catalog_move_to(&self, sel: &Selection, target: &WorkspaceId, now: u64) -> CatalogResult<TransferReport>;
pub fn catalog_make_shared(&self, sel: &Selection, now: u64) -> CatalogResult<TransferReport>;   // + domain questions, + assets
pub fn catalog_make_local(&self, sel: &Selection, now: u64) -> CatalogResult<TransferReport>;    // to current; refused if another ws uses it
pub fn transfer_preview(&self, op: TransferOp, sel: &Selection, target: Option<&WorkspaceId>) -> CatalogResult<TransferPreview>; // what comes along, what is reused, what refuses
```
Closure (design §4): domain → its local questions; game → its local roster, domains (with their local questions), questions, overlays, layout; move also → Plays and events. Copy reuses a needed row that has an active family member in the target; the picked rows are always new. Move refuses with `CatalogError::StillUsed { kind, id, used_by }` naming each staying user. New ids `<kind>-<uuid8>`; `family_id` set to the source's family or the source's own id.

- [ ] **Step 1: Failing tests:** `copying a domain brings its local questions and keeps shared ones shared`; `copying a game makes it work in the target` (build_snapshot succeeds there); `copying a second domain that shares a question reuses the first copy`; `an archived earlier copy is not reused`; `moving a domain moves its questions`; `moving is refused while a staying game uses a row, naming it`; `moving a game carries its Plays`; `make shared takes a domain's questions and a team's asset along`; `make local is refused while another workspace uses it`; `a refused transfer leaves the file byte-identical`.
- [ ] **Step 2:** → FAIL. **Step 3:** Implement. **Step 4:** → PASS. **Step 5:** Commit `P14.1: copy, move and share between workspaces, with what each row needs`.

### Task 5: Families and propagation

**Files:** Modify `transfer.rs` (or `family.rs`), `service.rs`; commands `catalog_propagate_preview`, `catalog_upsert` gains `propagate: bool`, `catalog_unfollow`; tests `crates/host/tests/family.rs`.

**Interfaces — Produces:**
```rust
pub struct PropagationPreview { pub update: Vec<(WorkspaceId, String)>, pub skipped: Vec<(WorkspaceId, String, &'static str /* why */)> }
pub fn propagation_preview(&self, item: &CatalogItem) -> CatalogResult<PropagationPreview>;
pub fn catalog_upsert_propagating(&self, item: &CatalogItem, now: u64) -> CatalogResult<(CatalogChange, PropagationPreview)>;
pub fn catalog_unfollow(&self, kind: CatalogKind, id: &str, now: u64) -> CatalogResult<()>;
```
Body fields per kind: team (name, short code, colour, logo asset, notes), domain (name, code, description), question (stem, options, difficulty, explanation, media). A copy whose change would break a board in its workspace (§2.31 duplicate difficulty, §2.32 incomplete on a board) is skipped and named.

- [ ] **Step 1: Failing tests:** `a family spans siblings and copies of copies`; `propagation changes only body fields`; `archived copies are updated too`; `a copy whose board would break is skipped and named`; `save here only touches nothing else`; `unfollow takes a row out of its family`.
- [ ] **Step 2–4:** FAIL → implement → PASS. **Step 5:** Commit `P14.1: a change can follow its copies`.

## P14.2 — Studio

### Task 6: Host wiring in Studio

**Files:** `apps/studio/src/host/{types.ts,queries.ts,bridge.tsx,fake.ts,commands.ts}`, `chrome/chrome.ts` (list prefs keyed by workspace), tests.

- `types.ts`: `Workspace`, `WorkspaceGroup`, `shared`/`familyId` on rows, `TransferPreview`, `PropagationPreview`.
- `queries.ts`: `useWorkspaces()`; every library key gains the current workspace id as its second element (`['catalog', ws, kind, …]`); `workspace-changed` invalidates everything workspace-keyed.
- `chrome.ts`: `prefs.<op>.lists` becomes `prefs.<op>.lists[workspace][tab]` (old documents read as the first workspace's).
- The fake host implements every new command (refusing as the host does).
- Tests: `switching drops every library query` (Review Focus 5); `list prefs are per workspace`.

### Task 7: The switcher, naming, Manage page

**Files:** Create `organisms/WorkspaceSwitcher.tsx`, `pages/WorkspacesPage.tsx`, `pages/NameWorkspacePage.tsx`; Modify `SidebarNav.tsx`, `App.tsx` (order: Beta welcome → name/create workspace → first run → shell), `chrome/nav.ts` (route `{ tab: 'workspaces' }`), `copy/`.

- Switcher at the top of the sidebar (above *Library*): name · menu of groups → workspaces (current checked, Ungrouped last) · *New workspace…* · *Manage workspaces…*; rail: initials + tooltip; disabled with the reason while a game is loaded.
- `NameWorkspacePage`: one empty text field, label *Workspace name*, no placeholder, *Continue* disabled until valid; used for the migrated workspace (`workspace_rename`) and for the first workspace of a fresh install (`workspace_create`).
- `WorkspacesPage`: 1.1 list view of workspaces, grouped by group; row actions Rename · Move to group · Duplicate · Archive/Restore · Delete permanently (archived only, pin, confirm naming the counts); group create/rename/reorder/delete.
- Tests: order of first-launch screens; no suggestion text anywhere (`input.value === ''`, no placeholder); switcher refusal while loaded; Manage actions call the right commands.

### Task 8: Where, shared, transfers and propagation in the lists and editors

**Files:** `host/listSpecs.ts` (Where filter + group on Teams and Questions), `MeaningChip` vocabulary (`shared`), `molecules/BulkBar.tsx` (extra actions slot), `organisms/TransferDialog.tsx` (preview then confirm), editors (`TeamEditor`, `DomainForm`, `QuestionEditor`) confirm frame for propagation, `pages/StatisticsPage` *All workspaces* filter, `05_STUDIO_DESIGN.md` §21.

- Row actions and bulk: *Copy to…*, *Move to…*, *Make shared*/*Make local*; the dialog shows `transfer_preview` (what comes along, reused, refusals) before the write.
- Editors: on save of a row with a family, *Save here only* · *Also update {n} copies ({m} skipped …)*.
- Tests: preview shown before write; refusal named; propagation choice sends `propagate: true|false`; Where filter reads `shared`.

## P14.3 — end to end, docs

### Task 9: e2e and docs

**Files:** `e2e/specs/workspaces.e2e.ts` (+ `SEEDS`: the e2e library is migrated on open, so it starts with an unnamed workspace); docs `docs/as-built/host.md` (Workspaces), `studio.md`, `release.md` (migration 4 and its backup), `04_ROADMAP.md` (P14.0–P14.3), `history.md`, CLAUDE.md status line; *What's new* `2.0.0-beta.1` entry (EN, RO).

- e2e: name the migrated workspace; create a second by name; copy a question into it; make a domain shared; switch; edit the question in its first workspace and propagate; check the copy changed.
- Gate: `npm run typecheck && npm run lint && npm run test:all && npm run lint:app && npm run lint:host && npm run map:check && npm run e2e` → green. Ask before pushing; do not bump the version (`version:beta -- --start 2.0.0` is the maintainer's call).
