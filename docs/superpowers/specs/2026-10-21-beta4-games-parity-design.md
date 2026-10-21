# beta.4: games parity

Status: built, 2026-10-21. The scope is the roadmap's beta.4 line (approved with the shared-library design), from the two parity audits. `main` only; rule 9 is also stable 1.1.1's (the board difficulty prompt) and is built so it can be carried to `release/1.x`.

## Why

The library tabs got list views (stable 1.1), groups and tags (P15), copy and move (P14) and bulk bars. The Game page did not: a board is still built one domain and one checkbox at a time, a roster one team at a time from a select, the Games list has no bulk bar, the Game page has no Copy, Move or Duplicate, a Play is named by its id, and the difficulty edit is a `window.prompt`. A library of 300 questions makes the board unworkable.

## What changes, and the rule each follows

**Pickers on the list-view model**
1. **Three picker dialogs**, one organism (`PickerDialog`) over `useListView`: *Add teams…* (Roster), *Add domains…* and *Choose questions…* (Board, per domain). Each has the library toolbar's search, the spec's filters, grouping and paging (100), a checkbox per row, a header checkbox per group (*select all in this group*) and one for the page, and *Apply* / *Cancel*. What the dialog holds is the dialog's own choice — it starts as the game's current membership and survives filter, search and page changes (unlike a library selection, which a filter clears). *Apply* writes `recipe_set_membership` once.
2. **Choose questions** lists the domain's questions with *Difficulty* (range) and *Tag* filters and *Group: Domain groups* (the default when the domain has groups). A row that cannot go on the board is shown disabled with its reason — incomplete (its gaps), or another chosen question has its difficulty while repeats are off. *Select all in this group* ticks the eligible rows in list order, skipping a difficulty already taken, so it never produces a board the host refuses.
3. **The board and the roster on the page** stay as they are drawn now — the roster in order with Move up / Move down / Remove, a domain card with its chosen questions — minus the inline add controls, which become the dialogs' buttons. A domain card lists only its chosen questions, each with its difficulty, the *this game* difficulty and Remove. *(My call: the inline checkbox list is what does not scale; the chosen list is what the operator reads during prep.)*

**Archived rows on a game**
4. **An archived team on the roster is refused at Load**, as an archived domain or question already is: `snapshot::build` checks it and names it ("the roster has the archived team Red; restore it or take it off the roster"). The roster shows such a team by name with an *Archived* chip, never by id.
5. **The Rules preview warns** before Load: a new warning `archivedOnGame` lists the archived teams, domains and questions the game still names, by name.

**Original edits follow their copies**
6. ***Apply to original* goes through *Also update copies***: when the row has copies, the same question the editors ask (*Save here only* · *Also update n copies*) is asked after *Apply to original*. `recipe_set_overlay` takes `alsoCopies`; with it, the Original arm writes through the propagating save in the same call.

**The Game page and the Games list**
7. **The Game page header** gets a menu beside Archive: *Duplicate*, *Copy to…*, *Move to…* — the Games list's row actions, with the same refusals (Move is disabled while the game is playing). Duplicate opens the new game.
8. **The Games list has a bulk bar**: *Archive*, *Restore*, *Copy or move…*. A game that is playing is left out of Archive and Move and the bar says so.
9. **The difficulty edit is a dialog** (`DifficultyDialog`): a number field 1–100 with the current value, then the scope choice (*This game* · *Apply to original*) in the same frame. No `window.prompt` anywhere in Studio.

**Plays**
10. **A Play is named, not numbered by id**: "Play 3" — its place among this game's Plays by start time — with its date; the id stays in a tooltip for support. *(My call: the host has no Play name, and a name the operator types is not asked for; an ordinal is what the operator says out loud.)*

## Non-goals
No change to what a board may hold (§2.31, §2.32) or to Load's other checks. No Play rename. No bulk edit of game settings. No new picker for the Rules tab.

## Left to the builder
The picker's layout inside a `Modal` (`lg`), the specs' sort options (name; for questions, difficulty then text), copy wording within `copy/`, and the e2e coverage on the real app (the pickers, the difficulty dialog, the bulk bar, an archived team refused at Load).
