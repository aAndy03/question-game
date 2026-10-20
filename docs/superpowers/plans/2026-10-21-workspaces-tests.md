# Workspaces — test list (Sonnet 5.5) and rulings

Plan: `2026-10-21-workspaces.md` · Spec: `../specs/2026-10-21-workspaces-design.md`.

Sonnet 5.5 (medium) proposed the list below; the build implements it, folding ids into the plan's tasks (§1–2 → Task 1–2, §3–5 → Task 3, §6–8 → Task 4, §9 → Task 5, §10 → Task 2, §11–12 → Tasks 6–8, §13 → Task 9, §14 throughout). Files may be merged where one file reads better (`tests/workspaces.rs` holds §2–5); ids stay as the reference.

## Rulings on the flags (the builder's calls)

- **F1** — every library has at least one workspace: a fresh or migrated library gets one **unnamed** `ws-1`. Studio asks for its name (*Create your first workspace* on an empty library, *Name your workspace* on a migrated one), so the operator still types every name and nothing is suggested. M19/M20 pin "one unnamed workspace".
- **F2** — order is welcome → name. `beta_welcome_done` is written first; a workspace row never counts as content, so `is_empty_library` ignores it.
- **F3** — the **current** workspace cannot be archived (switch first), and neither can the last active one; only archived workspaces can be deleted. So there is always an active current workspace.
- **F4** — a recipe loaded in Control (any Play status) blocks a switch, and blocks move, archive and delete of that game. At boot, an open Play makes its game's workspace current.
- **F5** — archived games and archived workspaces count as users (they would break on restore).
- **F6** — *Duplicate workspace* copies everything, archived rows as archived. *Copy to…* copies the rows picked and the local rows they need, each as it is.
- **F7** — copy into the same workspace is refused (there is *Duplicate*); copying a shared row gives a local copy in the row's family; assets take part in family reuse; a shared row is never "the target's copy".
- **F8** — groups follow the workspace name rules (typed, trimmed, ≤ 60, unique case-insensitively among groups).
- **F9** — Statistics *All workspaces* includes archived workspaces' Plays.
- **F10** — *Make local* on a domain leaves its shared questions shared (a local domain may hold them). A shared question used by a shared domain cannot become local (`ScopeRule`, naming the domain). An asset follows its row's explicit action only.
- **F11** — the body is every editable field except id, membership, archive state, workspace and family: team (name, short code, colour, logo, notes), domain (name, short code, colour, description), question (text, difficulty, options, explanation, media). A propagated question's options replace the copy's, with ids re-derived from the copy's id so option ids stay unique.
- **F12** — `main` is Beta; every identity built from `main` runs workspaces. `release/1.x` stays 1.x until 2.0.
- **F13** — `where` is a host parameter (`Where::{Both, Workspace, Shared}`), default `Both`.
- **F14** — per-workspace defaults live in `workspaces.settings` as a patch over `globals`; migration leaves `globals` as it is and new workspaces start with no patch.
- **F15** — Plays reach a workspace through their game; no column on `plays`/`events`.
- **F16** — accepted as written: the index rebuilds on open and on switch.
- **F17** — no test hook; M07 checks the backup's `user_version` is 3.
- **F18** — `family_id` on assets too.
- **F19** — list prefs are Studio chrome, keyed per workspace (`lists` → `<workspace id>` → tab).
- **F20** — names compare after Unicode lower-casing in Rust (`str::to_lowercase`), not `COLLATE NOCASE`.

---

## The list

No files were edited. I read the design doc and these code areas:
- `db.rs`, `backup.rs`, the `service.rs` signatures
- `store.rs`, `seed.rs`, `search.rs` and `snapshot.rs`, by signature only
- the `beta.rs` signatures and its `is_empty_library`
- the Studio `App.tsx` gate, `queries.ts`, `BetaWelcomePage.tsx` and `FirstRunPage.tsx`
- the `folders.ts` SEEDS table and the existing `upgrade.rs` test names

I did not read `model.rs`, `play.rs`, `state.rs` internals, `listSpecs.ts`, `useListView.ts`, `chrome.ts` or `SidebarNav.tsx` in full. Assertions touching them (per-workspace prefs, the rail, `Host` state) assume the names in the design doc.

**Count: 176 tests. 30 are [MUST].** Kind: **U** is a unit test, **I** an integration test, **P** a property test (proptest), **E** an e2e test.

## Conventions

**Files**
- Host tests live in `crates/host/tests/ws_*.rs`, sharing `crates/host/tests/common/ws.rs` (fixture builders).
- App tests live in `crates/app/src/commands/workspace.rs` and `beta.rs` (inline `#[cfg(test)]`).
- Studio tests sit beside their component (`*.test.tsx`).
- e2e specs live in `e2e/specs/ws-*.e2e.ts`, each registered in the `SEEDS` and `CHANNELS` tables of `e2e/support/folders.ts`.

**Fixtures** (named in the setup columns below)
- **Fx102** is a file built by applying `MIGRATIONS[..3]`, then `PRAGMA user_version=3`, with the `META_LAST_OPENED="1.0.2"` stamp. It is populated with raw SQL, covering:
  - 6 teams (one with a logo asset);
  - 3 domains, 12 questions and 4 option sets;
  - one question that sits in 2 domains;
  - 2 recipes with `recipe_teams`, `recipe_domains`, `recipe_questions` and `recipe_overlays`;
  - 2 closed Plays and 1 open Play, with events;
  - 1 archived row of each kind and 2 operators.
- **Fx11** is the same schema plus the 1.1 data shapes: `globals` holding list prefs, `--more-questions 120`, and incomplete questions.
- **Fx1** is a file at `user_version=1`, and **Fx2** is a file at `user_version=2`, for the migration chain.
- **dump(file)** is a canonical dump of every table's rows, ordered and byte-compared, used for "file unchanged" checks.
- **WS(n)** is a service with `n` named workspaces, each seeded through the public API.

## 1. Migration 4

| ID | File | Name | Setup and exact assertion | Kind |
|---|---|---|---|---|
| M01 [MUST] | ws_migration.rs | fx102_every_row_survives | Fx102 → `open_file`. For each of the 12 pre-existing tables, `dump(before)` equals `dump(after)` on the old columns (column-by-column, bytes equal). | I |
| M02 [MUST] | ws_migration.rs | fx11_every_row_survives | Same as M01 with Fx11, including `settings_json` and `layout_json` strings byte-identical. | I |
| M03 [MUST] | ws_migration.rs | all_rows_land_in_one_unnamed_workspace | After M01: `SELECT count(*) FROM workspaces`=1; its name is NULL (or the empty sentinel); `workspace_id` equals that id on every team, domain, question, asset and recipe; 0 rows have a NULL `workspace_id`. | I |
| M04 [MUST] | ws_migration.rs | nothing_is_shared_after_migration | After M01: `SELECT count(*) FROM teams/domains/questions/assets WHERE workspace_id IS NULL` is 0 for each. | I |
| M05 | ws_migration.rs | references_intact | After M01: `PRAGMA foreign_key_check` is empty. Every `recipe_*`/`domain_questions` row has the same `(recipe_id, team_id, …)` tuples as before. | I |
| M06 | ws_migration.rs | plays_and_events_untouched | After M01: `events` is byte-identical and the `plays` projection is identical. A Play's `scores_json` is unchanged. | I |
| M07 [MUST] | ws_migration.rs | backup_exists_before_step_runs | Fx102 → open with a pre-open hook (or inspect the file's mtime ordering). `report.backup` is Some, and `user_version` of the backup file is 3. The backup exists and `user_version` of the live file was still 3 when the backup was written (use `MIGRATIONS.len()-1` as `behind`, as the existing db.rs test does). | I |
| M08 [MUST] | ws_migration.rs | pinned_pre_workspaces_backup_named | After M01: `backup_dir` holds exactly one `questiongame-pre-workspaces-<stamp>.sqlite3`. It opens, has `user_version=3` and its dump equals the pre-migration dump. | I |
| M09 [MUST] | ws_migration.rs | pinned_backup_never_pruned | Create the pinned file, then drive 12 successive `open_guarded` calls with distinct versions and stamps (`keep=5`). The pre-workspaces file is still on disk and the rotation still holds 5 other copies. This fails today if `stamp_of` parses the pinned name, so it forces an exemption in `prune`. | I |
| M10 | ws_migration.rs | pinned_backup_not_counted_in_keep | The pinned file plus 5 rotation copies gives 6 files. A 6th rotation copy prunes the oldest rotation file, never the pinned one, and the rotation count stays 5. | I |
| M11 | ws_migration.rs | pinned_backup_not_overwritten | The pinned name for the same stamp already exists, so `open_guarded` returns `BackupFailed`, the library `dump` is unchanged and `user_version` is still 3. | I |
| M12 [MUST] | ws_migration.rs | interrupted_migration_rolls_back | Inject failure: a trigger or a `MIGRATIONS` test-only step 5 that errors after migration 4's `ALTER`s. After `Err`: `user_version`=3, `dump` equals the original, and there is no `workspaces` table (`sqlite_master`). A re-open with the good build succeeds. | I |
| M13 | ws_migration.rs | failed_migration_file_usable_by_old_build | After M12, open the file with `MIGRATIONS[..3]` applied manually. All queries of the 1.0.2 schema work. | I |
| M14 [MUST] | ws_migration.rs | newer_schema_refused | Set `user_version=5` (known=4). `open_file` returns `SchemaTooNew{found:5,known:4}`. No backup is taken beyond the stamped rotation. `dump` is unchanged. | I |
| M15 [MUST] | ws_migration.rs | reopen_is_idempotent | Open Fx102 twice with the same version. The second open writes no backup, makes no new `workspaces` row, and the dump equals the first open's dump. | I |
| M16 | ws_migration.rs | chain_from_v1 | Fx1 → open. It ends at 4 with all rows in one workspace (migrations 2, 3 and 4 compose). | I |
| M17 | ws_migration.rs | chain_from_v2 | Fx2 → open. `plays.operator_id` is rebuilt at boot and the workspace is created. | I |
| M18 | ws_migration.rs | unstamped_1_0_1_library | An Fx102 library with no `META_LAST_OPENED`. The rotation backup is labelled `1.0.1` and the pinned backup is also taken. Both exist. | I |
| M19 | ws_migration.rs | no_pinned_backup_for_fresh_file | A new file (not `existed`). The pinned backup is not written. `workspaces` is empty (brand-new install has no workspace). | I |
| M20 | ws_migration.rs | empty_v3_library_migrates_without_workspace_content | Fx102 with zero rows. Still one unnamed workspace is created, or none is. Pin the chosen behaviour (see flag F1). | I |
| M21 | ws_migration.rs | id_generator_never_reuses | Migrate, create and delete 3 workspaces, create a 4th: ids are all distinct (monotonic or uuid). | I |
| M22 | ws_migration.rs | search_index_rebuilt_with_scope | After migrating Fx102, `catalog_search("…")` finds a question in the unnamed workspace once it is current. Hits carry scope `ws:<id>`. | I |
| M23 | ws_migration.rs | current_workspace_defaults_to_the_migrated | After M01: `current_workspace_id()` is Some(migrated id). | I |
| M24 | ws_migration.rs | open_play_resumes_after_migration | Fx102 with an open Play. `resume_open_play` returns it, and the current workspace becomes that game's workspace. | I |
| M25 | ws_migration.rs | copied_from_columns_null | After M01: `copied_from`/`family_id` are NULL on every row. | I |
| M26 | ws_migration.rs | demo_ids_retained | Fx102 holding `seed-…`/`seed-ro-…`. After M01 the ids are unchanged and `seed_status` for the migrated workspace reports Loaded. | I |
| M27 | ws_migration.rs | migrate_copy_of_stable_library | Run `compact_copy` of Fx102 into Beta, then `open_file`. Same result as M01, and `is_empty_library` is false. | I |
| M28 | ws_migration.rs | migration_sql_is_one_transaction | Parse the `MIGRATIONS` step: it contains no `COMMIT`/`BEGIN`. `migrate` wraps it (static check). | U |

## 2. Scoping (property tests)

Generators: 1 to 4 workspaces, rows of each kind assigned to a workspace or shared, random archive flags, recipes using own and shared rows. Properties are checked per "view workspace" W.

| ID | File | Name | Setup and exact assertion | Kind |
|---|---|---|---|---|
| S01 [MUST] | ws_scoping.rs | list_never_returns_other_local | For every kind in {team, domain, question, asset} and every `ArchiveScope`: `catalog_list` in W has ids ⊆ local(W) ∪ shared. | P |
| S02 [MUST] | ws_scoping.rs | list_complete | Same generator. Result ids equal exactly local(W) ∪ shared, filtered by scope. Nothing is missing. | P |
| S03 [MUST] | ws_scoping.rs | get_refuses_foreign_local | `catalog_get(kind,id)` for id local to B while W is current returns NotFound (not a leaked row). Shared and own ids succeed. | P |
| S04 [MUST] | ws_scoping.rs | search_never_leaks | For random query terms drawn from B-local texts, no hit id is in local(B) while W is current. Shared hits still appear. | P |
| S05 | ws_scoping.rs | search_scope_field_stays_exact | After moves and make-shared in a random sequence, the index equals a rebuild (`rebuild_search_index`) hit-for-hit. | P |
| S06 [MUST] | ws_scoping.rs | recipe_list_scoped | `recipe_list` in W is exactly the games of W, in each scope. | P |
| S07 | ws_scoping.rs | recipe_get_foreign_refused | Reading a game of B from W is NotFound. | I |
| S08 [MUST] | ws_scoping.rs | snapshot_only_visible_rows | `build_snapshot` of a game of W has every team, domain and question in local(W) ∪ shared. | P |
| S09 | ws_scoping.rs | preview_board_scoped | `preview_board` of a game: same property as S08. | P |
| S10 | ws_scoping.rs | board_picker_candidates_scoped | The Games-tab board picker host call (domains and questions offered) returns only visible rows. Add the call to the host interface if it is not scoped by list calls. | I |
| S11 | ws_scoping.rs | roster_picker_scoped | The team picker offers only local(W) ∪ shared teams. | I |
| S12 [MUST] | ws_scoping.rs | stats_current_workspace_only | `stats_query` in W aggregates only Plays whose game belongs to W. A fixed fixture with 2 Plays per workspace gives a count of 2 for each. | P |
| S13 | ws_scoping.rs | stats_all_workspaces_choice | The `all` filter includes archived workspaces' Plays (pin the decision, see flag F9). Count equals the sum. | I |
| S14 | ws_scoping.rs | play_list_scoped | `play_list(None)` returns W's Plays only. `play_list(Some(foreign game))` is empty or refused. | I |
| S15 [MUST] | ws_scoping.rs | archived_workspace_invisible | Archive workspace B: nothing local to B appears in list, get, search, recipe_list, stats or pickers of any other workspace. Shared rows are still visible. | P |
| S16 | ws_scoping.rs | archived_workspace_rows_untouched | After archive and restore, `dump` of its rows is byte-identical. | I |
| S17 | ws_scoping.rs | shared_visible_everywhere | One shared question, N workspaces: it is listed, got and searched in each. | P |
| S18 [MUST] | ws_scoping.rs | referenced_by_sees_every_workspace | A shared question used by a game in B: `referenced_by` from W and the `catalog_archive` of that shared question both report B's game. Archive is refused (or follows the existing rule). | I |
| S19 | ws_scoping.rs | operators_global | Operators are listed identically in every workspace. | I |
| S20 | ws_scoping.rs | wrong_workspace_write_refused | `catalog_upsert` of an item whose `workspace_id` is not W and not shared returns a typed refusal (`workspace.foreign_row`). Dump unchanged. | I |
| S21 | ws_scoping.rs | archived_counts_in_reference_checks | A game in an archived workspace using a shared domain: the shared domain's membership edits and archive are still guarded. | I |
| S22 | ws_scoping.rs | seed_status_scoped | `seed_status` ignores another workspace's Demo rows. | I |
| S23 | ws_scoping.rs | copied_by_ids_not_shared_between_workspaces | Two workspaces each hold a question with the same stem. `catalog_search` returns only the one in W. | I |

## 3. Reference rules, at every write path

Paths: `catalog_upsert` (domain membership), `catalog_upsert_many`, `recipe_set_membership`, `recipe_upsert`, `recipe_set_overlay`, make shared/local, move, copy, duplicate, delete, restore.

| ID | File | Name | Setup and exact assertion | Kind |
|---|---|---|---|---|
| R01 [MUST] | ws_refs.rs | shared_domain_refuses_local_question | Upsert a shared domain with a member question local to W. Error `ref.shared_domain_local_question`. Dump unchanged. | I |
| R02 | ws_refs.rs | shared_domain_accepts_shared_question | The same with a shared question succeeds. | I |
| R03 | ws_refs.rs | local_domain_accepts_own_and_shared | A domain in W holding W-local and shared questions succeeds. | I |
| R04 [MUST] | ws_refs.rs | local_domain_refuses_other_workspace_question | A domain in W holding a question local to B is refused. | I |
| R05 | ws_refs.rs | upsert_many_refusal_atomic | `catalog_upsert_many` with 3 good rows and 1 violating row: dump unchanged (all-or-nothing). | I |
| R06 [MUST] | ws_refs.rs | game_roster_foreign_team_refused | `recipe_set_membership` with a team local to B in a game of W: refused. Own and shared teams are accepted. | I |
| R07 [MUST] | ws_refs.rs | game_board_foreign_domain_or_question_refused | A board holding a domain or question local to B is refused. A shared domain with its shared questions is accepted. | I |
| R08 | ws_refs.rs | game_board_question_not_in_domain_still_refused | A pre-existing 1.x rule still holds in a scoped world. | I |
| R09 [MUST] | ws_refs.rs | overlay_cannot_point_across_workspaces | `recipe_set_overlay` for a team/domain/question not visible to the game's workspace is refused. | I |
| R10 | ws_refs.rs | overlay_to_shared_target_ok | An overlay on a shared question succeeds, and `ThisGame` scope leaves the shared original unchanged. | I |
| R11 | ws_refs.rs | overlay_original_scope_on_shared_row | The `Original` scope edits the shared row. The overlay is dropped for this game only. Other workspaces' games with overlays keep theirs. | I |
| R12 [MUST] | ws_refs.rs | asset_follows_row_shared | Make a team shared whose logo is local: the logo asset is now shared (`workspace_id` NULL). Making a question shared moves its `media_asset_id` the same way. | I |
| R13 | ws_refs.rs | shared_row_with_local_asset_refused_on_upsert | A shared team upsert pointing at a local asset: `ref.shared_row_local_asset`. | I |
| R14 | ws_refs.rs | local_row_with_shared_asset_ok | Allowed. | I |
| R15 | ws_refs.rs | local_row_with_foreign_asset_refused | A team of W pointing at an asset local to B is refused. | I |
| R16 [MUST] | ws_refs.rs | restore_checks_references | Restore an archived question into a shared domain, or an archived domain whose question has since been made local to B: refused with the row named. | I |
| R17 | ws_refs.rs | archive_row_used_by_other_workspace_game | Archiving a shared team used by a game in B follows the existing `referenced_by` refusal and names B's game. | I |
| R18 | ws_refs.rs | recipe_upsert_workspace_immutable | Changing `recipe.workspace_id` through `recipe_upsert` is ignored or refused (only move changes it). | I |
| R19 | ws_refs.rs | recipe_duplicate_stays_in_workspace | `recipe_duplicate` in W produces a W game. It links copies to local rows only. | I |
| R20 | ws_refs.rs | import_writes_into_current_workspace | The `import` path (`import.rs`) puts new rows in W and refuses a target domain not visible in W. | I |
| R21 | ws_refs.rs | seed_demo_writes_into_target_workspace | The Demo's rows all carry the target `workspace_id`, and its recipe uses only them. | I |
| R22 | ws_refs.rs | invariant_property_after_random_ops | A random sequence of {upsert, share, local, move, copy, archive, restore, delete}. After each op the global invariant holds: no game, board, domain membership or asset refers to a row invisible to its owner. | P |

## 4. Workspace and group CRUD

| ID | File | Name | Setup and exact assertion | Kind |
|---|---|---|---|---|
| C01 [MUST] | ws_crud.rs | name_required | Create with "", "   ": `workspace.name_required`. No row. | U |
| C02 | ws_crud.rs | name_trimmed | " Season 1 " is stored as "Season 1". | U |
| C03 [MUST] | ws_crud.rs | name_max_60 | 60 chars accepted, 61 refused. Test with a multibyte string (60 `é` accepted) to fix chars vs bytes. | U |
| C04 [MUST] | ws_crud.rs | name_unique_case_insensitive | "Show" then "sHOW": `workspace.name_taken`. Non-ASCII case ("Édition" vs "édition") too. | U |
| C05 | ws_crud.rs | name_unique_among_active_only | An archived "Show" exists: creating "Show" succeeds. | I |
| C06 [MUST] | ws_crud.rs | restore_name_collision_refused | Archive "Show", create a new "Show", restore the old: refused naming the clash. Dump unchanged. | I |
| C07 | ws_crud.rs | rename_unique_and_self_allowed | Rename to the same name with different case succeeds. Rename to another's name is refused. | U |
| C08 [MUST] | ws_crud.rs | create_starts_empty | A new workspace holds 0 local rows and 0 games. It has no suggested name. Only the typed name is stored. | I |
| C09 | ws_crud.rs | create_with_group | Create with an existing group id succeeds. A missing group id is refused. | I |
| C10 | ws_crud.rs | create_does_not_switch | `current_workspace_id` is unchanged after create. | I |
| C11 [MUST] | ws_crud.rs | duplicate_copies_local_rows_and_games_no_plays | WS with 3 teams, 2 domains, 5 questions, 2 games, 2 Plays, 1 shared question used by a game. Duplicate as "Next": counts equal for local rows and games, Plays 0, `events` unchanged, the shared question is not copied and the duplicated game still points at the same shared id. | I |
| C12 [MUST] | ws_crud.rs | duplicate_new_ids_and_linked | Every duplicated row has a new id, the same `family_id` as its source (family set on both), and `copied_from`=source id. | I |
| C13 | ws_crud.rs | duplicate_game_internal_refs_remapped | A duplicated game's roster, board and overlays point at the duplicated rows, not the originals. Overlay `target_id`s are remapped. | I |
| C14 | ws_crud.rs | duplicate_includes_archived_rows | Pin the decision (see flag F6). Archived local rows are copied as archived, or skipped. | I |
| C15 | ws_crud.rs | duplicate_resets_play_counters | The duplicated team's `play_count` and `last_play_at` are 0/NULL. | I |
| C16 | ws_crud.rs | duplicate_one_transaction | Fail inside it (inject a unique name clash at the last row). Dump unchanged, no half workspace. | I |
| C17 | ws_crud.rs | duplicate_name_rules | The duplicate's name goes through the same checks as C01 to C04. | U |
| C18 | ws_crud.rs | duplicate_shared_not_copied | Count of `workspace_id IS NULL` rows is unchanged. | I |
| C19 | ws_crud.rs | duplicate_open_play_game_ok | A game with an open Play is duplicated (no Play, no state copied). | I |
| C20 [MUST] | ws_crud.rs | archive_hides_and_keeps_rows | Archive: `workspace_list(active)` excludes it, `archived` includes it, local rows still in the file, Plays untouched. | I |
| C21 | ws_crud.rs | archive_current_with_game_loaded_refused | Refused `workspace.game_loaded`. Dump unchanged. | I |
| C22 | ws_crud.rs | archive_current_without_game_moves_current | Pin the behaviour (flag F3): current switches to another active workspace, with a `workspace-changed` event. | I |
| C23 | ws_crud.rs | archive_only_active_workspace | Pin: refused, or allowed with none current (flag F3). | I |
| C24 | ws_crud.rs | restore_returns_rows | After restore the rows are visible again and unchanged. | I |
| C25 [MUST] | ws_crud.rs | delete_only_archived | Delete of an active workspace: `workspace.not_archived`. Dump unchanged. | I |
| C26 [MUST] | ws_crud.rs | delete_backup_first | Delete: a rotation backup exists with the workspace's rows still inside it. A failing backup dir (read-only) gives `BackupFailed` and the dump is unchanged. | I |
| C27 [MUST] | ws_crud.rs | delete_removes_local_rows_games_plays_events | After delete: no `workspace_id=B` row in teams, domains, questions, assets, recipes, `recipe_*`, `domain_questions`, `question_options`; `plays` and `events` for B's games are gone; the `workspaces` row is gone. | I |
| C28 [MUST] | ws_crud.rs | delete_leaves_shared_and_others_untouched | `dump` of shared rows and of workspace A is byte-identical before and after. | I |
| C29 [MUST] | ws_crud.rs | delete_one_transaction | Inject failure after the events removal (a trigger raising on `workspaces` delete). Dump unchanged afterwards, so the events survive. | I |
| C30 [MUST] | ws_crud.rs | delete_last_workspace_refused | Only one workspace left, even if archived: `workspace.last`. The meaning of "last" is flagged (F3). | I |
| C31 | ws_crud.rs | delete_preview_counts | `workspace_delete_preview` returns exact `{teams, domains, questions, games, plays}` for the named workspace, excluding shared rows. | I |
| C32 | ws_crud.rs | delete_keeps_asset_files | Asset rows are deleted, no file removal call is made (the file path stays on disk in a temp fixture). | I |
| C33 | ws_crud.rs | delete_clears_dangling_copy_links | Rows in A copied from rows in B: after deleting B, A's `copied_from` is NULL or kept as an opaque id. `family_id` queries still work and propagation lists no ghost copies. | I |
| C34 | ws_crud.rs | delete_with_open_play_refused_or_removed | An archived workspace holding an unfinished Play: delete proceeds, the Play is removed and `resume_open_play` returns None. | I |
| C35 | ws_crud.rs | ids_never_reused_after_delete | Delete workspace id X, create another: a new id ≠ X. Same for groups. | I |
| C36 [MUST] | ws_crud.rs | group_name_required_unique | "" refused, a duplicate name refused (case-insensitive: pin, flag F8), ≤60 if the same rule applies. | U |
| C37 | ws_crud.rs | group_rename_reorder | Reorder changes `position`. The list order follows. Ungrouped is always last and cannot be reordered. | I |
| C38 | ws_crud.rs | workspace_move_to_group_and_reorder | Move to a group and reorder inside it: positions contiguous. | I |
| C39 [MUST] | ws_crud.rs | group_delete_moves_workspaces_to_ungrouped | Delete a group: its workspaces survive, `group_id` is NULL, and no workspace row or library row is lost. | I |
| C40 | ws_crud.rs | group_delete_atomic | A failure injected midway leaves the group and the workspaces' membership intact. | I |
| C41 | ws_crud.rs | workspace_in_one_group_only | A schema/API check: the `group_id` column is single-valued. Setting a second group replaces it. | U |
| C42 | ws_crud.rs | rename_workspace_keeps_family_links | Renaming leaves `family_id` of all rows unchanged. | I |
| C43 | ws_crud.rs | workspace_never_shared_game | `recipe_upsert` with `workspace_id` NULL is refused. | I |

## 5. Switching

| ID | File | Name | Setup and exact assertion | Kind |
|---|---|---|---|---|
| W01 [MUST] | commands/workspace.rs | switch_refused_with_game_loaded | Load a game (`play_load`). `workspace_switch` returns `workspace.game_loaded`. `current_workspace_id` is unchanged. No event is emitted. | I |
| W02 [MUST] | commands/workspace.rs | switch_allowed_when_nothing_loaded | After `play_unload`, switch succeeds. | I |
| W03 | commands/workspace.rs | switch_refused_with_open_play_resumed | The boot-resumed open Play counts as loaded (flag F4). | I |
| W04 [MUST] | commands/workspace.rs | current_workspace_id_is_host_truth | The command returns the new id. A second `workspace_current` call, `Host` state and the persisted global all agree. | I |
| W05 | commands/workspace.rs | current_survives_restart | Switch, re-open the file: the same id is current. | I |
| W06 | commands/workspace.rs | current_falls_back_when_missing | Persisted id refers to a deleted or archived workspace: boot picks the first active, with no panic. | I |
| W07 [MUST] | commands/workspace.rs | exactly_one_workspace_changed_event | One switch emits exactly one `workspace-changed` to `main` (and `stats`), none to `stage`. The payload has the id. The count of emitted events is 1 after two quick switches to the same workspace (no-op emits 0). | I |
| W08 | commands/workspace.rs | switch_to_same_is_noop | Same id: Ok, no event. | U |
| W09 | commands/workspace.rs | switch_to_archived_or_unknown_refused | `workspace.not_found` or `workspace.archived`. | U |
| W10 | commands/workspace.rs | stage_unaffected | During a switch the Stage emission counter is unchanged and no `play-state` is sent. | I |
| W11 [MUST] | queries.test.ts | caches_dropped_on_switch | Seed the Query cache with a catalog list, search, recipes, seedStatus and stats. A `workspace-changed` event leaves no library query in the cache, while `settings`, `monitors`, `appInfo` and `paths` stay. | U |
| W12 | queries.test.ts | keys_carry_workspace_id | If keys are prefixed (builder's choice), a key built under workspace A never equals one for B. If clear-on-switch is chosen, assert the cache is emptied. | U |
| W13 | queries.test.ts | in_flight_response_from_old_workspace_discarded | A list request started under A resolves after the switch to B: it does not populate B's key. | U |
| W14 | useListView.test.ts | prefs_per_workspace_per_operator | Set sort and page size in A for operator X. Switch to B: defaults. Back to A: restored. Operator Y in A: defaults. | U |
| W15 | useListView.test.ts | prefs_survive_reload | The per-workspace prefs persist and are keyed `(operator, workspace)`. | U |
| W16 | useListView.test.ts | stale_prefs_for_deleted_workspace_ignored | Prefs keyed to a deleted workspace do not crash and are not applied to a new one. | U |
| W17 [MUST] | App.test.tsx | switch_returns_to_same_tab_page_1 | On Questions page 3, switch: still the Domains & Questions tab, page index 0. | U |
| W18 | App.test.tsx | switch_closes_editors_and_selection | Selection and an open editor are cleared on switch (no row from the old workspace is selected). | U |
| W19 | commands/workspace.rs | guard_stage_cannot_call_workspace_commands | `guard.rs` refuses the `stage` label for every `workspace_*` command. | I |
| W20 | commands/workspace.rs | workspace_commands_registered_in_codemap | `npm run map:check` passes with the new commands. | U |

## 6. Copy

| ID | File | Name | Setup and exact assertion | Kind |
|---|---|---|---|---|
| CP01 [MUST] | ws_copy.rs | copy_question_new_row_in_target | Copy Q from A to B. Q' has a new id, `workspace_id`=B and the same body; Q is unchanged; `family_id` is shared and set on both. | I |
| CP02 [MUST] | ws_copy.rs | copy_domain_brings_local_questions | Domain D (3 local questions, 1 shared) → B. B has D' with 3 new questions and the shared one by the same id; membership order kept. | I |
| CP03 [MUST] | ws_copy.rs | copy_game_brings_roster_domains_questions | Game G (2 teams, 2 domains, 4 questions, 1 shared team) → B. G' works: `build_snapshot` on G' succeeds, with only B-visible rows. The overlays are carried and remapped. | I |
| CP04 | ws_copy.rs | copy_game_has_no_plays | G' has no Plays and no events. | I |
| CP05 [MUST] | ws_copy.rs | reuse_active_family_copy | Copy domain D1 (with Q) to B, then D2 (also with Q): B holds one Q', and both domains reference it. The question count is 1. | I |
| CP06 [MUST] | ws_copy.rs | same_game_twice_no_multiplication | Copy G to B twice: the second creates G'' (new game) but reuses the teams, domains and questions from the first copy. Team count in B is unchanged. | I |
| CP07 | ws_copy.rs | reuse_requires_same_family | An unrelated B question with identical text is not reused. | I |
| CP08 [MUST] | ws_copy.rs | archived_copy_not_reused | Copy Q to B, archive Q', copy again: a third row Q'' is made. Q' stays archived. | I |
| CP09 | ws_copy.rs | reuse_family_member_in_other_workspace_not_target | Family member exists in C (not B): B gets a new copy. | I |
| CP10 | ws_copy.rs | copied_row_family_inherited | Copy a copy: it is in the same family (A→B→C): one `family_id` for 3 rows. | I |
| CP11 | ws_copy.rs | copy_to_same_workspace | Pin the behaviour: refused `copy.same_workspace`, or a duplicate allowed (flag F7). | I |
| CP12 | ws_copy.rs | copy_to_archived_workspace_refused | Refused. | I |
| CP13 | ws_copy.rs | copy_shared_row_to_workspace | Pin: a shared row copied to B becomes a local copy in the family, or is refused (flag F7). | I |
| CP14 [MUST] | ws_copy.rs | copy_one_transaction_refusal_unchanged | Inject a violation on the 3rd of 5 closure rows. `dump` equals the pre-state, and no ids were left in the search index (`rebuild` equals live). | I |
| CP15 | ws_copy.rs | copy_team_asset_row_points_same_file | The asset is a new row, `path` byte-equal, and no file is created or copied on disk. | I |
| CP16 | ws_copy.rs | copy_reuses_asset_copy | Two teams share one logo: a single new asset row in B (family reuse applies to assets or pin otherwise, flag F7). | I |
| CP17 | ws_copy.rs | copy_question_options_ids_preserved | Option ids and correct flags are identical in the copy. | I |
| CP18 | ws_copy.rs | copy_domain_membership_not_copied_for_question | Copy a lone question: it is in no domain in B. | I |
| CP19 | ws_copy.rs | copy_archived_row_state | Copying an archived row yields an active copy, or is refused (pin, flag F6). | I |
| CP20 | ws_copy.rs | copy_bulk_selection | A mixed selection of 3 questions + 1 domain containing 2 of them: no duplicates in B (reuse inside one call). | I |
| CP21 | ws_copy.rs | copy_search_index_updated | After copy, search in B finds the copy and search in A is unchanged. | I |
| CP22 | ws_copy.rs | copy_play_count_reset | A team copy's `play_count`=0. | I |
| CP23 | ws_copy.rs | copy_refuses_incomplete_board_break | Copying a game whose board has an incomplete question (§2.32) reproduces the same data without validation errors on a state that was valid. | I |
| CP24 | ws_copy.rs | copy_property_closure_visible | Random graph, random copy: every row reachable from the copy is local(B) ∪ shared (R22 style). | P |

## 7. Move

| ID | File | Name | Setup and exact assertion | Kind |
|---|---|---|---|---|
| MV01 [MUST] | ws_move.rs | move_question_changes_workspace_only | Move Q (used nowhere) A→B: same id, same body, `workspace_id`=B, `updated_at` unchanged or bumped (pin), and search follows. | I |
| MV02 [MUST] | ws_move.rs | move_domain_with_local_questions | D and its 3 local questions move, and the shared question stays shared. | I |
| MV03 [MUST] | ws_move.rs | move_game_with_closure_overlays_plays | G moves with its local roster, domains, questions, overlays and all Plays and events. `play_list` in B lists them, in A none. Snapshot in B works. | I |
| MV04 [MUST] | ws_move.rs | move_refused_when_stayer_uses_row | Q is in domain D2 (stays in A) and the user moves D1 (also holding Q): refused `move.in_use` naming D2 ("domain D2"). Dump unchanged. | I |
| MV05 [MUST] | ws_move.rs | move_refused_names_each_user | Two stayers use the rows: the error payload lists both, each as `{kind, id, name}`. | I |
| MV06 | ws_move.rs | move_refusal_offers_copy_instead | The payload has a `copy_instead` hint, and executing the copy then succeeds. | I |
| MV07 | ws_move.rs | move_refused_team_used_by_other_game | Team T is on games G1 (moving) and G2 (staying): refused, naming G2. | I |
| MV08 | ws_move.rs | stayer_includes_archived | An archived game or domain in A still using the row blocks the move (flag F5). | I |
| MV09 | ws_move.rs | move_game_with_both_selected_stays_consistent | Moving G1 and G2 together, both using team T: allowed, since neither stays. | I |
| MV10 [MUST] | ws_move.rs | move_one_transaction_refusal_unchanged | Inject a failure on the last statement: dump unchanged. | I |
| MV11 | ws_move.rs | move_shared_row_noop_or_refused | Moving a shared row is refused `move.shared` (shared rows are never moved). | I |
| MV12 | ws_move.rs | move_game_with_game_loaded_refused | The game is loaded in Control: refused (pin, flag F4). | I |
| MV13 | ws_move.rs | move_with_open_play | A game with an open Play moves: pin (probably refused). | I |
| MV14 | ws_move.rs | move_keeps_family | `family_id` and `copied_from` are unchanged by a move. | I |
| MV15 | ws_move.rs | move_asset_moves_with_row | The team logo asset has `workspace_id`=B. A second row in A using the same asset row blocks the move (asset is a user too). | I |
| MV16 | ws_move.rs | move_to_archived_or_same_refused | Refused. | I |
| MV17 | ws_move.rs | move_property_no_dangling | Random graph, random move: R22's invariant holds if allowed, and dump unchanged if refused. | P |
| MV18 | ws_move.rs | move_stats_follow_game | `stats_query` in B includes the moved Plays, and A's no longer. | I |
| MV19 | ws_move.rs | move_bulk_partial_refusal_all_or_nothing | 3 selected, the 2nd blocked: nothing moves. | I |

## 8. Make shared / make local

| ID | File | Name | Setup and exact assertion | Kind |
|---|---|---|---|---|
| SH01 [MUST] | ws_share.rs | make_shared_question | `workspace_id` becomes NULL. It appears in other workspaces' lists, and its media asset becomes shared. | I |
| SH02 [MUST] | ws_share.rs | make_shared_domain_shares_its_questions | Domain D (3 local) → shared: D and its 3 questions and their assets are NULL. The preview lists them for the "asked once" confirm. | I |
| SH03 | ws_share.rs | make_shared_preview_lists_affected | `share_preview(D)` returns `{questions:[3 ids], assets:[n ids]}`. | I |
| SH04 [MUST] | ws_share.rs | make_shared_team_with_logo | The team and its logo become shared. | I |
| SH05 | ws_share.rs | make_shared_game_refused | Games are never shared: `share.game`. | I |
| SH06 | ws_share.rs | make_shared_already_shared_noop | A no-op or an idempotent Ok. | I |
| SH07 [MUST] | ws_share.rs | make_local_refused_when_other_workspace_uses | Shared Q used by a game in B, current=A: refused `local.in_use` naming workspace B and its game. Dump unchanged. | I |
| SH08 [MUST] | ws_share.rs | make_local_ok_when_only_current_uses | The only user is a game in A (current): it becomes local to A. | I |
| SH09 | ws_share.rs | make_local_counts_archived_workspaces | A game in an archived workspace using it blocks, naming "(archived)" (flag F5). | I |
| SH10 | ws_share.rs | make_local_domain_with_questions | A shared domain makes local: its shared questions — do they come with it, or must they already be? Pin (flag F10): the rule is that a local domain may hold shared questions, so the questions stay shared. | I |
| SH11 | ws_share.rs | make_local_question_in_shared_domain_refused | A shared domain still holds the shared question; making the question local would break the rule. Refused naming the domain. | I |
| SH12 | ws_share.rs | make_local_asset_follow | A local row may keep a shared asset. After make-local the asset stays shared unless used only by this row (pin, flag F10). | I |
| SH13 | ws_share.rs | make_shared_one_transaction | Inject failure on the last asset update: nothing changed. | I |
| SH14 | ws_share.rs | make_shared_reuses_nothing_duplicates_nothing | Row count of each table is unchanged by share/local. | I |
| SH15 | ws_share.rs | make_shared_of_game_member_keeps_game_valid | A question used by a game in A is shared: the game is unchanged and valid. | I |
| SH16 | ws_share.rs | make_shared_search_scope_changes | The hit's scope goes `ws:A` → `shared`. A search from B finds it. | I |
| SH17 | ws_share.rs | make_shared_family_unchanged | `family_id` is unchanged. | I |
| SH18 | ws_share.rs | share_property_roundtrip | Random: share then local (when allowed) restores the original dump apart from `updated_at`. | P |

## 9. Families and propagation

| ID | File | Name | Setup and exact assertion | Kind |
|---|---|---|---|---|
| F01 [MUST] | ws_family.rs | family_across_siblings | Copy Q A→B and A→C: all three share one `family_id`. `family_members(Q)` returns 2 others. | I |
| F02 [MUST] | ws_family.rs | family_across_chains | A→B→C: the family of C' includes A's Q. | I |
| F03 | ws_family.rs | family_includes_archived_workspaces | Members in archived workspaces are listed, flagged archived. | I |
| F04 | ws_family.rs | family_members_flag_archived_rows | An archived row member is listed (propagation updates it). | I |
| F05 [MUST] | ws_family.rs | propagate_body_fields_only_question | Edit stem, options, correct flags, difficulty, explanation and save with "also update": every sibling's body equals the edit. Siblings' `id`, `workspace_id`, `archived_at`, `domain_questions` membership and `family_id` are unchanged. | I |
| F06 [MUST] | ws_family.rs | propagate_body_fields_only_team | name, short_code, color, notes copied. Roster membership and `archived_at` unchanged. | I |
| F07 | ws_family.rs | propagate_domain_body_only | name, code, description copied. Membership and questions unchanged. | I |
| F08 | ws_family.rs | propagate_never_touches_overlays | A game's overlays in the sibling's workspace are unchanged. | I |
| F09 | ws_family.rs | propagate_media_and_logo_decision | The question `media_asset_id` and team `logo_asset_id`: pin whether they propagate (flag F11). Asserts the chosen rule and the asset-follows-row invariant for shared siblings. | I |
| F10 [MUST] | ws_family.rs | save_here_only_changes_nothing_else | "Save here only": siblings' dumps are byte-identical. Family link is kept. | I |
| F11 | ws_family.rs | propagation_only_when_chosen | A plain `catalog_upsert` (no propagation flag) never touches siblings, even in the same family. | I |
| F12 [MUST] | ws_family.rs | edited_copy_overwritten | The copy was edited after copying, then propagated: it now equals the new body (no merge). | I |
| F13 | ws_family.rs | archived_copies_included | An archived sibling row is updated and stays archived. | I |
| F14 | ws_family.rs | link_survives_rename | A sibling renamed locally: still in the family and still updated. | I |
| F15 [MUST] | ws_family.rs | stop_following_removes_link | `family_leave(Q')`: Q' has no family (or its own new family), later propagation from Q does not touch Q', and Q' no longer appears in "Also update" counts. | I |
| F16 | ws_family.rs | stop_following_does_not_unlink_others | In a 3-member family, leaving one leaves the other two linked. | I |
| F17 | ws_family.rs | stop_following_singleton_family | Leaving the family such that one member remains: no ghost. `family_members` returns []. | I |
| F18 [MUST] | ws_family.rs | skip_copy_that_breaks_difficulty_rule | Copy Q' sits on a board in B with another question of difficulty 40. Edit raises Q to 40: `propagation_preview` lists Q' as skipped naming "B" and the game, reason `board.repeated_difficulty` (§2.31). Executing propagation leaves Q' unchanged. | I |
| F19 | ws_family.rs | skip_respects_allow_repeated_difficulty | The same with that game's `board.allow_repeated_difficulty=true`: not skipped. | I |
| F20 [MUST] | ws_family.rs | skip_copy_that_would_become_incomplete | Edit empties the stem or all correct marks, and a copy sits on a board: skipped with reason `board.incomplete` (§2.32). A copy off any board is updated. | I |
| F21 | ws_family.rs | skip_reasons_named_per_workspace | The preview contains `{workspace_name, game_name, reason}` for each skipped copy. `{n}` and `{m}` add up to the family size minus one. | I |
| F22 [MUST] | ws_family.rs | propagation_one_transaction | Inject failure on the 3rd copy write: the saved row and all copies are unchanged. | I |
| F23 | ws_family.rs | preview_equals_execution | Property: the set updated equals the previewed (non-skipped) set. | P |
| F24 | ws_family.rs | skip_check_accounts_for_overlays | The sibling has an overlay giving it a different difficulty: the check uses the effective body (effective_gaps/overlay) or pins otherwise. | I |
| F25 | ws_family.rs | propagation_shared_sibling | A shared sibling is updated, and the check covers every workspace's game that uses it. | I |
| F26 | ws_family.rs | propagation_updates_search_index | After propagation, searching the new text finds all siblings in their workspaces. | I |
| F27 | ws_family.rs | propagation_preview_writes_nothing | Preview is read-only (dump unchanged). | I |
| F28 | ws_family.rs | no_family_no_prompt | A row with no family: preview reports `n=0`, and the editor's save does not open the confirm. | I |
| F29 | ws_family.rs | family_id_set_on_first_copy_only | The source's `family_id` is generated on the first copy and not changed by later copies. | I |
| F30 | ws_family.rs | duplicate_workspace_yearly_family | Duplicate "2026" → "2027" → "2028": one family for each row, and propagation from 2028 reaches 2026. | I |

## 10. Demo per workspace

| ID | File | Name | Setup and exact assertion | Kind |
|---|---|---|---|---|
| D01 [MUST] | ws_demo.rs | demo_ids_derived_from_workspace | Load into workspace A (id a1) and B (b2): ids are `seed-a1-…` / `seed-b2-…`. No collision, and both loads succeed. | I |
| D02 | ws_demo.rs | demo_ro_ids_derived | The Romanian variant gets `seed-ro-<ws>-…` or an equivalent distinct form. Pin the format. | I |
| D03 [MUST] | ws_demo.rs | seed_status_per_workspace | Demo loaded in A only: `seed_status` is Loaded in A, Missing in B. After the Demo's team is archived in A, it is Partial in A, Missing in B. | I |
| D04 | ws_demo.rs | restore_demo_per_workspace | Delete-equivalent (archive) the Demo in B, then restore: A's Demo is untouched. | I |
| D05 | ws_demo.rs | demo_load_twice_same_workspace_idempotent | The second load adds no rows. | I |
| D06 | ws_demo.rs | migrated_workspace_keeps_legacy_ids | The migrated workspace's `seed_status` still sees `seed-…`. It does not demand the derived ids. Loading the Demo again does not duplicate. | I |
| D07 | ws_demo.rs | demo_into_migrated_and_new_coexist | Fx102 with the Demo, plus the Demo into a new workspace: 2 Demos, 2 recipes, search is scoped. | I |
| D08 | ws_demo.rs | demo_empty_state_offers_load | Studio: a new empty workspace's Games tab shows *Load the Demo*. Clicking calls `seed_demo` with the current workspace id. | U |
| D09 | ws_demo.rs | demo_workspace_id_chars | A workspace id with `-`/uppercase produces valid, unique seed ids (check length and charset). | U |
| D10 | ws_demo.rs | demo_closes_over_workspace_only | The Demo game uses only rows of its own workspace (no shared). | I |

## 11. First-launch order

| ID | File | Name | Setup and exact assertion | Kind |
|---|---|---|---|---|
| FL01 [MUST] | commands/beta.rs | workspace_row_not_content | `is_empty_library` is true for a file with one workspace row and no catalog rows. | U |
| FL02 [MUST] | commands/beta.rs | empty_library_with_named_workspace_still_shows_welcome | Beta, welcome not seen, one named workspace and no content: `beta_welcome_get.show`=true (flag F2 for the opposite order). | U |
| FL03 [MUST] | App.test.tsx | order_welcome_then_create_workspace_then_first_run | A brand-new install (no workspace, no operator, welcome unseen). Render `App`: BetaWelcome first; on *Start empty* → *Create your first workspace*; on typed name → FirstRunPage. Assert the three screens in order and that the shell never renders in between. | U |
| FL04 [MUST] | App.test.tsx | copy_stable_then_migrate_then_name | *Copy my stable library* → the swapped-in library is migrated (unnamed workspace) → *Name your workspace* → shell (no first run, since an operator exists). | U |
| FL05 | App.test.tsx | create_first_workspace_has_empty_field_no_placeholder | The input value is "". It has no `placeholder` attribute and no `defaultValue`. *Continue* is disabled until a name is typed. | U |
| FL06 | App.test.tsx | name_your_workspace_has_no_suggestion | Same for the migrated name. `aria-label` is fine, but no text such as "My workspace" appears. | U |
| FL07 [MUST] | App.test.tsx | unnamed_workspace_blocks_shell | A host with an unnamed workspace: the shell, sidebar and switcher are not rendered, and *Name your workspace* comes first (even before first run or a What's new). | U |
| FL08 | App.test.tsx | name_validation_inline | Empty, 61 chars, duplicate: inline message and no host call. | U |
| FL09 | commands/workspace.rs | name_unnamed_workspace_command | `workspace_name(id,name)` works only while the name is unset; thereafter it goes through rename rules. | I |
| FL10 | commands/beta.rs | restart_between_steps_resumes | Quit after welcome_done and before naming: the next boot goes straight to *Create your first workspace* (the welcome is not shown again, it is not stranded). | I |
| FL11 | commands/beta.rs | quit_after_create_before_first_run | The workspace exists and is named, no operator: first run is shown, and the welcome is not shown. | I |
| FL12 | commands/beta.rs | copy_refused_when_workspace_has_content | A named workspace with a team: `beta.library_not_empty` still holds, because content (not the workspace row) counts. | I |
| FL13 | commands/beta.rs | swap_in_migrates_and_pins_backup | After `swap_in` the copied library is at 4, and the pre-workspaces backup is written (the copy was 3). | I |
| FL14 | commands/beta.rs | failed_reopen_leaves_empty_no_workspace | The existing failure test extended: after a failed swap, `workspaces` is empty, not an unnamed phantom. | I |
| FL15 | commands/beta.rs | stable_channel_no_workspace_gate | On the stable channel (release/1.x behaviour) there is no workspace UI: pin the channel flag (flag F12). | U |
| FL16 | App.test.tsx | welcome_language_applies_to_workspace_screens | The language chosen at the welcome carries to the naming screens. | U |

## 12. Studio UI

| ID | File | Name | Setup and exact assertion | Kind |
|---|---|---|---|---|
| UI01 [MUST] | SidebarNav.test.tsx | switcher_at_top_above_library | The first focusable in the sidebar is the switcher button showing the workspace name, and it comes before the *Library* group in DOM order. | U |
| UI02 [MUST] | SidebarNav.test.tsx | rail_shows_initials_with_tooltip | Collapsed rail: the button text is the initials ("SF" for "Season Finale"; single word → 1–2 letters, pin rule), with the name as tooltip/`aria-label`. | U |
| UI03 | SidebarNav.test.tsx | initials_edge_cases | Emoji, non-Latin, a single character, leading digit: stable, non-empty. | U |
| UI04 [MUST] | WorkspaceSwitcher.test.tsx | menu_groups_with_ungrouped_last_and_check | 2 groups + 2 ungrouped: headers in group order, Ungrouped last, check only on current, archived workspaces absent. | U |
| UI05 | WorkspaceSwitcher.test.tsx | menu_has_new_and_manage_items | The last two items are *New workspace…* and *Manage workspaces…*. | U |
| UI06 [MUST] | WorkspaceSwitcher.test.tsx | disabled_with_game_loaded_shows_why | A game loaded: the other workspaces are disabled, and the text *Unload the game in Control first* is visible. | U |
| UI07 | WorkspaceSwitcher.test.tsx | uses_HeroUI_trigger_correctly | The trigger is a single `<button>` (no nested button); roles `menu`/`menuitem` are asserted with `getByRole`. | U |
| UI08 | WorkspaceSwitcher.test.tsx | click_calls_switch_once | Clicking a workspace invokes `workspace_switch` with the id, once. | U |
| UI09 | WorkspaceSwitcher.test.tsx | host_refusal_surfaces | The host returns `workspace.game_loaded` (race): an inline message and no state change. | U |
| UI10 [MUST] | ManageWorkspacesPage.test.tsx | lists_groups_as_headers_with_row_actions | Groups as headers, rows with rename, move to group, duplicate, archive and (archived only) restore/delete. | U |
| UI11 | ManageWorkspacesPage.test.tsx | delete_confirm_names_and_counts | The dialog names the workspace and counts rows, games and Plays (from the preview). The confirm is disabled for an active workspace. | U |
| UI12 | ManageWorkspacesPage.test.tsx | last_workspace_delete_disabled | The delete action is absent or disabled, with a reason. | U |
| UI13 | ManageWorkspacesPage.test.tsx | group_crud_inline | Create, rename, delete a group, with the error message for a duplicate. | U |
| UI14 | ManageWorkspacesPage.test.tsx | uses_list_view_model | Sort, headers and paging come from `useListView` like the 1.1 tabs (spec composition). | U |
| UI15 | ManageWorkspacesPage.test.tsx | archive_current_with_game_shows_refusal | The refusal text from the host. | U |
| UI16 | ManageWorkspacesPage.test.tsx | duplicate_asks_for_typed_name_no_prefill | The name field is empty, with no "Copy of …". | U |
| UI17 | NewWorkspaceDialog.test.tsx | create_has_no_suggested_name | Empty field, no placeholder, optional group picker. | U |
| UI18 [MUST] | Teams/Questions tab tests | where_filter_this_workspace_shared | The Where filter (*This workspace · Shared*) narrows the list. Default = both visible? (pin, flag F13). Rows show a *shared* chip only on shared rows. | U |
| UI19 | listSpecs.test.ts | group_by_where | Group by *Where* makes two header groups with counts. | U |
| UI20 | Domains tab test | domain_pane_marks_shared | The domain pane shows local and shared domains and the shared ones have the chip. | U |
| UI21 [MUST] | bulk bar tests | bulk_copy_move_share_for_selection | Select 3 rows: bar offers *Copy to…*, *Move to…*, *Make shared*/*Make local* on Teams, Domains & Questions and Games, and none on Operators. | U |
| UI22 | bulk bar tests | move_refusal_lists_users_and_copy_instead | A refusal with 2 users: both named in the dialog, a *Copy instead* button runs copy. | U |
| UI23 | bulk bar tests | target_picker_excludes_current_and_archived | The *Copy to…* list shows active workspaces other than the current one. | U |
| UI24 | bulk bar tests | make_shared_confirm_lists_questions_and_assets | The confirm appears once, with the lists from `share_preview`. | U |
| UI25 [MUST] | editor tests | propagation_confirm_frame | Saving a row with a family opens the editor's confirm: *Save here only* / *Also update {n} copies*, with workspace names; skipped copies: *({m} skipped: on a board in {workspace} it would …)*. | U |
| UI26 | editor tests | no_confirm_without_family | Direct save. | U |
| UI27 | editor tests | stop_following_action | The menu item calls `family_leave` and the confirm no longer appears on the next save. | U |
| UI28 | editor tests | propagation_cancel_changes_nothing | Escape on the confirm: no host write. | U |
| UI29 | copy tests | romanian_wording_present | All new strings exist in `en` and `ro` (a catalog-completeness test, like the existing `copy` tests). | U |
| UI30 | App.test.tsx | workspace_changed_event_listener_label | The listener is registered as `AnyLabel` of its own window (not bare), and stats gets the event too. | U |
| UI31 | atoms/icons test | icons_generated | New icon keys are present after `npm run studio:icons` (no stale `icons.generated.ts`). | U |
| UI32 | statistics tests | all_workspaces_choice | The filter bar *All workspaces* changes the query document and the key. | U |

## 13. e2e on the real app

Each spec needs `SEEDS` and `CHANNELS` entries in `folders.ts`.

| ID | File | Name | Setup and exact assertion | Kind |
|---|---|---|---|---|
| E01 [MUST] | ws-name-migrated.e2e.ts | name_the_migrated_workspace | Seed: a 1.0.2-schema fixture on the beta channel. Launch: *Name your workspace* is shown before the shell. Empty field, no suggestion. Type "Season One", Continue. The shell shows "Season One" in the switcher with the 1.x teams, questions and games present. The `backups` folder contains `questiongame-pre-workspaces-*.sqlite3`. | E |
| E02 [MUST] | ws-fresh-install.e2e.ts | welcome_then_first_workspace_then_first_run | Fresh Beta (stable: `none`). Welcome → Start empty → Create first workspace (type "Home") → first run → shell with "Home". | E |
| E03 [MUST] | ws-second-and-copy.e2e.ts | create_second_and_copy_a_question | Create "Club" from the switcher, switch to it (empty, offers *Load the Demo*), switch back, copy a question to "Club" via row action, switch, and find it there. | E |
| E04 [MUST] | ws-share-domain.e2e.ts | make_domain_shared_visible_elsewhere | Make a domain shared (confirm lists its questions). Switch to the other workspace: the domain shows the *shared* chip, and a game's board picker offers it. | E |
| E05 [MUST] | ws-propagate.e2e.ts | edit_and_propagate | Copy a question to "Club", edit its stem in "Home", choose *Also update 1 copies* (workspace named): switch and read the new stem. Then *Stop following*, edit again: *Save here only* only. | E |
| E06 [MUST] | ws-switch-refused.e2e.ts | switch_refused_while_game_loaded | Load a game in Control: the switcher entries are disabled with *Unload the game in Control first*. Unload, then switch works. Stage window is untouched (still on its screen). | E |
| E07 | ws-delete.e2e.ts | archive_and_delete_permanently | Archive "Club", it disappears from the switcher. In Manage, delete: the confirm names it and counts, then confirm. Afterwards a backup exists, "Home" is untouched, and the last-workspace delete is disabled. | E |
| E08 | ws-move-refusal.e2e.ts | move_refused_names_user | Move a domain whose question is also in another domain: the refusal names it, *Copy instead* works. | E |
| E09 | ws-duplicate.e2e.ts | duplicate_workspace_no_plays | Duplicate "Home" as "Next": same teams and games, Statistics shows no Plays in "Next". | E |
| E10 | ws-rail.e2e.ts | collapsed_rail_initials | Collapse the sidebar: initials with a tooltip, and the menu still opens. | E |
| E11 | ws-stats.e2e.ts | statistics_scoping | Play in "Home": Statistics in "Club" shows nothing, and *All workspaces* shows it. | E |
| E12 | ws-restart-persist.e2e.ts | current_workspace_survives_relaunch | Switch, relaunch the app: the same workspace is current. | E |
| E13 | ws-demo.e2e.ts | demo_in_two_workspaces | Load the Demo into both. Each has its own Demo game, and *Restore Demo* acts on the current one. | E |
| E14 | ws-upgrade.e2e.ts | existing_upgrade_spec_still_passes | The existing `upgrade.e2e.ts` flow (1.x update) still passes with the naming gate added (the spec has to type a name). | E |
| E15 | ws-group.e2e.ts | groups_in_switcher | Create a group, move a workspace into it, check the header order, delete the group: the workspace goes to Ungrouped. | E |

## 14. Regressions

| ID | File | Name | Setup and exact assertion | Kind |
|---|---|---|---|---|
| RG01 [MUST] | CI / git | release_1x_untouched | `git diff release/1.x...main` is not run against it; instead assert `release/1.x` `MIGRATIONS.len()==3`, and a CI check or manual step that no workspaces migration is cherry-picked. Document the check (not code-testable on main alone, see flag F12). | U |
| RG02 | catalog_service.rs | existing_suite_passes_in_a_workspace | The whole existing `catalog_service.rs` suite runs unchanged against a service whose current workspace is set (add a harness that creates and selects a workspace in `CatalogService::in_memory`). | I |
| RG03 | upgrade.rs | existing_upgrade_tests_pass | All 12 upgrade tests pass, with the `OpenOptions` expectations adjusted only for the extra pinned backup in `backups_in`. | I |
| RG04 | ws_regress.rs | list_view_features_in_workspace | Filters, sort, headers and paging return identical results inside a workspace to the 1.1 tests (run the 1.1 `listSpecs` tests with a workspace). | U |
| RG05 | ws_regress.rs | board_rules_in_workspace | §2.31 and §2.32 refusals still fire for games in a workspace. | I |
| RG06 | ws_regress.rs | scoring_and_play_unchanged | A full Play fixture (scores, consume, undo) gives identical `scores_json` to the pre-workspace baseline. | I |
| RG07 | ws_regress.rs | import_csv_in_workspace | The import preview and commit work and write into the current workspace only. | I |
| RG08 | ws_regress.rs | incomplete_question_floor | A question with text + one option is saved in a workspace, listed and kept off boards (1.1 rule). | I |
| RG09 | ws_regress.rs | search_features | The stem/option/domain search of 1.x unchanged, incl. archived scope. | I |
| RG10 | ws_regress.rs | archive_restore_rows_unchanged | The row-level archive and restore behave as 1.x. | I |
| RG11 | ws_regress.rs | backup_rotation_still_five | The rotation still keeps 5 for ordinary upgrades. | I |
| RG12 | ws_regress.rs | globals_stay_global | Shortcuts, control behaviour, update settings and `active_operator_id` are identical across workspaces. | I |
| RG13 | ws_regress.rs | stage_contract_fixtures | `fixtures/` still validate: `PlayStateForStage` has no workspace fields. | I |
| RG14 | ws_regress.rs | codemap_current | `npm run map:check` after the changes. | U |
| RG15 | ws_regress.rs | lint_boundaries | Atomic-design lint: the switcher organism, not atoms, imports `@tauri-apps/api`. | U |

## Flags: untestable, contradictory or underspecified

- **F1 (migration of an empty library):** the design says migration creates "one workspace with no name yet holding every existing row". On a v3 file with no rows, that conflicts with "a workspace row does not count as content" and with the "brand-new install has no workspace" rule. A file at v3 with no rows could be a 1.0.2 install that skipped first run. Decide: create the unnamed workspace, or none. M20 pins whichever is chosen.
- **F2 (welcome order versus a stored name):** the design says the workspace row is not content, so the welcome still shows after a name is typed. But the order is welcome → name, so a typed name can only exist after the welcome is done. The only case FL02 covers is a crash between "Start empty" and the welcome being marked seen, which `beta_welcome_done` ordering decides. Specify whether `beta_welcome_done` is written before or after the workspace.
- **F3 ("last remaining workspace" and archiving):** "last remaining" is ambiguous (last of all, or of active ones). Archive of the only active workspace is unspecified, and so is what happens to `current_workspace_id` when the current workspace is archived or deleted. Only archived workspaces can be deleted, so with one active workspace the last could never be deleted, but the active-count could reach zero by archiving. Decide, and add a rule for "zero active workspaces".
- **F4 ("a game loaded in Control"):**
  - It is unspecified whether an unfinished Play resumed at boot counts.
  - It is unspecified whether Move/Copy/Delete of the loaded game itself is refused.
  - A Play opened in workspace B while the persisted current workspace is A needs a rule at boot (I assumed current becomes B, M24).
  - Loading a game needs a "current workspace = the game's workspace" rule.
- **F5 (archived workspaces as users):** Move, Make local and propagation say "active or archived" only for propagation. For "anything that stays behind still uses" and "another workspace uses the row", it is unspecified whether archived games and workspaces count. I assume yes (they would break on restore); MV08 and SH09 pin it.
- **F6 (archived rows):** Duplicate workspace and Copy: are archived local rows copied (as archived) or skipped? Unspecified.
- **F7 (copy edge cases):**
  - Copy to the same workspace.
  - Copying a *shared* row to a workspace (equivalent to Make local, but with a new id).
  - Whether assets take part in "reuse an active family copy".
  - Whether a shared row can be reused as the target's copy.
- **F8 (group naming):** the group name is "required, unique", but case-sensitivity, the ≤60 limit and whether archived workspaces count are not stated for groups. I assumed the workspace rules.
- **F9 (statistics "All workspaces"):** unspecified whether Plays of archived workspaces are included. A deleted game's Plays are gone with it.
- **F10 (Make local on a domain/asset):**
  - It is unspecified whether a shared domain's shared questions come along or stay shared. The reference rules allow a local domain to hold shared questions, so staying shared is valid, but the spec says "*Make shared* also makes shared the questions" with no mirror clause for local.
  - A shared question in a shared domain cannot become local.
  - Whether a shared asset stays shared when its last other user goes.
- **F11 (propagation body list):** "names, text, options, difficulty, colour, notes" omits `code`, `short_code`, `description`, explanation, media asset and logo. Without a closed list the "body fields only" test cannot be exact. The spec needs an explicit field list. Also, option ids: whether propagated options replace siblings' option ids affects snapshots and overlays.
- **F12 (contradiction on channels and release/1.x):**
  - "Beta only, never merged into release/1.x" cannot be tested from main alone (RG01 is a process check).
  - A fresh stable install on main's code has no workspace. The design's first-launch flow is defined only for Beta. Define what the stable channel on `main` does until 2.0.
  - "At 2.0 → stable" cannot be tested now except via the Beta swap path (FL04, FL13).
- **F13 (Where filter default):** it is not said whether the default view is "This workspace" only or both. The 1.x lists would otherwise become mixed, but "scoped in the host" suggests the host returns both and Studio filters. This contradicts "never by Studio filtering a full list" unless `where` is a host parameter. Make `where` a parameter of `catalog_list`.
- **F14 (`globals` per workspace):** "game defaults, the timer default" are per workspace, but `globals` is one JSON document (`settings_load`/`settings_store`). The storage, the migration of existing values and the default for new workspaces are unspecified, so tests only exist as RG12 for the global half.
- **F15 (events have no workspace column):** `events` and `plays` reach a workspace only through `recipes`. Delete and stats rely on that join. A Play whose recipe row is hard-gone is orphaned. No test is possible without the schema decision. C27 and S12 assume the join through the game.
- **F16 (restart-safe delete):** delete is "backup then one transaction", but the search index (in-RAM) updates after commit, outside the transaction. A crash is harmless (rebuilt at open), but a test for the live-index/DB split after a failure only works through `rebuild_search_index` equality (used in CP14 and S05).
- **F17 (not testable here):** the "pre-migration backup exists on disk before the step runs" can only be shown indirectly (backup's `user_version` is 3, and ordering in `open_guarded`). There is no hook between backup and migrate; M07 uses the existing `behind` technique. Adding an injection point (test-only fn pointer) would make M12 and M07 direct.
- **F18 (`copied_from` versus `family_id`):** the migration lists `copied_from` on teams, domains, questions, recipes, but not assets, and `family_id` is in the "left to the builder" list. Assets that follow rows need either a family or reuse by (path, workspace); CP16 depends on it.
- **F19 (per-workspace list prefs):** stored where? Studio-side (localStorage) versus host `globals` is unspecified. W14 to W16 assume a per-operator, per-workspace key, and "per operator" has no storage owner in the design.
- **F20 (name case-insensitivity):** SQLite `COLLATE NOCASE` is ASCII only. "Case-insensitive" for names like "Édition" needs Unicode folding done in Rust, so C04 asserts the Unicode case explicitly.