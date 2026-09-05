# Optimized first spec

This file is the working spec for implementation decisions. It **absorbs** accepted detail specs.

Layering (do not invert):

1. `first_spec.txt` — original notes.
2. `spec-v1/` — concern split of those notes.
3. `optimized_first_spec.md` — this file. Durable decisions.
4. `N-details spec.md` — deepen omitted behaviour. They do **not** nullify this file.
5. When a detail spec is accepted, its content is merged here.

**Merge status:** `1-details spec.md` was merged and removed. `2-details spec.md` is merged here. `spec-v1/` unique text is absorbed here (2026-09-03); **optimized wins** where the two disagree. spec-v1 stays a reading split of `first_spec.txt`, not a second decision file.

If a later detail spec contradicts this file, stop and ask which wording to keep.

Jobs:

1. Restate the product in builder language.
2. Keep a short critique only where something is still open.
3. Choose dependencies against current package APIs.
4. Expand the logic the notes imply.
5. Share one vocabulary across Rust, Tauri 2, and the React 19 tree.

§2 is locked. §11+ holds absorbed detail-spec matrix. §2.16+ and §4/§12 absorb the 2-details graph (flags, overlays, views, Settings inner tabs).

---

## 1. Product model

QuestionGame is an offline-first desktop studio for a question-and-answer competition.

Two surfaces:

- **Studio shell** — the operator application (libraries, settings, control room).
- **Stage surface** — a separate fullscreen `WebviewWindow` on a chosen `Monitor`. Audience, cameras, moderator, and teams see only this surface.

Two uses, one binary:

1. **Recorded show (current target)** — studio or room. Operator runs Stage. Show is recorded for post. Not a livestream product.
2. **Anybody later** — friends or school download the same app without studio hassle.

Build the recorded-show case first. Same binaries; fewer displays for the second use.

Who is in the room: **teams** play; **moderator** is with the teams and watches Stage; **operator** uses the studio app; **audience / cameras** see only Stage.

The operator and Stage are different jobs. The app is the studio. Stage is only the show.

Day-one operator flow (from spec-v1): Teams tab → Domains+Questions → Game tab configure → optional Screens canvas → Control load + Play. The game can play if Screens tab was never opened (built-in defaults).

Canonical game truth lives in the Rust host. Webviews project that truth and add local chrome (Viewer hit targets, layout handles, Studio motion).

---

## 2. Locked decisions

### 2.1 Game recipe vs Play (expiry)

A question that was issued and then resolved (correct **or** wrong) is not reused **inside that Play**.

It does **not** disappear from the Domains + Questions library or from the Game tab recipe (e.g. `"test"`).

Day 1 Play of `"test"` consumes those questions for that Play only. Day 2 a new Play of `"test"` can use the exact same questions again.

Expiry = per-Play consumption. Never a library delete. A resolved question does **not** return to the available pool so the next team might get it.

### 2.2 Domain shapes — (a)(b)(c)(d) are all valid

- **(a)** Domains may have different question counts.
- **(b)** Domains may have different difficulty progressions.
- **(c)** Domains may have the same question count.
- **(d)** Domains may share the same difficulty progression.

A recipe may mix them. The Game tab **Shape manager** (floating dialog) manages these flags. It does not only display warnings. See §11.B4.

### 2.3 Award — flat, difficulty, lock-speed both ways

Modes: **flat**, **difficulty**, and **lock-speed exclusive**.

Lock-speed also exists as an **option** on flat/difficulty (`scoring.lock_speed.enabled`).

Exclusive mode: `scoring.mode = lock_speed` with `lock_speed_base = flat|difficulty`.

Both paths share:

```
base = flat_points  OR  f(difficulty)
points = floor(base * (1 + speed_weight * remaining_ms_at_lock / timer.duration_ms))
```

- Weight `0` equals the base.
- Wrong / empty reveal → `0`.
- Consecutive bonus stacks after this, from its own setting.
- Exclusive mode ignores the option checkbox (already on). Do not double-apply.

Wager/stake is deferred.

### 2.4 Timer, select, lock, reveal

Order when all are used: **Select → Lock → Reveal**.

- Select does **not** stop the timer.
- Lock **stops** the timer and stores `remaining_ms_at_lock`.
- **Reveal is the scoring and expiry point.** Lock does not score. Override does not score.

Defaults: stem, options (one by one), and outcome are operator-driven. Timer start is operator.

Timer is a **Game tab** setting: `timer.enabled`, `timer.duration_ms`. Default: enabled, **one duration for every question**. If disabled or unset: **operator pace** — no countdown, no `StartTimer`, no T=0 auto-lock. Lock-speed weight is then disabled. Stage clock node hides.

Timer hits zero (only if enabled):

| Selection at T=0 | What happens |
| --- | --- |
| At least one option selected | Auto-**lock**. Do not auto-reveal. |
| Nothing selected, nothing locked | `timer_expired_open`. Still selectable. Do not auto-reveal wrong. |
| Operator reveals with nothing selected or locked | Outcome **wrong**. Question consumed. Token ends. |

Host emits `remaining_ms` every **100ms** while running. Frontend may interpolate. No frontend clock that can pass host zero.

An issued question stays exclusive to this token until reveal or undo.

### 2.5 Judging and settings surfaces

Defaults (Game tab must surface every one):

- No partial credit. Multiple-answer is correct only if the locked set equals the correct set.
- Option order does not matter. `{A,C}` equals `{C,A}`.
- Outcome is not shown at lock.

Surfaces:

| Surface | Holds |
| --- | --- |
| **Game tab** | Every recipe setting. Same document as Control **Current game**. |
| **Control float** | Tabs **Global** (machine / studio) and **Current game** (this recipe / Play). |
| **Settings tab** | Same global document as Control Global. |

Before Play: Current game may edit Game-tab fields. After `play_start`: game-affecting fields stay **visible but disabled**. Control-behaviour stays enabled. Pause is not a back-door into award edits.

Control-behaviour (live during Play):

- `reveal.question|answers|outcome|leaderboard` = `operator` | `auto`
- `override.after_lock` = `allow` | `refuse_until_reveal`
- Stage / Statistics `Monitor`
- cue volume, mute
- overlay animations on/off
- Viewer hit-targets on/off
- mosaic density

Frozen at Play start: scoring (including lock-speed option and weight), judging, cap/bonus, `timer.enabled` / `timer.duration_ms`, roster, board, question bodies, shape enforce flags.

Timer duration already ticking on an issued question never jumps.

### 2.6 Override after lock (niche) and overlay

Scoring default stays §2.4: points write only at reveal.

Paths:

1. Lock → reveal → (wrong, or correct with cap) → override. Scoring already happened. Override only moves the token (if the ring allows).
2. Lock → **no reveal** → override. Reveal is **required**, then scoring, then the token may move. Same after timer expiry.

`override.after_lock`:

- `refuse_until_reveal` — GiveToken disabled until reveal. Hint: “Reveal first.”
- `allow` — GiveToken visible after lock / expiry. Press does **not** write points. Notice or two-click **Reveal & pass** runs reveal then `GiveToken`.

After a token-ending resolve, Stage does **not** auto-advance. Overlay animation plays on the current screen. It does not remount and does not reset reveal/select/lock.

Overlay queue: current finishes; pending length 1; newer pending replaces older. Do not `kill()` mid-beat.

Change screen while overlay busy: finish overlay, then base transition. Do not start a base transition under a running overlay.

### 2.7 Timeline undo vs restart

Undo restores materialized Play state. Events are not rewritten. Append `TurnInverted { target_event_id }`.

Rewind toward the first event warns: prefer Restart.

### 2.8 Versioning

No git-style branches in the operator UI.

1. Recipe revisions (settings, membership, layout).
2. Play records under a recipe.
3. Append-only events inside a Play, including inversions.

### 2.9 Engine shape

Layer-1 modules + a few facades + one host runtime. See §6.

### 2.10 Atomic persistence

Every library write and every Play event append is crash-safe. Events append first; projections rebuild on boot. Recipe save is one transaction. Layout auto-save debounces **400ms** into one `rev`.

### 2.11 UI and motion kits

| Kit | Role |
| --- | --- |
| HeroUI v3 | Default Studio styled kit. |
| Base UI | Unstyled primitives. Studio: only where HeroUI has no fit, skinned with HeroUI tokens. Stage: **first choice** (§2.30). |
| EvilCharts | Keep for now. Isolate to Statistics. |
| Iconify + Gravity UI | Default Studio icons. |
| `@phosphor-icons/react` | Supplement, especially duotone. |
| DialKit | Screens-tab workshop only. |
| Motion (`motion/react`) | Studio chrome only. |
| GSAP + `@gsap/react` | Stage screens, transitions, overlays, reveals, Stage 2D. |
| Calligraph | Studio **text transitions** only, behind the `Text` module. Not a typography primitive, not on Stage. See §2.29. |
| `svg.js` | Dropped. |
| `matter-js` | **Stage decor only** (decided 2026-09-04). A live world for the loose decorative bodies: each screen declares an invisible boundary box (may extend a little past the canvas) and a seeded body list; the bodies keep drifting and colliding for the life of the screen — `collide` by default, `collide-attract` (mild mutual pull) as a per-recipe option — tuned by `StageDecorSettings` (Screens tab dials at P9). GSAP's `Physics2DPlugin` has no collision detection, so it cannot do this job. Never used for anything whose truth is in play-state. |

### 2.12 Desktop only

No haptics. Physics = GSAP 2D plugins for tweened motion on Stage, plus `matter-js` headless for decor collision and containment (decor only). No Three.js in v1 unless a later screen design needs WebGL.

### 2.13 Search

Tantivy. Schema later. Not a product gap.

### 2.14 Notices and component variants

One frontend owner for errors / warns / blocks. Surfaces: inline on the parent, destructive dialog, collector float. Dismiss or solve. Final step may be two-click (arm, then confirm).

Shared controls ship a full variant set. See §14.

### 2.15 Operator pin

Optional. Set on Operators tab only. Hashed. Never in status bar or metadata. Top bar shows operator **name**. Pin is required to switch *to* a pinned operator, and for uninstall-data / wipe-plays. Live Play commands never ask for the pin.

### 2.16 Feature flags (graph)

Host `FlagService` is the only flag reader. Studio does not keep a second store.

- **Feature root** `feat.<name>` — whole subgraph. Default **on**. Off ⇒ commands reject `feature_off`.
- **Policy flag** — settings keys (`timer.enabled`, `override.after_lock`, …).
- **Runtime flag** — derived (`session.locked`, `overlay.busy`, `play.status`).

### 2.17 Library vs game overlay

Catalog tab owns originals. Game tab may edit inline with `ScopeConfirm`:

- **This game only** — overlay on the recipe item. Original unchanged.
- **Apply to original** — write catalog; other recipes that already have their own overlay stay.
- Cancel — revert the field.

Overlays cover stem, options, difficulty, per-question duration, domain name, team marks (color, logo, code). Row chip `overridden`. Reset drops the overlay.

Play snapshot copies **overlay-applied** bodies. A later catalog edit does not move an open or finished Play.

Multiple-choice mode is derived: one correct tick = `single`; more than one = `multiple`.

### 2.18 Timer cascade

At question issue:

```
question overlay duration
  else recipe timer.duration_ms
    else globals.timer.duration_ms
enabled: recipe if set, else globals
```

No per-question duration ⇒ every question in that Play uses the game timer. Game timer unset ⇒ all-games timer. Enabled false at the winning level ⇒ operator pace.

Do not turn `timer.enabled` off while a countdown is `running`.

### 2.19 Notices, bulk, views

Notices: 2, max 3 solve actions. Further confirms **stack in the same component** (Stop playing → “Are you sure?”).

Bulk on every library list. One confirm for the batch. Game-tab bulk defaults to this-game overlays. Questions-tab bulk writes originals.

List tabs offer **grid** and **table** for record lists. Persisted per operator per tab. Not used on Screens canvas, Control mosaic, Settings form, editors, Stage, Viewer, Timeline.

### 2.20 Settings tab inner tabs

1. **Monitors** — connected displays, Stage / Statistics assignment.
2. **Settings** — grouped globals. Parents nest children (award mode → points / map / lock-speed weight).
3. **Keyboard shortcuts** — command ↔ chord table. Conflicts inline. Live during Play. Not shown on Stage.

### 2.21 Action Panel timer

Timer cluster is **icon-only** (start / pause) plus the clock. Tooltips for labels. Hidden when operator pace.

### 2.22 Domain picker reuse

Question editor uses the same `DomainForm` / `DomainPicker` as the Domains pane: pick existing domains or create one in place.

### 2.23 License and repo

GNU **GPLv3**, open source, git for source versions, **monorepo** (Rust host + Studio webview + Stage webview in one repo). Not an operator screen. Operator history is recipe `rev` + Plays + event log.

### 2.24 Per-tab archive

Restore is a first-class action. Active | Archived switch (or an Archive page) lives **inside each library tab**. Bulk restore uses the same ScopeConfirm family (catalog originals). A playing recipe’s snapshot does not move if the catalog row is restored or re-archived.

### 2.25 Audio

v1 ships a **bundled default pack**: UI cue files and Stage music/beds in the install. Howler plays them. Cue keys: lock, correct, wrong, overlay start, play start, timer start, timer pause, timer expires with no reveal. Remap or mute each key. Volume/mute are Control-behaviour.

`@web-kits/audio` stays in the tree. **`feat.audio.synth` is off** until you say it is on. Off = no generated tones. On (later) = synth may fill a cue that has no file.

v2 (not now): operator replaces bundled files with a user pack in user-data. Missing user file falls back to the bundle. v1 has no pack editor.

### 2.26 Grilling round 1 (accepted)

- UI: **Stage**, **Screen**, tab **Game** (entity = Recipe).
- Stats views: **Live** | **All data**.
- Glossary: `CONTEXT.md` at project root.
- v1: one chrome; unused monitors unused. Optional **sample catalog** (skippable).
- `set_selection` on an unrevealed option is rejected.
- Operator switch mid-Play appends `OperatorSwitched`; timer keeps running.
- Restart-different: Control picker of unused catalog questions in the recipe’s domains; confirm before the new Play.
- Wager and CSV: not v1.
- Undo / restart / abandon while overlay busy: **block** + wait notice.
- v1 audio: **cues only**. Beds exist in the bundle, not auto-wired.

### 2.27 Grilling round 2 (accepted)

- Sample: recipe `"Demo"`, 2 teams, 2 domains, 3 questions each (10/20/30), single-answer, timer on, one shared duration. After insert it is a normal recipe.
- Restart-different: old board is the default pick; any non-archived catalog question in those domains may be added. Empty pool → (a) cancel Restart (b) Restart-same. No silent reuse of the consumed snapshot.
- One monitor is valid: Stage fullscreen window, Studio via Alt-Tab.
- `OperatorSwitched` is metadata + Control only. Not on Stage.
- First run: operator (required before Play) → sample skip/load → optional Settings.
- v1 Settings audio = cue map + mute/volume. Bundle beds stay invisible.

### 2.28 Grilling round 3 (accepted)

- **Stage target (main path):** Control top picker sends the fullscreen Stage window to the chosen **external** monitor. Recorded-show case.
- **One-monitor fallback:** Stage may fullscreen on the only display; Studio stays a normal window (Alt-Tab / shortcut). Stage does not destroy Studio.
- Demo / first-run defaults: award **`difficulty`**, lock-speed off, timer **30s**, cap and bonus **off**.
- Sample rows `origin = seed`. Settings **Restore Demo** re-inserts missing seed rows; overwrite of edits needs confirm.
- Skip sample: Game tab **Load Demo** or **New game**. Play blocked until ≥1 team and ≥1 board question.
- Stage window created on **first Control Load**, not at boot.

### 2.29 Text module (replaces "Calligraph on all text")

**Correction.** `calligraph` is *"fluid text transitions powered by Motion"* — an animation library for text that **changes**, not a typography primitive. The earlier wording ("Calligraph on **all** Studio and Stage text") asked for two things it cannot give:

1. Most strings never change. Mounting an animation runtime under every label is cost with no payoff.
2. Calligraph is built on **Motion**, and Motion is Studio-only (§2.11). Putting it on Stage smuggles a second animation runtime into the GSAP zone — and `PresentationService`'s queue only knows about GSAP timelines, so a Motion-driven text tween is invisible to `anim-complete`. Auto-reveal could outrun text that is still animating. That is a correctness bug, not a preference.

**Locked instead:**

One **`Text` module** owns every operator- and audience-readable string. Its interface is a token variant plus a change behaviour:

```
Text({ as, variant, transition: "none" | "swap" | "count", children })
```

- `variant` names a design-system role (`stage-display`, `stage-question`, `studio-body`, `studio-label`, …) and resolves to the token files. It is never a raw font size.
- `transition` describes what happens when the **content changes**:
  - `none` (default) — a plain DOM node. No animation runtime. Correct for the overwhelming majority of strings.
  - `swap` — the change should be seen (team name on handoff, domain title, question stem).
  - `count` — numeric roll. Scores, timer digits, points deltas.

Two implementations sit behind that one interface:

| Surface | `swap` / `count` implemented by |
| --- | --- |
| Studio | **Calligraph** (Motion). Studio has no `anim-complete` contract to honour. |
| Stage | **GSAP**, authored inside the screen's own timeline, so the overlay queue and `anim-complete` stay authoritative. |

Callers never learn which. That is the whole point of the module: swapping Calligraph out later touches one file, not hundreds of call sites.

**Rules.** No component imports `calligraph` directly. No text animation on Stage outside a `PresentationService` timeline. `transition` never changes what the text *says* — it is presentation only, and the string still comes from `play-state`.

### 2.30 Two design systems, one component stack

**HeroUI v3 only.** Pin `@heroui/react@^3.2.4` (latest as of 2026-09-04). v3 is Tailwind v4 + React Aria Components; **v2 patterns are wrong**, not merely old: no `HeroUIProvider`, no `framer-motion`, theming through oklch CSS variables. Source of truth is `https://heroui.com/react/llms.txt`, component docs at `heroui.com/en/docs/react/components/<name>`, plus the `heroui-react` skill in `.agents/skills/`. Never answer a HeroUI question from memory.

#### The split is tokens, not libraries

Both webviews are TypeScript + React 19 and both may use HeroUI v3 and Base UI. What differs is **which token scope they render under**.

| | Studio (`main` webview) | Stage (`stage` webview) |
| --- | --- | --- |
| Token source | `globals.css` — the HeroUI theme as shipped | `docs/questiongame Design System/tokens/*` |
| Look | HeroUI defaults: oklch palette, `--radius: 0.75rem`, `--font-sans` | Near-black ink on white, radius `0` (4px letter boxes, 8px answer cards only), inset borders, no shadows |
| Type | HeroUI's sans stack | Space Grotesk (display) + Space Mono (system/HUD) |
| Motion | `motion/react` | GSAP only |
| Density | Desktop chrome, resizable panels | Fixed 1920×1080, 64px padding |

**Mechanism.** HeroUI v3 themes through CSS variables, so the Stage root is a scope that redefines them — `--radius`, `--surface`, `--foreground`, `--font-sans` → Space Grotesk, `--success` → mint `rgb(131,255,178)`, `--danger` → coral `rgb(255,131,131)`, `--warning` → the warm yellow, and so on onto the questiongame palette. One component stack, two themes. Never import `globals.css` into the Stage webview, and never import the questiongame tokens into Studio.

#### What Stage builds with

The Figma frames are component-shaped, not free-form artwork: the team-order screen is a **sequence table** with a highlighted row; domain selection is a **card grid** with a selected state; the question screen is an **answer-card grid** plus a **timer readout**; the answer variants add a **result widget** with a points figure. Rebuilding those in raw markup would be waste.

So Stage composes them from the same libraries, restyled:

- **Base UI is the first choice on Stage.** It is unstyled, so the questiongame tokens fully control appearance and there is nothing to override.
- **HeroUI v3 display components** — `Card`, `Chip`, `Separator`, `Surface`, `Typography`, `Meter`, `Table`, `ListBox` — are fine where the theme scope covers them.
- **Avoid mounting interactive widgets on Stage** (`Button`, `Input`, `Select`, `Modal`). Nobody touches Stage; the design system states there is no hover or press state, only the reveal (dim → highlighted). Interactive widgets bring focus rings and ARIA semantics that are noise on a camera-facing surface.

The seven named components from the design system — `Header`, `ResultWidget`, `AnswerOption`, `TimerPanel`, `ScoreRow`, `TeamChip`, `DecorShape` — remain the Stage vocabulary. They are now *compositions over* Base UI / HeroUI primitives rather than hand-rolled markup, and `DecorShape` stays pure SVG.

#### The layers that only look like Stage

**Viewer hit targets** and **Screens-canvas selection handles** render in the *Studio* webview under Studio tokens, on top of a copy of the Stage tree. They never enter the Stage tree (§5.7).

---

## 3. Vocabulary

| Term | Meaning |
| --- | --- |
| Library entity | Team, Domain, Question, Operator, Game recipe. Soft-deletable. |
| Game recipe | Game tab package: teams, board, settings, layout. |
| Play | One run. Snapshot + event log. |
| Snapshot | Copy taken at Play start or Restart. |
| Event | Append-only fact. |
| Domain cursor | Next unconsumed question, `difficulty ASC`, then `id ASC`. |
| Turn token | Permission to play. |
| Round | Each active team receives exactly one token before anyone receives the next. |
| Select | Working choice. Not scored. |
| Lock | Freeze choice. Stops timer. Not scored. |
| Reveal (outcome) | Stage outcome + score + expiry. |
| Operator pace | `timer.enabled = false`. No countdown. |
| Overlay animation | Handoff on the current Stage screen. |
| Base transition | GSAP timeline between two Stage screens. |
| Viewer overlay | Operator hit targets in Control. Never on Stage. |
| Control-behaviour | Live during Play from Control Current game / Global. |
| Game-affecting | Frozen at `play_start`. |
| Notice | Error / warn / block owned by one Studio system. |
| Overlay (recipe) | Per-game copy of a catalog field. Not a Stage animation. |
| ScopeConfirm | Cancel / this game / apply to original. |
| Feature root | `feat.*` switch for a subgraph. |

---

## 4. Domain model

### 4.1 Library entities

**Team** — `id`, name, short code, color, logo, notes, `archived_at`, metadata (created, updated, play counts, last play at).

**Domain** — `id`, name, description, question membership with `sort_key`, `archived_at`. A question may sit in many domains. Difficulty edits do not reorder membership. **Sort by difficulty** is an explicit action.

**Question** — stem, media, `answer_mode` derived from correct ticks (`single` if one, `multiple` if more), ordered options, correct id set, `difficulty` 1–100, explanation, `archived_at`. Options ≥ 2. Cannot delete the last correct mark.

**Recipe overlays** — optional per-id patches on teams, domains, questions (text, difficulty, duration, marks). Snapshot applies them at Play start.

**Operator** — `id`, display name, optional pin hash, last active at, plays run.

**Assets** — user-data files. Host via `convertFileSrc` / `asset:`. Missing file: row stays, broken-asset notice, Stage fallback plate.

**Game recipe** — `id`, name, folder/tags, ordered team ids, board, settings, layout overrides, `rev`, `archived_at`, play history (not inlined).

Hard delete is not v1. Archive is `archived_at`. Restore is allowed. Each library tab owns its own archive view (Teams, Domains, Questions, Games, Operators). Open archive from that tab = that tab’s scope only. Cannot purge a row recipes or open Plays still point at.

### 4.2 Settings document

Globals (first-run / Settings tab / Control Global) are defaults. Recipe B5 overrides them. Play start freezes game-affecting keys.

| Key | Type | Default | Surface |
| --- | --- | --- | --- |
| `scoring.mode` | `flat` \| `difficulty` \| `lock_speed` | must be chosen | Game, frozen |
| `scoring.flat_points` | u32 | if used as base | Game, frozen |
| `scoring.difficulty_map` | table or curve | if used as base | Game, frozen |
| `scoring.speed_weight` | f32 ≥ 0 | `0` | Game, frozen |
| `scoring.lock_speed.enabled` | bool | `false` | Game, frozen |
| `scoring.lock_speed_base` | `flat` \| `difficulty` | if exclusive lock-speed | Game, frozen |
| `override.after_lock` | `allow` \| `refuse_until_reveal` | `refuse_until_reveal` | Control live |
| `turn.max_consecutive_correct` | `Option<u32>` | `None` | Game, frozen |
| `turn.bonus_after_consecutive` | `Option<{count, award}>` | `None` | Game, frozen |
| `judging.partial_credit` | bool | `false` | Game, frozen |
| `judging.order_matters` | bool | `false` | Game, frozen |
| `timer.enabled` | bool | inherit global if recipe unset | Game, frozen |
| `timer.duration_ms` | u32 | inherit global if recipe unset | Game, frozen |
| `globals.timer.enabled` | bool | `true` | Settings, all-games default |
| `globals.timer.duration_ms` | u32 | operator-chosen | Settings, all-games default |
| `reveal.question` | `operator` \| `auto` | `operator` | Game default + Control live |
| `reveal.answers` | `operator` \| `auto` | `operator` | Game default + Control live |
| `reveal.outcome` | `operator` \| `auto` | `operator` | Game default + Control live |
| `reveal.leaderboard` | `operator` \| `auto` | `operator` | Game default + Control live |
| `overlay_animations.enabled` | bool | `true` | Control live |
| `stage.monitor_id` | OS monitor | operator pick | Control live |
| `stats.monitor_id` | optional | none | Control live |
| `viewer.hit_targets` | bool | `true` | Control live |
| `control.mosaic_density` | enum | `comfortable` | Control live (per operator layout) |

Changing one key must leave a legal document. Host rejects illegal combos. UI disables the illegal sibling first.

Interlock examples:

- Mode → lock-speed exclusive: hide option checkbox; show base + weight.
- Mode → flat/difficulty: show option checkbox; hide exclusive base picker.
- Option off: weight slider disabled; stored weight kept.
- `timer.enabled = false`: hide StartTimer / Stage clock; disable lock-speed weight.
- `override.after_lock = refuse_until_reveal`: GiveToken disabled while locked and not revealed.

### 4.3 Play snapshot

On Play or Restart:

1. Copy participating teams (display fields).
2. Copy each included question body.
3. Copy resolved frozen settings.
4. Copy layout overrides.
5. Build per-domain queues: `difficulty ASC`, `id ASC`.
6. Cursor `0` on every domain.
7. Ring = recipe order.
8. `round_index = 1`, current team = ring[0].
9. Append `PlayStarted`.

`play_start` fails if the board has no questions. **1 team is allowed** (rehearsal) with a warn. Two Plays of one recipe cannot be `playing` at once. Screens tab refuses a recipe whose Play is `playing|paused`.

Restart `same_questions` reuses snapshot bodies. Restart `different_questions` re-reads the recipe as it is now.

### 4.4 Scoring

Points compute only on `RevealOutcome`.

- Flat / difficulty / lock-speed as §2.3.
- Wrong / empty reveal → `0`.
- Partial (default off): `floor(base_or_speed * max(0, (#correct_locked − #incorrect_locked) / #correct_total))`.
- Bonus after lock-speed, flat extra in v1 unless later changed.
- Cap ends the token after n consecutive corrects on this token. Last answer stays correct.
- Rank: points desc, competition `1,1,3`.

---

## 5. Runtime logic

### 5.1 Play lifecycle

```
IdleRecipe → LoadIntoControl → Playing ⇄ Paused
Playing → Restarted (new Play; same questions | different questions)
Playing → Completed (every snapshot question consumed)
Playing → Abandoned
```

Status: `loaded | playing | paused | completed | abandoned | restarted`.

Pause: running timer pauses. `StartTimer` is resume-only. Select, lock, reveal, override stay available.

Replay = another Play of the same recipe on another day.

### 5.2 Issue a question

`ChooseDomain(domain_id)` issues the next unconsumed question. No question id or difficulty from the operator.

### 5.3 Question-screen state

```
issued
  → stem_revealed
  → options_revealed (count 0..N)
  → selecting
  → locked             (remaining_ms_at_lock stored; timer stopped)
  → timer_expired_open
  → outcome_revealed   (scored + consumed)
```

Commands and rejects:

| Command | Illegal when |
| --- | --- |
| `choose_domain` | no token, domain empty, session already issued |
| `set_selection` | not issued, already locked |
| `lock_selection` | nothing issued; already locked; empty set (use empty reveal) |
| `start_timer` | timer disabled, not issued, already locked, already at 0, already running |
| `reveal_outcome` | not issued, already resolved |

Resolve on `RevealOutcome` only:

1. Judge locked set (or wrong if none locked).
2. Mark question consumed on this Play.
3. Apply points / bonus / cap / token end.
4. Append `TurnResolved`.

### 5.4 Turn ring

**Round invariant — holds for any team count `n`.**

Let `turns[t]` be the number of tokens team `t` has received in this Play, over the active teams `T`.

```
invariant:  max(turns) - min(turns) <= 1   for all t in T
```

A team may receive its `r+1`-th token only once every active team has received `r`. With `round_index = r`, the legal targets of `GiveToken` are the active teams whose `turns[t] == r - 1` — the ones not yet served this round.

`GiveToken` legal iff: not consecutive self-override; target has not already received a token this round; would not advance one team into the next round while another is behind.

The engine never skips a team to satisfy an override. It completes the round first, then opens the next one.

**Worked example (illustration only — `n = 4`; the rule is the invariant above, not this array).**

```
turns [1,1,0,1]  cannot become  [2,1,0,1]   (team 3 has not played round 1)
engine completes the round to   [1,1,1,1]
then                            [2,1,1,1]   is legal
```

Same shape at any `n`: `[1,1,0,0]` (n=4) cannot become `[2,1,0,0]`, `[1,2,0,0]` or `[2,2,0,0]`; `[1,0,0]` (n=3) cannot become `[2,0,0]`.

**Edge cases.** `n = 1` (rehearsal Play, §4.3): every round has exactly one legal target and self-override is unavailable. A team archived or removed from the recipe mid-Play does not change an open snapshot (§11.B), so `T` is fixed for the life of the Play.

After lock without reveal: §2.6. Issued but not locked: do not return the question to the pool; do not transfer it to the next team; reveal first (empty = wrong).

After a correct keep-turn, giving the token away ends the token early. Consecutive-correct of the giver resets (still listed as accepted working rule).

Action Panel drag reorders the **future** ring only. Row variants: `history`, `current`, `future`, `drop-ok`, `drop-illegal`, `overlooked`, `override-armed`, `override-blocked`, `rehearsal-solo`. Motion on pickup / gap / drop. Same language as Game tab roster.

### 5.5 Stage screens

`Idle`, `TeamOrder`, `ChooseDomain`, `Question`, `Scoreboard`, `FinalLeaderboard`.

Usual pairing (operator may show another screen anyway):

| Moment | Usual screen |
| --- | --- |
| Nothing playing | Idle |
| Whose turn | TeamOrder |
| Pick domain | ChooseDomain |
| Question in play | Question |
| Scores mid-show | Scoreboard |
| No questions left | FinalLeaderboard |

Leaderboard reveal (when not auto): **lowest team first, then up to first place**.

`ShowScreen` is always the operator’s. A Play can run on built-in screen defaults if Screens tab was never used.

Showing `FinalLeaderboard` early is allowed; Play is `Completed` only when queues are empty. Notice if questions remain.

### 5.6 Motion policy (Stage only)

Base transition: every pair `(from, to)` has a `gsap.timeline()`.

Overlay: drawn on the screen that is up. Queue as §2.6. Kinds: `token-handoff`, `round-advance`, `multiple-answers`, `outcome` (half screen, transparent, the question stays visible), `current-team`. **Every kind is enqueued automatically when its cause occurs, and the operator may also call any of them by hand at any time, over whatever screen is up, with `show_overlay` (decided 2026-09-04).** Stage cannot tell the two apart.

`overlay_animations.enabled = false` skips the queue and only updates the token.

Studio chrome does not use these timelines.

### 5.7 Viewer vs Stage

Stage: no operator chrome, layout overrides on, `emitTo("stage", …)` only.

Viewer: same tree plus hit targets.

### 5.8 Timeline

Undo restores materialized state. Append `TurnInverted`. Redo appends `TurnReapplied` or a fresh resolve if the operator did something else.

Working rule: undo waits if overlay is busy (status-bar hint). Still listed under open if you want it changed.

### 5.9 Completion and ties

Completed when every snapshot question is consumed. Ties allowed. Rank `1,1,3`.

### 5.10 Persistence

User-data directory. SQLite: catalog, recipes, plays, events, globals, per-operator `control_layout.json`. Tantivy sidecar. Assets dir.

Boot: replay events for any Play not terminal if the projection is missing.

---

## 6. How this sits on a normal fullstack desktop app

| Layer | What it is here |
| --- | --- |
| OS / TAO / WRY | Windows, monitors, webviews. |
| Rust domain modules | `library`, `recipe`, `play`, `rules`, `ring`, `settings`, `search`, `stats`, `health`, `stage_host`. |
| `tauri::State` | DB pool + materialized Play. |
| `#[tauri::command]` | Operator intent. Request/response. |
| `AppHandle::emit_to` | `"main"` and `"stage"`. |
| React 19 tree | Studio + Stage. Providers subscribe. Not a second writer. |
| Motion / HeroUI | Studio chrome. Text transitions go through the `Text` module (§2.29). |
| GSAP | Stage only. |

Frontend → host: `invoke("lock_selection", { playId })`.

Host → Stage: `emitTo("stage", "play-state", snapshot)`.

Facades (`MatchService`, `PresentationService`, `CatalogService`) are in-process Rust modules.

---

## 7. Dependencies

Unchanged from the last dependency pass.

Platform: Rust stable + Tauri 2 + `@tauri-apps/api` (`availableMonitors`, `WebviewWindow`, `emitTo`, `listen`, `convertFileSrc`). Convert physical `Monitor` pixels with `toLogical(scaleFactor)`.

Studio: React 19, Tailwind v4, `@heroui/react@^3.2.4`, `@heroui/styles`, Base UI on gaps, Iconify Gravity UI default, Phosphor supplement, `@dnd-kit/react` + `@dnd-kit/helpers`. Stage: same React and libraries under the questiongame token scope, Base UI first, no interactive widgets (§2.30).

TanStack (Studio only, exact uses — not Start, not Router unless later):

| Package | Use |
| --- | --- |
| `@tanstack/react-query` | Catalog list/get/search and `stats_query` only. Invalidate on `catalog-changed` / `recipe-changed`. Never cache live `play-state`. |
| `@tanstack/react-table` | Headless state for **table view**. Cells still HeroUI, strings still through `Text`. |
| `@tanstack/react-form` | Editors and Settings field state / validation. Inputs stay HeroUI (`TextField`, `Select`, …). |
| `@tanstack/react-virtual` | Long lists (questions, stats rows, Timeline). |
| `@tanstack/react-pacer` | 400ms layout debounce, search debounce, bulk batching. |
| `@tanstack/react-hotkeys` | Settings → Keyboard shortcuts. `useHotkeys` from the global document. `HotkeysProvider` on `main` only. Not on Stage. |

Zustand: UI chrome only — grid\|table preference, mosaic draft, notice-stack open, settings inner-tab. Never Play / scores / session.

HeroUI `Kbd` vs Hotkeys: **no conflict**. `Kbd` only paints keys. Hotkeys only listens. Shortcuts tab: `formatForDisplay('Mod+S')` (or `Kbd.Abbr` + `Kbd.Key`) inside `<Kbd>`. Register with `useHotkeys`. `ignoreInputs: true` for single-key chords so question-editor typing does not fire commands. Disable hotkeys on Stage. PinGate / Field focus uses the same ignore-inputs rule.

HeroUI also ships `Form` and `Table` visuals. Those are styled shells. TanStack Form/Table are the engines underneath. Do not mount two competing form states on one screen.

Motion for Studio. GSAP + `Physics2DPlugin` / `InertiaPlugin` for Stage. `useGSAP` with `revertOnUpdate: false` on overlays.

```bash
npm install dialkit motion calligraph
```

Calligraph is the **Studio** implementation behind `Text` (§2.29): `transition="swap"` and `transition="count"` only. Static strings render as plain nodes. Stage text transitions are GSAP, inside the screen timeline. Score digits use `transition="count"`.

Audio: **howler** plays the bundled default pack (UI cues + Stage music). `@web-kits/audio` is installed but inactive (`feat.audio.synth = off`) until you turn it on. User-replaceable packs are **v2**.

Default cue map: lock, correct, wrong, overlay start, play start, **timer start**, **timer pause**, **timer expires with no reveal**. Each key remappable or muted.

Charts: EvilCharts isolated under Statistics.

Search: `tantivy`.

Host: `serde`, `tokio`, `rusqlite` or `tauri-plugin-sql`, `thiserror`, `tracing`, `uuid`.

Drop: `@svgdotjs/svg.js`, `framer-motion`, legacy dnd-kit. `matter-js` is kept for Stage decor collision only (§7 table).

---

## 8. State rules

- One materialized `PlayState` in the host.
- Library updates never rebase an open Play.
- Control panels declare density from their box. Vertical scroll only.
- Mosaic layout persisted **per operator**.
- Stage overlays must not remount revealed children.
- Missing Stage monitor → pull window back, notice + suggestion.
- Notices are one frontend family (§14). Status bar may show the latest error one-liner and “open collector.”
- Grid/table view preference persisted per operator per tab.
- Keyboard shortcuts live on the global document.

---

## 9. Still open (narrow)

- Visual design of each Stage screen.
- Visual design of per-tab archive views.
- Default Stage monitor when several externals exist (not grilled).
- Wager / CSV (explicitly later).

---

## 10. Mapping back

Still true from the original notes: domain choice only, automatic difficulty, keep-turn-on-correct, ties, soft delete, Viewer overlays, Action Panel table, Timeline with restart warning, secondary-display Stage, offline-first, real monitor list.

Now also true: per-Play consumption only; (a)(b)(c)(d) all valid; lock-speed exclusive **and** option; select → lock → reveal; scoring at reveal; override after lock does not score; timer cascade (question → game → all-games) and operator pace; recipe overlays (this game vs original); Control Global | Current game; Settings Monitors / Settings / Shortcuts; grid|table on list tabs; Action Panel timer icons; overlay animation does not reset the screen; undo appends history; one `Text` module with Calligraph in Studio and GSAP on Stage; notices 2–3 actions with stacked confirm; HeroUI + Motion for Studio, GSAP for Stage; no haptics; svg.js and matter-js gone.

---

## 11. Feature families (absorbed from 1-details)

Family index: **A** Catalog, **B** Recipe, **C** Play, **D** Ring, **E** Session, **F** Award, **G** Stage, **H** Control, **I** Studio, **J** Platform, **K** Statistics, **L** Settings.

### 11.A Catalog

Commands: `catalog_list`, `catalog_get`, `catalog_upsert`, `catalog_archive`, `catalog_restore`, `catalog_search`, `asset_put`.

Event: `catalog-changed { kind, id, op }`.

Tables: `teams`, `domains`, `questions`, `domain_questions`, `operators`, `assets`.

Tabs: Teams, Domains+Questions, Operators. Stack: list → detail → edit. Dirty-form guard.

### 11.B Recipe

Commands: `recipe_list`, `recipe_get`, `recipe_upsert`, `recipe_archive`, `recipe_duplicate`, `recipe_set_membership`, `recipe_set_settings`, `recipe_set_layout`.

`recipe_upsert` is one transaction. Event: `recipe-changed { id, rev }`.

**Shape manager** (B4): floating dialog from Game tab Board. See current (a)(b)(c)(d), toggle enforce flags, Sort by difficulty, accept mix, jump to a failing domain. Enforce-on + illegal board **blocks** `play_start`. Enforce-off + mix is valid. Notices inside the dialog use §14.

Roster order: drag-and-drop with Motion (pickup, gap, drop).

Removing a team from a recipe does not mutate an open Play of that recipe.

### 11.C Play

Commands: `play_load`, `play_start`, `pause`, `resume`, `restart`, `abandon`, `get_state`.

Events on C2 include `PlayStarted|Paused|Resumed|Completed|Abandoned|Restarted`, session events, `TokenGiven`, `OverlayQueued`, `TurnInverted|Reapplied`, `SettingsLiveChanged`.

`play_load` attaches the recipe. Until `play_start`, Game tab and Control Current game write the same B5.

### 11.D–F

Ring, session, award: §5 and §2. Host modules `ring` and `rules`.

### 11.G Stage

Commands: `show_screen`, `stage_set_monitor`, `overlay_ack_complete`.

Stage emits `anim-complete { key }` so auto-reveal cannot outrun GSAP. Auto-outcome waits if overlay is busy.

### 11.H Control

Mosaic default (spec-v1 notes; operator may rearrange):

- Centre — Viewer
- Left — Game panel
- Right top — Action Panel
- Right bottom — Strips
- Bottom — Timeline (collapsed by default)
- Top — Stage / Statistics monitor pickers + settings icon (float)

Mosaic: Viewer, Game panel, Action panel, Strips, Timeline, settings float.

Settings float tabs: **Global** | **Current game**. Disabled fields stay visible.

| Play status | Current game | Global |
| --- | --- | --- |
| Nothing loaded | empty / disabled | enabled |
| Loaded, not Play | all fields, including Game-tab | enabled |
| `playing` / `paused` | game-affecting disabled; Control-behaviour on | enabled |
| completed / abandoned | do not rewrite the finished snapshot | enabled |

Action Panel while locked: Lock inert; Reveal on; GiveToken follows `override.after_lock`; timer shows frozen seconds or `0:00`.

Timer cluster: **icon-only** start / pause + clock. Hidden when operator pace.

Viewer click and Action Panel button are the same commands.

### 11.I Studio shell

Sidebar: expanded / icon strip / fully hidden with left-edge peek.

Top bar: recipe name if loaded, play status, current operator name.

Status bar: health, displays, latest notice, timer remaining if playing.

Search host: one component, kind filter per tab.

### 11.J Platform

Windows + macOS. `availableMonitors`. User-data vs install paths. Atomic IO. Health background. Offline only. Unplug Stage monitor: pull to primary, notice, Play stays `playing`.

### 11.K Statistics

Live view of current Play. All-data manager with compound filters. Optional Statistics `WebviewWindow`. Reads projections, never writes rules.

### 11.L Settings

L1 first-run writes globals. L2 Settings tab (Monitors | Settings | Shortcuts) = Control Global document. L3 recipe B5 = Control Current game before Play. L4 freeze on `play_start`. L5 Control-behaviour writable during Play.

---

## 12. Tabs and in-tab navigation

Shared: sidebar item, crumbs, back/forward stack, optional search, Active/Archive on library tabs. Dirty editor asks save/discard. Search filters the current list; it is not a stack page.

Record lists (Teams, Domains, Questions, Games, Operators, play history, stats entity results) offer **grid | table**, persisted per operator per tab. Same row node, two layouts. Bulk bar works in both. Not used on canvas, mosaic, Settings form, editors, Stage, Viewer, Timeline.

**First run:** paths, default award/timer/reveal, first operator (pin optional), optional sample catalog (still open). Same fields later live in Settings.

**Teams:** grid/table → `team/:id` → edit. Optional history. **This tab’s archive** + bulk archive/restore.

**Domains + Questions:** domain pane **Add domain**. Question editor: `DomainPicker` (existing) + embedded `DomainForm` (create in place). Difficulty required. Options ≥ 2. Correct ticks derive single vs multiple. Stack remembers referrer. Domain archive and Question archive are two scopes in this tab (switch which list you are looking at).

**Game — all games:** project cards / folders (or table). Hide archived unless **this tab’s archive** is open. All-games timer default lives here and in Settings.

**Game — one file:** pick teams (order + appearance overlays), pick domains for this show, pick questions from those domains. Inline edit with ScopeConfirm (this game / apply to original). Award & rules + this game’s timer. Shape manager. Plays history. Layout preview. Frozen while that recipe is playing.

**Screens:** only when no Play is `playing|paused`. Blocked route notice: (a) Go to Control (b) Stop playing → stacked “Are you sure?”. Auto-save layout, 400ms debounce.

**Control:** mosaic. Action Panel timer = icons + clock. Settings float Global | Current game. Screens route blocked while playing.

**Statistics:** Live | All data. Results table default; entity cards optional.

**Operators:** grid/table → `operator/:id` (pin set/clear).

**Settings inner tabs:**

1. Monitors — connected displays, Stage / Statistics assignment.
2. Settings — grouped parents with nested children (award → points / map / lock-speed).
3. Keyboard shortcuts — action / chord / reset. Conflict notice 2 actions (keep / reassign). Live.

Banner: open Plays keep their frozen copy. Global award default does not rewrite a recipe that already overrode it.

---

## 13. Host commands, events, frontend map

Commands: `catalog_*`, `recipe_*`, `recipe_set_overlay`, `play_load|start|pause|resume|restart|abandon|get_state`, `choose_domain`, `reveal_stem`, `reveal_next_option`, `set_selection`, `lock_selection`, `start_timer`, `pause_timer`, `reveal_outcome`, `give_token`, `reorder_ring`, `show_screen`, `stage_set_monitor`, `overlay_ack_complete`, `undo_turn`, `redo_turn`, `settings_get|set_global|set_current_game`, `settings_set_shortcut`, `stats_query`.

Events: `catalog-changed`, `recipe-changed`, `play-state` (full to main, stripped to stage), `health`, `monitors-changed`, `anim-complete`.

`play-state` includes Play status, ring, session (reveals, selection, locked, `remaining_ms`, `remaining_ms_at_lock`), scores, current screen, overlay busy/pending, live reveal flags.

| Surface | Motion | Writes via |
| --- | --- | --- |
| Studio tabs | Motion + `Text` | catalog_*, recipe_*, settings_* |
| Control mosaic | Motion chrome | session / ring / transport |
| Viewer | none extra | same commands as Action Panel |
| Stage | GSAP (incl. all text transitions) | `overlay_ack_complete`, `anim-complete` |
| Stats window | Motion + charts | none |
| Screens canvas | Motion + DialKit + dnd-kit | `recipe_set_layout` |

---

## 14. Notices and component variants

Host emits `{ code, severity, target_path, actions[] }`. Studio owns presentation.

Severities: `info`, `warn`, `error`, `block`.

| Surface | Use |
| --- | --- |
| Inline on the parent | Field or row that caused it. |
| Destructive dialog | One block that must be faced now. |
| Collector float | Several items (Shape manager, health, interlock). |

A notice carries **2, max 3** solve actions. Dismiss = continue, state unchanged. Solve = run an action.

Further confirms **stack in the same component** (Stop playing → “Are you sure?”). Cancel pops one frame. Pin may be the last frame (depth 3).

Bulk uses one ScopeConfirm for the batch.

Control variant set for shared controls: `rest`, `hover`, `focus`, `pressed`, `disabled`, `loading`, `selected`, `error`, `warn`, `arm`, `confirm`, `drag`, `drop-ok`, `drop-illegal`.

Stage audience components use `stage` vs `viewer` and do not show operator notices.

---

## 15. Interaction cells (absorbed)

Null by law: catalog edit does not rebase an open snapshot; monitor list does not change points; sidebar collapse does not change ring legality; charts do not write lock.

Hot cells already written as rules in §2 and §5. Short restatement:

- **A × B × C** — library/recipe edits do not bleed into an open snapshot. Next Replay / Restart-different can pick up new bodies.
- **B × C** — one settings document until `play_start`; then freeze game-affecting.
- **C × E** — pause does not clear the session.
- **D × E** — scoring at reveal; override-after-lock niche in §2.6; no return to pool.
- **D × G** — accepted token change on Domain/Question queues overlay.
- **E × F** — points only on E8; lock-time used if lock-speed is on.
- **E × G** — clock freezes at lock; overlay does not reset reveals.
- **G × J** — unplug pulls Stage, Play continues.
- **H × L × B × C** — Control two tabs and interlock table in §4.2.

Worked slice stays the 1-details `"test"` path: lock at 12s, reveal scores lock-speed, Day 2 Replay gets History q1 again. Override after a wrong reveal moves the token without a second score.

---

## 16. What this file refuses to invent

Livestream graphs, mobile haptics, Matter.js collisions between *functional* elements (decor bodies collide with an invisible box only in v1), git branches for operators, free-form award scripting, auto-advance of Stage after resolve, library expiry of questions, scoring on override without reveal.

---

## 17. Absorbed from spec-v1 (unique; optimized already won the fights)

These were in `spec-v1/` and not yet spelled here. Rules that disagreed (matter-js, haptics, live-safe-only Control, exclusive lock-speed-only, git branches) stay as this file already locked them.

**Platform**

- Real OS display list and real permissions. Surface faults as error/warn + suggestion (notice family).
- Respect install paths vs user-data. Uninstall screen: delete app files and/or generated user files.
- Processes visible in Task Manager / Activity Monitor — Tauri packaging, not a custom process manager.
- Offline first. No internet required.
- **License / repo (locked):** GNU GPLv3, open source, git for source versions, **monorepo** (Rust host + Studio + Stage in one repo). Not an operator screen. Operator versioning is still recipe `rev` + Play records + event log — not git branches in the UI.

**Screens workshop**

- Optional. Defaults are built into Stage screens.
- Load a recipe → edit nodes (font, size, color, move, resize). Apply to **this screen** or **all screens**.
- Save onto that recipe. Viewer overlays are never saved as Stage design.
- DialKit + dnd-kit. 400ms debounce.

**Overlay examples (keep as tests)**

- Idle → Domain (skipped TeamOrder) plays a handoff overlay for the current team, then Domain content.
- Idle → TeamOrder → Domain: base transitions only.
- Wrong, operator opens Domain, then overrides during the overlay: current overlay finishes, then the override overlay. Content already revealed stays.

**Control density**

Each panel answers: how do I look when space is limited, what stays visible, how many steps to reach the rest. Vertical scroll only.

**Restart stock**

Game tab may hold extra questions so a recording can Restart at least twice. That is a library practice, not an engine quota.

**Cross-tab state (host events, not a second store)**

- Rename team → Game tab, Viewer, Stage if shown, Statistics, search.
- Edit catalog question → later Plays / Restart-different; open Play snapshot unchanged.
- Play pressed → status bar, live stats, Stage may leave Idle only when the operator shows a screen.
- Archive → gone from active lists, findable in archive.

**Statistics**

Two jobs = two views until named otherwise: Live (current Play), All data (compound filters: variables + time). Optional extra monitor, never a second Stage.
