# 12 — Control tab

## This file owns

The Control tab: the operator room while a game is playing. Viewer, panels, Stage target, live overrides, Action Panel, Strips, Game panel, Timeline.

## Overall layout named in the notes

- **Centre** — Viewer of the Stage / Presentation
- **Bottom** — Timeline panel; others will follow
- **Right top** — Actions panel
- **Right bottom** — Strips panel of all the Screens / Slides
- **Left** — Game panel
- **Top** — some control settings, including:
  - Stage [External Display 1, 2, 3, etc]
  - Statistics [External Display 1, 2, 3, etc]
  - other settings still open
  - a settings icon opens a **floating window** for live-safe settings (reveal mode, Stage/Statistics display, overlay animations, volume). Scoring and judging stay in the Game tab / Play snapshot.

## Panels can move and resize

These panels can resize and adapt and can be moved, even the Viewer.

Panels are resizable with **min** and **max** per width and height.

Panels can be arranged between panels in the Control tab.

Multiple panels can stack, so the user has tab control and can change between them.

## Scale when space is limited

Each component (of the panels, and of groups) has to have a state and a visual style for scale:

- How do I look when space is limited?
- What options can I show directly when space is limited?
- Based on the space available, how many steps to show all of my components?

All components can allow for scroll, but only **vertical**, not horizontal.

## Viewer

The Viewer shows the same Screens that are on Stage, but with some modifications.

These modifications are **overlays**.

Purpose: so the operator can interact with some elements from the Screens through the Viewer, without overloading the Action Panel.

Overlays are a **separate concern** from Stage:

- Stage Screens do not show the overlays
- Stage does not show the mouse as a control tool

### Override turn from Order of teams, through the Viewer

On Order of teams, the operator can click the actual components of the Screen (in the Viewer) to give the turn to another team instead of the default order.

Default order of teams is set in the Game tab.

The operator can change that through the Viewer **while the game is playing**.

The default order still continues once the team that was selected by the operator answers wrong.

If the operator overrides again, that is allowed. The default order continues after that.

### How to override if Order of teams is never shown

If the operator never shows Order of teams, they cannot click a team name on that Screen.

Answer in the notes: there are actions in the **Action Panel**.

The default order engine (or whichever engine owns this) adapts dynamically so that a team is not overlooked.

## Action Panel — team table and drag-and-drop

The Action Panel will show a table with all teams. The operator can drag and drop them.

Clarification from the notes: **all teams’ turns have to be in sync**.

A team can play on its turn an infinite number of questions and get points.

### Sync rule — the principle

The rule does not depend on how many teams are playing. For any number of teams:

- Count how many turns each active team has had in this Play.
- No team may start its next turn until **every** active team has finished the current one.
- So the turn counts across teams never differ by more than one.
- The operator cannot override the same team into two turns in a row.

An override may only hand the turn to a team that has not yet played in the current round. The engine never skips a team to satisfy an override — it completes the round first, then opens the next one.

### The same rule, in the notes’ numbers (illustration, four teams)

The source notes used four teams. That count is an example, not part of the rule.

If Team 1, Team 2, Team 3, Team 4 have turns `[1,1,0,1]` and questions `[20,2,0,4]`, the order cannot go to `[2,1,0,1]` — Team 3 has not played this round.

All teams have to play their turn `[1,1,1,1]`, questions `[20,2,1,4]`, then the turn can go `[2,1,1,1]`.

If turns are `[1,1,0,0]`, the order of turns cannot be `[2,1,0,0]` or `[1,2,0,0]` or `[2,2,0,0]`.

With three teams the same rule reads `[1,0,0]` cannot become `[2,0,0]`. With a single team (rehearsal), there is only ever one legal next turn and override does not apply.

The formal statement lives in `optimized_first_spec.md` §5.4.

## Game panel

From the Game panel:

- select which Game to load
- the game starts when the operator presses **Play**
- **Pause** and **Resume** (recording breaks: pee-break, hunger-break, and similar)
- **Restart** options — see [13-play-restart-replay.md](13-play-restart-replay.md)
- choose whether Question / Leaderboard pieces appear automatically or wait for the operator

## Strips panel

Strips panel of all the Screens / Slides.

This is how the operator can decide what Screen to show on Stage.

Choosing a Screen always goes through the transition rules in [11-transitions-and-reveals.md](11-transitions-and-reveals.md).

## Timeline panel

Optional panel. By default it is **collapsed**.

Use case named in the notes: a simple interface for the operator to see the order of the elements that played.

On a studio set, unexpected things happen. Pause / Resume is in the Game panel.

Timeline also allows **undoing turns and redoing them**.

The operator can go back one, two, three, or all turns.

If needing to go back from the beginning, the app will warn: better to **restart** the game from the Game panel.

That warning is for metadata (clear metadata about the game) and because it would be illogical to rewind to the start when Restart exists.

## Time, select, lock, reveal on Question Screen

Time starts when the operator starts it from the Action Panel.

Answers have three acts: **select** → **lock** → **reveal outcome**.

- Default outcome reveal is operator-driven, not automatic.
- Timer hits zero with a selection: auto-lock. Do not auto-reveal.
- Timer hits zero with no selection: do not auto-lock and do not auto-reveal wrong. Operator may still select and lock after expiry (team shouts the answer at 1 second), then reveal.
- Reveal with nothing selected or locked counts as wrong.

## What this file does not own

How points are calculated, how libraries are edited, or the art of each Screen.

## Depends on

- [05-questiongame-rules.md](05-questiongame-rules.md)
- [10-stage-screens.md](10-stage-screens.md)
- [11-transitions-and-reveals.md](11-transitions-and-reveals.md)
- [02-platform-and-health.md](02-platform-and-health.md) — real external displays
- [13-play-restart-replay.md](13-play-restart-replay.md)

## Talks to

- [08-app-studio.md](08-app-studio.md)
- [14-statistics.md](14-statistics.md) — live statistics; Statistics may also target an external display
- [15-state.md](15-state.md) — Viewer, Stage, and panels stay in sync
