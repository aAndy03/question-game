# 09 — Screens tab (canvas)

## This file owns

The Screens tab: a canvas used when the game is **not** playing, to visually modify the Screens / Slides that will later go on Stage.

## When it is used

Only when the game is not playing.

The game can play even if the operator has never used this tab. Screens already have everything default as they are built.

## What the operator does here

1. Load a Game (from the Game tab library)
2. Loading the Game also loads the questions, domains, and the rest of that Game
3. Visually modify each component of the Screens that go on Stage
4. All modifications are saved to the Game that was loaded
5. What has not been modified stays as default
6. When that Game is played, Screens / Slides show on Stage / Presentation with those modifications

## Examples of modifications

- Change font, font size, color
- Apply a change to **all screens** or to the **current screen**
- If a question text is too small and out of bounds: resize the component, move it, and similar

## Layout

This needs a **layout engine**:

- either custom from zero
- or based on dnd-kit or some other library

The **dialkit motion** package can be used here.

## Why this is a separate concern from Stage

Stage shows the result.

Screens tab is the workshop.

Control tab Viewer is neither of these: it shows Stage plus operator-only overlays while a game is playing. Viewer overlays must never be saved as part of the Stage design.

## What this file does not own

The list of Screens / Slides, transitions, or live operator reveals.

## Depends on

- [07-libraries-and-metadata.md](07-libraries-and-metadata.md) — load a Game
- [10-stage-screens.md](10-stage-screens.md) — the Screens being edited
- [03-stack.md](03-stack.md) — dnd-kit, dialkit motion

## Talks to

- [08-app-studio.md](08-app-studio.md)
- [12-control-tab.md](12-control-tab.md) — Stage later shows the saved look
- [15-state.md](15-state.md) — saved modifications belong to that Game
