# beta.5: the rest of the parity audits

Status: building, 2026-10-21. The scope is the roadmap's beta.5 line, from the two parity audits. `main` only.

## What changes, and the rule each follows

**Detail panels**
1. **A row says what it is part of.** Team and Question detail, and the domain's edit pane, gain a *Copies* block: each other member of the row's family with its workspace (and *Archived*), from a new read `catalog_family(kind, id) -> FamilyCopy[]`, and *Stop following its copies* (`catalog_unfollow`) under it. A row with no copies shows no block. Question detail also shows its **tags** as chips and, per domain, its **domain group** ("History · Capitals").

**Statistics**
2. **A Workspace dimension.** `StatsDimension::Workspace`: turns grouped by the workspace their game lives in (named; a deleted workspace's id stays as the label). Offered only when *All workspaces* is on — inside one workspace it is one row.
3. **A team's Plays are this workspace's.** `Team.playCount` / `lastPlayAt` count Plays of games in this workspace only (a moved team no longer shows the old workspace's history here).

**Settings**
4. **"In this workspace"** wherever an action is this workspace's: *Wipe Plays* ("Deletes every closed Play of this workspace and its events…"), the Demo rows ("Adds the Demo's teams, domains, questions and game to this workspace").

**Manage workspaces**
5. **On the list-view model**: search, sort (name, created, changed), grouped by workspace group (default) or none, a Status filter (active / archived / all), group headers carrying the group's Rename · Move up · Move down · Delete. Row actions unchanged.

**Vocabulary**
6. **Every "group" says whose**: *Workspace group* (New workspace group, No workspace group, Delete workspace group, Workspace group name) and *Domain group* (New domain group, No domain group, Delete domain group, Domain group name); "Group" alone stays only for the list's *Group by*. **Tags say whose too**: the Games filter is *Game tag*, the Questions one *Question tag*. `03_CONTEXT.md` names both.

**Health**
7. **A library check.** `health.library_refs` (warn) when the library holds references that point at nothing or at another workspace — a domain member, a roster entry, a board domain or question, a team logo, a question's media. The notice says how many and offers **Repair** (`library_repair`): those references are removed, nothing else, after a confirm naming the count. Checked with every health report; cheap (counts in SQL).

**Strings**
8. **Every readable string from `copy/`**: the toasts (Team saved, Operator saved, "… is in Control"), the Plays table headers, the aria-labels the audit listed (Archive scope, Bulk actions, Unsaved changes, Screens, Sections, Game sections, Dismiss, Canvas), the detail panels' "id" label.

**Duplicate**
9. ***Duplicate* within a workspace** for teams, domains and questions (`catalog_duplicate(kind, ids)`): a new row with a new id, its name with " (copy)" (a question keeps its text — the twin note says it), **not** in the source's family (a duplicate is a variant to edit, not a copy to follow — *My call*). A duplicated question joins the source's domains, at the end, in the same group; a duplicated domain holds the same questions (members, not copies) and copies of its groups. Row action and bulk action; the transfer refusal for the same workspace now points at it truthfully.

**Accessibility**
10. **The disabled switcher's reason is reachable by keyboard**: it uses `DisabledReason` (focusable, named by the reason), as every disabled `Button` does.

## Non-goals
No game-tag or folder editor (the model has them; nothing edits them yet — an interface pass). No automatic repair. No change to what a copy follows.
