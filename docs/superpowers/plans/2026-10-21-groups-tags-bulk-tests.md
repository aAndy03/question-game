# Groups, tags, bulk edits — test list (Sonnet 5.5) and rulings

Plan: `2026-10-21-groups-tags-bulk.md` · Spec: `../specs/2026-10-21-groups-tags-bulk-design.md`. Sonnet 5.5 proposed the list below; the build implements it under these ids (files may be merged where one reads better).

## Rulings on the flags (the builder's calls)

1. **Group… on a row not in the domain** is skipped and counted, never refused.
2. **A zero-effect request** (Untag a tag nobody in the selection carries, rename or delete a tag no question carries) is a no-op reporting 0, not an error.
3. **Add to domain…** lists active domains in view, not the one the list is inside.
4. **Group by tag with a Tag filter** shows each question under all its tags; untagged questions go under *No tag*, last. The list shows only groups that have rows, as every grouping does; an empty group is managed in the Groups dialog.
5. **Import onto an existing question** treats `tags` like the rest of the row (it replaces them); memberships and groups are untouched by an import.
6. **Folding** is Rust `str::to_lowercase` into a `tag_key` column — never SQLite `NOCASE`. Inner whitespace is kept; no Unicode normalisation form beyond that.
7. **The spelling** a new tag takes is the one on the earliest-created question in view that carries it; the *Manage tags* list shows `MIN(tag)` per key.
8. **A bulk edit of a shared question** can break a board in another workspace; it is found at Load, as a one-by-one edit is. Documented in `host.md`.
9. **The cap lives in the one store path every question write takes** (`question_upsert` → `clean_tags`), so import, propagation, transfers and bulk edits all hit it.
10. **The search index** is rebuilt after every bulk edit and tag rename/delete (it is a projection, rebuilt at open too).
11. **Remove from domain on a shared domain**: the confirm says the domain is shared and the change reaches every workspace.
12. **Fake parity**: key rules are replayed against the fake in vitest (F1–F3, F5–F7); no shared scenario script (F13 dropped).
13. **Wording**: Studio says *domain group* where *group* could be confused; no grep test.
14. **No undo**, as designed; the confirms carry the counts.

---

## The list


Kinds: U unit, I integration, P property, E e2e.
File shorthands:
- `H/…` = `crates/host/tests/…`
- `S/…` = `apps/studio/src/…`
- `E/…` = `e2e/specs/…`
- New files proposed: `H/groups_tags.rs`, `H/bulk_edit.rs`, `E/groups-tags.e2e.ts`.
- Fixture "ws" = a CatalogService with 2 workspaces (A current, B), as `two()` in workspaces.rs.

## 1. Migration 5 (H/upgrade.rs)
| id | name | setup and assertion | k |
|---|---|---|---|
| M1 [MUST] | head_user_version_is_5 | Fresh open: `user_version == 5`; tables `domain_groups`, `question_tags` and column `domain_questions.group_id` exist. | I |
| M2 [MUST] | upgrade_from_4_keeps_every_row_and_adds_none | Use `write_older_schema(4)` on a head library with domains, questions and memberships. After open: row counts and `sort_key` are identical, `domain_groups` and `question_tags` are empty, every `group_id` is NULL. | I |
| M3 [MUST] | migration_5_is_backed_up_first | A file at v4 gets a rotated `.sqlite3` copy with `user_version == 4` before the step runs (P12.6). It is not the pinned pre-workspaces copy. | I |
| M4 | upgrade_from_1_0_2_runs_4_then_5 | A 1.0.2-shaped file ends at 5 with workspaces and groups tables both present. | I |
| M5 | migration_5_idempotent_at_head | Reopening a v5 file takes no backup and changes nothing. | I |
| M6 | newer_than_known_still_refused | `user_version = 6` is refused as before (existing test updated to the new head). | I |
| M7 | group_delete_set_null_fk | With `PRAGMA foreign_keys` on, deleting a `domain_groups` row sets `group_id` NULL in memberships and leaves the membership rows. | I |
| M8 | domain_delete_cascades_groups | Hard-deleting a domain row removes its groups. Deleting a question removes its tags. | I |
| M9 | search_index_needs_no_step | Tags are written directly into a v5 file and the index is rebuilt at open. A search by that tag hits. | I |

## 2. Groups: CRUD, names, membership (H/groups_tags.rs)
| id | name | setup and assertion | k |
|---|---|---|---|
| G1 [MUST] | create_group_in_domain | Create "Romans" in D1. `groups(D1) == ["Romans"]` with a non-empty id. | I |
| G2 [MUST] | name_trimmed_and_nonempty | `"  Romans "` is stored as `"Romans"`. `""` and `"   "` are refused. | I |
| G3 | name_max_60 | A 60-character name is accepted. A 61-character name is refused. | I |
| G4 [MUST] | name_unique_within_domain_ignoring_case | "Romans" and then "romans" in D1 are refused with a name-taken error. | I |
| G5 | same_name_in_other_domain_ok | "Romans" in D1 and D2 both succeed. | I |
| G6 | rename_to_own_name_different_case_ok | Renaming "Romans" to "ROMANS" succeeds and shows the new spelling. | I |
| G7 | rename_to_sibling_refused | Renaming B to a name equal to A (any case) is refused. | I |
| G8 | rename_unknown_group_notfound | An unknown group id gives NotFound. | I |
| G9 | groups_ordered_by_sort_key_new_goes_last | Create A, B, C. Order is A, B, C. | I |
| G10 | reorder_move_up_down | Move C up gives A, C, B. Moving the first group up is a no-op, not an error. | I |
| G11 | reorder_full_permutation_validated | Reordering with a missing or foreign id is refused. The order is unchanged. | I |
| G12 [MUST] | delete_group_ungroups_members_keeps_them | Q1 and Q2 are in "Romans". After delete, both are still in the domain, `group_id` is NULL, and the sort order is unchanged. | I |
| G13 | delete_group_does_not_touch_other_domains | Q1 in D1 (group G) and D2 (group H). Deleting G leaves Q1's group in D2 as H. | I |
| G14 | no_archive_for_groups | `CatalogKind` has no group variant. Archive scopes list no groups. | U |
| G15 [MUST] | membership_group_set_and_read | Set Q1's group in D1. The domain read returns the member's `groupId`. | I |
| G16 [MUST] | one_group_per_domain_per_question | Assigning Q1 to B after A in D1 moves it. Q1 is in B only. | I |
| G17 | group_must_belong_to_the_domain | Assigning Q1 in D1 to a group of D2 is refused. | I |
| G18 | assign_requires_membership | Setting a group for a question not in the domain is refused. | I |
| G19 | question_in_two_domains_has_group_per_domain | Q1 gets A in D1 and X in D2, and each is read independently. | I |
| G20 | archived_domain_keeps_groups | Archive D1. Its groups are listable on read and survive restore. | I |
| G21 | archived_question_keeps_group | Archive then restore Q1. Its group in D1 is unchanged. | I |
| G22 | groups_scoped_to_view | Groups of a local domain in B are NotFound/WrongWorkspace from A (the existing rule). Groups of a shared domain are visible from both. | I |
| G23 | group_name_unique_check_sees_only_its_domain_across_ws | The same name on the same-named domain in workspace B does not collide. | I |
| G24 | create_group_in_shared_domain_is_shared | A group created on a shared domain from A is visible from B. | I |
| G25 | catalog_changed_emitted_on_group_write | Create, rename, reorder and delete each announce `catalog-changed` for domains once. | I |

## 3. Membership survival on every rewrite
| id | name | setup and assertion | k |
|---|---|---|---|
| S1 [MUST] | domain_upsert_keeps_each_members_group | Q1 in group A, Q2 in group B, Q3 ungrouped. Upsert the domain with the same member list (as the domain editor does). Groups are unchanged. | I |
| S2 [MUST] | domain_upsert_reorder_keeps_groups | Same members in a new order: sort_keys change and groups stay. | I |
| S3 [MUST] | domain_upsert_drop_member_drops_its_group_only | Remove Q2 from the member list. Q2 is gone and Q1 and Q3 keep theirs. Re-adding Q2 gives No group. | I |
| S4 | domain_upsert_add_member_starts_ungrouped | A new member has `group_id` NULL. | I |
| S5 [MUST] | question_save_adding_other_domain_leaves_existing_group | Q1 in D1/A. The editor adds Q1 to D2 (D2 upsert only). Q1's group in D1 is still A. | I |
| S6 [MUST] | question_save_removing_other_domain_leaves_group | Q1 in D1/A and D2. Remove it from D2. D1/A is unchanged. | I |
| S7 | question_save_alone_keeps_memberships_and_groups | `upsert` of the question body only. No membership or group change. | I |
| S8 | leaving_then_readding_via_add_to_domain_starts_no_group | Remove Q1 from D1 and add it again via bulk. Its group is NULL. | I |
| S9 [MUST] | archive_restore_domain_roundtrip_keeps_groups | Archive and restore D1. All member groups are intact. | I |
| S10 | recipe_overlay_and_play_load_ignore_groups | Load a game whose domain has groups. The snapshot is byte-identical to one built from a library without groups, so a Play never sees them. | I |
| S11 [MUST] | P_membership_rewrites_preserve_groups | Proptest: random sequence of domain upserts, question saves, bulk add/remove, archive/restore across 3 domains. Invariant: a (domain, question) pair that was never removed keeps its group. A group's `domain_id` always equals the membership's `domain_id`. | P |
| S12 | P_one_group_invariant | Random assigns: at most one group per (domain, question). | P |

## 4. Tags: rules, folding, cap, search
| id | name | setup and assertion | k |
|---|---|---|---|
| T1 [MUST] | tags_trimmed_1_to_40 | `" Rome "` is stored as `"Rome"`. `""`, `"  "` and a 41-character tag are refused. A 40-character tag is accepted. | U |
| T2 [MUST] | case_folded_first_spelling_kept | Q1 has "Christmas". Saving Q2 with "christmas" stores "Christmas" on Q2. | I |
| T3 | duplicate_within_one_question_collapses | `["a","A","a "]` leaves 1 tag. | U |
| T4 | position_preserves_input_order | `["b","a"]` reads back as `["b","a"]`. | I |
| T5 [MUST] | cap_20_accepts_20_refuses_21 | The editor save with 21 distinct tags is refused (not trimmed). 20 is accepted. | I |
| T6 | cap_counts_after_folding | 21 inputs that fold to 20 distinct tags are accepted. | U |
| T7 | non_ascii_folding | "Ștefan" and "ștefan", and "ÉCOLE" and "école", fold together (Unicode lowercase). | U |
| T8 | whitespace_inside_preserved | "Round  2" keeps its inner spacing (decide: collapse or keep, and assert it). | U |
| T9 [MUST] | tags_part_of_body_roundtrip | Question upsert and read returns `tags`. The wire shape is camelCase `tags: string[]`. An old payload without `tags` deserialises to `[]`. | U |
| T10 | tag_list_is_distinct_in_view | `catalog_tags()` returns the distinct tags of A ∪ shared with counts. B-local tags are absent. | I |
| T11 | tag_list_includes_archived_questions | An archived question's tag is listed. | I |
| T12 | tag_list_uses_first_spelling_across_questions | The list shows one entry and its count. | I |
| T13 [MUST] | search_finds_question_by_tag | Q1 text has no "xmas" but a tag "xmas". `catalog_search("xmas")` returns Q1. | I |
| T14 | search_tag_case_insensitive | The query "CHRISTMAS" hits tag "Christmas". | I |
| T15 | search_after_tag_edit_reindexed | After remove or rename, the old tag stops matching and the new one matches. | I |
| T16 | search_scope_honours_workspace | A tag on a B-local question is not found from A. | I |
| T17 | tags_not_in_snapshot_or_stage | Neither `PlaySnapshot` nor `PlayStateForStage` serialisation contains "tags". | I |
| T18 | import_file_tags_cleaned | An import row `tags: [" a ","A","b"]` stores `["a","b"]`. A missing key gives `[]`. | I |
| T19 | import_tags_over_cap_row_refused_or_reported | A row with 21 tags appears in the report as refused, not trimmed. The preview and the commit agree (planner run twice). | I |
| T20 | import_tags_wrong_type_reported | `tags: "a"` is a row error, with the other rows unaffected. | I |
| T21 | import_tag_matches_existing_spelling | Importing "christmas" onto a library holding "Christmas" stores "Christmas". | I |
| T22 | import_update_of_existing_question_replaces_or_merges_tags | Pin the intended behaviour (underspecified, see Flags). | I |
| T23 | no_export_carries_tags_nor_groups | Verify there is no export surface. A grep-test of codemap for a tags export command fails if one appears. | U |
| T24 | P_tag_normalisation_idempotent | normalise(normalise(x)) == normalise(x), and any list yields at most 20 distinct, case-unique tags. | P |

## 5. Manage tags (H/groups_tags.rs)
| id | name | setup and assertion | k |
|---|---|---|---|
| MT1 [MUST] | rename_tag_across_all_questions_in_view | 3 questions carry "Rome" (2 local, 1 shared). Rename to "Romans". All three carry it and none carries "Rome". | I |
| MT2 [MUST] | rename_to_existing_merges_and_leaves_one | Q1 has [a,b], Q2 has [a]. Rename a to B. Q1 is [B] only, Q2 is [B], with the first spelling "b" kept (existing wins). | I |
| MT3 [MUST] | rename_refused_whole_when_merge_exceeds_cap | Q1 has 20 tags including a, and none is b. Rename a to a new tag is fine. Merging so that some question gets a 21st is refused, naming how many questions. No row is changed. | I |
| MT4 | rename_case_only_change | Renaming "rome" to "Rome" re-spells it everywhere (not read as a merge). | I |
| MT5 | rename_to_invalid_name_refused | Empty or over 40 characters is refused. | I |
| MT6 [MUST] | delete_tag_from_every_question | The tag is gone from all questions in view, other tags and their order are kept, and positions stay compact. | I |
| MT7 | manage_ops_touch_only_questions_in_view | The tag also exists on a B-local question. After rename in A, B's question is untouched. | I |
| MT8 [MUST] | manage_preview_counts_total_and_shared | `tag_usage("Rome")` returns `{total: 3, shared: 1}`. The same figures are what the confirm shows and match the rows actually changed (returned in the result). | I |
| MT9 | manage_includes_archived_questions | The counts and the changes include archived questions. | I |
| MT10 | manage_atomic_on_failure | Inject a failure on the second question (a closed-DB test seam or a trigger). The first is not changed. | I |
| MT11 | manage_emits_catalog_changed_once | Exactly one question `catalog-changed`. | I |
| MT12 | rename_unknown_tag_notfound_or_noop | Pin it: zero-count rename returns count 0, not an error (see Flags). | I |
| MT13 | shared_question_tag_change_visible_in_other_workspace | Rename on a shared question, then switch to B: B sees the new tag. | I |
| MT14 | rename_bumps_updated_at_and_search | The rows' `updated_at` is bumped and the index is updated. | I |

## 6. Bulk edits (H/bulk_edit.rs; one result shape `{applied, skipped:[{reason,count}], …}`)
Common
| id | name | setup and assertion | k |
|---|---|---|---|
| B0 [MUST] | bulk_one_transaction_failure_leaves_nothing | For each op, one bad id in the selection (a B-local one: WrongWorkspace) leaves every other row unchanged. A table-driven test over all six ops. | I |
| B1 | bulk_empty_selection_refused | Empty `ids` is refused. | I |
| B2 | bulk_duplicate_ids_deduped | `[q1,q1]` counts once. | I |
| B3 | bulk_unknown_id_notfound_whole | Refused whole. | I |
| B4 | bulk_result_counts_add_up | `applied + Σskipped == |ids|`, checked on random selections for all ops. | P |
| B5 | bulk_emits_catalog_changed_once_per_kind | One question event, plus one domain event for the membership ops. | I |
| B6 [MUST] | bulk_does_not_update_copies | Q1 and its copy Q1' are in a family (workspace B). A bulk tag, untag and set-difficulty leaves Q1' unchanged. The family `propagate` is never invoked. | I |
| B7 | bulk_on_archived_questions | Archived rows are editable by bulk, and stay archived. | I |
| B8 | bulk_shared_count_reported | The result and the preview say how many selected rows are shared. | I |
| B9 | bulk_bumps_updated_at_only_for_changed_rows | A skipped row's `updated_at` is unchanged. | I |

Tag / Untag
| id | name | setup and assertion | k |
|---|---|---|---|
| B10 [MUST] | tag_adds_to_those_lacking_it | 5 questions, 2 already tagged. The result is applied 3, skipped `already tagged` 2. All carry the tag once. | I |
| B11 | tag_case_folds_to_existing_spelling | Tagging "christmas" uses the library's "Christmas". | I |
| B12 [MUST] | tag_refused_whole_if_any_would_exceed_cap | 1 of 10 questions has 20 tags. Refused, naming 1, and none of the 10 is tagged. | I |
| B13 | tag_invalid_name_refused | Empty or over 40 characters. | I |
| B14 | tag_appends_at_end_position | The new tag's position is last. | I |
| B15 [MUST] | untag_removes_from_all_carrying | The result is applied n, skipped "not tagged" m. Other tags stay in order. | I |
| B16 | untag_case_insensitive | `untag("christmas")` removes "Christmas". | I |
| B17 | untag_tag_carried_by_none_noop_or_refused | Pin it (see Flags). | I |
| B18 | selection_tags_listing | `tags_of(ids)` returns the distinct tags with a count within the selection, for the Untag picker. | I |

Group
| id | name | setup and assertion | k |
|---|---|---|---|
| B20 [MUST] | group_assigns_selection_in_domain | 20 questions go to "Romans" in one call. All are in it. | I |
| B21 [MUST] | group_no_group_clears | Group NULL clears the group, and the result counts the changed ones only. | I |
| B22 | group_skips_already_in_group | The count of "already in Romans" is reported. | I |
| B23 [MUST] | group_member_of_other_domain_refused_or_skipped | The selection includes a question that is not a member of the domain: pin it (see Flags). The group-of-a-different-domain case is always refused. | I |
| B24 | group_moves_from_previous_group | A question in A goes to B and leaves A. | I |
| B25 | group_requires_domain_param | The host refuses a Group bulk with no domain (the UI only offers it inside a domain). | I |

Add to / Remove from domain
| id | name | setup and assertion | k |
|---|---|---|---|
| B30 [MUST] | add_to_domain_appends_in_selection_order | Selection [q3,q1,q2], target has 4 members. Sort order after: old 4, q3, q1, q2. | I |
| B31 | add_to_domain_skips_existing_members | Skipped "already in domain" count. Existing members' position and group are untouched. | I |
| B32 [MUST] | add_to_shared_domain_refuses_local_questions_naming_them | Selection holds 2 local and 1 shared. Refused whole, with the 2 local ids in the error. Nothing is written. | I |
| B33 | add_to_shared_domain_with_shared_only_ok | Applies. | I |
| B34 | add_to_local_domain_accepts_shared_questions | Applies (the existing rule). | I |
| B35 | add_to_domain_of_other_workspace_refused | WrongWorkspace. | I |
| B36 | add_to_archived_domain | Pin it: refused or allowed (see Flags). | I |
| B37 | add_lands_ungrouped | New memberships have `group_id` NULL. | I |
| B38 [MUST] | remove_from_domain_keeps_question_and_other_domains | Q is in D1 and D2. Remove from D1. Q exists, is in D2 with its group, and its tags are kept. | I |
| B39 | remove_from_domain_drops_group_there | Re-adding gives No group. | I |
| B40 | remove_skips_non_members | The count is reported. | I |
| B41 | remove_may_leave_domain_empty_ok | A domain with zero members is legal (a board may then break at Load, not at the write). | I |
| B42 | remove_from_shared_domain_when_selection_has_shared_only | Applies. Local-only is not relevant. | I |
| B43 | remove_breaks_board_reports_on_load_not_write | A recipe board points at the removed question. The write succeeds and `play_load` or the preview warns. Matches a one-by-one edit. | I |

Set difficulty
| id | name | setup and assertion | k |
|---|---|---|---|
| B50 [MUST] | set_difficulty_1_to_100_and_not_set | Sets 37. Setting `None` stores 0 (the `NOT NULL` column) and reads back as null. | I |
| B51 | set_difficulty_0_and_101_refused_whole | Nothing is changed. | I |
| B52 [MUST] | set_difficulty_no_new_refusal_board_clash | Setting equal difficulties on 2 questions of one domain that a board holds (repeats off) is accepted. `build_snapshot` and the preview report the §2.31 clash, as a one-by-one edit does. | I |
| B53 | set_difficulty_skips_already_that_value | The count is reported. | I |
| B54 | set_difficulty_changes_completeness | A question gains or loses the "difficulty" gap (`complete.rs`). The §2.32 list filter reflects it. | I |
| B55 | set_difficulty_is_body_change_for_search_not | The index is unaffected by a difficulty-only change (or just remains consistent). | I |

## 7. Workspaces interplay (H/transfer.rs, H/family.rs, H/workspaces.rs)
| id | name | setup and assertion | k |
|---|---|---|---|
| W1 [MUST] | copy_domain_copies_groups_and_member_groups | Domain D with groups A and B, Q1∈A, Q2∈B, Q3 ungrouped. Copy to ws B. The new domain has "A" and "B" in the same order (new ids), and each copied question sits in the equivalent group. | I |
| W2 [MUST] | copy_question_carries_tags_not_groups | Copy Q1 (tags [x,y], group A in D) alone. The copy has [x,y] and no group, and no membership unless the closure brings its domain. | I |
| W3 | copy_domain_closure_with_shared_question_keeps_group | A shared question referenced by the copied domain keeps its group in the copy (membership copied, question not). | I |
| W4 [MUST] | copy_into_reused_domain_keeps_target_groups_and_arrivals_ungrouped | The target already holds a family member of D (reused). Its groups are unchanged, nothing is matched by name (including an identical "Romans"), and the arriving questions have group NULL. | I |
| W5 | copy_domain_as_new_row_no_name_collision | The copied groups never collide, since they are a new domain's. | I |
| W6 [MUST] | move_domain_keeps_groups | The same ids and groups after a move. | I |
| W7 | move_question_between_workspaces_drops_membership_of_source_domain | Pin with the existing rule. Its group goes with the membership. Tags go with the question. | I |
| W8 [MUST] | make_shared_domain_shares_its_groups | The groups are visible from B after share. Their names are unchanged. | I |
| W9 | make_local_domain_makes_groups_local | The group is NotFound from B after. | I |
| W10 | share_domain_with_unshared_groups_name_collision | Not applicable by design, since groups are never matched. Assert two shared domains may each hold a "Romans". | I |
| W11 [MUST] | duplicate_workspace_copies_groups_and_tags | The new workspace's domains hold groups, the memberships have their groups, and the questions have their tags. The original is untouched. | I |
| W12 [MUST] | propagation_carries_tags_not_group | Also-update on Q1 (family of 3) replaces tags on the copies and does not change their memberships or groups. | I |
| W13 | propagation_tags_from_original_replace_exactly | The copy had [z]. After propagating [x,y] it has [x,y]. | I |
| W14 | propagation_breaking_board_still_refuses | Existing behaviour, with tags present (regression). | I |
| W15 | tag_cap_on_propagation | A body with 20 tags propagates (cap is the same). | I |
| W16 | delete_workspace_permanently_removes_groups_tags | Hard delete of an archived workspace leaves no `domain_groups` or `question_tags` rows for its ids. Shared groups and tags stay. | I |
| W17 | switch_workspace_rebuilds_index_with_tags | A tag search follows the switch. | I |
| W18 | P_transfer_preserves_tag_multiset | Random copy, move and share of questions: every question's tag list is equal (as a list) on the result row. | P |
| W19 | P_transfer_never_splits_group_domain | Random domain copies: each copied membership's group belongs to the new domain. | P |
| W20 | restore_sample_game_unaffected | The Demo seeds have no groups and no tags, and keep working. | I |

## 8. Studio list view (S/host/listSpecs.test.ts, listView.test.ts, useListView.test.tsx)
| id | name | setup and assertion | k |
|---|---|---|---|
| L1 [MUST] | group_filter_inside_domain_matches_member_group | View D1 with 3 groups. The filter {A} keeps A's members. "No group" is a filter option that keeps ungrouped. | U |
| L2 [MUST] | default_grouping_is_groups_when_domain_has_groups | D1 has ≥1 group and no picked grouping, so the effective group-by is "Groups". A domain with none keeps today's default. | U |
| L3 [MUST] | picked_grouping_wins_and_is_remembered | The user picks "Difficulty". It is stored per tab. Reopening D1 keeps it, even though D1 has groups. | U |
| L4 | default_grouping_is_computed_not_stored | Add the first group, and the default flips with no stored value. Delete the last group and it flips back. | U |
| L5 [MUST] | group_headers_in_operator_order_no_group_last | Groups [C,A,B] in order, headers in that order, then "No group". | U |
| L6 | empty_group_header_shown | A group with 0 members still shows a header (so it can be a drop target for Group…). Pin the decision (see Flags). | U |
| L7 [MUST] | no_group_by_groups_under_all_questions | Under All questions, the group-by options exclude "Groups". The Group filter is hidden. | U |
| L8 | persisted_groups_grouping_under_all_falls_back | A stored "groups" choice then switching to All questions falls back to the default and does not throw. | U |
| L9 [MUST] | tag_filter_multi_any_of | Filter {a,b} keeps questions with a or b. An empty filter keeps all. | U |
| L10 | tag_filter_case_insensitive_options_unique | The options come from the tags in view, one per folded form. | U |
| L11 [MUST] | group_by_tag_question_under_each_tag | A question with 2 tags appears under both headers. Untagged goes to a "No tag" bucket last. | U |
| L12 | group_by_tag_counts_do_not_double_count_total | The header counts sum to more than the rows. The footer total is still the number of distinct rows. | U |
| L13 | group_by_tag_with_tag_filter | Filter {a}: headers show only a, or all of the question's tags? Pin it (see Flags). | U |
| L14 | search_matches_tag_text | The client search box matches tags too (the host search does). The fake must match. | U |
| L15 | filters_compose_domain_group_tag_search | AND across kinds, OR within tag. | U |
| L16 | selection_survives_regroup | Select 3, switch to group-by tag. Selection by id still holds. A question shown twice is one selection entry. | U |
| L17 | select_all_in_group_header_selects_group_members | Header checkbox selects only that group's rows. | U |
| L18 | pagination_with_duplicate_rows_by_tag | Page boundaries with a question in two headers do not drop or duplicate within a header. | U |
| L19 | listspec_tag_column_or_chip_cell | The Questions spec renders tags as chips with overflow "+n". | U |
| L20 | stored_view_prefs_forward_compatible | An old stored prefs blob without tag/group keys loads with the defaults. | U |

## 9. Editor, bulk Edit menu, dialogs (S/organisms/*.test.tsx, S/molecules)
| id | name | setup and assertion | k |
|---|---|---|---|
| E1 [MUST] | editor_tag_input_adds_chip_on_enter_and_comma | Type "Rome" + Enter, so a chip "Rome" is in the DOM. Backspace on empty input removes the last chip. | U |
| E2 [MUST] | editor_typing_existing_tag_other_case_picks_existing | "christmas" with "Christmas" in view yields the chip "Christmas". | U |
| E3 | editor_picker_lists_only_used_tags | The suggestion list equals the in-view tags. With none it is empty and there is no pre-made suggestion. | U |
| E4 | editor_cap_20_disables_input_with_message | After 20 chips the input is disabled, or says "20 tags max". | U |
| E5 | editor_rejects_41_char_tag_inline | A message, no chip. | U |
| E6 | editor_tags_role_and_a11y | `getByRole('listbox'/'list')` and each chip's remove button has a label. | U |
| E7 [MUST] | editor_group_picker_beside_each_domain | The question is in D1 and D2. Two pickers, each listing only that domain's groups plus "No group". | U |
| E8 | editor_group_picker_hidden_for_domain_without_groups | Or disabled with a hint. Pin it. | U |
| E9 | editor_removing_domain_removes_its_picker | The group choice is dropped with it. | U |
| E10 [MUST] | editor_save_writes_question_then_domain_upserts_with_groups | Mock host. Order: the question save, then each changed domain's upsert, carrying the member's group. One save from the user's side (single toast, one dirty reset). | U |
| E11 | editor_save_does_not_upsert_unchanged_domains | Only domains whose membership or group changed. | U |
| E12 | editor_save_failure_midway_reports | The question saved, the domain upsert failed. A notice names it, and the editor stays dirty for the domain part. | U |
| E13 | editor_new_question_in_domain_context_preselects_domain_no_group | Opened from inside D1. D1 is preselected with No group. | U |
| E14 | editor_also_update_copies_carries_tags | The call includes tags. It excludes groups. | U |
| E15 [MUST] | bulk_edit_menu_items_by_context | Under All questions: Tag…, Untag…, Add to domain…, Set difficulty… only. Inside a domain: plus Group… and Remove from domain. The menu is hidden when nothing is selected. | U |
| E16 | bulk_edit_menu_sits_beside_copy_move_share | Order in the BulkBar `extra` slot. Tab order. | U |
| E17 | untag_menu_item_disabled_when_selection_has_no_tags | Or the dialog says so. | U |
| E18 [MUST] | tag_dialog_shows_count_and_skipped_note | Selection 5, 2 tagged. The confirm reads "Tag 3 questions; 2 already tagged Christmas". | U |
| E19 [MUST] | confirm_mentions_shared_count_and_all_workspaces | Selection with 2 shared. The confirm says 2 and that the change reaches every workspace. With 0 shared the sentence is absent. | U |
| E20 | tag_dialog_cap_refusal_message | The host refusal "n questions would exceed 20" is shown inline, the dialog stays open, the selection is kept. | U |
| E21 | add_to_domain_dialog_lists_domains_in_view_only | Excludes the current domain when inside one? Pin it. Excludes archived? Pin it. | U |
| E22 | add_to_shared_domain_refusal_names_local_questions | The refusal text lists the question titles. | U |
| E23 | group_dialog_lists_this_domains_groups_and_no_group | Radio choice. Confirm disabled until a choice is made. | U |
| E24 | remove_from_domain_confirm_text | Says they stay in the library and in other domains. | U |
| E25 | set_difficulty_dialog_validates_1_100_or_not_set | NumberField role is `textbox`. 0 and 101 block the confirm. "Not set" is a toggle. | U |
| E26 | set_difficulty_dialog_warns_board_clash_not_refuses | Pin it (see Flags): it may only be a static note. | U |
| E27 [MUST] | bulk_success_toast_with_count_and_selection_cleared_or_kept | Toast "Tagged 3 questions". The pinned decision is that the selection is kept. | U |
| E28 | bulk_in_flight_disables_confirm | No double submit. | U |
| E29 | groups_dialog_new_rename_move_delete | The sequence calls the host in order. Delete asks to confirm, with the member count, and says they stay ungrouped. | U |
| E30 | groups_dialog_name_validation_inline | Duplicate (any case) and over 60 characters shown inline. | U |
| E31 | groups_button_only_inside_a_domain | Hidden under All questions. | U |
| E32 | group_header_menu_rename_delete | Reuses the dialog pieces. | U |
| E33 [MUST] | manage_tags_dialog_counts_rename_merge_delete | Rows show tag and count. Renaming to an existing tag shows the merge wording with the count. Delete confirm shows the count and the shared count. | U |
| E34 | manage_tags_dialog_shared_warning_text | Per tag "n shared, changes every workspace" only when n>0. | U |
| E35 | manage_tags_button_in_domains_and_questions_toolbar_only | Not on the Teams or Games tabs. | U |
| E36 | queries_invalidated_on_catalog_changed | After a bulk edit and on a `catalog-changed` event, the lists, the tag list and the groups refetch (TanStack keys). | U |
| E37 | no_group_or_tag_in_play_state_store | Lint or grep guard: Zustand and the playState store hold no tags and groups. | U |

## 10. Fake host parity (S/host/fake/*.test.ts, fake.ts)
| id | name | setup and assertion | k |
|---|---|---|---|
| F1 [MUST] | fake_enforces_same_group_rules | G2, G4, G10, G12 and G16 replayed against the fake. Same errors with the same codes. | U |
| F2 [MUST] | fake_enforces_tag_rules_and_cap | T1, T2 and T5, the fold and the cap refuse the same way. | U |
| F3 [MUST] | fake_bulk_ops_atomic | Table B0 for the fake. A failure leaves the state byte-equal. | U |
| F4 | fake_bulk_counts_match_host_shape | Result and skipped fields have the same names as the wire type (compile-time via `types.ts`). | U |
| F5 | fake_add_to_shared_rule | B32. | U |
| F6 | fake_membership_survival | S1, S3, S5 and S6 on the fake's domain upsert. | U |
| F7 | fake_manage_tags_merge_and_cap | MT2 and MT3. | U |
| F8 | fake_search_matches_tags | T13. | U |
| F9 | fake_import_planner_tags | T18 to T20 (the fake mirrors `import.rs`; change both together). | U |
| F10 | fake_copy_move_share_groups_tags | W1, W2, W4, W6 and W8 against the fake transfer. | U |
| F11 | fake_difficulty_board_clash_not_refused | B52. | U |
| F12 | fake_demo_library_has_groups_and_tags | Seeds for `?fake` show the feature: some groups in one domain and tags across 2 domains. | U |
| F13 | P_fake_vs_host_conformance | Not possible directly, so share a JSON scenario script (op list plus expected end state) run by both a Rust test and a vitest. Keep it to a handful of scenarios. | I |
| F14 | wire_types_codemap_updated | `npm run map:check` after the new commands, tables and settings. | U |

## 11. Host wiring and contract
| id | name | setup and assertion | k |
|---|---|---|---|
| C1 | commands_registered_and_guarded | The new `catalog_*` commands are in `crates/app`, refused by webview label for `stage`. Stage may call exactly two commands (existing guard test extended). | I |
| C2 | commands_respect_lock_or_play_state | Pin it: bulk edits during a live Play are allowed (library edits are today). Verify the board for the running Play is the snapshot, so it is unaffected. | I |
| C3 | wire_roundtrip_camelcase_group_and_tags | The serde shape of `groupId`, `groups`, `tags` and the bulk result. | U |
| C4 | host_crate_has_no_tauri | The existing sweep still passes (new files). | U |
| C5 | statistics_and_plays_ignore_groups_tags | The `stats_query` document is unchanged for a library with groups and tags (regression snapshot). | I |
| C6 | whats_new_has_en_ro_entries | The release notes include the new entry in both locales (docs checklist). | U |

## 12. e2e on the real app (E/groups-tags.e2e.ts; follow workspaces.e2e.ts and library-views.e2e.ts)
| id | name | scenario and assertion | k |
|---|---|---|---|
| X1 [MUST] | groups_flow_in_a_domain | Open the Demo's History. Groups… then create "Romans" and "Medieval". Select 20 questions, then Edit… then Group… then Romans. The list default regroups under headers Romans/Medieval/No group with counts. Close and relaunch the app, and the groups persist. | E |
| X2 [MUST] | tags_across_domains_found_by_filter | Tag 3 questions in 3 domains "Christmas" with the bulk menu. Under All questions, filter Tag = Christmas to get 3 rows. The Search box finds one by the tag. | E |
| X3 | editor_tag_chips_and_group_picker_one_save | Open a question, add 2 chips, pick a group, Save. Reopen: persisted. | E |
| X4 [MUST] | bulk_set_difficulty_and_toast | Select 10, set difficulty 40. Toast says 10. Rows show 40. | E |
| X5 | add_to_shared_domain_refusal_visible | Local questions into a shared domain show the refusal naming them. The library is unchanged. | E |
| X6 | manage_tags_rename_merge_delete | Rename merges. Delete confirm shows counts. Lists update with no reload. | E |
| X7 | copy_domain_to_workspace_keeps_groups | Copy a domain with groups to workspace B, switch to B: groups and grouping are there. | E |
| X8 [MUST] | upgrade_from_v4_library_launches_with_no_groups | Use `upgrade.e2e.ts` with a v4 file. The app launches, the list works, migration 5 backup exists on disk. | E |
| X9 | play_unaffected | Load a game and play one turn with groups and tags present. Stage shows no tag or group. | E |

## Flags (underspecified, contradictory or hard to test)
1. **Group… on a mixed selection.** A selection inside a domain may include a question that has no membership, or one whose membership was removed between select and confirm. The design says nothing about refuse vs skip (B23). I propose skip with a count, since "Group…" is offered only inside a domain and all rows come from its list. Confirm.
2. **Tag/Untag/Manage with a zero-effect request** (Untag a tag nobody carries, rename of an unknown tag). Refused or a no-op with 0 applied? The design only specifies skipped counts. Pin it.
3. **Add to domain: archived target, and the current domain.** "A domain in view" may include archived domains and the one you are in. Say whether each is excluded. The test E21 depends on it.
4. **Group-by-tag together with a Tag filter** (L13). Do headers show all of a question's tags, or only the filtered ones? Underspecified. Also whether an untagged bucket exists, and whether an empty group header is shown (L6; it should be, or an empty group is unreachable as a target).
5. **Import with tags onto an existing question.** Replace, merge or ignore? Not stated (T22). The import file can also hold no group, which is fine, but the design should say that updates keep memberships and groups.
6. **Tag normalisation edge cases.** Inner whitespace, Unicode folding (Rust `to_lowercase` vs SQLite `NOCASE`, which is ASCII only), and normalisation form (NFC). If folding is done in SQL with NOCASE, "Ștefan" and "ștefan" would not fold together; this is a likely bug. I recommend a folded key column or Rust comparison, and T7 will catch it. The builder is free to choose, but needs to be told it is tested.
7. **"First spelling wins" is not stable under delete.** If the first holder of "Christmas" is deleted, "christmas" on another question becomes the spelling. There is no canonical row, so the spelling in the Manage list is "whichever is first". A test needs a deterministic rule (earliest question `created_at`, or the lowest `rowid`). The design should name one, or accept that the display spelling per question is what is stored.
8. **Shared question tag/difficulty changes by bulk in a workspace that cannot see all families.** A bulk edit of a shared question changes it for every workspace, as the design says. The copies are not updated, but a shared question also changes under another workspace's boards, which may break a board there (B52). The "no new refusal" rule means that workspace finds out only at Load. This is consistent with the design, but surprising, and it is worth an e2e or a doc note.
9. **Cap in the editor vs legacy.** An imported file with 20 tags plus a merge: covered. But a question that ends up with more than 20 by a path outside the checks (propagation of a body from a family member whose tags were valid) cannot happen if the cap is enforced in `Question::validate`. State that the cap lives there so every door is covered. Otherwise test each door (B12, MT3, W15, T19).
10. **Bulk op "one transaction" with search index.** The Tantivy index is not transactional with SQLite. A failure after commit but before the index update leaves the index stale until the next open. Untestable without a failure-injection seam. Prefer rebuilding or re-indexing after commit and treat the index as rebuildable (as noted for migration 5).
11. **Result of "Remove from domain" on a shared domain from a workspace.** A shared domain's membership change reaches every workspace. Does the confirm carry the same shared warning as the question warning? The design only mentions shared questions, not shared domains.
12. **Fake parity.** The fake has no way to verify the SQL, so F13 (shared scenario script) is the only real guard. Without it, parity is manual and will drift (the import planner already has this problem).
13. **Wording.** "Group" collides with workspace groups and list grouping. A lint-level check cannot catch UI strings. Add a vocabulary grep test over the new strings in `apps/studio` ("domain group" wherever "group" could be confused), if wanted.
14. **No undo.** Bulk edits have no undo and no history surface, so a mis-click on 150 rows cannot be reverted. That is a stated choice, not a test, but the confirm text is the only safety net (E18, E19, E24).