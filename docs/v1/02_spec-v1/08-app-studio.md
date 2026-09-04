# 08 — App studio (shell and tabs)

## This file owns

The app as a studio: installation, first-time setup, the chrome around content, the tabs, in-tab navigation, sidebar behaviour, and the operator’s day-to-day flow.

## Installation and first time

**Installation screen**

**First time setup screen.** Each of the settings the setup contains can be modified later from the Settings tab.

## Shell

Sidebar + Content + Top bar + Bottom bar (Status bar).

## Sidebar

All tabs show up in the sidebar.

The sidebar can be collapsed in two ways:

1. **Strip** — only the icons are shown
2. **Hidden completely** — it can be added again by dragging from the left edge of the app

## In-tab navigation

All tabs can offer in-tab navigation back-and-forth. As deep as every tab content requires.

Example already named: Game tab uses cards / folders and needs in-tab navigation.

## Tabs

### Teams tab

See [07-libraries-and-metadata.md](07-libraries-and-metadata.md).

### Domains + Question tab

See [07-libraries-and-metadata.md](07-libraries-and-metadata.md).

### Game tab

See [07-libraries-and-metadata.md](07-libraries-and-metadata.md) and [13-play-restart-replay.md](13-play-restart-replay.md).

### Screens tab

Only used when the game is **not** playing.

See [09-screens-tab.md](09-screens-tab.md).

### Control tab

Used to run Stage.

See [12-control-tab.md](12-control-tab.md).

### Statistics

Live statistics for the currently playing game, and statistics of all data.

See [14-statistics.md](14-statistics.md).

### Operators

Library of all operators.

See [07-libraries-and-metadata.md](07-libraries-and-metadata.md).

### Settings tab

Manages all the global settings.

See also [06-game-settings.md](06-game-settings.md).

Numbering in the source notes jumps (3.8 appears twice). Names above are the tab names, not the old numbers.

## Search

Most of these tabs need a search.

Use Tantivy for Rust so search is not built from zero.

The search component can be reused in Questions, Teams, Game, Screens, Operator tabs, and similar.

## Flow imagined in the notes (recorded show)

1. Add teams in Teams tab
2. Add questions in the Question tab (Domains + Question tab)
3. Add Game in Game tab. Configure everything for the game. Add teams, domains + questions, modify game settings, and similar
4. Optionally load the game in Screens tab (canvas) and apply modifications. All modifications save automatically
5. To play a game, go into Control. From the Game panel select which game to load. The game starts when the operator presses play from the Game panel

## What “play a game” must mean

A distinction is needed for metadata.

Each play of the same game must correctly manage its own metadata.

See [13-play-restart-replay.md](13-play-restart-replay.md).

## Status bar

Bottom bar is the Status bar.

Health errors, warnings, and necessary info from [02-platform-and-health.md](02-platform-and-health.md) have a place here, without turning the whole studio into a health dashboard.

## What this file does not own

Game rules, Stage drawing, Control panel internals beyond “this tab exists”.

## Depends on

- [01-product-context.md](01-product-context.md)
- [02-platform-and-health.md](02-platform-and-health.md)
- [07-libraries-and-metadata.md](07-libraries-and-metadata.md)

## Talks to

Every tab file. This is the map of the studio.
