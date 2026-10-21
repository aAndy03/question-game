# Remove the shared library (beta.2) — test list (Sonnet 5.5) and rulings

Ids are stable; a gap in a sequence is a test cut to keep the list at about 190. Plan: `2026-10-21-remove-shared-library.md` · Spec: `../specs/2026-10-21-remove-shared-library-design.md`. Sonnet 5.5 proposed the list below; the build implements it under these ids (files may be merged where one reads better). Ids follow the plan's tasks: **U** = Task 1 (migration 6), **H** = Task 2 (one scope), **C** = Task 3 (copy with domains, Demo, safety), **A** = Task 4 (app, contract), **S** = Task 5 (Studio drops sharing), **W** = Task 6 (switching), **E** = Task 7 (e2e, docs, What's new). Task 8 (reviews) is the mapping table at the end.

Rulings are at the bottom (**Rulings needed**). Where a test depends on one it carries `[R#]`, and it is written against my recommended answer.

Kinds (layer): host integration (`I`), host unit (`HU`), host property (`P`), app (`APP`, `crates/app`), Studio vitest (`V`), e2e (`E2E`).

File shorthands:
- `H/…` = `crates/host/tests/…`
- `HS/…` = `crates/host/src/…` (unit tests in the module)
- `AP/…` = `crates/app/…`
- `S/…` = `apps/studio/src/…`
- `E/…` = `e2e/specs/…`
- New files proposed: `H/unshare.rs`, `H/unshare_prop.rs`, `E/upgrade-shared.e2e.ts`.

## The fixture: B1, a beta.1 library

Built in the test as a head library, written down with `db::write_older_schema(.., 5)` (no triggers), then `db::share_for_test(path, kind, id)` on every row marked `(s)`. Opening it with `open_guarded` migrates it. Every test uses all of B1 or the named slice of it; "before" facts are read from the v5 file *before* it is opened (a `snapshot_before(path)` helper that, for each workspace, lists what that workspace saw: own ∪ shared rows, archived included, plus each game's `board_problem`).

Workspaces (all created at distinct `created_at`, so "oldest" is unambiguous):
- `wsA` archived, created 50 (older than every active one)
- `ws-1` active, created 100 (the oldest active; owns originals)
- `ws-2` active, created 200
- `ws-3` active, created 300
- `wsB` archived, created 400

Rows:
- Assets: `aS (s)` (a team logo and a question's media), `aL` (local to ws-2), `aU (s)` (referenced by nothing).
- Teams: `tS (s)` (logo `aS`), `tK (s, archived)`, `tN (s)` (on no roster), `tF (s)` in family 7 with `tF2` local to ws-2, `tL1` local to ws-1.
- Questions: `qS1 (s)` difficulty 10, `qS2 (s)` media `aS` difficulty 20, `qS3 (s)` tags `["Rome","rome"]`-style case clash with a ws-2 local question's `["ROME"]`, `qA (s, archived)`, `qU (s)` in no domain, `qF (s)` in family 9 with `qF2` local to ws-2 (body drifted: another difficulty) and `qF3` local to ws-3 and archived, `qL1` local to ws-1, `qL2` local to ws-2.
- Domains: `dS (s)` holds `qS1,qS2,qS3` in two groups (`Romans` = qS1,qS3; `Medieval` = qS2; sort keys 0,1,2), `dK (s, archived)`, `dL1` (ws-1: `qS1,qL1`), `dL2` (ws-2: `qS1,qF2,qL2`), `dL3` (ws-3: `qS2`).
- Games: `g1` ws-1 (roster `tS,tL1`; board `dS` → `qS1,qS2`; board `dL1` → `qL1`), `g2` ws-2 (roster `tS,tF2`; board `dL2` → `qS1,qF2`; team overlay for `tS` with `patch_json {"logo_asset_id":"aS"}`; question overlay for `qS1`), `gB` ws-2 (**already broken**: board holds `qS1` and `qS1b`, two questions of equal difficulty in one domain with repeats off), `g3` ws-3 (roster `tS`), `gA` in archived `wsA` (roster `tS`, board `dS` → `qS3`).
- Plays: `P1` closed in g1, `P2` **paused** in g2 (snapshot names `tS`, `qS2`, `aS`), `P3` closed in g3. Events appended for each.
- Operators and globals as in any library.

Slices named in tests: `B1.min` = ws-1 + ws-2, `qS1` shared and in a local domain of each, one game each.

---

## 1. Task 1 — Migration 6 (H/unshare.rs, H/upgrade.rs, HS/db.rs)

### 1a. The step machinery (HS/db.rs, H/upgrade.rs)
| id | name | setup and assertion | k |
|---|---|---|---|
| U1 [MUST] | head_user_version_is_6 | Fresh open: `user_version == 6`; `MIGRATIONS.len() == 6`; `UNSHARE_STEP == 6`; `WORKSPACES_STEP == 4`. | HU |
| U2 [MUST] | step_6_is_a_rust_step_run_in_the_one_transaction | `MIGRATIONS[5]` is `Step::Rust`; steps 1–5 are `Step::Sql`. A v4 file ends at 6 and a `trace` of the connection shows exactly one `BEGIN` and one `COMMIT` for 5+6 together. | HU |
| U3 [MUST] | write_older_schema_runs_only_sql_steps_and_writes_no_triggers | `write_older_schema(.., 5)` yields `user_version 5`, no trigger named `*_has_workspace_*` in `sqlite_master`, and `workspace_id` accepts NULL. Asking for `steps = 6` is a debug-assert/Err (it must not run the Rust step). | HU |
| U4 | share_for_test_sets_null_and_only_on_a_v5_file | `share_for_test(path, kind, id)` sets `workspace_id = NULL` on that row; on a head file (triggers present) it returns the trigger's error. A missing id is `NotFound`. | HU |
| U5 [MUST] | migration_6_is_backed_up_first | A v5 file stamped by another version gets a rotated `.sqlite3` copy with `user_version == 5` **and its shared rows still NULL** before step 6 runs; the backup is not the pinned pre-workspaces copy. | I |
| U7 [MUST] | v4_library_runs_5_then_6 | A v4 file (workspaces, no groups/tags) ends at 6: `domain_groups`, `question_tags`, the five trigger pairs exist; row counts and ids identical (nothing was shared); no `family_id` was allocated. | I |
| U8 [MUST] | v3_library_runs_4_5_6_with_the_pinned_backup | A 1.0.2-shaped v3 file with an open Play ends at 6 in one unnamed `ws-1`; the pinned pre-workspaces copy exists once; the Play resumes. Existing `migration_4_…` and `migration_keeps_an_open_play_resumable` still pass. | I |
| U10 | future_schema_refused_found_7_known_6 | `user_version = 7` gives `SchemaTooNew { found: 7, known: 6 }` and the file is untouched. | I |

### 1b. Where the originals and the copies go
| id | name | setup and assertion | k |
|---|---|---|---|
| U12 [MUST] | original_id_goes_to_the_oldest_active_workspace | B1. After migrating, `qS1`, `tS`, `dS`, `aS` have `workspace_id = ws-1` (not `wsA`, which is older but archived). Their bodies, `created_at`, `updated_at`, `family_id`'s group and archive state are byte-identical to before except `workspace_id` (and `family_id` where one was allocated). | I |
| U13 [MUST] | tie_on_created_at_goes_to_the_lowest_id | Two active workspaces with equal `created_at`: the lower id owns the originals. | I |
| U15 | single_workspace_library_just_gets_the_workspace_id | One workspace `ws-1`, a shared question/team/domain/asset: each row gets `workspace_id = ws-1`; no copy, no `family_id` allocated, row counts unchanged. | I |
| U16 [MUST] | every_other_workspace_active_or_archived_gets_each_shared_row_once | B1: for each of the shared rows (`aS aU tS tK tN tF qS1 qS2 qS3 qA qU qF dS dK`), each of `ws-2`, `ws-3`, `wsA`, `wsB` holds **exactly one** member of its family (counting its own existing members), and `ws-1` holds the original. | I |
| U17 [MUST] | copies_get_a_fresh_id_and_the_same_family | A copy's id is new (not equal to any id existing before), has the right prefix for its kind, and its `family_id` equals the original's; every family id is unique across rows of different families; a row that had no family now has one and the original joined it. | I |
| U19 [MUST] | a_copy_keeps_body_tags_difficulty_and_dates | Compare copy vs original: same name/stem/options/difficulty/explanation/notes/colour, same tag lists (before respelling), same `created_at` and `updated_at`, `play_count` fresh (derived, rebuilt at boot). `origin` is carried. | I |
| U20 [MUST] | archived_shared_rows_arrive_archived_with_the_same_stamp | `qA`, `tK`, `dK` and their copies have `archived_at` equal to the original's. An active shared row's copy is active. | I |
| U21 [MUST] | archived_workspaces_get_their_rows_too | `wsA` and `wsB` each hold copies of every shared row (not only the ones their games use); `workspace_list` still shows them archived; unarchiving `wsA` later shows the rows. | I |
| U23 | unused_shared_rows_are_copied_too | `aU`, `tN`, `qU` exist in every workspace: nothing a workspace could *see* in beta.1 disappears, whether or not a game uses it. | I |
| U24 [MUST] | nothing_anyone_could_see_disappears | `snapshot_before` vs after, per workspace (all five): every row seen before (own ∪ shared, archived included) has, after, a row **in that workspace** that is the same row or in the same family, with the same archive state [R2] and, unless it is a reused drifted member, the same body. | I |

### 1c. Families: reused, never twinned
| id | name | setup and assertion | k |
| --- | --- | --- | --- |
| U26 [MUST] | existing_family_member_is_reused_not_twinned | `qF` shared, `qF2` in ws-2 (same family). After: ws-2 has **no new** question with family 9 besides `qF2` (row count per (ws-2, family 9, active) is 1); `qF2`'s id is unchanged. | I |
| U27 [MUST] | references_in_the_workspace_are_remapped_onto_the_reused_member | `g2`/`dL2` that named `qF` (add a variant of B1 where they did) now name `qF2`; same for `tF` → `tF2` on g2's roster. | I |
| U28 | a_reused_member_keeps_its_drifted_body | `qF2` difficulty/stem unchanged by the migration (the shared body is not written over it); the original keeps its own. | I |
| U29 [MUST] | review_focus_2_edit_after_reuse_creates_no_twin | After U26, edit `qF2` in ws-2 with *Also update copies* on: it follows to `qF` (ws-1) and the ws-3 copy; ws-2 still has exactly one member of family 9; no "Biblie" name pair. | I |
| U30 [MUST] | member_present_in_three_workspaces_reuses_in_each | A family with members in ws-2 and ws-3 (not ws-1): ws-1 gets the original, ws-2 and ws-3 reuse theirs; no copy is made in either. [R1] | I |
| U31 | two_members_in_one_workspace_pick_the_earliest_active | ws-2 holds two active family members (the operator copied twice): references go to the earlier `created_at` (tie: lower id); the other is untouched; no third row. | I |
| U32 [MUST] | the_oldest_workspace_already_holding_a_member | `qF2` is in **ws-1** (the would-be owner): per [R1] the original goes to the oldest active workspace that holds no family member; if none, to `ws-1` and the pre-existing member stays beside it. Assert both branches. | I |
| U33 [MUST] | archive_state_mismatch_does_not_hide_a_row | ws-2 holds an **archived** family member `qF3` and the shared row is active: per [R2] it is not reused for the active row; ws-2 gets an active copy, `qF3` stays archived. Mirror: shared row archived, ws-2 member active: the archived shared row gets an archived copy; the active member is unchanged. | I |
| U34 [MUST] | reuse_that_would_collapse_two_entries_makes_a_fresh_copy | `dL2` holds both `qS1` (shared) **and** `qF2`' where `qF2'` is a family member of `qS1`. Reuse would put one question in the domain twice (PK `(domain_id, question_id)`): per [R3] ws-2 gets a fresh copy instead; domain member count, sort keys and groups identical to before. Same for a roster holding `tS` and its member, a board listing both, and two overlays. | I |
| U35 [MUST] | reuse_that_would_change_a_board_problem_makes_a_fresh_copy | A reused `qF2` has a difficulty that would clash/leave a board in ws-2 that `qF` (shared) did not: per [R4] fresh copy; `board_problem` before == after. | I |
| U36 | reusing_a_domain_member_that_lacks_a_question_a_board_needs | ws-2's `g2` boards `dS` (shared) with `qS1,qS2`; ws-2 has a family copy `dS2` that holds only `qS1`. Per [R4] ws-2 gets a fresh domain copy; g2 loads as before. | I |
| U37 | unrelated_same_name_rows_are_left_alone | A local "Biblie" in ws-2 with no family link and a shared "Biblie": ws-2 ends with two rows named "Biblie" (the local, and the shared's copy), not merged. | I |
| U38 | a_row_with_a_family_but_no_member_elsewhere | `qS1` already in family 5 with a member in ws-1 only (ws-1 is the owner): ws-1 holds both (per R1 branch) and others get copies in family 5 (the family id is reused, not renewed). | I |

### 1d. References remapped, per workspace
| id | name | setup and assertion | k |
| --- | --- | --- | --- |
| U39 [MUST] | domain_members_name_the_workspaces_own_question | `dL2`'s member `qS1` now names ws-2's copy; `dL1`'s names ws-1's original; `sort_key` and `group_id` of every membership unchanged. | I |
| U40 [MUST] | a_copied_shared_domain_has_members_of_its_workspaces_copies | In ws-2/ws-3/wsA/wsB, `dS`'s copy holds copies of `qS1,qS2,qS3` **of that workspace** (not ws-1's), in the same `sort_key` order. | I |
| U41 [MUST] | copied_domain_groups_come_with_members_mapped | The copy of `dS` in ws-3 has groups `Romans`, `Medieval` (new ids, same order and names) and `group_id` of each member equal to the equivalent group; `domain_groups.domain_id` always equals the membership's `domain_id` (never points at ws-1's domain). | I |
| U42 | the_owners_groups_are_unchanged | `dS`' own groups in ws-1 keep their ids. | I |
| U43 [MUST] | rosters_name_the_workspaces_own_team | `g1` → `tS` (original), `g2` → `tS'` (ws-2), `g3` → `tS''`, `gA` → `tS'''`; `position` unchanged; `tL1` and `tF2` unchanged. | I |
| U44 [MUST] | boards_and_board_domains_are_remapped | `g2`'s `recipe_domains` name ws-2's `dL2` (unchanged) **and**, if a board used shared `dS`, ws-2's copy; `recipe_questions.domain_id` (no FK) and `question_id` both remapped together; `position` unchanged. | I |
| U45 [MUST] | overlay_keys_are_remapped | `g2`'s `recipe_overlays` row `(team, tS)` becomes `(team, tS')`, `(question, qS1)` becomes `(question, qS1')`; a `domain` overlay for `dS` likewise; no overlay is lost or duplicated. | I |
| U46 [MUST] | overlay_patch_json_asset_ids_are_remapped | `patch_json {"logo_asset_id":"aS"}` on g2's team overlay becomes `{"logo_asset_id":"<ws-2 copy of aS>"}`; other keys in the JSON are byte-preserved (key order and unknown keys kept); a question overlay's `media_asset_id` the same. | I |
| U49 [MUST] | team_logos_are_remapped | `tS'.logo_asset_id` is ws-2's copy of `aS`; `tS` (owner) still points at `aS`. | I |
| U50 [MUST] | question_media_is_remapped | `qS2'.media_asset_id` is that workspace's copy of `aS`. | I |
| U51 | a_reused_member_keeps_its_own_logo_and_media | `tF2` and `qF2` keep their asset ids; `aS` is still copied into ws-2. | I |
| U52 [MUST] | no_row_references_a_row_in_another_workspace | After migrating B1, a sweep: for each of `recipe_teams`, `recipe_domains`, `recipe_questions`, `domain_questions`, `recipe_overlays` (+ keys and patch ids), `teams.logo_asset_id`, `questions.media_asset_id`, `domain_groups`→`domains`: the referenced row's `workspace_id` equals the referrer's. | I |
| U55 [MUST] | game_rows_are_not_touched_beyond_their_references | `recipes.rev`, `updated_at`, `settings_json`, `layout_json`, `name`, `tags_json` identical before and after for every game, including those whose rosters were remapped. [R6] | I |

### 1e. Boards, tags, groups, Plays
| id | name | setup and assertion | k |
| --- | --- | --- | --- |
| U56 [MUST] | board_problem_before_equals_after_for_every_game | For `g1 g2 g3 gA gB`, `board_problem` computed in the game's own workspace before (v5 view) and after (v6) is equal (both `None` or the same refusal text modulo ids → names). | I |
| U57 [MUST] | review_focus_1_broken_board_stays_exactly_as_broken | `gB` (broken before) still refuses at Load with the same reason; `g2`, which shares `qS1` with it, loads; no twin domain appears in ws-2 (count of domains named like the shared one is 1). | I |
| U58 | every_loadable_game_still_builds_a_snapshot | `play_load`/`build_snapshot` for `g1 g2 g3` succeeds and the snapshot's team/question **names** equal those from the v5 file. | I |
| U59 [MUST] | tags_are_respelled_per_workspace_earliest_wins | `qS3` has `Rome`, ws-2's `qL2` (created earlier than ws-2's copy of qS3) has `ROME`: after, in ws-2 both carry `ROME`; in ws-1 the earliest-created question's spelling; each workspace's `question_tags` has one spelling per `tag_key`. Ties on `created_at` go to the lower id. [R7] | I |
| U64 [MUST] | plays_and_events_are_byte_identical | Dump `plays` and `events` (the real table names; the plan's `play_events` is `events`) before and after: byte-equal, including the paused `P2`'s snapshot JSON naming old ids. [R12] | I |
| U65 [MUST] | review_focus_3_paused_play_in_a_non_oldest_workspace_resumes | `P2` (ws-2) resumes after the upgrade; the Stage/Studio state it emits carries the snapshot's team name and `logo_url` id `aS`; `asset_get_any(aS)` resolves from ws-2 while `catalog_get(Asset, aS)` from ws-2 is `WrongWorkspace`/`NotFound`. | I |
| U67 | statistics_for_old_plays_label_by_snapshot_name | `stats_query` in ws-2 for `P2` has no error; the team rows for `tS` (not in ws-2 any more) are labelled by the snapshot's name; `all_workspaces` counts the same Plays once. [R18] | I |
| U68 | team_play_counts_follow_the_ids_in_the_log | `tS` (owner) keeps its derived `play_count`; copies start at 0; no `plays` row is rewritten. [R18] | I |
| U69 | operators_globals_and_settings_untouched | Operators (no `workspace_id` column), `globals`, `workspace.current`, `workspace_groups` byte-equal. | I |

### 1f. Triggers, failure, scale, search
| id | name | setup and assertion | k |
| --- | --- | --- | --- |
| U70 [MUST] | no_row_has_a_null_workspace_after | `SELECT count(*) … WHERE workspace_id IS NULL` is 0 for all five tables on B1 and on every other fixture. | I |
| U71 [MUST] | null_insert_is_refused_on_all_five_tables | For `teams domains questions assets recipes`: `INSERT … workspace_id NULL` fails with `a library row lives in a workspace`. | HU |
| U72 [MUST] | null_update_is_refused_on_all_five_tables | `UPDATE t SET workspace_id = NULL WHERE id = …` fails with the same message and the row is unchanged; `UPDATE … SET workspace_id = 'ws-2'` still works (a move). | HU |
| U73 | an_upsert_on_a_connection_with_no_bound_workspace_is_refused | Clear `temp.current_ws`, then `team_upsert`: the trigger fires (the subquery is NULL); no row written. [R19] | HU |
| U74 | set_workspace_to_an_unknown_workspace_fails_the_foreign_key | `workspace_id` still `REFERENCES workspaces(id)`; moving a row to `ws-zzz` fails. | HU |
| U75 [MUST] | a_failure_inside_step_6_leaves_user_version_5_and_the_rows_as_they_were | Pre-create a trigger named `teams_has_workspace_insert` in the v5 file so the step's last statement fails (after every remap has run) [R8]: `open_guarded` errs, `user_version` is 5, `SELECT count(*) WHERE workspace_id IS NULL` equals the shared count, no copy row exists, the backup exists and is at 5. | I |
| U76 [MUST] | a_failed_migration_can_be_retried_after_the_cause_is_removed | Following U75, drop the blocking trigger and open again: it migrates to 6 and equals a clean migration (row-for-row, ids aside). | I |
| U79 | search_index_is_rebuilt_for_the_opening_workspace | After migration `catalog_search("<qS2 stem>")` from ws-2 returns ws-2's copy, from ws-1 the original; neither returns the other's. | I |
| U80 | scale_5000_shared_questions_x_5_workspaces | 5,000 shared questions in 5 workspaces migrate in under 10 seconds and with a statement count linear in rows (no per-row full-table scans: assert via `sqlite3_stmt` count or by timing 1,000 vs 5,000 ≈ linear within 8×). | I |

### 1g. Property tests (H/unshare_prop.rs)
| id | name | setup and assertion | k |
| --- | --- | --- | --- |
| U81 [MUST] | P_migration_preserves_what_each_workspace_saw | Generate a v5 library: 1–4 workspaces (random archived flags), random teams/domains/questions/assets, random `share_for_test`, random families across workspaces, random games with random rosters/boards/overlays over what each workspace may see. After migrating: U24, U52, U70 and U56 (the `board_problem` map) hold. | P |
| U82 [MUST] | P_at_most_one_active_member_per_family_per_workspace_is_created | For every (workspace, family) pair, the number of active members after ≤ max(before count, 1) — the step never raises it. | P |

---

## 2. Task 2 — The host has one scope (H/workspaces.rs, transfer.rs, bulk.rs, groups_tags*.rs, family.rs, catalog_service.rs)

| id | name | setup and assertion | k |
|---|---|---|---|
| H1 [MUST] | scope_a_row_is_seen_only_in_its_workspace_all_four_kinds | Team, domain, question, asset created in ws-A: `catalog_list`, `catalog_get`, `catalog_search` and `catalog_tags` from ws-B see nothing; `catalog_get` is `WrongWorkspace`/`NotFound`. | I |
| H2 [MUST] | scope_upsert_of_a_new_row_lands_in_the_current_workspace | Upsert each kind in ws-B: `workspace_id = ws-B`; `land()` is gone (a compile-level check plus the row). | I |
| H3 [MUST] | an_upsert_never_moves_a_row_and_never_reaches_another_workspaces | Upserting an id owned by ws-A from ws-B is `WrongWorkspace` (kinds ×4) and writes nothing. | I |
| H4 [MUST] | no_workspace_id_is_null_sweep | Source sweep like the `tauri` sweep: `crates/host/src` (except `catalog/unshare.rs`, the migration text in `db.rs`, tests) contains no `workspace_id IS NULL`, no `IS NULL OR workspace_id`, and no `shared` identifier in `catalog/`. | HU |
| H5 [MUST] | in_view_means_this_workspace | `store::IN_VIEW` text is `workspace_id = (SELECT id FROM temp.current_ws)`; `in_view("q")` the aliased form; games and library rows use the same predicate. | HU |
| H6 | bulk_report_has_no_shared_field | Serialise a `BulkReport`: no `shared` key; fields the Studio type lists are exactly the wire's (set equality). | HU |
| H7 | tag_count_has_no_shared_field | Serialise `TagCount`: keys are `tag`, `questions` only. | HU |
| H8 [MUST] | an_old_payload_with_shared_true_deserializes_and_lands_here | `{"id":"q-x",…,"shared":true}` for Team/Domain/Question/Asset deserialises (no `deny_unknown_fields`); `Stamps` has no `shared`; saving it lands in the current workspace and is not shared; re-serialising omits `shared`. | HU |
| H10 [MUST] | tag_list_counts_only_this_workspace | Same tag on questions in ws-A (2) and ws-B (1): from ws-A count 2, from ws-B count 1; archived questions counted. | I |
| H11 [MUST] | manage_tags_rename_and_delete_touch_only_this_workspace | Rename "Rome" in ws-A: ws-B's questions keep "Rome"; counts returned equal rows changed. | I |
| H13 [MUST] | bulk_ops_refuse_another_workspaces_id_whole | For tag/untag/group/add-to-domain/remove-from-domain/set-difficulty: one id from ws-B in a ws-A selection → `WrongWorkspace`, nothing written (table-driven, as B0). | I |
| H14 [MUST] | the_shared_domain_rule_is_gone | A local domain accepts any local question and `add_to_domain` of local questions into any local domain succeeds; the `domain_rule` function does not exist (sweep). | I |
| H15 | groups_are_visible_only_in_their_workspace | Groups of a ws-A domain are `NotFound`/`WrongWorkspace` from ws-B; `group_create` on it from ws-B refused. | I |
| H16 [MUST] | transfer_op_make_shared_and_make_local_do_not_deserialize | `"make_shared"` and `"make_local"` as `TransferOp` give a serde error; the enum has `copy`, `move` only. | HU |
| H17 [MUST] | move_refuses_naming_each_staying_user | Move a question used by a domain/game that stays: `StillUsed` names every user (`game X`, `domain Y`), nothing moves. | I |
| H18 | move_a_whole_closure_succeeds | Move a game with its roster/board closure: all `workspace_id` change; the source workspace no longer sees them; tags respelled to the target. | I |
| H19 | move_into_a_workspace_holding_a_family_member | Moving `Q` into a workspace that already has an active family member of `Q`: per [R9] it is allowed and both stay (no merge); `family_members` lists both. | I |
| H20 [MUST] | copy_reuses_only_what_came_along | Closure rules (picked → always new; came along → reuse an active family member) still hold with no shared branch: update of the old `shared`-closure tests to two-workspace ones. | I |
| H22 [MUST] | family_copy_names_a_workspace_always | `FamilyCopy.workspace` is a `WorkspaceId` (not `Option`); `propagation_preview` lists members in every workspace (active and archived), none "shared". | I |
| H23 [MUST] | propagation_reaches_family_members_in_every_workspace | Edit in ws-A with *Also update copies*: body reaches ws-B and ws-C (and an archived ws-D) copies, tags included, never memberships/groups/overlays; a member the change would break is skipped and named (regression, tags present). | I |
| H24 | propagation_with_an_asset_carries_the_workspaces_own_copy | `with_body` for logo/media: the family member of the asset in the copy's workspace; if none, the copy keeps its own (no shared arm). | I |
| H25 [MUST] | stop_following_copies_cuts_the_link | After `catalog_unfollow`, an edit no longer reaches it; the others remain one family; the row is still in its workspace. | I |
| H27 [MUST] | seed_demo_has_no_shared_case | `seed_status`/`seed_demo` in ws-A never read ws-B's rows; `home_of` returns `Option<WorkspaceId>`. | I |
| H29 [MUST] | delete_workspace_permanently_has_no_fk_blocker_after_migration | On the migrated B1: archive `ws-1`, delete it: succeeds (no row elsewhere references its rows); `ws-2`'s games still load; the pre-delete backup exists. | I |
| H31 | duplicate_workspace_copies_every_row_no_shared_filter | `workspace_duplicate` copies all rows, local filter removed; family joins; archived stays archived; groups and tags copied; **patch_json asset ids in overlays are remapped** [R13]. | I |
| H33 | proptest_no_list_or_search_returns_another_workspaces_row | Existing property in `workspaces.rs`: drop the shared generator; assert the stronger `∀ list/search result, workspace_id = current`. | P |

---

## 3. Task 3 — Copy with domains, Demo, the safety fixes (H/transfer.rs, H/workspaces.rs, H/demo_scenarios.rs, AP tests)

### 3a. Copy to… with domains (scenario 2)
| id | name | setup and assertion | k |
|---|---|---|---|
| C1 [MUST] | review_focus_5_one_question_from_a_300_question_domain | ws-A domain `D` holds 300 questions; copy question `q7` with `with_domains: true` to ws-B (no copy of D there): ws-B gets 1 question and 1 domain row whose member list is exactly that question; ws-B question count +1, not +300. | I |
| C2 [MUST] | the_copied_domain_keeps_only_the_picked_members_groups | `D` has groups `A`, `B`; the picked question sits in `A`, another picked sits in `B`, a third (unpicked) in `A`: the copy has groups `A` and `B` in order (new ids), the picked in their equivalent groups, the unpicked absent. A group with no picked member is **not** copied (or copied empty — pin it) [R10]. | I |
| C3 [MUST] | picked_questions_join_an_existing_family_copy_at_the_end_in_no_group | ws-B already holds a family copy `D'` of `D` with 4 members and a group `A`: the picked question joins `D'` after the 4 (sort key greater than all), `group_id` NULL even if D' has an identically named group; `D'`'s other members and groups unchanged; `report.joined` names `D'`. | I |
| C5 | a_picked_question_already_in_the_target_domain_is_not_added_twice | Copying `q` whose copy (reused) is already in `D'`: no duplicate membership (PK), `joined` omits it. | I |
| C6 [MUST] | with_domains_false_lands_in_no_domain_and_the_preview_says_so | `with_domains: false`: no domain row created or joined in ws-B; the copy is in no domain; the preview's `created` lacks domains and `joined` is empty; the preview text (S) says "in no domain". | I |
| C7 [MUST] | a_question_in_two_source_domains_brings_both | `q` in `D1` and `D2` with domains on: ws-B gets (or joins) both; `report.created` lists the new domain rows with `picked: false`. | I |
| C9 | an_archived_target_family_copy_is_not_joined | `D'` archived in ws-B: a fresh domain row is created (as `family_member_in` only sees active). [R10] | I |
| C10 [MUST] | copy_a_whole_domain_is_unchanged | Selection with a domain (and `with_domains` either value): the domain row + all its questions + groups copied, as before; no `joined`. | I |
| C11 | domain_and_one_of_its_questions_both_picked | The whole domain wins; the question is not copied twice or added again; report has it once. | I |
| C12 [MUST] | with_domains_applies_to_picked_questions_only | A game selection brings its board domains as before regardless of `with_domains`; a team selection is unaffected. | I |
| C13 | copy_default_options_are_with_domains_true | `CopyOptions::default().with_domains`; `catalog_copy_to` serde with the field absent ⇒ true; `{"withDomains": false}` ⇒ false. | HU |
| C14 [MUST] | preview_equals_write | For C1, C3, C6, C7: `transfer_preview(Copy, …, options)` returns the same `created/reused/joined/refused` as the write; the preview leaves row counts, `family_id`s and the sequence unchanged (rolled back). | I |
| C15 [MUST] | a_copy_leaves_the_operator_in_their_workspace | After success or refusal, `current_workspace()` and `temp.current_ws` are the source's. | I |
| C19 | move_a_question_that_is_in_a_staying_domain_is_refused_naming_the_domain | Move `q` (member of `D` which stays): `StillUsed` names `domain D`; nothing moves. | I |
| C20 [MUST] | each_target_domain_copy_is_a_family_member_of_its_source | New domain row has the source's `family_id` (created if none); a second copy-with-domains to the same target joins the first. | I |

### 3b. Demo in every workspace
| id | name | setup and assertion | k |
|---|---|---|---|
| C22 [MUST] | demo_restore_works_in_a_second_workspace_after_its_demo_moved | ws-2 seeds its Demo (ids `seed-ws-2-…`), then moves it to ws-3: in ws-2 `seed_status` reports all missing and `seed_demo(Missing)` creates a Demo with **different ids** (no `WrongWorkspace`), leaving ws-3's untouched. [R5] | I |
| C23 [MUST] | demo_moved_twice_gets_a_third_generation | Repeat C22 once more: ws-2 gets a third distinct set; ids unique; `home_of` for each is correct. [R5] | I |
| C24 | demo_in_the_first_workspace_still_handles_the_move | The existing test `restore_sample_game_works_after_the_first_demo_moved_away` passes unchanged. | I |
| C25 [MUST] | duplicate_workspace_recognises_its_demo | Duplicate a workspace holding the Demo: in the duplicate `seed_status` = all present, edited 0; `seed_demo(Missing)` inserts 0 (no second Demo); `Overwrite` rewrites the duplicate's rows and not the source's. [R5] | I |
| C26 | duplicate_of_a_workspace_whose_demo_had_moved | Source's Demo moved away: the duplicate has none and a restore creates one with the duplicate's ids. | I |
| C27 [MUST] | a_beta1_shared_demo_becomes_a_demo_in_every_workspace | B1 variant with the English Demo made shared: after migration every workspace's `seed_status` is complete (present = all, missing = 0); no workspace gets a second Demo on *Restore sample game*; ids per [R5]. | I |

### 3c. The empty-library guard
| id | name | setup and assertion | k |
|---|---|---|---|
| C30 [MUST] | is_empty_library_sees_rows_in_other_workspaces | Current workspace empty; `ws-2` holds one team/domain/question/asset/game/Play/operator: `is_empty_library` is false for each kind separately. | APP |
| C31 [MUST] | is_empty_library_sees_an_archived_workspaces_rows | The only content is in an **archived** workspace: false. | APP |
| C32 | is_empty_library_sees_archived_rows | An archived row in any workspace: false. | APP |
| C33 [MUST] | a_library_with_only_empty_workspaces_is_empty | Three empty workspaces (named or not), no Plays, no rows: true; settings and meta rows do not count. | APP |
| C34 [MUST] | check_copyable_refuses_a_library_with_work_in_another_workspace | `beta.library_not_empty`; `swap_in` refuses and removes the staged copy; nothing was replaced (the data-loss guard). | APP |
| C35 | welcome_does_not_show_for_a_library_with_work_elsewhere | `welcome().show` false when only another workspace has rows. | APP |

### 3d. The workspace switch
| id | name | setup and assertion | k |
|---|---|---|---|
| C38 [MUST] | workspace_switch_that_fails_rebuilding_search_leaves_the_old_workspace_bound | File-backed catalog, make the index directory unwritable (replace it with a regular file) then `workspace_switch(ws-B)`: returns `Err`; `current_workspace()` is still A; lists return A's rows; `workspace.current` global still A (reopen to confirm). [R8] | I |
| C39 [MUST] | a_successful_switch_writes_the_global_only_after_the_index | Order check: induce the failure at rebuild and confirm the global was never written; on success the index answers B's rows before `workspace.current` is read back. | I |
| C42 | the_app_command_does_not_emit_workspace_changed_on_failure | `workspace_switch` APP: on `Err`, no `workspace-changed` event and defaults untouched. | APP |
| C44 | asset_get_any_is_read_only_and_unscoped | `asset_get_any(aS)` from a workspace that does not own it returns the row; `asset_get` does not; there is no write counterpart; unknown id → `NotFound`. | I |
| C45 [MUST] | every_play_side_asset_read_uses_asset_get_any | Source sweep/list: the call sites named by [R11] (snapshot logo/media resolution, the command Studio/Stage call for a path) use it; a paused Play's pictures resolve after a workspace switch. | I |

---

## 4. Task 4 — App and contract (AP/tests, packages/contract)

| id | name | setup and assertion | k |
|---|---|---|---|
| A1 [MUST] | removed_commands_are_not_registered | `lib.rs`'s `generate_handler!` list has no `catalog_make_shared`/`catalog_make_local` (source sweep); `commands::workspace` has no such fn. | APP |
| A2 [MUST] | guard_lists_no_removed_command | `guard.rs` allow-list and the "only Studio may touch workspaces" test (`only_studio_may_touch_workspaces`) list neither; a call to either name from `main` is `guard.unknown_command`/refused. | APP |
| A3 [MUST] | stage_still_may_call_exactly_two_commands | `overlay_ack_complete`, `stage_ready` only (regression). | APP |
| A4 [MUST] | contract_command_list_has_no_make_shared_or_local | `packages/contract/src/commands.ts` and the **built `dist/commands.d.ts`/`index.d.ts`** contain neither name; `npm test -- contract` asserts the list. | V |
| A5 | contract_dist_is_rebuilt | A script test (or CI check) fails if `dist` differs from a fresh build. | V |
| A6 [MUST] | copy_and_preview_accept_with_domains | `catalog_copy_to` and `transfer_preview` deserialise `{"withDomains":false}`; absent ⇒ true; wrong type ⇒ a clean `invalid` error. | APP |
| A7 | transfer_preview_for_move_ignores_with_domains | Move with `withDomains` supplied: accepted and ignored. | APP |
| A8 | an_old_studio_payload_with_op_make_shared_gets_a_readable_refusal | `transfer_preview` with `"op":"make_shared"` returns a `host.invalid` error (not a panic, not a silent copy). | APP |
| A9 [MUST] | transferred_emits_changes_for_joined_domains | A copy that joined a domain emits `catalog-changed` for that domain in the target; after a copy the right kinds are announced once each. | APP |
| A10 | refuse_moving_the_loaded_game_unchanged | Loaded game cannot be moved/copied-over (existing); `with_domains` copy of questions of the loaded game's workspace allowed. | APP |
| A11 [MUST] | codemap_diff_is_exactly_the_removed_surface | `npm run map:check` clean after regenerating; the diff removes: two commands, `shared` on Stamps/BulkReport/TagCount, `TransferOp` variants, `make_*` event/guard entries; adds `withDomains`, `joined`, `previous`, `asset_get_any` (if a command). No other line changes. | V |
| A12 | clippy_and_the_app_wiring_test_pass | `lint:host`, `lint:app`, `host_wiring.rs` updated for the removed commands and the new arguments. | APP |

---

## 5. Task 5 — Studio drops sharing (S/pages/transfer.test.tsx, host/workspaces.test.ts, host/listSpecs.test.ts, pages/groups-tags.test.tsx, organisms/*)

| id | name | setup and assertion | k |
|---|---|---|---|
| S1 [MUST] | no_row_action_or_bulk_menu_offers_make_shared_or_local | Teams, Library (list, detail, bulk bar) and DomainPane: `queryByText(/make shared|make local/i)` null; the transfer menu's items are `Copy to…`, `Move to…` only (role `menuitem`). | V |
| S2 [MUST] | the_shared_chip_and_globe_icon_are_gone | No `MeaningChip meaning="shared"` renders (type error if used); `DomainPane` has no globe icon; the `shared` key is absent from `icons.ts` and `icons.generated.ts` (`npm run studio:icons` is clean). | V |
| S3 [MUST] | the_list_toolbars_offer_no_where_filter_or_grouping | Teams and Library toolbars: no control labelled "Where"; the group-by options exclude it; `listSpecs` exports no `whereFilter`/`whereGroup`. | V |
| S4 | stored_view_prefs_with_a_where_filter_load_with_defaults | A stored list preference holding `where` or `groupBy: 'where'` loads without throwing and falls back to the default. | V |
| S5 [MUST] | the_copy_dialog_brings_domains_by_default_and_the_preview_names_them | Selection with a question: a `switch` role "Bring their domains" (`TRANSFER.withDomains`) checked; the preview lists "Joins: History" and "Creates: Science" by name. | V |
| S6 [MUST] | the_switch_is_hidden_when_no_question_is_selected | Teams-only, domains-only and games-only selections show no switch; the command is called with `withDomains` omitted or true. | V |
| S7 [MUST] | turning_it_off_says_the_question_arrives_in_no_domain | Toggle off: the preview re-runs (`transfer_preview` called with `withDomains: false`); text states "in no domain"; `catalog_copy_to` gets `withDomains: false`. | V |
| S8 | the_switch_resets_for_each_open | Close and reopen the dialog: on again. | V |
| S9 | preview_error_and_refusal_states_are_unchanged | A refused move offers *Copy instead*; the confirm is disabled while previewing; double-click does not submit twice. | V |
| S10 | the_copy_dialog_names_the_joined_domains_not_ids | Names come from the report/`workspaceName`, never `dom-xxxx`. | V |
| S11 [MUST] | the_fake_host_lands_every_row_in_the_current_workspace | Fake `catalog_upsert` stamps the current workspace for every kind; no seed has `shared: true`; `Stamps` type has no `shared`. | V |
| S12 [MUST] | the_fake_hosts_transfer_mirrors_task_3 | The fake's copy with domains: C1 (1 member, not all), C3 (joins at the end, no group), C6 (off), C7, C10, and `joined` in its report; same reports for the same inputs as the host tests (table of input → expected report shared as a JSON scenario). | V |
| S13 | the_fake_refuses_what_the_host_refuses | Move of a question used by a staying domain: refusal names it; `catalog_make_*` are unknown commands in the fake (`command('catalog_make_shared')` rejects). | V |
| S14 [MUST] | the_bulk_confirms_have_no_shared_sentence | `useBulkEdit`: the "n are shared, the change reaches every workspace" line is gone for Tag, Untag, Set difficulty, Add/Remove from domain; the confirm text for 0 and for n rows is otherwise unchanged. | V |
| S15 | the_bulk_result_toast_ignores_a_shared_key | A host answer carrying a stale `shared` count (old fake) renders the normal toast. | V |
| S16 [MUST] | manage_tags_has_no_shared_reach_or_rename_elsewhere | `ManageTagsDialog`: no "n shared, changes every workspace" text; rename/delete confirms show only the count; `GROUPS_TAGS.sharedReach`/`sharedDomainReach`/`renameElsewhere` are not exported (type check). | V |
| S17 | remove_from_domain_confirm_has_no_shared_domain_line | Wording per ruling 11 of the groups/tags list is dropped. | V |
| S18 [MUST] | copy_keys_removed | `TRANSFER.whereShared`, `makeShared`, `makeLocal`, `sharedTitle`, `localTitle`, `confirmShared`, `confirmLocal`, `where`, `whereLocal` are gone from `copy/workspaces.ts`; `grep -ri "shared library\|make shared\|make local\|shared with every"` over `apps/studio/src` (excluding `whatsNew.ts` and tests that assert absence) is empty. | V |
| S19 | whats_new_2_0_0_beta_2_has_en_and_ro | Entry exists in both locales, mentions "no shared library", "a copy in each workspace, linked", and *Copy to* bringing domains; operator words (no "migration 6"); `whatsNew.test.ts` passes. | V |
| S20 | workspace_manager_text_has_no_shared_library | Manage workspaces / Workspaces page copy is free of "shared". | V |
| S21 | list_view_columns_and_counts_have_no_shared | Teams/Library rows: no "Shared" cell/column/count, counts equal list length. | V |
| S22 | propagating_save_dialog_names_workspaces_not_shared | `usePropagatingSave`: copies listed by workspace name; no "shared" row ("the shared library") when `FamilyCopy.workspace` is always a name. | V |
| S23 | question_editor_has_no_shared_note | The editor shows no "this question is shared" banner and does not disable domain add for it. | V |
| S24 | add_to_domain_dialog_has_no_shared_refusal_branch | The refusal naming local questions for shared domains is gone; adding local questions to any local domain works in the fake. | V |
| S25 | the_dist_bundle_has_no_removed_strings | After a Studio build, `dist/studio` contains none of the removed copy strings (cheap grep in the build test). | V |

---

## 6. Task 6 — Workspace switching is clean (S/pages/*.test.tsx, S/host/queries tests, S/chrome/*.test.ts, AP/)

| id | name | setup and assertion | k |
|---|---|---|---|
| W1 [MUST] | screens_resets_its_picked_game_when_the_workspace_changes | Fake host with two workspaces and different games; Screens picks `g-A2` in A; `workspace-changed` to B: the picker shows B's first game (or placeholder if none), never `g-A2`; the layout editor remounts (key changes) and shows B's canvas. Fails first (bug). | V |
| W2 | screens_with_no_games_in_the_new_workspace_shows_the_empty_state | After the switch, `EmptyState what="games"`; no stale `recipeId` query fires (no `recipe_get` for A's id after the switch). | V |
| W3 [MUST] | all_data_statistics_drops_its_filters_on_a_switch | Set a game filter and a date filter in A, switch to B: filter controls are at defaults, the table shows B's Plays, no request is sent with A's game id. | V |
| W4 [MUST] | live_statistics_remounts_on_a_switch | `LiveStats` keyed on the workspace id: component state (selected Play/range) resets; a `play-state` from the previous workspace is not drawn after the switch. | V |
| W5 | statistics_header_still_all_workspaces_toggle_survives | The *All workspaces* switch is kept per spec (Non-goal) — either reset to off with the filters or kept; pin it [R15]. | V |
| W6 [MUST] | the_stats_window_resets_on_the_first_workspace_switch | Stats window mounted with an empty `keys.workspaces` cache (it never saw a previous id): receiving `workspace-changed` with `previous = A, current = B` resets every `WORKSPACE_SCOPED` query; fails first. | V |
| W7 [MUST] | receive_workspaces_resets_when_previous_differs_or_cache_is_empty | Table: (cache A, next B) reset; (cache B, next B) no reset; (empty cache, previous A, next B) reset; (empty cache, previous null, next B) reset (first event with no knowledge: reset anyway or skip? pin [R15]); (cache A, previous B, next B) → trust the cache or `previous`? pin. | V |
| W8 [MUST] | workspace_changed_payload_carries_previous | `emit.rs`/`workspace.rs`: payload has `previous: string \| null`; first-ever event after boot has `previous = null`; a switch has the old id; a rename/archive/group change emits `previous == current`. Serde shape camelCase test; the TS `Workspaces` type matches. | APP |
| W9 | the_stats_window_gets_the_event_even_when_main_is_closed | `emit_to(STATS, …)` still fires; no panic if the window is absent. | APP |
| W10 [MUST] | the_stats_window_title_names_the_workspace | On create and on every switch the window title is `questiongame Statistics — <workspace name>`; an unnamed workspace is not given a made-up name; `windows.rs` unit test on the title function. | APP |
| W11 | the_title_follows_a_rename | `workspace_rename` of the current workspace retitles the stats window. | APP |
| W12 [MUST] | back_after_a_switch_does_not_land_in_the_old_workspace | Navigate Teams → Library(domain d-A) → Workspaces; switch to B; `back` is empty and `forward` is empty; `goBack()` returns false; the route is not a row of A. `clearHistory()` exists on the store. | V |
| W13 | the_current_route_with_a_row_id_is_reset_on_a_switch | If the route when the switch lands names a row of the old workspace (`{tab:'library', questionId}`, `{tab:'games', id}`, `{tab:'teams', id}`) it is replaced by the tab root. (A switch normally happens on the Workspaces tab; the stats window case and a host-initiated switch do not.) [R15] | V |
| W14 | a_dirty_editor_guard_is_not_bypassed_by_clear_history | Clearing history leaves the guard in place; a switch with a dirty editor is still asked. | V |
| W15 [MUST] | a_board_notice_of_the_old_workspace_is_dismissed_on_a_switch | A notice with `target_path` `recipe/g-A1/board` (or `team/…`, `domain/…`, `question/…`) raised in A is gone after the switch to B; the notice store's stack count drops; `dropForWorkspace()` called by `receiveWorkspaces`. | V |
| W16 [MUST] | notices_about_the_app_or_the_new_workspace_survive | A health notice (`monitors`, `update`), a notice whose path names no row, and one raised after the switch are kept. [R16] | V |
| W17 | a_notice_raised_late_for_the_old_workspace_is_not_shown | A `notice` event for a row of A arriving after the switch is dropped (needs the workspace id in the notice or an id→workspace lookup). [R16] | V |
| W18 [MUST] | workspace_scoped_queries_are_all_reset | Spy `resetQueries`: each of `catalog.all`, `search`, `recipes.all`, `settings`, `seedStatus.all`, `import-preview`, `plays`, `stats`, `rulesPreview` is reset; add `tags`/`groups`/`family` keys if the groups/tags work added any (a test that lists all `keys.*` and fails on an unclassified one). | V |
| W19 | the_import_preview_of_the_old_workspace_is_dropped | An import preview computed in A is not shown after a switch. | V |
| W20 | library_and_game_selections_are_cleared_on_a_switch | Selected ids in a list (Zustand chrome store) and an open detail panel from A do not leak into B. | V |
| W21 | the_switcher_reason_is_unchanged | While a game is loaded the switcher stays disabled with its reason. | V |
| W22 | switching_back_to_the_first_workspace_restores_a_clean_state | A → B → A: no filter, no Back entries, the stats window shows A. | V |

---

## 7. Task 7 — e2e, docs, What's new

Docs checks are mechanical (`D`), run in `npm test` as a sweep test where noted.

| id | name | setup and assertion | k |
|---|---|---|---|
| E1 [MUST] | upgrade_shared_a_beta1_library_opens_and_both_workspaces_show_their_rows | `e2e_library --beta1-shared` writes a v5 file (head library → `write_older_schema(.., 5)` → `share_for_test` on a shared team, a shared domain with groups, 3 shared questions, a shared asset; two workspaces `Club A` (older) and `Club B`, each with a game on the shared rows). First boot: What's new for `2.0.0-beta.2` is shown (EN); Teams, Library and Games tabs in `Club A` list the shared rows; switch to `Club B` (Workspaces tab): the same rows are listed; both games Load without a refusal. | E2E |
| E2 [MUST] | upgrade_shared_the_backup_exists_and_is_at_schema_5 | After E1, the backups folder holds a `.sqlite3` copy; opened read-only it has `user_version 5` and NULL `workspace_id` rows. | E2E |
| E3 [MUST] | upgrade_shared_an_edit_still_offers_also_update_copies | In `Club B`, edit the shared-derived question's text, Save: the *Also update copies* dialog names `Club A`; confirming, `Club A` shows the new text. *Stop following copies* then cuts it (a further edit does not offer it). | E2E |
| E4 | upgrade_shared_the_tags_are_one_spelling_per_workspace | In each workspace the Tag filter lists one spelling of the clashing tag (seed `Rome`/`ROME`). | E2E |
| E5 | upgrade_shared_groups_survive_in_both_workspaces | Open the domain in both workspaces: its groups and headers present. | E2E |
| E6 [MUST] | upgrade_shared_a_paused_play_resumes_with_its_pictures | `P2` paused in `Club B` (seed) resumes on relaunch: Stage shows the team name and the logo `<img>` has a loaded `src` (naturalWidth > 0). | E2E |
| E7 | upgrade_shared_the_broken_board_is_still_broken | The seeded broken game in `Club B` refuses at Load with the same reason; the others Load. | E2E |
| E8 [MUST] | workspaces_spec_uses_copy_and_move_only | `workspaces.e2e.ts` rewritten: names a workspace, creates a second, copies a question *with its domain* to it (one question from a larger domain → the target domain has one), moves a team (refusal naming a staying user, then *Copy instead*), edits with *Also update copies*; no "shared" step. | E2E |
| E9 | the_demo_restores_in_a_second_workspace | Create `Club B`, *Restore sample game* in both: each has one Demo; move one Demo out and restore again — no refusal. | E2E |
| E10 | a_workspace_switch_leaves_nothing_behind | Statistics filter + Screens game picked in A, Back-button history, a board notice; switch to B: filters default, Screens shows B's game, Back disabled, notice gone; the separate Statistics window title names B and shows B's Plays. | E2E |
| E11 [MUST] | the_empty_library_guard_with_work_in_a_second_workspace | A Beta library whose only content is in a second workspace is not offered *Copy from stable* (Beta welcome absent / refusal `beta.library_not_empty`). | E2E |
| E12 | docs_and_codemap_sweep | A sweep test: `docs/v1/03_CONTEXT.md` has no "shared library" outside a "removed" note; `docs/as-built/host.md` has the "Shared library removed (beta.2)" entry with migration 6; the two superseded specs start with the dated note; `docs/v1/04_ROADMAP.md` lists P16 = beta.2; `docs/as-built/history.md` has the entry; `codemap.yaml` carries no `catalog_make_*`. | D |

---

## 8. Task 8 — Reviews: the Review Focus pinned to tests

| Review Focus | Tests |
|---|---|
| 1. Shared row on both workspaces' boards, one board already broken | U56, U57, U34, U35, U81, E7 |
| 2. Shared row already copied into a second workspace, then edited | U26, U27, U28, U29, U30, U81, U82 |
| 3. Paused Play in a non-oldest workspace with media/logo | U64, U65, U67, C44, C45, E6 |
| 4. Switch on Statistics, Screens, stats window, Back | W1–W8, W10, W12, W15, E10 |
| 5. Copy to… of one question from a 300-question domain | C1, C2, C3, C14, S5, S12, E8 |
| Anti-goal: something a tester had is gone | U24, U16, U21, U23, U81, E1 |
| Anti-goal: library written before backup | U5, U75, E2 |
| Anti-goal: Plays/Statistics history rewritten | U64, U68, U69 |

Every review-fix commit adds a test that fails first (the plan's rule); keep ids `R<n>-…` for those.

---

## Rulings needed

Places where the design or plan is ambiguous. My recommendation is in bold; the tests above are written against it.

1. **R1 — the owner when the oldest workspace already holds a family member.** The spec gives the original to the oldest active workspace unconditionally, which can leave two family members there (a visible twin, what the maintainer complained about) while promising "no twin". **Recommend: the original goes to the oldest active workspace that holds no member of its family; if every active workspace has one, to the oldest active one, and the pre-existing member stays beside it (beta.1 showed both there already).**
2. **R2 — reuse and archive state.** `store::family_member_in` finds active rows only. A reused archived member would hide an active shared row in that workspace; a reused active member would hide the archived shared row. **Recommend: reuse only a member with the same archive state; otherwise make a copy.** (So the guarantee is "at most one *active* member per family per workspace created", not "at most one row".)
3. **R3 — reuse that would collapse two entries.** If a workspace's domain, roster, board or overlay set holds both the shared row and its own family member, remapping onto the member breaks the primary key (and changes the board). **Recommend: in that workspace make a fresh copy of the shared row instead of reusing.**
4. **R4 — reuse guard for boards.** "Drifted body can break a board" contradicts the anti-goal that a game that loaded must still load, and domain *membership* drift (a family copy lacking a question the board needs) is not a body edit at all. **Recommend: reuse only if `board_problem` of every game in that workspace that used the shared row is the same with the member as before; otherwise make a copy.** U56 then holds without exceptions.
5. **R5 — Demo ids.** Recognition of a Demo is by `seed-<ws>-…` id. Copies made by migration 6 and by `workspace_duplicate` get fresh ids, so *Restore sample game* would build a second Demo; and `demo_here` rebuilds the same scoped ids when a non-first workspace's Demo moved (a `WrongWorkspace` collision). **Recommend: migration 6 and duplicate give a copied `seed-` row the target workspace's scoped seed id (`seed-<ws>-…`); a moved Demo's replacement takes a generation suffix (`seed-<ws>-r2-…`, first free); `Copy to` keeps fresh ids (it is a deliberate second copy).**
6. **R6 — what the migration may touch.** **Recommend: it never bumps `rev` or `updated_at` of games or rows whose references it remaps, never rewrites `created_at`/`updated_at` of copies (they equal the original's), and copies take the original's `origin`.** Otherwise "earliest-created spelling wins" is not deterministic.
7. **R7 — re-spelling scope.** The spec says "each workspace re-spells within itself". **Recommend: every workspace, including ones that gained no rows (idempotent), with ties on `created_at` going to the lower id.**
8. **R8 — forcing failures in tests.** The plan says "a test hook" for U14 and none for the switch rollback. **Recommend: no production hook. U75 pre-creates a trigger with the step's own trigger name in the v5 file so the last statement fails; C38 swaps the index directory for a regular file.**
9. **R9 — Move into a workspace that already holds a family member.** Today it creates two members in one workspace. **Recommend: allow it (a move is not a merge) and cover it by H19; do not add a merge rule in beta.2.**
10. **R10 — Copy with domains edge cases.** **Recommend: only the picked questions' *active* source domains are brought; an archived source domain is ignored; an archived target family copy is not joined (a new domain row is made); a group with no picked member is not copied; `with_domains` applies to picked questions only (games and teams unaffected).**
11. **R11 — where `asset_get_any` is used.** The plan says "every Play-side asset read" without naming the call sites. **Recommend: list them in the plan (the snapshot/Play-state logo and media resolution, and whatever command or `convertFileSrc` path Studio/Stage use to turn an asset id into a file) and have C45 assert exactly that list.**
12. **R12 — table name.** The plan says `play_events`; the schema table is `events` (and `plays`). U64 compares both. Correct the plan text.
13. **R13 — overlay `patch_json` asset ids in copy, move and duplicate.** `transfer::copy` and `duplicate_into` remap overlay *keys* but not asset ids inside `patch_json` (a team overlay's `logo_asset_id`), an existing gap that migration 6 must not repeat. **Recommend: fix both in beta.2 (H31 asserts it); if deferred to beta.3, say so in the plan.**
14. **R14 — "oldest".** The plan says lowest `created_at`, then id; `opening_workspace` orders by `sort_key`. And a library with no active workspace: **recommend `created_at`, then id (as the plan), and fall back to the oldest workspace of any state if none is active.**
15. **R15 — switching details.** (a) Does Statistics' *All workspaces* switch reset on a workspace switch (recommend: yes, with the other filters). (b) `receiveWorkspaces` when the cache is empty and `previous` is null: **reset** (cheap, safe). (c) Does a route naming a row of the old workspace get replaced (recommend: yes, defensively, to the tab root).
16. **R16 — notices.** "Notices keyed to a row of the workspace left" needs a way to know which workspace a row belongs to. **Recommend: the host adds the workspace id to row-targeted notices; Studio drops any notice whose workspace id is not the current one on a switch, and ignores late ones.** Health and app notices carry none and are kept.
17. **R17 — stats window title.** It is created in Rust (`"questiongame Statistics"`). **Recommend: the app retitles it on every `workspace-changed` (and on rename of the current workspace) with the workspace name, or leaves the plain title when the workspace is unnamed.**
18. **R18 — team Plays counts and Statistics rows.** The original `tS` keeps the counts of every Play that named its id; copies start at 0; other workspaces' old Plays label by snapshot name (spec). **Recommend: accept, and say in What's new only if the maintainer's testers will notice (their Statistics → Teams page).**
19. **R19 — writes with no bound workspace.** With `land()` gone, an upsert on a connection with an empty `temp.current_ws` inserts NULL and the trigger refuses it. **Recommend: that is the intended failure; add U73 so it is a tested contract, and make `bind_workspace` failure at open fatal.**
20. **R20 — wire leftovers.** `TransferReport.unchanged` (existed for shared picks), `Refusal`, `FamilyCopy.workspace: Option` and `workspaceName: Option`. **Recommend: remove `unchanged`, make `workspace` required, and keep `refused` as is; Studio ignores unknown keys so old payloads still parse.**

## Rulings (decided, 2026-10-21)

The recommendation stands except where a change is noted.

- **R1** Accepted. The original goes to the oldest active workspace that holds no member of its family. If every active workspace holds one, it goes to the oldest active, and the existing member stays beside it.
- **R2** Accepted. A member is reused only if its archive state matches.
- **R3** Accepted. If reuse would put two entries in one container (domain, roster, board or overlay set), that workspace gets a fresh copy.
- **R4** Changed: a simpler rule with the same guarantee.
  - Teams and assets are reused under R2/R3.
  - A question is reused only if its difficulty and its options (count and correct marks) equal the shared row's.
  - A domain is reused only if no game in that workspace boards the shared domain.
  - Anything else gets a fresh copy. So a game that loaded still loads.
- **R5** Accepted.
  - Migration 6 and *Duplicate workspace* give a copied `seed-` row the target workspace's scoped seed id when it is free.
  - When a workspace's own seed ids are taken elsewhere, its Demo takes the first free generation (`seed-<ws>-r2-…`).
  - *Copy to* keeps fresh ids.
- **R6, R7, R8, R9, R10** Accepted.
- **R11** Changed: nothing resolves a Play's assets by id today. The snapshot carries the ids and no read of them exists (Studio writes no assets), so `asset_get_any` is not added (no port without a caller). It comes with the first asset read.
- **R12** Accepted: the table is `events`.
- **R13** Accepted: fixed in beta.2 for copy, move and duplicate.
- **R14** Accepted.
- **R15** Accepted: (a) yes, (b) reset, (c) yes.
- **R16** Changed: no host change. On a switch Studio drops every notice whose target path names a row (recipe, team, domain, question). Health and app notices stay.
- **R17, R18, R19, R20** Accepted.

## Review rulings (Opus and Sonnet, 2026-10-21)

- **Opus #8, stands:** copying the same question twice with *Bring their domains* adds two members to the target domain. A picked row is always copied new, by the rule copy has had since P14. The second copy is a deliberate second copy, the same as copying a domain twice.
- **Sonnet #7, partly:** the Statistics window still resets its queries on its first `workspace-changed`, because it cannot know the previous workspace. It no longer remounts and loses its filters for it: `useWorkspaceGeneration` counts moves, and learning the first workspace is not a move.
- **Sonnet #9, the Demo in Second:** a workspace made by name holds no Demo, so "New there: Geography" is what the host says. Confirmed on the real run.
