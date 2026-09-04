# 15 — State

## This file owns

How changes travel through the app so nothing is looking at old information.

## Instant update in the same tab

The app needs state management.

If in the same tab a change happens, and other components depend on or use that variable that changed, all have to update instantly.

## Update across tabs

If something changed in a tab, it has to reflect in other tabs as well.

Examples that follow from the rest of the spec:

- Rename a team in Teams tab → Game tab, Control Viewer, Stage (if that team is on a Screen), Statistics, search results
- Change a question’s text in Domains + Question tab → Screens canvas if that Game is loaded, Stage Question Screen in a later Play
- Press Play in Control Game panel → Status bar, Statistics live view, Stage leaving Idle
- Override whose turn it is in Viewer → Order of teams, complementary animation on Domain, Action Panel table, Statistics
- Soft delete to archive → item disappears from active library lists, remains findable in archive

## Engines also have state

Layer 2, Layer 3, Layer 4 and so on manage their own states and metadata, on top of the Layer 1 engines they bind.

Visual versions of components surface because the backend caused them, or because something changed in the backend.

## Stage vs Viewer vs Screens tab

Three places can show “the same Screen” for different jobs:

- **Stage** — audience
- **Viewer** — operator, plus overlays
- **Screens tab canvas** — workshop, only when not playing

They must not fight:

- Overlays never leak onto Stage
- Canvas edits never apply to the wrong Game
- Viewer always follows the current Play + current Screen

## Quality

Stay optimized while offering fullstack quality.

No memory leaks (also a health rule).

Atomic saves where a group of changes belongs together.

## What this file does not own

Which engine computes points, or how GSAP tweens are written.

## Depends on

- [04-layered-engines.md](04-layered-engines.md)
- [08-app-studio.md](08-app-studio.md)

## Talks to

Every file that describes a thing the operator can change.
