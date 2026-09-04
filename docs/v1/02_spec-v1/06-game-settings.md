# 06 — Game settings

## This file owns

Settings that change how a Play behaves. Settings are chosen before the game plays. They can be changed later from Settings, and also configured on a Game in the Game tab.

## General rule

A setting can have multiple options.

The engine of the game can accept different settings.

Logical options should be inferred for each setting, even when the notes only give one example.

First time setup contains settings. Each of those can be modified at any point from the Settings tab. A Game can also carry its own setup (teams, domains + questions, game settings).

## Variables that are set before play

Named in spec v1, plus “other variables not yet included”:

- names
- domains
- questions
- difficulty
- answers
- points
- future variables

## Points awarded

Points awarded is a setting with these options (set on the Game before play):

1. **Flat** — same points no matter the difficulty
2. **Complex / difficulty** — based on the difficulty of the questions
3. **Lock-speed** — base (flat or difficulty) plus extra points from time remaining **at lock**. Wrong or empty reveal is 0.

Every Game setting is surfaced in the Game tab.

Control also has a settings icon that opens a floating window. Only live-safe settings change during a Play (reveal mode, Stage display, overlay animations, volume). Scoring, judging, timer duration, teams, and questions stay frozen for that Play.

Judging defaults: no partial credit; option order does not matter (`{A,C}` equals `{C,A}`).

## Consecutive correct turns

Example from the notes: a setting that owns how many consecutive correct turns are allowed.

This setting exists so that a team cannot finish all remaining questions alone.

## Bonus after consecutive correct turns

Another setting that owns the awarded points can say:

If a team completes consecutive correct turns, they get a bonus award, based on the scoring system.

## What is not a “game setting” in this file

These are related, but they live elsewhere:

- Global app Settings tab — [08-app-studio.md](08-app-studio.md)
- Which external display is Stage — [12-control-tab.md](12-control-tab.md)
- Whether Question / Leaderboard pieces reveal automatically or wait for the operator — [11-transitions-and-reveals.md](11-transitions-and-reveals.md) and Control Game panel
- Screen look (font, size, color, layout) — [09-screens-tab.md](09-screens-tab.md)

## Future settings

The notes say other variables might be introduced later. New settings still follow the same pattern:

- named option list
- set before play
- owned by the Settings engine
- stored on the Game used for that Play
- visible in First time setup and in Settings, when they are global
- visible in the Game tab, when they belong to one Game

## What this file does not own

Turn-by-turn rules (those stay in the rules file even when a setting changes them).

## Depends on

- [05-questiongame-rules.md](05-questiongame-rules.md)
- [07-libraries-and-metadata.md](07-libraries-and-metadata.md) — a Game holds a copy of the chosen settings

## Talks to

- [04-layered-engines.md](04-layered-engines.md) — Settings engine, Award engine
- [08-app-studio.md](08-app-studio.md) — First time setup, Settings tab, Game tab
- [13-play-restart-replay.md](13-play-restart-replay.md) — a later Play of the same Game may use the same settings or different settings
