# Remove the shared library (beta.2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every library row lives in exactly one workspace. A beta.1 library's shared rows become linked copies in every workspace, losing nothing. Every surface stops mentioning sharing, and the workspace-switching bugs the audits found are fixed.

**Architecture:**
- Migration 6 is the first **Rust** migration step: it runs code inside the one migration transaction, after the backup.
- It hands each shared row's original id to the oldest active workspace and gives every other workspace a family member (reused or copied). It re-points every reference per workspace, adds NULL-refusing triggers, and re-spells tags per workspace.
- After it, the scope SQL has one meaning (this workspace), and the shared verbs, fields and UI are deleted end to end.

**Tech Stack:** Rust (rusqlite, serde), Tauri 2, React 19 + HeroUI v3 + TanStack Query, vitest, WebdriverIO e2e.

**Spec:** `docs/superpowers/specs/2026-10-21-remove-shared-library-design.md`

## Global Constraints

- `main` only. No version bump, no tag, no push without the maintainer's word. Commit attribution: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- The data folders `org.questiongame.desktop` / `org.questiongame.app` are off-limits.
- **Back up, then migrate** (P12.6). Migration 6 runs inside the one migration transaction; a failure leaves the file at 5.
- Events are append-only: migration 6 never writes `play_events` or `plays`.
- "Nothing anyone could see disappears": every row a workspace saw in beta.1 (its own plus shared, archived included) is visible there after migration 6.
- The original id goes to the **oldest active workspace** (lowest `created_at`, then id). An already-present family member in another workspace is **reused**, never twinned. Same-name rows with no family link are left alone.
- After migration 6 no library row has `workspace_id IS NULL`. Triggers refuse it from then on.
- Vocabulary: `docs/v1/03_CONTEXT.md`. Docs, `codemap.yaml` (`npm run map`) and *What's new* change in the same commits as the code. Keep CLAUDE.md lean.
- Gates before each commit: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:host`, `npm run test:app`, `npm run lint:host`, `npm run lint:app`, `npm run map:check`. Run `npm run e2e` before the final commit.

## Review Focus

1. **A beta.1 library where a shared row is on both workspaces' boards**, one of them with a board already broken before the upgrade. Expect: both games load (or fail) exactly as before, and no twin domain appears.
2. **A shared row already copied into a second workspace** (family member present), then edited there. Expect: that member is reused, references point at it, and no "Biblie" twin is created.
3. **A paused Play in a non-oldest workspace** whose snapshot names a shared question with media or a team with a logo. Expect: it resumes and shows its pictures after the upgrade.
4. **A workspace switch on Statistics, Screens and the separate Statistics window**, and Back right after a switch. Expect: no old workspace's game, filter or row is shown, and Back does not land in the old workspace.
5. ***Copy to…* of one question from a 300-question domain** with *with their domains* on. Expect: the target gets the domain row with that one question, not 300. Copying into a workspace that already has a copy of the domain adds the question to it.

Each line's test is pinned in the owning task below.

---

### Task 1: Migration 6, shared rows become linked copies

**Files:**
- Modify: `crates/host/src/catalog/db.rs` (migration runner: `Migration` steps that are SQL or Rust; step 6; `write_older_schema` keeps writing ≤ 5 without triggers)
- Create: `crates/host/src/catalog/unshare.rs` (the step's code)
- Modify: `crates/host/src/catalog/mod.rs`
- Test: `crates/host/tests/unshare.rs` (new), `crates/host/tests/upgrade.rs`
- Test support: `db::share_for_test(path, kind, id)`, `#[doc(hidden)]`. It sets `workspace_id = NULL` on a row in a v5 file, so tests can build beta.1 libraries.

**Interfaces:**
- Produces: `pub(crate) enum Step { Sql(&'static str), Rust(fn(&Connection, u64) -> CatalogResult<()>) }`. `MIGRATIONS: &[Step]`, `len() == 6`.
- Produces: `unshare::run(conn: &Connection, now_ms: u64) -> CatalogResult<()>`. Triggers named `<table>_has_workspace_insert` / `_update` on teams, domains, questions, assets, recipes refuse `workspace_id IS NULL` with `RAISE(ABORT, 'a library row lives in a workspace')`.
- Produces: `db::WORKSPACES_STEP` unchanged (4). New `db::UNSHARE_STEP: u32 = 6`.

- [ ] **Step 1: Write the failing tests** in `tests/unshare.rs`. Each builds a head library with the rows, `write_older_schema(.., 5)`, `share_for_test` on the shared ones, then opens it (which migrates):
  - `u01_a_shared_question_in_two_workspaces_domains_is_one_row_per_workspace`
    - the oldest workspace keeps the id;
    - the other's domain member names a new id with the same `family_id`.
  - `u02_a_shared_domain_with_groups_is_copied_with_its_groups_and_members`
  - `u03_a_shared_team_on_two_rosters_points_each_roster_at_its_own_row`
  - `u04_a_shared_asset_as_logo_and_as_media_is_remapped_including_overlay_patch_json`
  - `u05_archived_shared_rows_arrive_archived`
  - `u06_a_family_member_already_in_the_workspace_is_reused_not_twinned`
    - it holds even when that member's body drifted;
    - row count per (workspace, family) is ≤ 1.
  - `u07_unrelated_same_name_rows_are_left_alone`
  - `u08_board_problem_before_equals_after_for_every_game_in_its_own_workspace`
    - one board is broken before the upgrade and stays exactly as broken.
  - `u09_tags_are_respelled_per_workspace`
    - the earliest-created question's spelling wins within each workspace.
  - `u10_no_row_has_a_null_workspace_and_a_null_write_is_refused`
  - `u11_archived_workspaces_get_their_rows_too`
  - `u12_plays_and_play_events_are_byte_identical_after`
  - `u13_a_library_with_no_shared_rows_only_gains_the_triggers`
  - `u14_a_failure_inside_step_6_leaves_user_version_5`
    - force it with a test hook; the backup exists.

  In `upgrade.rs`:
  - v2/v3/v4 libraries still upgrade to 6;
  - the future-schema test becomes found 7 / known 6.
- [ ] **Step 2:** `cargo test -p questiongame-host --test unshare`. Expected: FAIL, `share_for_test` and step 6 do not exist.
- [ ] **Step 3: Implement** `Step`, the runner change (SQL via `execute_batch`, Rust via the fn, same transaction), and `unshare::run`.
  - For each kind in order asset → question → team → domain, for each shared row:
    1. Pick the oldest active workspace W0 and set `workspace_id = W0`.
    2. For every other workspace W (archived included): look for an existing family member in W. If there is none, copy the row with a fresh id, in the same family (create one if the row had none), keeping archive state.
    3. Record the mapping `(W, kind, old_id) → id`.
  - Then per workspace W, re-point:
    - `domain_questions.question_id` of W's domains;
    - domain copies' members;
    - recipes' rosters and boards (`recipe_teams`, board tables) and overlays (team/domain/question keys and `logo_asset_id` / `media_asset_id` inside `patch_json`);
    - teams' `logo_asset_id` and questions' `media_asset_id`.
  - Domain copies take their groups via `groups::write_copy_with_groups`.
  - Then re-spell tags per workspace (the earliest-created question's spelling per `tag_key`), then create the triggers.
  - Never touch `plays` / `play_events`.
- [ ] **Step 4:** run the two test files. Expected: PASS. Then `npm run test:host`. Expected: PASS, apart from the shared-behaviour tests Task 2 rewrites. List those failures, don't fix them here.
- [ ] **Step 5: Commit** `beta.2: migration 6 turns shared rows into linked copies`.

### Task 2: The host has one scope

**Files:** `crates/host/src/catalog/{store,transfer,workspace,bulk,groups,family,model,seed,service,import,error,mod}.rs`. Tests: `crates/host/tests/{workspaces,transfer,bulk,groups_tags,groups_tags_review,family,catalog_service}.rs`.

**Interfaces:**
- Consumes: Task 1's triggers.
- Produces:
  - `store::IN_VIEW` keeps its name and means `workspace_id = (SELECT id FROM temp.current_ws)`;
  - `in_view(alias)` likewise;
  - `land()` is gone, and new rows write the current workspace.
  - `Stamps` loses `shared` (the field is deleted; serde ignores the key in old payloads, with no `deny_unknown_fields` anywhere).
  - Removed:
    - `TransferOp::MakeShared` / `MakeLocal`, `catalog_make_shared`, `catalog_make_local`;
    - `store::domain_rule`, `users_elsewhere`, and the shared arm of `home_of` (it returns `Option<WorkspaceId>`);
    - `BulkReport.shared`, `TagCount.shared`.

- [ ] **Step 1: Write the failing tests:**
  - `scope_a_row_is_seen_only_in_its_workspace` (all four kinds);
  - `scope_upsert_of_a_new_row_lands_in_the_current_workspace`;
  - `bulk_report_has_no_shared_field` (a compile-level change: assert the JSON has no `shared` key);
  - `tag_list_counts_only_this_workspace`;
  - `an_old_payload_with_shared_true_deserializes_and_lands_here`.
  - Delete or rewrite every test that makes rows shared. Each one either becomes a two-workspace copy test or goes; list them in the commit message.
- [ ] **Step 2:** `npm run test:host`. Expected: compile errors and failures on the removed items.
- [ ] **Step 3: Implement** the deletions, so each call site reads one way.
  - Transfer closure, reuse and move rules lose their shared branches.
  - Propagation reaches family members in every workspace as today.
  - `seed.rs`: Demo status and restore lose the shared cases.
- [ ] **Step 4:** `npm run test:host` and `npm run lint:host`. Expected: PASS.
- [ ] **Step 5: Commit** `beta.2: the host has one scope`.

### Task 3: Copy with domains, Demo in every workspace, the safety fixes

**Files:**
- `crates/host/src/catalog/{transfer,seed,service}.rs`
- `crates/app/src/commands/{beta,workspace}.rs`
- tests `crates/host/tests/{transfer,workspaces,demo_scenarios}.rs`, `crates/app/tests/*`

**Interfaces:**
- Produces: `CatalogService::catalog_copy_to(&self, selection: &Selection, target: &WorkspaceId, options: CopyOptions, now_ms: u64)`.
  - `CopyOptions { with_domains: bool }` (`Default` → `with_domains: true`, serde camelCase).
  - `transfer_preview` takes `CopyOptions` for `Copy`.
  - `TransferReport` gains `joined: Vec<Touched>` (domains in the target the copied questions were added to).
- Produces: `CatalogService::asset_get_any(&self, id: &AssetId)`. It is unscoped and read-only, for resolving a Play's snapshot assets. Every Play-side asset read uses it.
- Produces: `crates/app/src/commands/beta.rs::is_empty_library` reads every workspace (unscoped counts).

- [ ] **Step 1: Write the failing tests:**
  - `copy_one_question_with_domains_brings_the_domain_row_with_only_that_question`
    - review focus 5: the source domain holds 300 questions, and the target domain has exactly 1 member;
    - groups come with only that member.
  - `copy_with_domains_joins_an_existing_family_copy_at_the_end_in_no_group`
  - `copy_without_domains_lands_in_no_domain_and_the_preview_says_so`
  - `copy_a_whole_domain_is_unchanged`
  - `demo_restore_works_in_a_second_workspace_after_its_demo_moved`
    - also after duplicate: a duplicated workspace's Demo is recognised (no second Demo);
    - audit P4.
  - `a_paused_play_in_another_workspace_resolves_its_assets_after_migration_6`
    - review focus 3; build it with Task 1's fixture.
  - `is_empty_library_sees_rows_in_other_workspaces`
  - `workspace_switch_that_fails_rebuilding_search_leaves_the_old_workspace_bound`
- [ ] **Step 2:** run them. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Copy with domains: for each picked question, each of its domains in the source is resolved in the target:
    - an existing family member → the question joins it (`joined`), at the end, in no group;
    - otherwise the domain row is copied with **only picked questions** as members and its groups filtered to them.
  - Demo: apply the "moved" handling for every workspace's seed ids, not only `ws-1`. A duplicated workspace maps the source's seed ids to its own.
  - `workspace_switch`: rebuild the index for the new workspace before writing `workspace.current`; on error re-bind the old workspace.
- [ ] **Step 4:** `npm run test:host`, `npm run test:app`, and both clippy runs. Expected: PASS.
- [ ] **Step 5: Commit** `beta.2: copy brings a question's domains, the Demo in every workspace, safer switch and welcome`.

### Task 4: App and contract

**Files:**
- `crates/app/src/commands/{transfer,workspace}.rs` (wherever make shared/local live)
- `crates/app/src/{lib,guard}.rs`
- `packages/contract/src/commands.ts` (+ `dist` via its build)
- `codemap.yaml`

**Interfaces:**
- Removed commands: `catalog_make_shared`, `catalog_make_local`.
- `catalog_copy_to` and `transfer_preview` take `withDomains?: boolean` (absent → true).

- [ ] **Step 1: Failing tests.**
  - The guard test lists no removed command.
  - The contract test asserts the command list no longer has them.
  - `crates/app` asserts `catalog_copy_to` accepts `withDomains`.
- [ ] **Step 2:** `npm run test:app` and `npm test -- contract`. Expected: FAIL.
- [ ] **Step 3: Implement** and run `npm run map`, then read its diff: it is the removed surface.
- [ ] **Step 4:** the gates. Expected: PASS.
- [ ] **Step 5: Commit** `beta.2: the app and contract drop make shared / make local`.

### Task 5: Studio drops sharing

**Files:**
- `apps/studio/src/host/{types,listSpecs,fake,queries}.ts`
- `organisms/{useTransfer,DomainPane,useBulkEdit,ManageTagsDialog,QuestionEditor}.tsx`
- `pages/{LibraryPage,TeamsPage}.tsx`
- `copy/{workspaces,groupsTags}.ts`
- `atoms/{Chip,icons}.ts(x)`
- tests `pages/transfer.test.tsx`, `host/workspaces.test.ts`, `host/listSpecs.test.ts`, `pages/groups-tags.test.tsx`

**Interfaces:**
- Consumes: Task 4's command list.
- Produces:
  - `useTransfer` menu items `copy` and `move` only.
  - The copy dialog has a `SwitchField` "Bring their domains" (`TRANSFER.withDomains`), shown when the selection has questions, default on.
  - The preview lists created, reused and joined by name.
  - Removed:
    - `MeaningChip` meaning `shared`, the `shared` icon key;
    - `whereFilter` / `whereGroup`;
    - `GROUPS_TAGS.sharedReach` / `sharedDomainReach` / `renameElsewhere`;
    - `TRANSFER.whereShared` / `makeShared` / `makeLocal`;
    - `shared` on `types.ts` stamps, `BulkReport`, `TagCount`.

- [ ] **Step 1: Failing tests.**
  - `no row action or bulk menu offers Make shared or Make local` (Teams, Library, DomainPane).
  - `the copy dialog brings domains by default and the preview names the domain it joins or creates`.
  - `the list toolbars offer no Where filter or grouping`.
  - `the fake host refuses nothing about sharing and lands every row in the current workspace`.
  - Rewrite the shared cases in the four test files.
- [ ] **Step 2:** `npx vitest run --project studio`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Remove the shared copy, chips and branches.
  - Rebuild the fake host's transfer to mirror Task 3, including `withDomains` and `joined`.
  - Run `npm run studio:icons` if an icon key goes.
- [ ] **Step 4:** the gates. Expected: PASS.
- [ ] **Step 5: Commit** `beta.2: Studio drops sharing; Copy to brings domains`.

### Task 6: Workspace switching is clean

**Files:**
- `apps/studio/src/pages/{ScreensPage,StatisticsPage}.tsx`
- `organisms/{AllDataStats,LiveStats}.tsx`
- `host/queries.ts` (`receiveWorkspaces`)
- `chrome/nav.ts`
- `chrome/notices.ts`
- `App.tsx` (the stats window title)
- `crates/app/src/emit.rs` (if `workspace-changed` carries `previous`)
- tests beside each

**Interfaces:**
- `workspace-changed` payload gains `previous: string | null`. `receiveWorkspaces` resets the scoped queries when `previous !== next.current`, or when there was no cached value.
- `useNavStore.getState().clearHistory()` is called on a switch.
- `useNoticeStore.getState().dropForWorkspace()` dismisses notices whose target path names a row of the left workspace (recipe, team, domain or question paths).

- [ ] **Step 1: Failing tests:**
  - `screens resets its picked game when the workspace changes`;
  - `all-data statistics drops its filters on a switch`;
  - `live statistics remounts on a switch`;
  - `the stats window resets its queries on the first switch` (no previous cache);
  - `back after a switch does not land in the old workspace`;
  - `a board notice of the old workspace is dismissed on a switch`;
  - `the stats window title names the workspace`.
- [ ] **Step 2:** run them. Expected: FAIL.
- [ ] **Step 3: Implement.** Key `ScreensPage`, `AllDataStats` and `LiveStats` on `workspaces.current`. Then make the queries, nav and notices changes above.
- [ ] **Step 4:** the gates. Expected: PASS.
- [ ] **Step 5: Commit** `beta.2: a workspace switch leaves nothing of the old one behind`.

### Task 7: e2e, docs, What's new

**Files:**
- `e2e/specs/workspaces*.e2e.ts`, `e2e/specs/upgrade-shared.e2e.ts` (new)
- `e2e/folders.ts` (SEEDS)
- `crates/host/examples/e2e_library.rs` (a `--beta1-shared` seed: v5 with shared rows via `write_older_schema` + `share_for_test`)
- docs:
  - `docs/v1/03_CONTEXT.md`
  - `docs/as-built/{host,studio,history}.md`
  - `docs/v1/05_STUDIO_DESIGN.md` §20–22
  - `docs/v1/04_ROADMAP.md` (P16 = beta.2 ☑ plus the roadmap from the spec, Part 3)
  - the workspaces and groups-tags-bulk specs (a dated "superseded in part" note at the top)
- `apps/studio/src/copy/whatsNew.ts`: a new `2.0.0-beta.2` entry, EN and RO, operator words:
  - no shared library;
  - what was shared is now a copy in each workspace, linked;
  - *Copy to* brings domains.

- [ ] **Step 1: Write and update the specs:**
  - the workspace specs use copy and move only;
  - `upgrade-shared.e2e.ts`: a beta.1 library with shared rows opens, and both workspaces list their rows and load their games.
- [ ] **Step 2:** `npm run e2e`. Expected: FAIL on the new spec before the seed exists.
- [ ] **Step 3: Implement** the seed, then write the docs and notes. Run `npm run map`.
- [ ] **Step 4:** all gates plus `npm run e2e`. Expected: PASS, every spec.
- [ ] **Step 5: Commit** `beta.2: e2e, docs and What's new for the shared library's removal`.

### Task 8: Reviews and fixes

- [ ] Dispatch the Opus 5.5 (host + migration) and Sonnet 5.5 (Studio) reviews in parallel, background, on `f6cf58c..HEAD`. Give them the spec, this plan and the Review Focus.
- [ ] Fix every finding, minor ones included (the maintainer's preference). Each fix gets a test that fails first. Then the full gates plus `npm run e2e`.
- [ ] Commit `beta.2: review fixes`. Ask the maintainer before pushing. The version bump (`npm run version:beta`) and tag are theirs to call.
