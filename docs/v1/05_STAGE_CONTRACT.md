# P1 — The Stage contract

What a Stage screen consumes and exposes. Frozen before any screen is drawn, because the constraints below are structural: a screen built without them cannot be retrofitted to satisfy §2.6.

Code: `packages/contract/src/`. This file explains the *why*; the code is the contract.

| Concern | File |
| --- | --- |
| Screen registry, transition pairs | `screens.ts` |
| Node ids, slot kinds, persistent slots | `nodes.ts` |
| Reveal keys, overlay kinds, animation keys | `reveal.ts` |
| `PlayStateForStage` and helpers | `play-state.ts` |
| Command and event names | `commands.ts` |
| Typed fixtures | `fixtures.ts` → `fixtures/*.json` via `npm run fixtures` |

---

## 1. What Stage receives

`PlayStateForStage` is the stripped snapshot the host sends with `emitTo("stage", "play-state", …)`. The full snapshot goes to `main` only.

Stage never receives operator chrome, Viewer hit-target flags, catalog rows, settings documents, or anything about other recipes. **A leak here is a leak on camera.**

Three shape decisions worth stating, because they are not obvious:

**Reveals are lists of ids, not counts.** `reveals.optionIds` is the ordered list of revealed option ids. A count would assume the operator reveals in array order, and would silently point at the wrong card if the board were ever reordered. Ids survive both.

**Reveal state lives on the Play, not in component state.** It must survive undo and be byte-identical in Stage and the Viewer. This is why `PresentationService` writes reveals *through* `MatchService` rather than keeping its own copy.

**Verdict is presentational; points are separate.** The design system has three result frames — `ALL CORRECT`, `INCORRECT`, `EXTRA SELECTION` — but with partial credit off (the default) the third still scores zero. `outcome.verdict` picks the frame; `outcome.pointsAwarded` is the number.

`contractVersion` is stamped on every snapshot. It bumps when a field is removed or changes meaning, never for additions, so a host/webview mismatch surfaces as a notice instead of a blank screen.

## 2. Node ids

Format `<screen>.<slot>` or `<screen>.<slot>.<key>`. `recipe_set_layout` overrides key off exactly these strings.

Four slot kinds, declared per screen in `SCREEN_SLOTS`:

| Kind | Key | Example |
| --- | --- | --- |
| `static` | none | `question.stem` |
| `entity` | catalog entity id | `scoreboard.row.team-alpha` |
| `ranked` | 1-based rank | `finalLeaderboard.row.3` |
| `indexed` | decorative index | `idle.decor.2` |

**A key is never an array position and never a label.** An operator can spend an afternoon in the Screens canvas; renaming a team or reordering the board must not move that work. `nodeId()` throws on a missing or surplus key, so a malformed id cannot be built. `parseNodeId()` returns `null` instead of throwing, so a stale override from an older recipe revision can be reported and skipped rather than crashing Stage.

Adding a slot is one entry in `SCREEN_SLOTS`. The builder, parser, validator and canvas all derive from it.

## 3. Which nodes must not unmount

> *An overlay plays while `question.option.opt-b` is revealed — which nodes must not unmount?*

**None of them.** That is the whole rule, and it is stronger than it first sounds.

Spec §2.6: an overlay animation "plays on the current screen. It does not remount and does not reset reveal/select/lock." So during an overlay:

- the `question` page stays mounted;
- `question.stem` and every revealed `question.option.*` keep their DOM nodes, so their reveal animations are not replayed and their state is not lost;
- the overlay draws **above** that tree and touches nothing inside it.

React will unmount a subtree for reasons that have nothing to do with intent — a changed `key`, a conditional wrapper, a route swap, a parent re-created because a new object identity arrived from `play-state`. Any of those silently breaks §2.6. Two structural defences:

**Persistent slots.** `header`, `wordmark`, `timer` and `decor` are mounted once in the Stage frame and animated for the life of the Stage window. They live *outside* the page components, so a screen change cannot unmount them. That is what makes a cross-screen transition possible at all — the header does not flicker between `chooseDomain` and `question` because it never re-rendered as a different element.

**Stable keys everywhere.** Every list on Stage keys off an entity id, matching the node-id rule above. Option cards key on `option.id`, team rows on `team.id`, leaderboard rows on rank.

The P3 test corpus asserts this directly: the `overlay-over-question` fixture must render, run an overlay, and finish with the same DOM nodes and the same reveals.

## 4. Reveal and animation keys

`RevealKey` is `stem` | `option:<id>` | `outcome` | `leader:<rank>`. Each maps to one of four channels (`question`, `answers`, `outcome`, `leaderboard`), and each channel is independently `operator` or `auto` (§4.2).

`AnimKey` namespaces everything that can report completion: `transition:<from>><to>`, `overlay:<kind>`, `reveal:<key>`. Stage emits `anim-complete { key }` with one of these and nothing else — that handshake is what stops auto-reveal outrunning GSAP (§11.G).

`screenPairs()` derives all 42 ordered pairs from the registry, so adding a screen automatically demands its transitions rather than quietly shipping without them.

## 5. Fixtures

18 fixtures in `packages/contract/src/fixtures.ts`, authored in TypeScript so they typecheck against `PlayStateForStage` at build time, and emitted to `fixtures/*.json` with `npm run fixtures`.

They cover every screen, the full question lifecycle (issued → stem → partial options → locked → each of the three outcomes), timer expiry with nothing selected, operator pace, paused, a one-team rehearsal Play, and an overlay running over a partly-revealed question.

The test suite asserts invariants across all of them rather than checking them one at a time: the round invariant holds at every team count; no fixture scores before reveal; a lock time exists exactly when a lock happened; at most one overlay is pending; leaderboard ranks reveal lowest-first; no revealed or locked option id is absent from the session's own option list.

At P6 these become integration assertions — the host must reproduce each one as a real emission.

## 6. What P1 deliberately leaves open

- **Copy and labels.** The contract carries ids and values, never strings like `TIMER // REMAINING`. Those belong to the design system.
- **Payload shapes for commands.** Names are frozen; each argument list arrives with the phase that implements it.
- **Studio's own state.** Nothing here describes the Control mosaic, the Viewer, or the libraries.
- **`OverlayKind`** has two members today (`token-handoff`, `round-advance`). It is a union so a third is one entry plus one timeline, not a new event shape.
