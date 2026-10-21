# Beta 2.x: groups inside domains, tags, bulk edits — design

*2026-10-21. Status: approved 2026-10-21. Release D of four (A channels ✓ → B stable 1.1 ✓ → C Beta 2.0 workspaces ✓ → **D groups, tags, bulk edits**). Beta only: built on `main`, never merged into `release/1.x`.*

The maintainer's words: inside a domain, an operator can create **whatever groups they want**, beyond the groupings the list views already offer; groups are **for organising** — for now they do not touch boards or Plays. **Tags** are added when adding (or editing) a question and belong to the question **whatever its domain**. For bulk actions they had no list of their own and accepted the designer's proposal: *Tag…, Untag…, Group…, Add to domain…, Remove from domain, Set difficulty…*. Everything else below is the designer's call, marked *(call)*.

## Intent

A domain of 150 questions is one long list. The built-in groupings (difficulty band, answer type, completeness) slice it by what the app knows; an operator also needs to slice it by what *they* know — "Romans", "Medieval", "Warm-ups", "Round 2 maybe". Tags do the same across domains — "Christmas special" on questions in History, Science and Sport — so a themed show can be found in one filter. And once a list can be sliced, the operator wants to act on the slice: tag it, group it, put it in another domain, set its difficulty, all at once.

Success: an operator opens History, makes three groups by name, selects twenty questions and puts them in *Romans* in one action, sees History grouped by their groups, tags a handful of questions across three domains *Christmas*, finds them all with the Tag filter under *All questions*, and sets the difficulty of ten questions at once — and nothing about a game's board or a Play changed unless they changed a question's difficulty or domains, exactly as a one-by-one edit would.

## Goals

1. **Groups inside a domain**: create (typed name), rename, reorder, delete. A question in a domain sits in **at most one** of that domain's groups, or none (*No group*) *(call)*. A question in several domains has a group per domain.
2. **Groups in the list view**: inside a domain, *Group: Groups* (headers in the operator's order, *No group* last) and a **Group** filter; **the default grouping of a domain that has groups is its groups** *(call)*. Under *All questions* there is no group-by-group (groups are per domain).
3. **Tags on questions**: free text, typed or picked from tags already used in view; a question has any number (cap 20) *(call)*. The editor shows them as chips; the import file may carry them.
4. **Tags in the list view**: a **Tag** filter (multi, any-of) on Domains & Questions and **Group: Tag** (a question with two tags appears under each, as with domains), and search finds a question by its tag.
5. **Manage tags**: rename (or merge into an existing one) and delete a tag across every question in view, from one dialog *(call)*.
6. **Bulk edits** on a selection of questions, each one confirm and one transaction: **Tag…**, **Untag…**, **Group…** (inside a domain only), **Add to domain…**, **Remove from domain** (inside a domain only), **Set difficulty…**.
7. Workspaces carry it all: groups live with their domain, tags with their question.

## Non-goals

- Groups or tags affecting boards, Stage, scoring or Plays. A board still picks questions per domain and difficulty (§2.31).
- Tags on teams, domains or operators (games already have tags; unchanged).
- Nested groups, a question in two groups of one domain.
- A tag colour, icon or description.
- Statistics by tag or group (a later release) *(call)*.
- Bulk edits on teams or games beyond what exists.

## Anti-goals

- A suggested group or tag name. The tag picker lists only tags the operator has already used; a new one is typed. Nothing is pre-made.
- A bulk edit that half-lands: validated first, written in one transaction, refused whole.
- A bulk edit that does what a one-by-one edit could not — the same rules, the same refusals, just many rows.
- Losing a question's membership or tags in a copy, move, share, duplicate or migration.

## Constraints (from the repo)

- Every SQL statement lives in `crates/host/src/catalog/store.rs`; scoping (*current ∪ shared*) is the TEMP `current_ws` binding (`host.md` ▸ Workspaces). New tables follow it.
- Migrations are forward-only; this is **migration 5**, backed up first by the usual rotated copy (P12.6).
- `domain_questions(domain_id, question_id, sort_key)` is a question's membership; a domain upsert rewrites it delete-then-insert.
- Studio list views are `host/listView.ts` + one `ListSpec` per tab (05_STUDIO_DESIGN §20); bulk actions sit in `BulkBar` (`extra` slot) and `LibraryList`.
- Names are typed, trimmed, ≤ 60 characters (groups) — the workspace name rules.
- The vocabulary file (`03_CONTEXT.md`) gains **Group** (in a domain) and **Tag** (on a question); *group* already names workspace groups and list-view grouping — the UI always says *domain group* where it could be confused *(call)*.

## The parts as decided

### Groups

- A group belongs to **one domain** and lives where the domain lives: a local domain's groups are local, a shared domain's groups are shared. Groups are not library rows of their own — no archive, no Archive tab; *Delete group* leaves its questions in the domain, ungrouped *(call)*. A group name is unique within its domain, ignoring case.
- A question's group is part of its **membership** in that domain, so it is the domain's to change (§4.1: the sort key is the membership's). Saving a domain keeps each member's group.
- Where the operator sets it: the bulk bar's **Group…** inside a domain (pick a group, or *No group*), and the question editor, which shows a group picker beside each domain the question is in *(call)*.
- Managing groups: inside a domain, a **Domain groups…** button (named so beside workspace groups, review) in the toolbar opens one dialog — the domain's groups in order with *New group*, *Rename*, *Move up/down*, *Delete* *(call)*. A group header's menu offers *Rename* and *Delete* too.
- Archived domains keep their groups; archived questions keep their group.
- **A group survives every rewrite of membership** *(call)*: saving a domain keeps each remaining member's group; adding or removing *another* domain on a question leaves its group in the rest untouched. Leaving a domain drops the group there — re-adding, or **Add to domain…**, starts at *No group*.
- **Into a reused domain** (transfer reuse): the reused domain keeps its own groups, and a question that arrives in it has *No group* — groups are never matched by name *(call)*. A domain copied as a new row brings all its groups, so no name can collide.
- **The default grouping** is computed, not stored: a domain with groups opens grouped by them unless the operator has picked a grouping for the tab (a picked one is remembered, as in 1.1, and wins); a domain with no groups keeps today's default *(call)*.
- **The question editor's group pickers** are saved with the domain memberships the editor already writes after the question (the same domain upserts, now carrying the group) — one save from the operator's side *(call)*.

### Tags

- A tag is text on a question: trimmed, 1–40 characters, compared ignoring case; the first spelling used is kept, and typing *christmas* where *Christmas* exists picks *Christmas* *(call)*. Stored per question; the tag list is the distinct tags of the questions in view (this workspace ∪ shared), archived questions included.
- Tags are part of a question's **body**: they travel with copy, move, share and duplicate, and *Also update {n} copies* carries them *(call)*.
- **Manage tags…** (Domains & Questions toolbar): each tag with how many questions carry it; *Rename* (to an existing tag = merge) and *Delete* (from every question), each confirmed with the count, one transaction, only over questions in view — a shared question's tags change for every workspace, and the confirm says how many shared ones *(call)*.
- The import file: an optional `tags: [string]` per question, cleaned by the same rules.
- Search indexes tags with the question's text. The index is rebuilt at every open, so migration 5 needs no index step.
- **The cap and merges refuse, never trim** *(call)*: a Tag… or a merge that would give any question a 21st tag is refused whole, naming how many; a merge into a tag a question already has simply leaves one.
- Only the import file carries tags in; there is no export, and groups have no file form (duplicate workspace and copies carry them).

### Bulk edits

On Domains & Questions, the bulk bar (beside *Copy, move or share…*) gains **Edit…**, a menu of:

- **Tag…** — pick or type one tag; added to every selected question that lacks it.
- **Untag…** — pick one of the tags the selection carries; removed from all.
- **Group…** — inside a domain: a group of that domain, or *No group*.
- **Add to domain…** — a domain in view; added at the end of it, in the selection's order. A shared domain accepts only shared questions (the existing rule) — refused naming the local ones.
- **Remove from domain** — inside a domain: takes them out of it (they stay in the library and in their other domains).
- **Set difficulty…** — 1–100, or *Not set*. The same rules as editing one question: the library may hold it; a board it would break says so on Load (§2.31, §2.32) and the rules preview warns *(call: no new refusal)*.

Each shows its count and the rows it does not apply to ("3 already tagged *Christmas*"), runs in one transaction, and reports through the usual `catalog-changed` events and a toast with the count — no new undo or history surface *(call)*. When the selection holds **shared** questions the confirm says how many, and that the change reaches every workspace.

**Copies (families):** a bulk edit changes the selected rows only; their copies in other workspaces are **not** updated. *Also update {n} copies* stays in the single-question editor (maintainer, 2026-10-21).

### Workspaces

- Copying a domain copies its groups and each copied member's group; copying a question carries its tags; a reused domain (transfer reuse) keeps its own groups. Duplicate workspace copies groups and tags.
- *Make shared* on a domain shares its groups with it; *Make local* likewise.
- Propagation: tags are body (carried); a question's group is membership (not carried).

### Migration 5

`domain_groups(id, domain_id → domains ON DELETE CASCADE, name, sort_key, created_at, updated_at)`, `domain_questions.group_id → domain_groups ON DELETE SET NULL`, `question_tags(question_id → questions ON DELETE CASCADE, tag, position, PRIMARY KEY(question_id, tag))` *(call: exact names are the builder's)*. Existing rows: no groups, no tags. Backed up first (rotated copy).

## Left to the builder

- Exact table and column names, how tag case-insensitivity is stored (a folded key column or comparison in Rust), the command names and shapes (one `catalog_bulk_edit { op, ids, … }` or one command per edit).
- The tag input component (HeroUI has a tag-group; Base UI if it fits better) and the exact layout of the group pickers in the question editor.
- Whether the Groups dialog and Manage tags share one list molecule.
- Docs: `05_STUDIO_DESIGN.md` §22, `host.md`, `studio.md`, `03_CONTEXT.md`, roadmap, history, *What's new* (EN, RO).
