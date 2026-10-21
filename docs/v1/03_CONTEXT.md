# QuestionGame

A desktop studio for a question-and-answer competition: one operator app, one audience Stage.

## Language

### People and surfaces

**Operator**:
The person who runs the studio app and commands Stage.
_Avoid_: user, admin, host (ambiguous with Rust host)

**Moderator**:
The person in the room with the teams who watches Stage, not the studio chrome.
_Avoid_: presenter, MC (unless you later split the role)

**Team**:
A competing side in a recipe and a Play.
_Avoid_: player, contestant (individuals are not first-class)

**Studio**:
The operator application: libraries, Control, Settings.
_Avoid_: app (too wide), dashboard

**Stage**:
The fullscreen audience surface on a chosen monitor.
_Avoid_: Presentation, slide deck, output

**Viewer**:
The Control preview of Stage plus operator hit targets. Never shown on Stage.
_Avoid_: preview (too generic)

### Recipe and run

**Recipe**:
The prepared package: roster, board, settings, layout, overlays. Operator tab label is **Game**.
_Avoid_: template, match, “recipe tab”

**Play**:
One run of a recipe, with its own snapshot and event log.
_Avoid_: session (conflicts with question session), game, match

**Snapshot**:
The copy of recipe + overlay-applied bodies taken at Play start or Restart.
_Avoid_: clone, fork

**Event**:
An append-only fact in a Play. Undo appends an invert; it does not rewrite.
_Avoid_: log line, mutation

**Restart**:
A new Play, now, from the same recipe. Same questions or different questions.
_Avoid_: reset, rewind

**Replay**:
Another Play of that recipe on another day.
_Avoid_: rematch, resume

**Archive**:
Soft-delete of a library row, scoped to that tab. Restore is allowed.
_Avoid_: delete, trash

**Incomplete (question)**:
A library question with a gap — no text, fewer than two options, no correct answer, no difficulty, or no active domain. Stored and editable; never on a board, never in a Play.
_Avoid_: draft, invalid, broken

**Import**:
Bringing many questions into the library from one JSON file, previewed before anything is written.
_Avoid_: upload, sync

**Overlay (recipe)**:
A per-recipe patch of a catalog field (this game only).
_Avoid_: overlay (Stage animation — that is Overlay animation)

### Competition

**Domain**:
A named group of questions a team may choose. Stage lists only domains on the recipe board.
_Avoid_: category, topic

**Question**:
The catalog item: stem, options, correct marks, difficulty.
_Avoid_: card, clue

**Difficulty**:
Integer 1–100 on a question. Cursor is easy to hard inside a domain.
_Avoid_: level, points (points are awarded separately)

**Board**:
The recipe’s chosen domains and chosen questions, with order and overlays.
_Avoid_: map, pool

**Token**:
Permission for one team to play until wrong (or cap).
_Avoid_: turn (the period), chance

**Round**:
Each active team receives exactly one token before anyone receives the next.
_Avoid_: cycle, lap

**Session (question)**:
The issued question until it is resolved. Select, lock, reveal live here.
_Avoid_: Play, turn

**Select**:
Working choice. Timer keeps rolling. Not scored.
_Avoid_: pick, highlight

**Lock**:
Frozen choice. Timer stops. Not scored.
_Avoid_: submit, confirm (confirm is a notice step)

**Reveal (outcome)**:
Stage shows result, scores, question consumed in this Play.
_Avoid_: grade, resolve (host verb is fine; audience word is reveal)

**Consume**:
A resolved question is not issued again in this Play. Library keeps it.
_Avoid_: expire (sounds permanent), delete

### Settings and control

**Control-behaviour**:
A setting that may change while a Play is running.
_Avoid_: live setting

**Game-affecting**:
A setting frozen at Play start.
_Avoid_: frozen setting (state, not kind)

**Operator pace**:
No countdown; the operator advances.
_Avoid_: untimed, manual timer

**Scope choice**:
Cancel, *This game only*, or *Apply to original* (the library row) — asked by `DifficultyDialog` (beta.4; once `ScopeConfirm`).
_Avoid_: save dialog

**Notice**:
Studio-owned error, warn, or block with at most three actions.
_Avoid_: toast (one surface only), alert

**Screen**:
One Stage layout (Idle, TeamOrder, ChooseDomain, Question, Scoreboard, FinalLeaderboard).
_Avoid_: Slide, deck page

**Workspace**:
One library of teams, domains, questions and games in the file, named by the operator (Beta 2.0). A row lives in exactly one workspace; it reaches another only by *Copy to* or *Move to* (there is no shared library since beta.2).
_Avoid_: project, space, profile

**Domain group**:
An operator-made group of questions inside one domain, for organising only — boards and Plays never read it (P15). Say *domain group* where *group* could mean a workspace group or a list grouping.
_Avoid_: category, folder, section

**Tag**:
A word or phrase on a question, across domains, part of its body (P15).
_Avoid_: label, keyword

**Copy** (between workspaces):
A new row in another workspace that remembers where it came from — a row and its copies are one **family** — so editing one offers *Also update {n} copies*; *Stop following its copies* leaves the family (Beta 2.0).
_Avoid_: share, link, sync, mirror
