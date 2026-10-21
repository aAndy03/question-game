# beta.3: copy, import, the editor, readable refusals

Status: built, 2026-10-21 (reviewed by Opus and Sonnet; every finding fixed). The scope is the roadmap's beta.3 line (approved with the shared-library design), from the two parity audits. `main` only.

## What changes, and the rule each follows

**Copy**
1. **Archive state is kept**: a copied row arrives archived if its source is archived, as Duplicate already does (audit P12).
2. **A copied game always loads as its original does**: a question that only came along is reused only if its copy in the target still has the same difficulty and completeness; otherwise it is copied fresh (audit P11).
3. **Twin names are said, not refused**: the transfer preview lists a picked row that would arrive beside a row of the same name in the target (`TransferReport.twins`). The dialog says "Club already has a team named Red." *(My call: a hard rule would block copies the operator means. A warning keeps the choice theirs, and the maintainer may harden it later.)*

**Import**
4. **The preview says where each row lands**: the domains (name and code), its tags, and for a duplicate, which question it duplicates.
5. **Two domains with one name**: a row naming the name lands in the oldest-created one, and the preview row says so ("History (HIS_100), the oldest of 2 named History"; a code naming another: "one of 2"). A code always picks exactly.

**Question editor**
6. **One write**: the question and every membership it changes are saved together (`catalog_upsert_many`), so there is never a saved question with a refused membership. When copies are updated, the memberships ride in the propagating save's transaction (`with`). A refusal there is a notice, never "Question saved".
7. ***Also update copies* is asked only when the body changed**: the stem, options, difficulty, explanation, media or tags. A change of domain or group is not the copies' business.

**Refusals and notices**
8. **Names, not ids**: `StillUsed`, `ScopeRule` and `WrongWorkspace` messages name the row (team Red, domain History, game Friday), and `referenced_by` names what uses it ("the game Friday"). This also fixes "Still used by a a recipe board".
9. **Archive confirm, bulk too**: archiving rows that games use names those games, for one row or many.

**Small fixes**
10. **Team colour**: the colour text field shows a colour (hex) or nothing. A theme colour token (`var(--state-incorrect)`, the Demo's) is shown by its swatch, never as raw text. *(Found running the real app.)*
11. **Dialog actions never leave the frame** (done, 0a5e24b).

## Non-goals
No change to what a copy reuses beyond rule 2. No hard uniqueness rule. No new notice codes: a readable message is the notice.
