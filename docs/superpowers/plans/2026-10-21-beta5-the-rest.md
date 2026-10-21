# beta.5 the rest — plan and test list

Spec: `docs/superpowers/specs/2026-10-21-beta5-the-rest-design.md`. Executed natively.

## Tasks
1. **Host** — `catalog_family`; `catalog_duplicate` (`catalog/duplicate.rs`); `catalog/integrity.rs` with `library_check` / `library_repair` and `health.library_refs`; `StatsDimension::Workspace` with `TurnFact.workspace_id` filled by the catalog; `TEAM_COLUMNS` scoped to the team's workspace. Tests: `crates/host/tests/beta5.rs`, `health.rs`.
2. **App** — commands `catalog_family`, `catalog_duplicate`, `library_repair`; the health tick feeds `library_refs`.
3. **Studio** — `CopiesBlock` + `useFamily`; tags and domain groups in Question detail; *Duplicate* actions; Workspace in Statistics; Settings copy; Manage workspaces on `workspacesSpec`; the vocabulary; `SHELL`; the switcher; Repair in the collector; the fake host's mirrors. Tests: `pages/beta5.test.tsx`.
4. **Real app** — `e2e/specs/beta5.e2e.ts` with screenshots; `groups-tags.e2e.ts` follows the new words.
5. Docs, *What's new*, codemap; reviews; fixes.

## Test list (Sonnet, condensed; ★ = most likely to catch a bug)
- A row's family: other members with workspace and archive state; none for a row never copied; Stop following empties it, twice is harmless (`beta5.rs`, `beta5.test.tsx`).
- ★ Workspace dimension names the workspace (`beta5.rs`); offered only with *All workspaces* (StatsFilterBar).
- ★ A team's Plays after it leaves its game's workspace: 0 there (`beta5.rs`).
- ★ Repair removes exactly the bad references, nothing else, and the count matches the check; nothing to repair is 0 (`beta5.rs`).
- ★ Duplicate names never collide: "(copy)", "(copy 2)" (`beta5.rs`, `beta5.test.tsx`, `beta5.e2e.ts`); a question in two domains keeps each group; a domain's groups are its own; all or none (`beta5.rs`).
- ★ No two concepts share a copy string: no bare "New group", "No group", "Delete group", "Group name"; *Question tag* ≠ *Game tag* (`beta5.test.tsx`).
- The switcher's reason by keyboard (`beta5.test.tsx`); Repair asks first, naming the count (`beta5.test.tsx`); Manage workspaces searches and filters by Status (`beta5.test.tsx`, `beta5.e2e.ts`).
