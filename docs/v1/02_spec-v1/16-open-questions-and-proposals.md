# 16 — Open questions and proposals

## This file owns

Older proposals. Many items below are now **locked** in `optimized_first_spec.md` §2 (expiry per Play, (a)(b)(c)(d), lock-speed award, select/lock/reveal, overlay animations, undo-append, kit split, no haptics). Read that file first. This page remains a pointer, not a second source of truth.

---

## 1. Other engines

### Named in the notes

Question Engine, Award engine, Domain engine, Teams engine, Settings engine, Screens engine, Animation engine.

### Proposed extra Layer 1 engines

Only added where the notes already describe a job that has no named owner:

| Proposed engine | Owns |
| --- | --- |
| Game engine | What a Game is, what is configured on it |
| Play engine | One actual run, Play vs Restart vs later Replay |
| Turn / Order engine | Default order, operator override, turns-in-sync rule |
| Stage / Display engine | Which physical display is Stage, full screen, real OS display list |
| Control engine | Operator commands: Play, Pause, Resume, next Screen, reveals |
| Timeline engine | Played elements, undo / redo of turns |
| Health engine | Background health, memory, errors / warnings / suggestions |
| Files / Paths engine | Install paths, user-files place, uninstall options |
| Search engine | Tantivy-backed search used by many tabs |
| Statistics engine | Live and all-data statistics |
| Archive engine | Soft delete and archive |
| Audio engine | Game sounds and UI sounds |
| Layout engine | Screens tab canvas layout |

Layer 2 binders would pair the ones that already talk in the notes (Domain + Question, Screens + Animation, Teams + Turn / Order, Control + Stage, Game + Settings, Play + Timeline).

---

## 2. What goes in Rust and what goes in Typescript

Direction already in the notes: backend logic in Rust. Visual versions in Typescript + React + libraries. Visual versions surface because the backend changed.

### Proposed split

**Rust (behind Tauri 2)**

- QuestionGame rules and settings as the source of truth
- Award calculation
- Turn / order enforcement (the round invariant: turn counts across active teams never differ by more than one, at any team count)
- Libraries, metadata, archive, atomic saves
- Play / Restart / Replay records
- Timeline events
- Tantivy search
- File paths, install / uninstall options
- Real OS display detection and permissions
- Health checks

**Typescript + React + named libraries**

- Studio shell and tabs
- Control layout, panel resize / stack / scale
- Viewer overlays (not on Stage)
- Screens tab canvas
- Stage drawing of Screens / Slides
- GSAP base transitions and complementary animations
- Reveals of question, answers, leaderboard rows
- Sounds playback
- Charts
- HeroUI / Base UI / icons

The operator never needs this split. It only keeps Stage and Control from disagreeing.

---

## 3. Replay vs restart vs version control

See also [13-play-restart-replay.md](13-play-restart-replay.md).

### Proposal

Do not use git-style branching as the operator model.

Use:

1. **Game** = recipe (can have recipe versions when settings, teams, questions, or screen look change)
2. **Play** = one run (Play and Restart each create a Play record)
3. **Turns** = events inside that Play (Timeline undo / redo)

**Restart** = new Play, now, from this Game, with the named option “same questions or different questions”.

**Replay** = another Play later. If the recipe changed, that later Play uses the new recipe version, or an older recipe version if one was kept.

This matches the notes: metadata must stay clear; rewind-to-start is the wrong tool; Restart exists for that.

---

## 4. Audio package

The notes ask:

- Can `@web-kits/audio` be used to create sounds for the game?
- Or is it only for UI of the app?
- Can it load custom sound files?

This spec does not decide the package. Stage does need sounds (named under Screens / Slides). UI may also need sounds. Custom files should be possible so a recorded show can use its own pack. If this package cannot do that, another audio path is chosen later without changing the product rule.

---

## 5. GSAP vs other motion libraries

The notes say if GSAP is used, svg.js and matter-js might later be dropped.

Product rule that stays either way:

- Every Screen has a base transition to every other Screen
- Complementary animations exist for skipped information
- Question and Leaderboard have a reveal layer after the Screen transition finishes

---

## 6. Unnamed pieces still open

- Exact names of Statistics’ two main views
- Full detail of every Stage Screen (promised for another prompt)
- Full list of “what other settings?” in Control top bar
- Restore-from-archive screens
- Precise meaning of the two “(c)” lines about domains having the same number of questions and the same difficulty progression — both kept as written in [05-questiongame-rules.md](05-questiongame-rules.md)

---

## What this file does not own

Locked product rules. Those stay in files 01–15.
