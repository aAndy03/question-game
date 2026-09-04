# 14 — Statistics

## This file owns

Statistics: live, while a Play is running, and the manager of all data afterwards.

## Two main jobs

1. **Live statistics** for the currently playing game
2. **Statistics of all data** — manager of all statistics

## Filters

Offers full filters.

Compound filters: **all variables + time**.

## Two main views

The notes say Statistics has two main views. They are not named beyond the two jobs above. Until a later prompt names them, treat the two jobs as the two views:

- Live (current Play)
- All data (library + all Plays)

## Where Statistics appears

- Its own **Statistics** tab in the sidebar
- Control tab top settings include **Statistics [External Display 1, 2, 3, etc]**

That means statistics can be sent to an external display, separate from Stage. Stage is the show. A statistics display is optional extra.

## Charts

Charts use echarts, in a way that does not fight HeroUI. See [03-stack.md](03-stack.md).

## What Statistics reads

Metadata from Teams, Domains, Questions, Games, Plays, Operators.

Live values from the current Play: scores, turns, domains left, questions left, and similar.

## What this file does not own

Award rules (those produce the numbers). Control panel layout.

## Depends on

- [05-questiongame-rules.md](05-questiongame-rules.md)
- [06-game-settings.md](06-game-settings.md)
- [07-libraries-and-metadata.md](07-libraries-and-metadata.md)
- [13-play-restart-replay.md](13-play-restart-replay.md)

## Talks to

- [08-app-studio.md](08-app-studio.md)
- [12-control-tab.md](12-control-tab.md)
- [15-state.md](15-state.md) — live statistics must update instantly
