# Remove the shared library, and the Beta parity roadmap (beta.2 – beta.5)

Status: draft for the maintainer's approval · 2026-10-21 · `main` only (Beta)

## Why

Beta 2.0.0-beta.1 shipped workspaces with a **shared library**: a team, domain, question or asset with `workspace_id IS NULL` is seen and edited by every workspace. Two audits (Opus on the host, Sonnet on Studio, 2026-10-21) found about 110 gaps and bugs; roughly half exist only because of shared rows:

- archiving a shared row in one workspace breaks another workspace's game;
- editing a shared question's difficulty breaks another workspace's board;
- import previews green and then fails on a shared domain;
- a shared domain refuses local questions;
- twin names, as with two "Biblie";
- one tag with two spellings;
- domain groups that reach every workspace;
- Plays counts that disagree;
- *make local* refusals that pile up.

The maintainer's own test showed the confusion. One question made shared appeared in workspace 2 with no domain; a second "Biblie" was then created there; making the first "Biblie" shared showed two domains of one name side by side.

**Decision (the maintainer's):** take the easy path. **Workspaces keep only Copy and Move.** Copies already carry a family link: editing a row offers *Also update copies*, and *Stop following copies* cuts the link. That is the useful half of sharing, made explicit and opt-in per edit.

## Goals

1. No row is ever shared. Every team, domain, question and asset lives in exactly one workspace; a workspace sees only its own rows.
2. **Nothing anyone could see disappears.** A beta.1 library's shared rows become ordinary copies in every workspace, linked as one family, so *Also update copies* still connects them.
3. Every surface stops mentioning sharing: commands, chips, filters, counts, copy, docs, tests, the codemap.
4. While here, fix the workspace-switching bugs the audits found (they are independent of sharing, and cheap).

## Non-goals

- No new sharing concept (no "linked" or "global" rows, no per-workspace visibility table).
- No UI redesign. The Board's layout is a later interface pass.
- Statistics' *All workspaces* stays: it reads Plays, not shared rows.

## Anti-goals (a failure even if it works)

- A tester opens beta.2 and a team, domain, question, tag or game they had is gone, or a game that loaded in beta.1 no longer loads.
- A beta.1 library is written before it is backed up (P12.6 still holds: back up, then migrate).
- A game's Plays or Statistics history is rewritten. Events are append-only.

---

## Part 1: migration 6, shared rows become copies

Runs inside the one migration transaction, after the backup, on any library at schema 5 (beta.1). A library at 4 or older runs 5 then 6; it has no shared rows, so 6 is then a no-op apart from the schema bump.

### For every shared row (`workspace_id IS NULL`): teams, domains, questions, assets

1. **Who keeps the original id.** The original row (its id, its Plays and Statistics history, its family) goes to **one** workspace: the oldest active workspace (`ws-1` in practice). *(My call: ids referenced by Plays' events then still resolve in the workspace most likely to have run them. Another workspace's old Plays show the snapshot's names in Statistics, which is how Statistics already labels rows it cannot see.)*
2. **Every other workspace, active or archived, gets the row once.** *(My call, builder check.)*
   - **If that workspace already holds a member of the row's family** (a copy made before the original was made shared), that member is reused and references are remapped onto it. No twin is made, even if its body has drifted. A drifted body can break a board just as an edit can; Load reports that as today.
   - **Otherwise it gets a copy.** The copy has a fresh id and the same `family_id`. If the row had no family, one is created and the original joins it. An archived row's copies arrive archived; the copy keeps the body, tags and difficulty.
   - **Same-name rows with no family link are left alone**: two rows, as now. Name twins are beta.3's warning.
3. **References are remapped per workspace.** In each workspace:
   - its domains' members that named a shared question name that workspace's copy;
   - a copied shared domain's members name that workspace's copies of its questions;
   - its games' rosters and boards (and board overlays) that named a shared team, domain or question name that workspace's copies;
   - its teams' `logo_asset_id` that named a shared asset names that workspace's copy;
   - its questions' `media_asset_id`, and asset ids inside game overlays' `patch_json` (a team overlay's `logo_asset_id`), likewise.
4. **Domain groups.** A shared domain's groups are copied with each domain copy (`write_copy_with_groups`), with members mapped.
5. **Tags.** They are body, so they are carried as they are. After the migration each workspace re-spells within itself (the earliest-created question's spelling wins), so a workspace never shows one tag with two spellings.

### After

- No row has `workspace_id IS NULL`. Enforced from here on: a write of a library row without a workspace is a bug and refuses. Each table gets a `BEFORE INSERT/UPDATE` trigger refusing NULL; a table rebuild to `NOT NULL` is not worth its foreign-key risk.
- **No runtime board refusal** *(my call, builder check)*. Copies carry identical bodies and a reused family member is the workspace's own row, so the remap cannot introduce a board problem the library did not already have. Some beta.1 boards are already broken from outside (a shared edit, bulk *Set difficulty*); refusing on those would strand real libraries. Instead the upgrade test asserts, per game in its own workspace, that `board_problem` before equals `board_problem` after.
- **Migration 6 is a Rust step**: today's `MIGRATIONS` list is SQL-only, so it gains a step that runs code inside the same transaction. A failure there is any migration's failure: the library stays at 5, the backup is there, and the existing upgrade-failure path reports it.
- **Open Plays and old snapshots** *(my call, builder check)*: snapshots keep the original ids (append-only). Resolving a Play's assets (media, team logos) reads by id **across workspaces**, read-only, so a paused Play in another workspace keeps its pictures. Catalog writes stay scoped.
- Search index rebuilt; the `user_version` is 6.
- `tests/upgrade.rs` gets a v5 fixture with shared rows used by two workspaces' games, and asserts:
  - nothing lost;
  - ids, families and archive state as above;
  - boards load in both workspaces;
  - tags re-spelled;
  - groups copied;
  - Plays untouched.

## Part 2: the shared concept removed from every surface

**Host (`crates/host`)**
- The scope SQL becomes one predicate. `IN_VIEW` / `in_view()` fold into `IN_WORKSPACE` (or `IN_VIEW` keeps its name and drops `IS NULL`; the builder's call, one meaning). This touches `store.rs` (~64 sites), `transfer.rs`, `workspace.rs`, `bulk.rs`, `groups.rs`, `family.rs`, `model.rs`, `db.rs`.
- `Stamps.shared` goes from the model and the wire; old payloads that carry it still deserialize (`serde(default)`, ignored).
- `TransferOp::MakeShared` / `MakeLocal`, `catalog_make_shared`, `catalog_make_local`, `domain_rule` (a shared domain holds only shared questions), `users_elsewhere`, `home_of`'s "shared" answer, `BulkReport.shared`, `TagCount.shared`, and the shared reach in Manage tags all go.
- `seed.rs`: the Demo is per workspace already; the shared cases go. Fix Demo restore after a move or duplicate in **every** workspace (audit: only `ws-1` was handled).
- `stable_copy.rs` / `beta.rs`: the "empty library" check reads **every** workspace, unscoped (audit: data-loss guard).

**App (`crates/app`)**
- Remove the make shared / make local commands, their guard entries, and their `lib.rs` registration.
- `workspace_switch` rebuilds search before it commits the switch, or rolls back (audit: half-switched state).

**Contract**
- `packages/contract/src/commands.ts`: remove the two commands; rebuild `dist`.

**Studio (`apps/studio/src`)**
- `host/types.ts`: drop `shared` on stamps, `BulkReport.shared`, `TagCount.shared`.
- `useTransfer.tsx`: the menu is *Copy to…* and *Move to…* only. *Copy to…* of questions offers **"with their domains"**, on by default. This is the maintainer's Scenario 2. *(My call, builder check.)*
  - **If the target already holds a family copy of a domain**, the copied question joins that copy, in no group, at the end.
  - **Otherwise the domain row is copied** with **only the picked questions** as members. Its groups come along, with only those members; its other questions do not. Copying a whole domain stays what it is today.
  - **With the switch off**, a question arrives in no domain, and the preview says so.
  - **The preview names the domains** it will join and the ones it will create.
- Remove: the shared chip (`MeaningChip meaning="shared"`); the globe icon in `DomainPane`; the *Where* filter and grouping in `listSpecs.ts` (Teams, Library); the shared lines in `useBulkEdit` and `ManageTagsDialog`; `GROUPS_TAGS.sharedReach` / `sharedDomainReach`; `TRANSFER.whereShared` / `makeShared` / `makeLocal`; the bulk transfer's shared argument.
- `host/fake.ts`: the same rules as the host. One workspace per row; no `shared: true` seeds.
- `WORKSPACE_SCOPED` and switching (audit bugs, independent of sharing):
  - **Screens**: reset the picked game when the workspace changes (key the page on the workspace id).
  - **Statistics**: `AllDataStats` and `LiveStats` keyed on the workspace id, so filters reset. The **stats window** resets on `workspace-changed` even when it never cached a previous id; carry the previous id in the event or reset whenever the cache is empty. Its title names the workspace.
  - **Back/forward** cleared on a workspace switch (`chrome/nav.ts`).
  - Notices keyed to a row of the workspace left are dismissed on a switch.
- Tests: rewrite the shared cases in `transfer.test.tsx`, `workspaces.test.ts`, `listSpecs.test.ts` and `groups-tags.test.tsx`. Each shared-reach assertion goes, and each switching bug gets a test that fails first.

**e2e**
- Specs touching make shared or the shared chip are rewritten around copy and move (`e2e/specs/workspaces*.e2e.ts`).
- One new upgrade spec: a v5 library with shared rows opens in beta.2 and both workspaces show their rows. The seed comes from `e2e_library` writing schema 5 with shared rows via `db::write_older_schema`, setting `workspace_id` to NULL after the write (the head schema's triggers refuse NULL, so the v5 file is written without them).

**Docs (kept in step, same commits)**
- `docs/v1/03_CONTEXT.md`: *Workspace* without "shared library"; a short *Copy* / *family* entry ("copies remember each other; *Also update copies*").
- `docs/as-built/host.md`: the workspaces section rewritten; a "Shared library removed (beta.2)" entry with the incident and migration 6; the P15 bullets that mention shared rows corrected.
- `docs/as-built/studio.md`, `docs/v1/05_STUDIO_DESIGN.md` (§20–22: the chip, filter, menu and bulk lines).
- `docs/superpowers/specs/*workspaces*` and `*groups-tags-bulk*`: a dated note at the top: "Superseded in part: the shared library was removed in beta.2; see 2026-10-21-remove-shared-library-design.md".
- `docs/v1/04_ROADMAP.md` (this roadmap) and `docs/as-built/history.md`.
- `CLAUDE.md` only if a line there names the shared library (keep it lean).
- `codemap.yaml` regenerated (`npm run map`); its diff is the list of removed commands and fields.
- **What's new 2.0.0-beta.2** (EN, RO), operator words: there is no shared library any more; what was shared is now a copy in each workspace, linked, so an edit still offers to update the others; *Copy to* can bring a question's domains.

## Part 3: the roadmap (beta.2 – beta.5, stable 1.1.1)

Each version is its own design → plan → Sonnet tests → build → Opus + Sonnet reviews → fixes, as before. The scope lines below are what the audits found once sharing is gone.

| Version | Focus | Contents |
| --- | --- | --- |
| **beta.2** | Remove the shared library, safely | Parts 1–2 above: migration 6, every surface, the switching bugs, *Copy to* with domains, the Demo in every workspace, the empty-library guard. |
| **beta.3** | Copy, import, the editor | Copy: archived rows keep their state; a reused copy that would break the new game's board is copied fresh or named in the preview; game copy checks boards. Import: domain resolution in this workspace only, tags shown in the preview, new domains said, *Duplicate* rows explained, refusals inside the dialog. Question editor: question and memberships saved in **one** write (no half-saved question); *Also update copies* asked only when the body changed. Readable refusals: names, not ids; notice codes and titles for the workspace cases. Archive confirm says which games use the row (bulk too). Name twins: a soft warning in this workspace on create, copy, move and import (the maintainer may want a hard rule; asked in beta.3's design). |
| **beta.4** | Games parity | Board and Roster pickers on the list-view model (search, difficulty and tag filters, domain-group headers, *select all in group*, paging). An archived team on a roster: refused at Load like domains and questions. A Rules warning for an archived row on the board. *Apply to original* goes through *Also update copies*. Game page: Copy/Move/Duplicate. Games bulk bar. Plays section: copy and names, not raw ids. The difficulty prompt becomes a dialog. |
| **beta.5** | The rest | Detail panels (question, team) show tags, groups, copies and *Stop following copies*; Statistics: the workspace in the header and window title, a *Workspace* dimension with *All workspaces*, Teams' Plays count scoped; Settings copy says "in this workspace" (Wipe Plays, Demo); Manage workspaces as a list view with counts; vocabulary (*Workspace group*; game tags vs question tags); a library health check (orphan groups, broken boards, tag spellings); hard-coded English strings to copy; *Duplicate* within a workspace for teams, domains and questions; the disabled switcher's reason reachable by keyboard. |
| **stable 1.1.1** | Fixes 1.1 also has | Studio below 1280 px (an opened row's detail hidden; the e2e failures at 1100 px); the board difficulty `window.prompt`; any other 1.1 bug the audits named. Made on `release/1.x`, merged forward. |

After beta.5: interface passes (the Board first, which the maintainer finds cluttered).

## Left to the builder

- `IN_VIEW` kept and narrowed, or folded into `IN_WORKSPACE`.
- The exact shape of the NULL-refusing triggers.
- How *Copy to…* asks "with their domains" (a switch in the dialog, default on), as long as the preview names what comes along.
- How the stats window learns the previous workspace.

## Risks

- **The migration is the risk.** A beta.1 library with a game that uses shared rows in two workspaces must come out with both games loading. The test fixture must cover: a shared question in a local domain; a shared domain with groups; a shared team on two rosters; a shared asset as a team logo and as question media; archived shared rows; a shared row already in a family with a member in another workspace (reused, no twin); a paused Play in a non-oldest workspace whose snapshot names a shared asset; a board already broken before the upgrade (still loads the same way after).
- **Plays and Statistics history** for other workspaces' old Plays now label by snapshot name (no live row). This is accepted, and it is said in What's new only if testers would notice.
