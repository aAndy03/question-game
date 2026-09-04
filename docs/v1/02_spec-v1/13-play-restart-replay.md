# 13 — Play, restart, replay

## This file owns

The difference between a prepared Game, one actual Play of that Game, a Restart during recording, a later Replay, Timeline undo, and why metadata must not mix them.

Locked names from the clarification pass: **Game recipe** in the Game tab, **Play** for one run, **Restart** for a new Play now, **Replay** for another Play later. No git branches in the operator UI.

## What the notes already require

The same Game can be played an infinite amount of times.

The same Game can play with some settings, or with different settings and setups.

A distinction is needed for metadata, so each play of the same game can correctly manage its own metadata.

All questions are reusable. Teams, domains, questions can be added in any game. Each must handle metadata correctly.

## Restart (during the current run)

From the Game panel the operator can restart.

In the Game tab, the user can add multiple questions to the game anticipating at least 2 restarts.

When restarting from the Game panel, the operator should get the option:

- restart with **same questions**
- or **different questions**

## Replay vs restart

The notes say this seems similar to “the game can be replayed multiple times with settings and other variables different (teams, questions)”.

But a **replay is different from restarting**.

The notes say: *What differs? Well I do not have the terminology now.*

## Version control thought from the notes

The app clearly needs a version control for each little thing.

Maybe:

- a **replay** is a different version in branching (version control)
- a **restart** is just a restart in the same branch

Locked: recipe revisions + Play records + append-only events (including undo inversions). Not git branches. See `optimized_first_spec.md`.

## Timeline undo is not a restart

Undo / redo of turns stays inside the current run.

Going back to the beginning should warn: use Restart from the Game panel instead.

Reason named in the notes: metadata clarity, plus it is illogical to rewind everything when Restart exists.

## Proposed names (proposal only)

These names are offered so later files can talk without mixing ideas. They can be renamed.

| Name | Meaning |
| --- | --- |
| **Game** | The prepared setup in the Game tab: teams, domains + questions, settings, screen modifications |
| **Play** | One actual run of that Game, started with Play in the Game panel. Has its own metadata |
| **Pause / Resume** | Same Play, clock and recording stop / continue |
| **Restart** | End the current Play’s progress and start a new Play from the same Game now. Option: same questions or different questions. Same Game card / folder |
| **Replay** | Another Play of that Game at another time. May keep the Game as-is, or use a changed setup (teams, questions, settings) |
| **Undo turns** | Step backward inside the current Play. Not a new Play |

Expiry of a question (“never played again in the current game”) means: never again in **this Play**.

A Restart with different questions, or a later Replay, can use questions again from the library.

## Proposed strategy instead of git-style branches for the operator

Do not make the operator think in git branches.

Use three layers of history:

1. **Game** — the recipe. If the recipe changes (settings, teams, screen look), that Game has versions of the recipe.
2. **Play** — each press of Play / each Restart creates a Play record under that Game.
3. **Turns** — events inside one Play. Timeline undo / redo moves on this list.

Undo restores materialized state so the Play continues from there. Events are **not** rewritten. An invert event is appended so metadata stays a real history.

That gives version control for “each little thing” without asking the operator to merge branches.

## What this file does not own

How Play is pressed in the UI chrome (Control tab does), or statistics charts.

## Depends on

- [05-questiongame-rules.md](05-questiongame-rules.md) — expiry language
- [07-libraries-and-metadata.md](07-libraries-and-metadata.md)
- [12-control-tab.md](12-control-tab.md)

## Talks to

- [14-statistics.md](14-statistics.md) — each Play is a statistics subject
- [16-open-questions-and-proposals.md](16-open-questions-and-proposals.md)
