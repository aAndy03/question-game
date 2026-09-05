# QuestionGame v1 — implementation roadmap

Scope: everything needed to ship v1 as locked in `optimized_first_spec.md`. Module shape follows `01_codebase-design-spec-v1.md`. Names follow `03_CONTEXT.md`. Stage visuals follow `../questiongame Design System/readme.md`.

**Reading order for a new session:** `optimized_first_spec.md` → `01_codebase-design-spec-v1.md` → this file.

**Status legend:** ☐ not started · ◐ in progress · ☑ done + exit criteria met.

---

## Two design systems, one component stack

This is the rule most likely to be broken by accident, so it comes first.

| | **Studio** (`main` webview) | **Stage** (`stage` webview) |
| --- | --- | --- |
| Tokens | `packages/design-studio/globals.css` — HeroUI theme as shipped | `packages/design-stage/tokens/*` |
| Look | HeroUI defaults, oklch, `--radius: 0.75rem` | Ink on white, radius 0, inset borders, no shadows |
| Type | HeroUI sans stack | Space Grotesk + Space Mono |
| Motion | `motion/react` | GSAP only |
| Canvas | Resizable desktop chrome | Fixed 1920×1080, 64px padding |
| Components | HeroUI v3 first, Base UI on gaps | **Base UI first**, HeroUI *display* components where the theme scope covers them |

Both are TypeScript + React 19 and both use the same libraries. **What differs is the token scope, not the stack.** HeroUI v3 themes through CSS variables, so the Stage root redefines them onto the questiongame palette (`--success` → mint, `--danger` → coral, `--radius` → 0, `--font-sans` → Space Grotesk). Never import `globals.css` into Stage; never import the questiongame tokens into Studio. Full rule: `optimized_first_spec.md` §2.30.

Stage avoids *interactive* widgets (`Button`, `Input`, `Select`, `Modal`) — nobody touches Stage, and their focus rings and ARIA semantics are noise on a camera-facing surface. Structural and display components are exactly right: the Figma frames are a sequence table, a domain card grid, an answer card grid, a timer readout, and a result widget.

---

## Atomic design — the frontend file convention

Both webviews organise components by [atomic design](https://bradfrost.com/blog/post/atomic-web-design/) level. The level is the directory; the directory is the level.

```
atoms/       one element. No composition, no data fetching, no play-state.
             Props in, markup out. Fully token-driven.
molecules/   2–5 atoms bound to one job. May hold local presentational state.
             Still no play-state, no host commands.
organisms/   a self-contained region. Reads play-state (Stage) or dispatches
             commands (Studio). The first level allowed to know the domain.
templates/   layout skeletons with slots. No content, no domain knowledge.
pages/       one route or one Stage screen. Wires play-state into a template.
```

**Rules that make the convention load-bearing rather than decorative:**

1. **Dependencies point one way only** — `pages → templates → organisms → molecules → atoms`. An atom importing an organism is a lint error, enforced in `eslint.config.js` via `no-restricted-imports`. Flat config *replaces* rule options rather than merging them, so each file group gets one fully-composed rule — never several partial ones that would cancel each other out.
2. **Only organisms and pages may touch `play-state` or `invoke`.** Atoms and molecules take props. This is the Play write seam expressed as a directory rule.
3. **Every Stage element carrying a contract node id is an atom or molecule** (P1), so the Screens canvas has one addressable node per id.
4. **Reveal state lives on organisms**, never inside an atom — atoms unmounting would break §2.6.
5. Each level has a co-located test file; atoms and molecules are testable with no host at all.

---

## Monorepo layout

npm workspaces. One repo, GPLv3, per `optimized_first_spec.md` §2.23.

```
questiongame/
├─ apps/
│  ├─ stage/                  Stage webview
│  │  └─ src/{atoms,molecules,organisms,templates,pages}/
│  └─ studio/                 Studio webview
│     └─ src/{atoms,molecules,organisms,templates,pages}/
├─ packages/
│  ├─ contract/               play-state types, command names, node ids, reveal keys
│  ├─ design-stage/           questiongame tokens, Stage theme scope, decorative SVGs
│  ├─ design-studio/          globals.css, HeroUI theme scope, Studio primitives
│  └─ text/                   the Text module (§2.29), one impl per surface
├─ crates/
│  └─ host/                   Tauri 2 app + Rust modules
├─ fixtures/                  play-state JSON for frontend development
└─ docs/
```

`packages/contract` is the only package both webviews **and** the host schema depend on. `design-stage` and `design-studio` must never import each other.

---

## Documentation

Consult these rather than memory; several moved fast in the last year.

| Area | Reference |
| --- | --- |
| HeroUI v3 (**pin `^3.2.4`**) | https://heroui.com/react/llms.txt · components at `heroui.com/en/docs/react/components/<name>` · `heroui-react` skill in `.agents/skills/` |
| Base UI | https://base-ui.com |
| React 19 | https://react.dev/reference/react |
| Tailwind v4 | https://tailwindcss.com/docs |
| Tauri 2 | https://v2.tauri.app |
| GSAP 3 | https://gsap.com/docs/v3 · React: https://gsap.com/resources/React |
| Motion (Studio) | https://motion.dev/docs/react |
| Calligraph | https://calligraph.raphaelsalaja.com |
| TanStack Query | https://tanstack.com/query/latest |
| TanStack Table | https://tanstack.com/table/latest |
| TanStack Form | https://tanstack.com/form/latest |
| TanStack Virtual | https://tanstack.com/virtual/latest |
| TanStack Pacer / Hotkeys | npm: `@tanstack/react-pacer`, `@tanstack/react-hotkeys` |
| Zustand | https://zustand.docs.pmnd.rs |
| dnd-kit | https://next.dndkit.com |
| DialKit | npm: `dialkit` |
| Iconify React | https://iconify.design/docs/icon-components/react |
| Phosphor Icons | https://phosphoricons.com |
| Howler | https://howlerjs.com |
| ECharts (EvilCharts wraps it) | https://echarts.apache.org |
| rusqlite | https://docs.rs/rusqlite |
| Tantivy | https://docs.rs/tantivy |
| proptest | https://docs.rs/proptest |
| Vitest | https://vitest.dev |
| Atomic design | https://bradfrost.com/blog/post/atomic-web-design/ |

---

## Principles that decide the ordering

1. **The host is the only source of truth.** Every frontend phase is built against fixtures before the host exists, and must not gain the ability to write Play state when the host arrives.
2. **Animation constraints are structural.** Overlays must not remount a screen or reset reveal state (§2.6). A screen designed as a self-contained page cannot satisfy that later — so the contract is frozen before anything is drawn.
3. **Install per phase.** Roughly half the §7 list is provisional.
4. **Tests live on the four interfaces** (`MatchService`, `CatalogService`, `PresentationService`, `FlagService`), never on React, GSAP, or rusqlite internals.

### Track parallelism

```
P0 ─┬─ P1 → P2 → P3 ──────────────┐
    │                             ├─ P6 → P7 → P8 → P9 → P10 → P11 → P12
    └─ P4 → P5 ───────────────────┘
```

**Track A (Stage frontend)** P1–P3 and **Track B (Rust core)** P4–P5 are independent and can run concurrently. They meet at P6.

---

## P0 — Monorepo and tooling  ☑

**Goal:** one repo both tracks commit into without a later port.

**Deliverables**

- `git init`; GPLv3 `LICENSE`; `.gitignore` for `node_modules/`, `target/`, `dist/`, `.agents/`, `.claude/`, `.remember/`, `skills-lock.json`.
- The workspace layout above. npm workspaces, TypeScript strict, Vite per app, [Tailwind v4](https://tailwindcss.com/docs), [Vitest](https://vitest.dev).
- The five atomic directories scaffolded in both apps, each with an index barrel.
- **ESLint import-boundary rule** enforcing the one-way dependency order, and a rule banning `design-studio` imports inside `apps/stage` (and vice versa).
- Token files moved out of `docs/` into `packages/design-stage/tokens/`; `globals.css` into `packages/design-studio/`.

**Install:** `react@19`, `react-dom@19`, `typescript`, `vite`, `@vitejs/plugin-react`, `tailwindcss@4`, `vitest`, `eslint`.

**Exit criteria — all met 2026-09-04**

- ☑ `npm run dev:stage` serves a 1920×1080 canvas; Space Grotesk and Space Mono load from **self-hosted woff2** with zero requests to `fonts.googleapis.com` / `fonts.gstatic.com`; every questiongame token resolves.
- ☑ `npm run dev:studio` serves with the HeroUI theme resolving (`--radius: 0.75rem`, oklch palette) and **zero** questiongame tokens in scope.
- ☑ Boundary rules fire, verified with probe files: atom → organism, `apps/stage` → `design-studio`, `apps/stage` → `motion`, atom → `PlayStateForStage`, any → `calligraph`, `apps/studio` → `design-stage`, molecule → `@tauri-apps/api`. A `pages` file importing `PlayStateForStage` and `design-stage` is clean.
- ☑ `npm run typecheck`, `npm run test` (11 tests), and `npm run lint` pass from the root.

**Scaffold notes**

- Fonts are **self-hosted** in `packages/design-stage/fonts/`. `tokens/typography.css` previously carried a `fonts.googleapis.com` `@import`, which would have made Stage require the network to render — a direct conflict with offline-first (§17). Do not reintroduce it.
- `stage.css` repoints the HeroUI variables onto the questiongame palette. **Never remap a variable to itself** (`--font-mono: var(--font-mono)`): a self-referential custom property is invalid and silently falls back to the inherited family.
- Tauri is not installed yet (P6). `crates/` exists but is empty.

Tauri is deliberately absent — it wraps an existing Vite dev server, so P1–P3 stay browser-runnable and P6 costs nothing.

---

## P1 — The Stage contract  ☑

**Goal:** freeze what a Stage screen consumes and exposes, so screens, motion, the Screens canvas, and the host agree. ~1 day. Skipping it guarantees a P2 rebuild.

**Deliverables** — all in `packages/contract`

- `PlayStateForStage` — the stripped snapshot: Play status, ring (teams, order, current, `turns[]`), session (issued question, revealed stem, revealed option count, selection, locked set, `remaining_ms`, `remaining_ms_at_lock`), scores, current screen, overlay busy/pending, live reveal flags. Stage never receives operator chrome, Viewer flags, or catalog rows.
- **Node id scheme** — `<screen>.<slot>[.<key>]`, stable across Plays, keyed by entity id and never by array index alone:
  ```
  idle.wordmark            teamOrder.row.<teamId>       chooseDomain.card.<domainId>
  question.header          question.stem                question.option.<optionId>
  question.timer           question.result              scoreboard.row.<teamId>
  leaderboard.row.<rank>   *.decor.<n>
  ```
  `recipe_set_layout` overrides key off exactly these strings.
- **Reveal keys** — `stem`, `option:<optionId>`, `outcome`, `leader:<rank>`.
- **Screen list and props** — the six screens plus the `currentTeam` interstitial, and the three answer variants the Figma source shows (all-correct, incorrect, extra-selection/partial).
- **Persistence rule** — which nodes survive a screen change (header, wordmark, clock, decor) so overlays animate over them without a remount.
- `fixtures/` — idle · team-order · domain-selection · question (issued / stem-revealed / options-partially-revealed / locked / outcome-correct / outcome-incorrect / outcome-partial) · scoreboard · final-leaderboard · current-team.

**Exit criteria — all met 2026-09-04**

- ☑ All 18 fixtures typecheck against `PlayStateForStage` (authored in TypeScript, emitted to JSON with `npm run fixtures`).
- ☑ Every node id is derivable from a fixture without reading component code — asserted for every team, domain and option in every fixture.
- ☑ Written answer in `05_STAGE_CONTRACT.md` §3: **none of them.** Persistent slots (`header`, `wordmark`, `timer`, `decor`) mount once in the Stage frame, outside the page components; every list keys off an entity id.
- ☑ 39 contract tests green, covering the invariants across all fixtures rather than one at a time.

**Also delivered**

- `screenPairs()` derives all 42 ordered transition pairs from the registry, so adding a screen demands its transitions.
- `AnimKey` namespaces transitions, overlays and reveals, so `anim-complete` is unambiguous.
- `contractVersion` on every snapshot, so a host/webview mismatch is a notice rather than a blank screen.
- Commands grouped by owning module, with `STAGE_COMMANDS` limited to `overlay_ack_complete`.

---

## P2 — Stage screens, static  ☑

**Goal:** the screens and answer variants, pixel-faithful to the design system, driven only by fixtures. No host, no GSAP animation (the live decor world is the one exception, see below).

**This is the Fable 5.1 phase.** Give it the tokens, the design system readme, the P1 contract, and the atomic convention — one screen at a time, producing real components.

**Install:** `@base-ui/react` (Base UI moved off the `@base-ui-components` scope), `@heroui/react@^3.2.4`, `@heroui/styles`. Installed 2026-09-04; the static atoms and molecules are plain token-driven markup and do not mount either library yet — pages decide where a display component earns its place.

**Deliverables by atomic level** (`apps/stage/src/`, shared primitives in `packages/design-stage`)

| Level | Components |
| --- | --- |
| **atoms** ☑ | `Text` (§2.29, `transition="none"` this phase) · `Tag` (pill, radius 0, solid fill; the word is a prop) · `LabelBox` (4px radius letter box) · `Rule` (1/2/3px divider) · `ClockDigits` (ms in, `[ hh:mm:ss ]` out; never ticks) · `PointsFigure` (signed points + authored unit) · `CategoryCode` (whatever code play-state carries) · `DecorShape` **deferred to pages** |
| **molecules** ☑ | `TeamChip` · `ScoreRow` · `SequenceRow` (position derived from ring index, team and score from play-state) · `DomainCard` (**difficulty** of the next question + name + selected state — no serial number) · `AnswerOption` (8px card, neutral/dim/selected/correct/incorrect, hidden-but-mounted until revealed) · `TimerPanel` (label + milliseconds in; serves both the **Play clock** — how long the game has been running — and the question countdown) · `ResultWidget` (verdict + awarded points) · `QuestionStem` |
| **organisms** ☑ | `StageHeader` (asymmetric 1/1/2px rule; title, subject and Play clock derived from play-state) · `SequenceTable` · `DomainGrid` · `AnswerGrid` · `ScoreboardTable` · `LeaderboardList` · `DecorField` **deferred to pages** |
| **templates** ☑ | `StageFrame` (1920×1080, 64px padding, 40px header/body gap, header + body + decor slots) · `SplitFrame` (content column + fixed 398–600px decorative column) |
| **pages** ◐ | `Idle` ☑ · `TeamOrder` ☑ · `ChooseDomain` ☑ · `Question` ☑ (all session states) · `Scoreboard` ☑ (shared lead: every rank-1 row wears LEADER) · `FinalLeaderboard` ☑ (cards by position, labels by competition rank, champion line after rank 1, ties share a label, >4 teams wrap) · `CurrentTeam` ☑ (question counter, team mark, domain + difficulty). **Overlays** (`apps/stage/src/organisms/overlays/`, drawn in the frame's overlay slot above the page, never remounting it): `token-handoff` and `multiple-answers` full screen, `outcome` half screen with the question still visible — the P3 particle bursts for `+` / `−` grow out of the outcome overlay. All built with the operator, decor included. `StageRoot` holds the frame, the persistent header and decor, and the screen → page registry. |

Plus a **fixture switcher** dev route ☑ (`?fixture=<name>`, link strip outside the canvas, dev builds only). It survives into P3 as the animation harness.

**Two kinds of text reach Stage.** Derived text (team names, domain names, difficulty, stems, options, points, ranks, clocks) arrives in `play-state` and is never written in a component. Authored text (HUD labels, the `//` delimiter, verdict wording, tag words, the idle tagline, the difficulty bands) lives in `apps/stage/src/copy/` so an operator-editable copy table later has exactly one thing to override. A component that carries a string literal an operator might want to change is a bug.

**Contract changes made for P2 (2026-09-04, `CONTRACT_VERSION` 2):** `clock: { elapsedMs, running }` on the Play (the header's Play clock — how long the game has been running — needs host time); `nextDifficulty` on `StageDomain` (the domain card shows difficulty, not a number); `leaderboardRevealedRanks` moved from `session.reveals` to the Play root, because FinalLeaderboard shows with `session: null` and had nowhere to keep it. `finalLeaderboard.row.<n>` keys off finishing *position*, not competition rank, so tied teams get distinct node ids.

**Design constraints — rules, not suggestions** (source: the design system readme)

- Fixed 1920×1080, 64px outer padding, 40px header/body gap.
- **Borders, never shadows.** Structure from solid `inset` box-shadows (1/2/3px). No drop-shadow, blur, glass, gradient, or photography anywhere.
- Radius `0` default; `4px` only on letter/avatar boxes; `8px` only on answer cards and result widgets — the only rounded surfaces.
- Header (per the screen references, 2026-09-04): `<brand> | <partner>` left, the Play clock `[ hh:mm:ss ]` right, one 1px rule below. The screen title (`playing sequence //`, `select category // team alpha`) sits in the body, not the header. The 2px frame marks the current sequence row.
- Space Grotesk = human voice (questions, team names, hero numbers), tight negative tracking at size. Space Mono = system voice (HUD labels, timers, category codes), positive tracking. Nothing else.
- Copy is HUD-terse: `DOMAIN // TECHNOLOGY`, `TIMER // REMAINING`, `[ 00:12:20 ]`, `RESULT // ALL CORRECT`, `+N PTS`. Category codes `TEC_881`. No emoji.
- Max 1–2 signal colours live per screen.
- **No hover, focus, or press states.** The only state change is the reveal: dim → highlighted.
- Decorative shapes are loose bodies at matrix rotations, opacity 0.12–0.35 as texture or 1.0 as commentary. Never redraw the `?`/`!` glyphs.

**Decor model (decided 2026-09-04).** Each screen has two kinds of element: *functional* (derived from the Play or authored copy) and *design* (the SVG bodies). Design bodies are 2D physics bodies. v1 uses the simple containment rule: each screen declares an **invisible rectangular boundary** the bodies cannot leave (it may extend past the canvas so shapes bleed off the edge as in Figma); collision with functional elements is v2. A screen's decor is a **manifest** (`apps/stage/src/decor/manifests/<screen>.ts`): boundary + a body list with *ranges* for size, rotation and preferred region — never fixed positions. The concrete layout is **seeded from the Play** (play id, team names, domain names) and settled headless by `matter-js` (GSAP's `Physics2DPlugin` has no collision detection), so every Play gets its own scatter while the visual style stays exactly the design system's. **The bodies are never static** (decided 2026-09-04): once a screen shows, its world keeps running — `collide` (default: drift and bounce inside the box) or `collide-attract` (plus a very mild mutual pull so they keep meeting). Each screen also has an **invisible anchor** point (manifest) that pulls every body in for `attractSeconds`, then pushes them away for `repelSeconds`, forever, at `strength` — the tide that keeps the scatter from settling into a pattern. The mode and its dials (`drift`, `attraction`, `bounce`, `spin`, `maxSpeed`, and `anchor.{enabled, attractSeconds, repelSeconds, strength}`) are `StageDecorSettings` in play-state, a per-recipe layout setting; the Screens tab (P9) exposes them as [DialKit](https://www.npmjs.com/package/dialkit) dials saved through `recipe_set_layout`. The world steps at a fixed 60 Hz and writes transforms straight to the DOM — React renders frame zero only, so play-state emissions never restart the scatter. This is the one motion in P2; it is matter-driven, independent of the GSAP screen timeline, and reports no `anim-complete`. Bodies may carry a **role** (`correct` / `incorrect`); the screen's *mood*, derived from play-state, dims the non-matching body to texture opacity once an outcome shows, without touching the running world. Every body is an exported path now (`decorative_idle_screen/` holds the filled `?` and digits `1`–`5`; the diamonds are the `Union` assets; the outlined `?` is `deocrative_turn_order/_.svg`; the handoff arrow is `arrow-right.svg`). A manifest may be a **function of the Play**: idle shows one digit per team.

**Space and colliders (2026-09-04).** The bodies live in the canvas plus a 160px bleed, **minus the functional elements**: every element marked `data-decor-solid` (header, content column, stem block, side panel, answer board…) is measured from the DOM by the frame and becomes a static wall with a 24px margin, so the free space hugs the content like a U and follows it as rows or cards grow. Colliders are the assets' **convex hulls**, not boxes, so letters touch where their ink touches. Both the asset registry and the hulls are generated by `npm run decor:hulls` from `packages/design-stage/assets/**/*.svg` (new file → new id from folder key + name; replaced file → new hull); a test fails with that command's name when a hull is stale. Manifest regions and anchors are fractions of the canvas box. Capacity handling (shrink / retire under sustained overlap) is deferred; see the risk register.

**Exit criteria**

- ☑ Every fixture renders at 1920×1080 with no horizontal scroll and no layout shift between fixture swaps (browser sweep over all 25 fixtures, 2026-09-04; `exit.test.tsx` asserts the frame tokens per fixture).
- ☑ Every P1 node id is present in the DOM with its contract id (`exit.test.tsx`: every static slot of every screen, every entity/ranked node of every fixture).
- ☑ No focus ring, cursor affordance, or interactive HeroUI widget is reachable on Stage (`exit.test.tsx`: no focusable element in any fixture; `stage.css` sets `cursor: none`).
- ☑ Screens read fixtures only — no local state that could disagree with `play-state` (the only `useState`-free tree; the decor world is derived from the Play and never written back).
- ☑ Atoms and molecules render with zero `play-state` imports (eslint boundary plus `exit.test.tsx` source sweep).

---

## P3 — Stage motion  ☑

**Install:** [`gsap`](https://gsap.com/docs/v3), [`@gsap/react`](https://gsap.com/resources/React), [`calligraph`](https://calligraph.raphaelsalaja.com).

**Deliverables**

- Base transition for **every** `(from, to)` pair across seven screens. Shared beats authored once (`apps/stage/src/presentation/beats.ts`); each pair composes them. **Structure in place (2026-09-04):** a registry (`presentation/transitions/`) resolves all 42 pairs — a bespoke pair by key, every other pair to the composition **exit(from) → decor handover → enter(to)** from seven per-screen enters and exits (`presentation/screens.ts`), so every pair has a specific shape and nothing is ever unanimated; the header's show/hide is the runner's (opacity only — React owns `visibility` on hidden-but-mounted nodes, and cleanup never clears it); `StageRoot` keeps the outgoing page mounted in a lower layer with its last play-state while the incoming one mounts on top, the decor world swaps when the timeline says so, and `runTransition` reports `anim-complete` exactly once (a jump mid-transition finishes the running one first). All 42 pairs play through this path.
- Overlay layer: draws over the live screen, never remounts it, never resets reveal/select/lock. Lives on organisms (rule 4 above). **Done (2026-09-04):** `presentation/overlays.ts` plays each `OverlayRequest` as enter → hold → exit and reports `overlay:<kind>` once; the outcome overlay rises as a half sheet and bursts `+` / `−` pieces with Physics2DPlugin. `OverlayLayer` keeps the shown request locally so it runs to completion even if the host clears `active` early; disabled overlays draw nothing but still report.
- Overlay queue: current runs to completion; pending depth exactly 1; newer pending replaces older; never `kill()` mid-beat; no base transition under a running overlay. **Done on the Stage side:** the host owns the queue; `presentation/sequencer.ts` holds a transition while an overlay runs and an overlay while a transition runs; a newer `active` arriving mid-run waits (depth 1, newer replaces older).
- Reveal layer addressed by P1 reveal keys: stem → options one by one → outcome; leaderboard lowest rank first. **Done (2026-09-04):** `presentation/reveals.ts` — `useRevealPlayer` diffs the snapshot's revealed keys against what the screen has shown, plays each new key in order (a tie reveals every row of that rank as one key), reports `reveal:<key>` once; keys already revealed at mount do not replay.
- `anim-complete { key }` on every timeline end — the handshake that stops auto-reveal outrunning GSAP. **Done:** transitions, overlays and reveals each report exactly once through `host/events.ts`.
- `Text` gains its Stage implementation: `swap` and `count` as GSAP tweens **inside the screen timeline**, never Motion (§2.29). **Done:** `presentation/text.ts`; the atom tweens the node React already updated on a content change, never on first render; `count` rolls the number and keeps grouping and zero padding.
- `overlay_animations.enabled = false`: skip the queue, update the token, no visual. **Done:** nothing drawn, handshake still fires.
- **Manual overlays (decided 2026-09-04):** every overlay kind (`token-handoff`, `round-advance`, `multiple-answers`, `outcome`, `current-team`) is enqueued automatically by its cause *and* callable by the operator at any time over any screen via `show_overlay`. The outcome overlay is transparent; the question stays visible.

**Test corpus — the §17 examples, against a stubbed clock**

- ☑ Idle → ChooseDomain (TeamOrder skipped) plays a handoff overlay, then domain content — Stage plays the transition first and the handoff over the new screen when both arrive in one emission (`pages.test.tsx`). The host's side (enqueueing the handoff) is P4/P6.
- ☑ Idle → TeamOrder → ChooseDomain plays base transitions only.
- ☑ Wrong answer → operator opens ChooseDomain → overrides mid-overlay: current overlay finishes, then the override overlay; revealed content stays revealed. Stage side: a running overlay is never killed, a newer `active` waits (depth 1), a transition waits for the overlay (`sequencer`, verified in the browser). Host side (queue) is P4.
- ☑ Overlay while an option is revealed: still revealed afterwards, DOM node never unmounted (`pages.test.tsx` asserts node identity).
- ☑ Two rapid overrides collapse to one pending, not two — Stage keeps one waiting request and a newer one replaces it; the authoritative collapse is the host's queue (P4).

**Exit criteria**

- ☑ All 42 `(from, to)` pairs have a timeline, verified by an exhaustive test over the screen list (`presentation.test.ts`).
- ☑ `anim-complete` fires exactly once per timeline (transitions, overlays, reveals).
- ☑ No `motion/react` import anywhere under `apps/stage` (eslint boundary plus a source sweep in `presentation.test.ts`).

---

## P4 — `MatchService` (Rust, headless)  ☐

**Goal:** all game truth, no UI and no database. Highest-value test surface in the project (category 1 — pure in-process computation).

**Install:** Rust stable, `serde`, `thiserror`, `uuid`, [`proptest`](https://docs.rs/proptest).

**Deliverables** — `crates/host/src/`

- `rules` — judging (set equality, order-irrelevant, partial credit off by default), consume-per-Play, completion, competition rank `1,1,3`.
- `ring` — the round invariant, `give_token` legality, `reorder_ring` on the future ring only.
- `award` — flat / difficulty / lock-speed (exclusive and option), `floor(base * (1 + speed_weight * remaining_ms_at_lock / duration_ms))`, cap and consecutive bonus, `0` on wrong or empty reveal.
- `session` — `issued → stem_revealed → options_revealed → selecting → locked | timer_expired_open → outcome_revealed`, plus the §5.3 reject table.
- `timer` — host-authoritative, 100ms tick, the T=0 table, the §2.18 cascade, operator pace.
- `play` — snapshot build (§4.3), lifecycle, append-only events, `TurnInverted` on undo, restart same/different.
- One public interface: the §13 `play_*` and session commands returning `Result<_, MatchError>`.

**Exit criteria**

- ☐ **Property test:** for team counts 1–12 and random legal command sequences, `max(turns) − min(turns) ≤ 1` always holds and no team is overridden into consecutive turns.
- ☐ Points are written only by `reveal_outcome` — a test drives lock, override, pause, and undo and sees the score unchanged.
- ☐ Undo never mutates an existing event; the log only grows.
- ☐ Replaying a full event log rebuilds a byte-identical `PlayState`.
- ☐ `n = 1` rehearsal Play runs to completion.
- ☐ Zero `tauri::` imports — these modules compile as a plain library.

---

## P5 — `CatalogService`, `FlagService`, persistence  ☐

**Install:** [`rusqlite`](https://docs.rs/rusqlite) (or `tauri-plugin-sql`), [`tantivy`](https://docs.rs/tantivy), `tokio`, `tracing`.

**Deliverables**

- Schema: `teams`, `domains`, `questions`, `domain_questions`, `operators`, `assets`, `recipes`, `plays`, `events`, `globals`.
- `catalog_*` / `recipe_*` / `recipe_set_overlay` behind one interface. Archive is `archived_at`; no hard delete; a row referenced by a recipe or open Play cannot be purged.
- Recipe overlays (stem, options, difficulty, per-question duration, domain name, team marks) and `ScopeConfirm` semantics at the data layer.
- Atomic writes: events append first, projections rebuild on boot, `recipe_upsert` is one transaction.
- Tantivy behind `catalog_search` — not a separate service.
- In-memory adapter for tests; the storage seam stays internal.
- `FlagService`: three flag kinds, the §2.18 cascade, the §4.2 interlock table, the `play_start` freeze.

**Exit criteria**

- ☐ The same suite passes against both SQLite and in-memory adapters.
- ☐ Kill the process mid-write; boot replays events and loses nothing.
- ☐ A catalog edit during an open Play leaves that Play's snapshot byte-identical.
- ☐ Every illegal settings combination in §4.2 is rejected by the host, not merely disabled in UI.

---

## P6 — Tauri wiring  ☐

**Goal:** the tracks meet. Stage stops reading fixtures and starts reading the host.

**Install:** [Tauri 2](https://v2.tauri.app), `@tauri-apps/api`.

**Deliverables**

- Two webviews: `main` and `stage`. Stage window created on **first Control Load**, not at boot.
- The §13 command surface as `#[tauri::command]`; `tauri::State` holds the DB pool and materialized `PlayState`.
- `emitTo("main", …)` full snapshot; `emitTo("stage", …)` stripped.
- Monitor port: `availableMonitors`, `toLogical(scaleFactor)`, plus a **fake monitor list adapter** so unplug behaviour is testable.
- In-process test harness adapter for the host command seam.

**Exit criteria**

- ☐ Every P1 fixture is reproducible as a real `play-state` emission — fixtures become integration assertions.
- ☐ Unplugging the Stage monitor pulls the window to primary, raises a notice, Play stays `playing`.
- ☐ Stage renders identically fixture-fed or host-fed.
- ☐ One monitor is a valid configuration (Stage fullscreen, Studio via Alt-Tab).

---

## P7 — Studio shell and libraries  ☐

**Install:** [`@tanstack/react-query`](https://tanstack.com/query/latest), [`@tanstack/react-table`](https://tanstack.com/table/latest), [`@tanstack/react-form`](https://tanstack.com/form/latest), [`@tanstack/react-virtual`](https://tanstack.com/virtual/latest), `@tanstack/react-pacer`, [`zustand`](https://zustand.docs.pmnd.rs), [`@iconify/react`](https://iconify.design/docs/icon-components/react), [`@phosphor-icons/react`](https://phosphoricons.com), [`motion`](https://motion.dev/docs/react).

**Read the `heroui-react` skill first.** v3 only.

**Deliverables by atomic level** (`apps/studio/src/`)

| Level | Components |
| --- | --- |
| **atoms** | Thin wrappers over HeroUI primitives that pin project variants — `Button`, `Field`, `Icon`, `Kbd`, `StatusDot`, `Text` (Studio impl) |
| **molecules** | `SearchField` + kind filter · `RecordRow` (one row, two layouts) · `InlineNotice` · `ArchiveToggle` · `BulkBar` · `DirtyGuard` |
| **organisms** | `LibraryList` (grid\|table, virtualised) · `RecordEditor` · `SidebarNav` · `TopBar` · `StatusBar` · `NoticeCollector` |
| **templates** | `ShellLayout` (sidebar + content + top + status) · `LibraryTabLayout` (list → detail → edit stack) |
| **pages** | Teams · Domains+Questions · Games (all + one) · Operators |

Sidebar has three states: expanded / icon strip / hidden with left-edge peek. Per-tab archive with Active\|Archived. grid\|table persisted per operator per tab.

**Exit criteria**

- ☐ Renaming a team updates every surface via host events — no second store, no manual refetch.
- ☐ Zustand holds only chrome state; a grep for score/ring/session keys in stores returns nothing.
- ☐ `play-state` never appears in a TanStack Query key.
- ☐ No `apps/studio` file imports `design-stage`.

---

## P8 — Control tab  ☐

**Install:** [`@dnd-kit/react`](https://next.dndkit.com), `@dnd-kit/helpers`, `@tanstack/react-hotkeys`.

**Deliverables by atomic level**

| Level | Components |
| --- | --- |
| **atoms** | `TransportButton` · `TimerIcon` · `RingRowHandle` · `HitTarget` |
| **molecules** | `TimerCluster` (icon-only start/pause + clock, hidden at operator pace) · `RevealControls` · `RingRow` (nine variants: history, current, future, drop-ok, drop-illegal, overlooked, override-armed, override-blocked, rehearsal-solo) · `ScreenStrip` |
| **organisms** | `Viewer` (Stage tree + hit-target overlay) · `GamePanel` · `ActionPanel` · `StripsPanel` · `TimelinePanel` · `SettingsFloat` (Global \| Current game) |
| **templates** | `ControlMosaic` (resizable min/max, movable, stackable as tabs, persisted per operator) |
| **pages** | Control |

Density: each panel declares its own limited-space behaviour. Vertical scroll only, never horizontal. Hotkeys on `main` only, `ignoreInputs: true`, never on Stage.

**Exit criteria**

- ☐ Viewer click, Action Panel button, and keyboard chord dispatch the *same* command — one test asserts three call sites hit one handler.
- ☐ Every illegal ring drop is refused with `drop-illegal`, at 2, 3, 5, and 8 teams.
- ☐ Undo, restart, and abandon are blocked with a wait notice while an overlay is busy.
- ☐ No operator chrome ever appears in the Stage webview.

---

## P9 — Screens tab canvas  ☐

**Install:** [`dialkit`](https://www.npmjs.com/package/dialkit).

**Deliverables:** route blocked while a Play is `playing|paused`, with the two-action notice and stacked "Are you sure?"; load a recipe, select nodes by P1 contract id, edit font / size / colour / position / size, apply to this screen or all screens; **decor physics dials** (DialKit) bound to `StageDecorSettings` — mode, drift, attraction, bounce, spin, max speed, the anchor (on/off, attract seconds, repel seconds, strength), plus each screen's boundary box and anchor point; auto-save to `recipe_set_layout`, 400ms debounce, one `rev`.

**Exit criteria**

- ☐ An override saved here appears on Stage in the next Play of that recipe, and nowhere else.
- ☐ Viewer overlays are never persisted as Stage design.
- ☐ A recipe with no overrides plays correctly on built-in defaults.

---

## P10 — Settings, first run, notices, audio, health  ☐

**Install:** [`howler`](https://howlerjs.com).

**Deliverables:** first run (paths → first operator, required before Play → sample catalog skip/load → optional Settings; demo defaults award `difficulty`, lock-speed off, timer 30s, cap and bonus off); sample recipe `"Demo"` (2 teams, 2 domains, 3 questions each at 10/20/30, single-answer, timer on, rows `origin = seed`, **Restore Demo** in Settings); Settings inner tabs Monitors \| Settings \| Keyboard shortcuts; Operators tab with optional hashed pin gating operator switch, uninstall-data, and wipe-plays but **never** a live Play command; the notice family (host emits `{ code, severity, target_path, actions[] }`; inline / destructive dialog / collector float; 2 max 3 actions; confirms stack in the same component); audio behind the cue-key interface with the bundled pack and Howler adapter, `feat.audio.synth` **off**; health engine silent until error/warn, always paired with a suggestion.

**Exit criteria**

- ☐ Play is blocked until at least one team and one board question exist.
- ☐ No notice anywhere offers more than three actions.
- ☐ Muting and volume take effect mid-Play; scoring settings cannot.
- ☐ No generated tone is ever produced with the synth flag off.

---

## P11 — Statistics  ☐

**Install:** EvilCharts / [ECharts](https://echarts.apache.org), isolated under Statistics only.

**Deliverables:** Live view of the current Play; All-data view with compound filters (variables + time); optional Statistics window on a second monitor; results table default with optional entity cards.

**Exit criteria**

- ☐ Statistics issues no writing command at all — verified by a grep of its imports.
- ☐ The Statistics window is never a second Stage.

---

## P12 — Packaging and release  ☐

**Deliverables:** Windows and macOS bundles; install paths vs user-data separation; uninstall screen offering app files and generated user files independently; processes visible in Task Manager / Activity Monitor; GPLv3 notices; offline verification.

**Exit criteria**

- ☐ Clean install → first run → Demo recipe → full Play to `Completed` on both OSes.
- ☐ A run with the network disabled behaves identically.
- ☐ Uninstall removes exactly what the operator selected.
- ☐ No memory growth across three consecutive Plays.

---

## Explicitly not in v1

Wager/stake · CSV import/export · user-replaceable audio packs · `@web-kits/audio` synth · Three.js / WebGL · haptics · mobile · livestream output · git-style branching in the operator UI · hard delete · a pack editor.

---

## Open decisions that block phases

| Decision | Blocks | Note |
| --- | --- | --- |
| **Studio theme reconciliation** | P7 | `globals.css` ships HeroUI's default blue/Geist/`0.75rem` theme. That is now the *intended* Studio look (§2.30), so the only open question is whether Studio should borrow the signal colours (mint/coral) for correct/incorrect readouts so the two surfaces agree on meaning. |
| **Missing design-system files** | P2 | The design system readme indexes `styles.css`, `assets/`, `components/core/`, `ui_kits/questiongame/` (13 screens), `guidelines/`, and `SKILL.md`. **None are in this repo** — only `tokens/` and four decorative SVG folders. If they exist elsewhere, that is most of P2 already built. |
| **Default Stage monitor with several externals** | P6 | §9, ungrilled. |
| **Archive view visual design** | P7 | §9. |

---

## Risk register

| Risk | Phase | Mitigation |
| --- | --- | --- |
| Screens built as self-contained pages → overlays remount them, reveal state dies | P2 | P1 contract freezes persistent nodes; P3 tests assert no unmount; reveal state lives on organisms |
| Stage picks up Studio styling through a shared component | P2, P7 | Separate `design-stage` / `design-studio` packages with a lint boundary; Stage never imports `globals.css` |
| A second writer of Play state appears in React | P7, P8 | Atomic-level rule (only organisms/pages touch `invoke`); CI grep gate on store keys; `play-state` never in a Query key |
| Auto-reveal outruns an animation | P3, P8 | `anim-complete` handshake; Motion barred from Stage (§2.29) |
| HeroUI v3 is young; a needed component is missing or unstable | P2, P7 | Base UI is the named fallback and the first choice on Stage anyway |
| Layout overrides break when a question or team is renamed | P9 | Node ids key off entity id, never label or index (P1) |
| Timer drift between host and webview | P4, P6 | Host-authoritative at 100ms; frontend may interpolate but never pass host zero |
| Decor bodies crowd the free space (many teams, long names) and stay interpenetrated | P2, P3 | U boundary from measured solids and hull colliders (done). Planned: a fill budget at frame zero and a gentle capacity engine (sustained-overlap monitor → shrink offenders → retire by priority), dials in `StageDecorSettings.capacity` |
