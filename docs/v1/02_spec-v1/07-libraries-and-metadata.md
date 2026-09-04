# 07 — Libraries and metadata

## This file owns

The reusable libraries inside the studio: Teams, Domains + Questions, Games, Operators. How delete works. Why metadata matters. How the same items can be used in many Games and many Plays.

## Shared library rules

These rules repeat on the library tabs:

- Full create, read, update, delete
- Delete is **soft delete**, into **archive**
- **Metadata full** — includes all possible data: when played, plus technical, and similar
- Most of these tabs need **search** (Tantivy in Rust; one reusable search component)

Reusable items:

- Teams
- Domains
- Questions

They can be added in any Game. That is why each one must handle its metadata correctly.

## Teams tab

Manager for all teams.

Library of teams.

Full CRUD.

Metadata for each team (includes all possible data, when played, plus technical, and similar).

Delete is soft delete, in archive.

## Domains + Question tab

Library of all the domains + questions.

Full CRUD.

Here all questions are created.

Here all domains are created and managed.

Difficulty for each question.

Metadata full.

All delete is soft delete, in archive.

A domain holds n questions. A question belongs in the library and can be placed into domains / games as the Game tab requires.

## Game tab

Library for all played games — and also the place where a Game is created and configured.

The Game tab shows all games as **cards / folders**.

In-tab navigation is required.

Full CRUD.

Delete is soft delete, in archive.

Metadata full.

In the Game tab the operator configures everything for the game: add teams, add domains + questions, modify game settings, and similar.

## Operators tab

Library of all operators.

Full library behaviour is expected to follow the same pattern (CRUD, metadata, archive, search), even where the notes are shorter.

## Screens tab is not a library of people or questions

Screens tab loads a Game and visually modifies Screens / Slides. It is documented in [09-screens-tab.md](09-screens-tab.md). Modifications save onto the loaded Game.

## Why metadata exists

The same Game can be played an infinite amount of times.

The same Game can play with some settings, or with different settings and setups.

Each Play of the same Game must correctly manage its own metadata.

Teams, domains, and questions are reusable. Metadata must show when they were used, in which Games / Plays, and technical facts, without mixing one Play into another.

## Archive

Soft delete means the item leaves the active library and sits in archive.

The notes do not define restore screens in detail. Archive is still the required delete behaviour.

## What this file does not own

How a Play is started from Control, or how Stage looks.

## Depends on

- [05-questiongame-rules.md](05-questiongame-rules.md)
- [06-game-settings.md](06-game-settings.md)
- [13-play-restart-replay.md](13-play-restart-replay.md)

## Talks to

- [08-app-studio.md](08-app-studio.md) — tabs that show these libraries
- [14-statistics.md](14-statistics.md) — statistics read this metadata
- [15-state.md](15-state.md) — a library change must update every tab that shows that item
