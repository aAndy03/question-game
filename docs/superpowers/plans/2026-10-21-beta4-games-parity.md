# beta.4 games parity — plan and test list

Spec: `docs/superpowers/specs/2026-10-21-beta4-games-parity-design.md`. Executed natively.

## Tasks
1. **Host** — `snapshot::build` refuses an archived team (`CatalogError::Refused`, by name); `CatalogService::archived_on_game`; `PreviewWarning::ArchivedOnGame { names }` first in `rules_preview`; `recipe_set_overlay_with(…, also_copies)` and the command's `alsoCopies`. Tests in `crates/host/tests/catalog_service.rs` (beta.4 block).
2. **Studio pickers** — `PickerDialog`, `pickTeamsSpec` / `pickDomainsSpec` / `pickQuestionsSpec`, the three picker tabs, `ListToolbar` without View/Status; `RosterSection` and `BoardSection` rebuilt on them.
3. **Studio edits** — `DifficultyDialog` (replaces `ScopeConfirm` and the `window.prompt`), *Apply to original* through `usePropagatingSave.decide`.
4. **Studio pages** — the Game page's *More actions*, the Games bulk bar (`useTransfer.menu(selection, move)`), `playNumbers`, the `archivedOnGame` copy, the fake host's mirrors.
5. **Real app** — `e2e/specs/games.e2e.ts` with screenshots in `e2e/.artifacts/look-*.png`; fix what it shows.
6. Docs, *What's new*, codemap; reviews; fixes.

## Test list (Sonnet, condensed; ★ = the five most likely to catch a bug)
- ★ A search that hides a chosen row, then Apply: the row stays, the new one is appended (`beta4.test.tsx`).
- Cancel writes nothing; the next opening starts from the game (`beta4.test.tsx`).
- ★ Select all in a group with one per difficulty: the first of each difficulty, `[b1, b3]` (`beta4.test.tsx`); with repeats on, every one (the 120-row group test).
- A group past one page is selected whole: 120 chosen (`beta4.test.tsx`).
- Incomplete rows disabled and skipped; a chosen incomplete row stays and can come off (`BoardSection.test.tsx`).
- ★ An archived team refused at Load by name, restored then loads; the preview names it (`catalog_service.rs`, `beta4.test.tsx`, `games.e2e.ts`).
- The preview names an archived domain and question (`catalog_service.rs`).
- ★ *Apply to original* with copies: here only leaves the copy; with copies updates it and names it (`catalog_service.rs`); Studio asks and sends `alsoCopies` (`beta4.test.tsx`).
- ★ The Games bulk bar with a playing game: Archive leaves it out and says so (`beta4.test.tsx`).
- The difficulty value: 0, 101, 2.5, −3, empty, the same value refused; 1, 100 accepted (`beta4.test.tsx`); on the real app the press commits (`games.e2e.ts`).
- Plays numbered by start then id, closing up after a wipe (`beta4.test.tsx`).
- On the real app: roster picker, board picker, difficulty dialog, Duplicate from the Game page, the bulk bar, the archived team refused on the Roster with no ids and no "elsewhere" (`games.e2e.ts`).

Ruled out of scope: a copy that would break being skipped by *Apply to original* is the propagation's own rule (P14), tested there.
