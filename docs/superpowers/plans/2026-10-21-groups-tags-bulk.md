# Groups, tags and bulk edits (Beta, release D) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Operator-made groups inside a domain, tags on questions, *Manage tags*, and six bulk edits on a selection of questions — organising only, boards and Plays untouched.

**Architecture:** Migration 5 adds `domain_groups`, a `group_id` on a domain membership and a `question_tags` table. Groups ride on `DomainMember` (so every domain write keeps them) and tags on `Question` (so they are body: copies, transfers and propagation carry them). Bulk edits are one host verb, `catalog_bulk_edit`, one transaction per call; Studio adds a Group filter and grouping, a Tag filter and grouping, tag chips and group pickers in the editor, a Groups dialog, Manage tags, and an *Edit…* menu in the bulk bar.

**Tech Stack:** Rust (rusqlite, Tantivy), Tauri 2, React 19 + HeroUI v3, vitest, WebdriverIO.

**Spec:** `docs/superpowers/specs/2026-10-21-groups-tags-bulk-design.md`

**Tests:** `docs/superpowers/plans/2026-10-21-groups-tags-bulk-tests.md` (Sonnet's list with the builder's rulings).

## Global Constraints

- `main` only. Phases **P15.0** (host), **P15.1** (Studio), **P15.2** (e2e, docs).
- Migration 5 is the fifth `MIGRATIONS` entry, forward-only, backed up by the usual rotated copy.
- Group names: typed, trimmed, 1–60 characters, unique in their domain ignoring Unicode case. Tags: trimmed, 1–40 characters, compared ignoring case, the first spelling kept; at most 20 per question — a write past 20 is refused whole.
- Nothing suggests a group or tag name; the tag picker lists only tags already used in view.
- Every SQL statement in `store.rs`; every read/write in view (*current ∪ shared*); a group lives where its domain lives.
- Bulk edits: validated first, one transaction, refused whole; copies in other workspaces are **not** updated.
- Every new command is Studio-only, in `COMMAND_GROUPS` and `generate_handler!`; `npm run map` → `mismatches: []`.
- HeroUI v3 (`heroui-react` skill); copy in `copy/`; commit per task with docs and the co-author line; ask before pushing.

## Review Focus

1. **A domain save from Studio rebuilds `DomainMember`s** (the domain pane, the question editor's membership loop): `domain_upsert` writes exactly the groups it is sent, so every Studio site that builds a member must carry its `groupId`. Tests `saving a domain from the pane keeps each member's group`, `adding a domain in the editor keeps the groups in the others`.
2. **A tag merge that collides** (question carries both) leaves one, never a duplicate key error. Test `merging into a tag a question already has leaves one`.
3. **Bulk Add to domain into a shared domain with a local question** refuses whole, naming them. Test `add to a shared domain refuses local questions, nothing written`.
4. **The default grouping** of a domain with groups must not override a grouping the operator picked. Test `a picked grouping wins over the groups default`.
5. **Search after a tag rename** finds the new tag, not the old. Test `search follows a tag rename`.

---

## P15.0 — host

### Task 1: Migration 5, the model, groups and tags in store

**Files:** `crates/host/src/catalog/{db.rs,model.rs,store.rs,mod.rs}`, new `crates/host/src/catalog/groups.rs`; tests `crates/host/tests/groups_tags.rs`, `upgrade.rs`.

**Interfaces — Produces:**
```rust
pub struct DomainGroup { pub id: DomainGroupId, pub domain_id: DomainId, pub name: String, pub sort_key: i64 }
// DomainMember gains `#[serde(default)] pub group_id: Option<DomainGroupId>`
// Domain gains `#[serde(default)] pub groups: Vec<DomainGroup>` (read-only on the wire; written by the group verbs)
// Question gains `#[serde(default)] pub tags: Vec<String>`
impl CatalogService {
    pub fn group_create_in(&self, domain: &DomainId, name: &str, now: u64) -> CatalogResult<DomainGroup>;
    pub fn group_rename_in(&self, group: &DomainGroupId, name: &str, now: u64) -> CatalogResult<()>;
    pub fn group_reorder_in(&self, domain: &DomainId, order: &[DomainGroupId], now: u64) -> CatalogResult<()>;
    pub fn group_delete_in(&self, group: &DomainGroupId, now: u64) -> CatalogResult<()>;   // members → no group
    pub fn tag_list(&self) -> CatalogResult<Vec<TagCount>>;                                   // in view, archived included
}
pub struct TagCount { pub tag: String, pub questions: usize, pub shared: usize }
```
Migration 5: `domain_groups(id PK, domain_id → domains ON DELETE CASCADE, name, sort_key, created_at, updated_at)`, `ALTER TABLE domain_questions ADD COLUMN group_id TEXT REFERENCES domain_groups(id) ON DELETE SET NULL`, `question_tags(question_id → questions ON DELETE CASCADE, tag TEXT, tag_key TEXT, position INTEGER, PRIMARY KEY(question_id, tag_key))`. `domain_upsert` writes each member's `group_id` and refuses a group of another domain; `question_upsert` writes tags delete-then-insert after cleaning (trim, fold with `to_lowercase`, keep the first spelling already used in view, cap 20 → `Invalid`). Search text gains the tags. Transfer copy maps group ids (new rows) and drops a member's group when the domain is reused; `duplicate_into` copies groups. Propagation: tags are body (`with_body` carries them), groups are not.

- [ ] Failing tests (ids from the list: migration, groups CRUD, membership survival, tags rules, cap, search, copy/duplicate/reuse/propagation interplay) → `cargo test -p questiongame-host --test groups_tags` FAIL → implement → PASS → `npm run test:host` green → commit `P15.0: groups inside domains and tags on questions`.

### Task 2: Bulk edits and Manage tags

**Files:** new `crates/host/src/catalog/bulk.rs`; `crates/app/src/commands/catalog.rs` (+ commands), `lib.rs`, `packages/contract/src/commands.ts`; tests `crates/host/tests/bulk.rs`.

**Interfaces — Produces:**
```rust
pub enum BulkEdit { Tag(String), Untag(String), Group { domain: DomainId, group: Option<DomainGroupId> },
                    AddToDomain(DomainId), RemoveFromDomain(DomainId), SetDifficulty(Option<u8>) }
pub struct BulkReport { pub changed: Vec<QuestionId>, pub unchanged: Vec<QuestionId>, pub shared: usize }
pub fn catalog_bulk_edit(&self, ids: &[QuestionId], edit: &BulkEdit, write: bool, now: u64) -> CatalogResult<BulkReport>; // write=false is the preview
pub fn tag_rename(&self, from: &str, to: &str, write: bool, now: u64) -> CatalogResult<BulkReport>;   // to an existing tag = merge
pub fn tag_delete(&self, tag: &str, write: bool, now: u64) -> CatalogResult<BulkReport>;
```
Commands: `catalog_bulk_edit { ids, edit, preview }`, `tag_list`, `tag_rename { from, to, preview }`, `tag_delete { tag, preview }`, `domain_group_create|rename|reorder|delete`. A preview runs the write in a transaction and rolls it back. Refusals: a 21st tag, a local question into a shared domain (`ScopeRule`, naming them), a group of another domain, an id not in view.

- [ ] Failing tests → implement → PASS; `npm run test:host && npm run test:app`; `npm run map` mismatches empty → commit `P15.0: bulk edits and Manage tags`.

## P15.1 — Studio

### Task 3: Types, fake, list views

`host/types.ts` (`DomainGroup`, `groupId` on members, `groups` on domains, `tags` on questions, `BulkEdit`, `BulkReport`, `TagCount`), `host/fake.ts` (every new command, same refusals), `host/listSpecs.ts` (questions: **Group** filter and grouping inside a domain, **Tag** filter (multi) and grouping everywhere; the default grouping is `groups` when the domain has groups and the tab has no picked grouping), `host/useListView.ts` (computed default). Tests: spec shape, defaults, fake parity.

### Task 4: Editor, dialogs, bulk Edit

`molecules/TagField` (chips + picker of used tags; typing a new one adds it; no suggestions), `organisms/QuestionEditor` (tags; a group picker beside each domain the question is in, saved with the domain memberships), `organisms/GroupsDialog` (inside a domain: New group · Rename · Move up/down · Delete; also reachable from a group header's menu), `organisms/ManageTagsDialog` (each tag with counts; Rename/merge, Delete, confirms with counts and the shared count), `organisms/useBulkEdit` (the bulk bar's **Edit…** menu: Tag…, Untag…, Group…, Add to domain…, Remove from domain, Set difficulty…, each previewed then confirmed). Copy in `copy/groupsTags.ts`. Tests per dialog and menu.

- [ ] Commit `P15.1: groups, tags and bulk edits in Studio`.

## P15.2 — end to end, docs

### Task 5: e2e and docs

`e2e/specs/groups-tags.e2e.ts`: make two groups in Geography, put two questions in one by bulk Group…, see the headers; tag questions in two domains, filter by the tag under All questions; bulk Set difficulty. Docs: `05_STUDIO_DESIGN.md` §22, `host.md`, `studio.md`, `03_CONTEXT.md` (Group in a domain, Tag), roadmap P15, history, *What's new* next beta (EN, RO). Gate: `typecheck · lint · test:all · lint:host · lint:app · map:check · e2e`.
