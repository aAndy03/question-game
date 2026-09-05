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
│  ├─ host/                   the four services. A plain library: zero `tauri::`
│  └─ app/                    the Tauri 2 shell around it (P6)
├─ dist/                      both webviews build here; Tauri's `frontendDist`
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

Tauri is deliberately absent — it wraps an existing Vite dev server, so P1–P3 stay browser-runnable and P6 costs nothing. *(It did: P6 added `crates/app` and two `dist/` subdirectories, and touched no screen.)*

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

## P4 — `MatchService` (Rust, headless)  ☑

**Goal:** all game truth, no UI and no database. Highest-value test surface in the project (category 1 — pure in-process computation).

**Install:** Rust stable (1.94, edition 2024), `serde`, `serde_json`, `thiserror`, `uuid`, [`proptest`](https://docs.rs/proptest). A Cargo workspace at the repo root holds `crates/host`; `npm run test:host` and `npm run lint:host` run it from the same place as everything else.

**Deliverables** — `crates/host/src/`

- ☑ `rules` — judging (set equality, order-irrelevant, partial credit off by default), competition rank `1,1,3`. Consume-per-Play and completion live on `play`, which is where the consumed set is.
- ☑ `ring` — the round invariant, `give_token` legality, `reorder_ring` on the future ring only.
- ☑ `award` — flat / difficulty / lock-speed (exclusive and option), `floor(base * (1 + speed_weight * remaining_ms_at_lock / duration_ms))`, `0` on wrong or empty reveal. Cap and consecutive bonus are applied by `reveal_outcome`, which is the only place that knows the running consecutive count.
- ☑ `session` — the §5.3 stages, derived from the fields rather than stored: the operator reveals, selects and locks in the order the show decides, and a stored stage enum would need correcting at every step.
- ☑ `timer` — host-authoritative, the T=0 table, the §2.18 cascade, operator pace.
- ☑ `play` — snapshot build (§4.3), lifecycle, append-only events, `TurnInverted` on undo, restart same/different.
- ☑ One public interface: the §13 `play_*` and session commands returning `Result<_, MatchError>`.

**Exit criteria — all met 2026-09-05** (63 tests: 34 unit, 23 `match_service`, 4 `stage_contract`, 2 proptest)

- ☑ **Property test:** `tests/round_invariant.rs` over 1–12 teams and random sequences (legal *and* illegal), and `random_command_sequences_keep_every_invariant` over the real command surface — the invariant holds, no team is overridden into consecutive turns, and a rejected command leaves the Play byte-identical.
- ☑ Points are written only by `reveal_outcome` — `points_are_written_only_by_reveal_outcome` drives select, lock, override, pause and undo and sees the score unchanged.
- ☑ Undo never mutates an existing event; the log only grows (`undo_only_grows_the_log` asserts the old log is a prefix of the new one).
- ☑ Replaying a full event log rebuilds a byte-identical `PlayState` — asserted on a scripted Play *and* at the end of every property run.
- ☑ `n = 1` rehearsal Play runs to completion.
- ☑ Zero `tauri::` imports — asserted by a source sweep, not by hope.

**Also delivered**

- **`stage::project`** — the game half of `PlayStateForStage`, with `tests/stage_contract.rs` checking it against all 25 P1 fixtures: same keys, same JSON kinds, same `CONTRACT_VERSION`. The only keys the host may be missing are the presentation half (`currentScreen`, `overlay`, `revealModes`, `decor`), which P6 merges. This buys most of the P6 exit criterion three phases early, and a rename on either side now fails a Rust test instead of blanking Stage. *(P6 kept the split and added the whole-emission assertion beside it.)*
- **`reveal_and_pass`** — §2.6's two-click *Reveal & pass* as one atomic command: an illegal target is refused before anything is revealed.
- **`Ring::default_next`** — what the Action Panel arms by default (next legal target in ring order). A default, not a rule; any legal target is still accepted.

**Decisions made while building it (2026-09-05)**

- **No clock inside the host.** Every command takes the millisecond it happened at, and a running timer is stored as `remaining as of running_since`. Ticks therefore never mutate a Play: `tick` only applies the T=0 table, and it applies it **at the computed zero instant**, so a late poll scores exactly what a punctual one would and a replay lands on the same millisecond.
- **`judging.order_matters` makes the outcome binary.** A set-share is meaningless when position is part of the answer, and partial credit pays only a `partial` verdict — otherwise a right set in the wrong order would have scored full marks.
- **`give_token` is refused while a question is issued and unrevealed, in both `override.after_lock` modes** (§2.6 path 2: reveal is required, then scoring, then the token may move). The setting decides whether Control *shows* the button; `allow` pairs it with `reveal_and_pass`. The host never invents a reveal.
- **Undo is a span, not a step.** `TurnInverted { target_event_id, from_seq, to_seq }` names the resolve it inverts and the stretch of log it takes out of the projection — from the `QuestionIssued` that opened that turn to the end of the log — so the question returns to the pool and the token to the team that held it. Redo is legal only while the undo is still the last event; after that the way forward is a fresh resolve (§5.8).
- **Undo reaches a Play that has just completed.** The last question of the board is exactly the one an operator is most likely to want back, so `undo_turn` accepts `playing | paused | completed` and reopens the Play; abandoned and restarted are closed records and stay closed.
- **A duration nowhere in the cascade is operator pace.** The host will not invent a countdown the operator never chose.
- **The reveal commands live on `MatchService`.** `reveal_stem`, `reveal_next_option` and `reveal_leaderboard_rank` are Play state (they survive undo and must read identically in Stage and Viewer), so `PresentationService` will call them rather than keep its own copy.
- **`play_start` warns, it does not refuse, at one team.** `Play::is_rehearsal` is the signal; the notice is P8's.

## P5 — `CatalogService`, `FlagService`, persistence  ☑

**Install:** [`rusqlite`](https://docs.rs/rusqlite) with `features = ["bundled"]`, [`tantivy`](https://docs.rs/tantivy), `tracing`. **`tokio` was not installed** — see the decisions below.

**`rusqlite`, decided 2026-09-05** (`optimized_first_spec.md` §7 no longer offers the choice). `tauri-plugin-sql` would drag Tauri into `crates/host` at P5 and break the plain-library property P4 asserts with a source sweep; its `Database.load()` / `execute` JS API is a second writer of the catalog by design; it is `sqlx`-async, so every catalog call and every test would become a future to talk to a local file; and it does nothing for Tantivy, which is Rust-side either way. Three decisions that come with it:

1. **`bundled`** — SQLite compiled from source. No system library on either OS, which is what offline-first and a clean install require.
2. **Migrations are handwritten and forward-only**, keyed off the `user_version` pragma: an ordered `&[&str]` applied in one transaction at boot. No migration crate — it is thirty lines, and it is exactly the kind of thing that should be readable in the diff. v1 has no downgrade story, so there are no `down` steps.
3. **One writer connection behind a `Mutex`, owned by `CatalogService`** — the interface never hands a `Connection` out. `journal_mode = WAL` with `synchronous = FULL`: writes are human-paced (a handful per question), so the fsync costs nothing measurable and the durability claim stops depending on the kind of crash. WAL also gives readers a free lane, so the Tantivy indexer opens its **own read-only connection** rather than a pool dependency.

**Deliverables** — `crates/host/src/flags.rs` and `crates/host/src/catalog/`

- ☑ `flags` — `FlagService`: the §4.2 settings document, the three flag kinds (`feat.*` roots resolved through the subgraph, policy keys, runtime flags derived from the Play), the §2.18 cascade, the §4.2 interlock table, the `play_start` freeze, and the shortcut map with its conflict rule.
- ☑ Schema: `assets`, `teams`, `domains`, `questions`, `question_options`, `domain_questions`, `operators`, `recipes`, `recipe_teams`, `recipe_domains`, `recipe_questions`, `recipe_overlays`, `events`, `plays`, `globals`.
- ☑ `catalog_*` / `recipe_*` / `recipe_set_overlay` behind one interface. Archive is `archived_at`; there is no hard-delete path in the crate; `referenced_by` reports what a row is used by.
- ☑ Recipe overlays (stem, options, difficulty, per-question duration, domain name, team marks) and `ScopeConfirm` semantics at the data layer — `EditScope::ThisGame | Original`.
- ☑ Atomic writes: events append first, projections rebuild at `CatalogService::open`, `recipe_upsert` is one transaction.
- ☑ Tantivy behind `catalog_search` — not a separate service, and not a `SearchService` port.
- ☑ In-memory adapter for tests (`CatalogLocation::Memory`); the storage seam stays internal — `store.rs` is `pub(super)` and no interface returns a `Connection`.

**Exit criteria — all met 2026-09-05** (143 tests: 62 unit, 27 `catalog_service`, 25 `match_service`, 23 `flag_service`, 4 `stage_contract`, 2 property)

- ☑ **The same suite passes against both SQLite and in-memory adapters.** `tests/catalog_service.rs` has an `each_adapter` harness that runs a body twice — once in memory, once against a real file with WAL and `synchronous = FULL`.
- ☑ **Kill the process mid-write; boot replays events and loses nothing.** Dropping a `CatalogService` with no clean shutdown is what a kill looks like from the file's point of view; reopening replays the log and `resume_open_play` hands back a byte-identical Play. A second test kills *between* two commands and asserts that exactly the unpersisted ones are missing and nothing else is.
- ☑ **A catalog edit during an open Play leaves that Play's snapshot byte-identical** — asserted against an upsert, an archive **and** a new recipe overlay, on both adapters. The settings half is asserted separately in `tests/flag_service.rs`.
- ☑ **Every illegal settings combination in §4.2 is rejected by the host, not merely disabled in UI.** `every_game_affecting_key_is_refused_while_a_play_is_open` walks the whole frozen block and cross-checks it against `GAME_AFFECTING_KEYS`, so a key added to §4.2 and not to the test fails the suite.

**Also delivered**

- **`FrozenSettings::validate` on `MatchService::play_load`.** P4 accepted whatever settings it was handed. The interlocks now live on the settings types themselves, so `FlagService` runs them before a key is written *and* `play_load` runs them over a snapshot that may have come from an older database row. A Play that would score wrong for its whole life fails at the door instead.
- **`FlagService::disabled`** — the §4.2 sentence "UI disables the illegal sibling first" as data: every key that is frozen, inert, or under an off feature root, with the reason. Computed once by the flag reader instead of four times in Studio.
- **`FlagService::flag`** — one lookup over all three flag kinds, with `FLAG_KEYS` enumerating what resolves. `None` is an unknown key, never a false.
- **`CatalogError::PlayAlreadyOpen`** — §4.3's "two Plays of one recipe cannot be `playing`" enforced in the store, so it survives a restart of the process instead of holding only inside one `MatchService`.
- **Prefix search.** Each query term matches exactly or as a prefix, so an operator typing `sci` finds `Science`. The frontend debounces; it does not compose queries.

**Decisions made while building it (2026-09-05)**

- **`tokio` was not installed.** Nothing in the host is asynchronous: `rusqlite` is sync, Tantivy's writer is sync, and the whole point of choosing `rusqlite` over `tauri-plugin-sql` was to keep catalog calls and their tests from becoming futures to talk to a local file. A runtime with no user is weight, not readiness — it belongs with P6's Tauri wiring, where something actually awaits.
- **The search index lives in RAM and is rebuilt at open.** A v1 library is thousands of rows; rebuilding costs milliseconds and removes the entire class of "the index disagrees with the database" bugs an on-disk index has to defend against. The read-only lane WAL reserves is still the right home for indexing the moment it moves off-thread. Commits are lazy — a write marks the index dirty and the next search commits — so a bulk edit (§2.19) pays for one commit, not one per row. **The *write* half of that was still one transaction per row when P5 shipped; P6 closed it with `catalog_upsert_many` / `catalog_archive_many` / `catalog_restore_many`.**
- **Recipes are not reachable through `catalog_*`.** §11.A and §11.B are two families with two verb lists, and a row writable through both `catalog_upsert` and `recipe_upsert` would be two ways to do one thing. `CatalogKind::Recipe` exists for `catalog-changed` and the archive plumbing; `catalog_list` and `catalog_get` refuse it.
- **Every §4.2 write is validated on a clone and committed whole.** A refused settings write changes nothing — the same discipline `MatchService` keeps for commands, and the reason `settings_set_*` can be per key while the *document* stays legal.
- **An unreachable bonus is an illegal document.** `turn.bonus_after_consecutive.count > turn.max_consecutive_correct` is refused: the cap ends the token *at* n corrects and the bonus lands *at* count, so a larger count is a setting that can never take effect. §4.4 does not spell this out; it follows from the two keys' definitions, and a silently dead award is worse than a notice.
- **`reveal.*` is the one Game-tab key that does not freeze.** §4.2 lists it as a Game default *and* Control live, so writing it during a Play is legal and moves the live copy `PresentationService` will read, not just the recipe's default.
- **A board naming an archived or missing row refuses to build a snapshot.** A show that quietly loses a question is worse than one that will not start until the operator has looked at it — which is the Shape manager's job at P8.
- **`EditScope::Original` drops the editing recipe's own overlay for that target** so the operator sees the change they just made, and leaves every *other* recipe's overlay standing (§2.17). A per-question duration has no original to apply to, and says so.
- **Catalog metadata is host-owned.** `created_at` is carried from the stored row and `updated_at` moves to `now_ms` whatever the caller sent, so a client cannot backdate a row. Writes take `now_ms` like every other command — there is still no clock inside the host.

---

## P6 — Tauri wiring  ☑

**Goal:** the tracks meet. Stage stops reading fixtures and starts reading the host.

**Install:** [Tauri 2](https://v2.tauri.app) (`tauri`, `tauri-build`), `@tauri-apps/api`, `@tauri-apps/cli`, `tokio`, `tracing-subscriber`.

**`crates/app`, a new workspace member.** `crates/host` stays a plain library — the P4 source sweep still fails on a `tauri` in its `src` tree — so Tauri wraps it from the outside instead of moving into it. `crates/app` depends on `questiongame-host`; nothing depends on `crates/app`.

```text
state         the four services behind one lock, and the only clock in the project
commands/     the §13 surface as `#[tauri::command]`, one file per service
emit          host → webview events; the only sender
guard         which webview may call what (§5.7)
windows       the two webviews, and where the Stage one stands
monitors      the real end of the monitor seam
tick          the 100ms show loop and the monitor watch
decor         `StageDecorSettings` out of the recipe's layout document
demo          a demo library, for running P6 before P7 has library tabs
error         what a refused command looks like on the wire
```

**Deliverables**

- ☑ Two webviews: `main` and `stage`. Stage created on **first Control Load**, not at boot — and it opens fullscreen on primary and *waits* there (§9). Both are served under the path they occupy in the bundle (`/studio/`, `/stage/`) in dev as well, from **one dev origin**, so both are `local` to Tauri's ACL and `crates/app` has no dev/prod branch.
- ☑ The §13 command surface as `#[tauri::command]`; `tauri::State` holds one `Mutex<Host>` with all four services.
- ☑ `emitTo("main", …)` full (`PlayStateForStage` + `OperatorState`); `emitTo("stage", …)` stripped.
- ☑ Monitor seam: `availableMonitors` + `toLogical(scaleFactor)` on one side, a `Vec<MonitorInfo>` literal on the other. The unplug path is a host unit test.
- ☑ `PresentationService` (`crates/host/src/presentation.rs`) — the screen, the overlay queue, the `anim-complete` door. Reveals go *through* `MatchService`.
- ☑ `catalog_upsert_many` / `catalog_archive_many` / `catalog_restore_many` — §2.19's bulk as one transaction (the open question from P5; see the decisions below).

**Exit criteria — all met 2026-09-06** (193 Rust tests: 72 host unit, 29 `catalog_service`, 25 `match_service`, 23 `flag_service`, 16 `presentation_service`, 13 `host_wiring`, 7 `stage_contract`, 6 app unit, 2 property. 306 TypeScript.)

- ☑ **Every P1 fixture is reproducible as a real `play-state` emission.** `every_fixture_is_reproducible_as_a_real_emission` builds the whole emission the way `crates/app` does and asserts that no fixture carries a key the host cannot produce and the host produces none a fixture does not know. `the_game_projection_is_still_only_the_game_half` keeps `project` on its own side of the split, so the 100ms tick cannot start dragging the queue along.
- ☑ **Unplugging the Stage monitor pulls the window to primary, raises a notice, Play stays `playing`.** `unplugging_the_stage_display_leaves_the_play_playing` drives it through the fake list; nothing in `monitor.rs` can reach a Play, which is what makes the last clause true by construction rather than by care.
- ☑ **Stage renders identically fixture-fed or host-fed.** `apps/stage/src/host/host.test.tsx` renders `StageRoot` directly and `App` behind a stub host and compares the DOM.
- ☑ **One monitor is a valid configuration.** `one_display_is_a_valid_configuration`, and the Stage window is fullscreen-on-primary by default because the host never picks a display.

**Also delivered**

- **`MatchService::adopt`** — the boot path. P5 could replay an open Play but had no way to put it *back*; the test worked around it by reloading the snapshot, which loses the score. `Host::open` now adopts the replayed Play, and `boot_takes_back_the_play_that_was_open_with_its_score` asserts it.
- **`MatchService::can_undo` / `can_redo`** — reads for the Timeline's buttons, so Control asks instead of trying the command and catching the refusal.
- **`stage_ready`** — the second (and last) command Stage may call. It reports the contract version this webview was built against, which is what turns a mismatch into a §14 notice on the operator's screen instead of a blank one on the audience's, and it asks for the current state, which a deduplicated emission otherwise would not send to a late-mounting window.
- **`recipe_new`** — a new recipe seeded from `game_defaults`, which is the one place §12's seeding rule is applied.
- **`crates/app/src/demo.rs` + `seed_demo_library`** — a four-team, three-domain library written through the ordinary verbs. Dev builds only; §10's optional sample catalog at first run replaces it.
- **A `tracing` subscriber.** The host has emitted spans since P5 with nobody listening.
- **`EMPTY_PLAY_STATE`** in `packages/contract` — what Stage draws before the host has anything to send. Idle reads nothing off the Play, so an empty roster is the wall before a recipe is loaded, not a hole.

**Decisions made while building it (2026-09-06)**

- **Confirmed against the Tauri 2 docs: a plain `#[tauri::command]` runs on the main thread**; only `#[tauri::command(async)]` (or an `async fn`) moves off it. So **every command that can reach the database is `(async)`** — `play_persist` is a ~2.5 ms fsync and it follows every command that appends an event. `get_state` and `settings_get` stay synchronous: they are a fold and a struct borrow, and the thread hop would cost more than the work.
- **`Host::write` persists only when the log grew.** That single line is why the show loop never touches disk: the 100ms tick goes through the same path and appends nothing 999 times in 1000. The T=0 table is the exception, and that one *should* cost an fsync.
- **The emission is deduplicated.** An idle or paused Play costs nothing on the wire; `stage_ready` exists because of it.
- **`PresentationService` lives in `crates/host`, not in `crates/app`.** The screen, the queue and the auto-reveal chain are pure computation with a reject table, so they belong where the other three services are and are tested at the same bar. What is genuinely Tauri's — the window, the display list, the event bus — is all that stayed above the line.
- **Overlays are enqueued from a *diff* of the projection, not from the command.** §5.6 says a kind is enqueued when its **cause** occurs, and the same cause arrives from `reveal_outcome`, from an override and from an undo putting the token back. One diff covers all of them and a new command needs no entry.
- **`current-team` has no automatic cause.** Its cause is the handoff, which `token-handoff` already animates; it stays operator-called (§5.6 allows any kind by hand at any time).
- **`reveal.outcome` has no chained command.** The other three channels have one (`reveal_stem`, `reveal_next_option`, `reveal_leaderboard_rank`); the outcome node becomes visible as part of `reveal_outcome`, which is the only thing that scores (§2.4). Auto-revealing it would mean Stage resolving a question by itself. The channel still reaches Stage, which is where the arrival animates. **If §4.2 meant something else by `reveal.outcome = auto`, this is the place to say so.**
- **The auto-reveal chain is host-side.** A beat is an append to the Play, so Stage driving it would be a second writer. Stage still receives `revealModes` because it has to know whether a node is waiting for a human. A chained beat the operator already took is `Ok(false)`, not an error: auto races the operator, and losing that race is not a failure.
- **The webview boundary is enforced in the command layer, not in capabilities.** Tauri does not gate app-defined commands behind capabilities — `generate_handler!` registers them for every webview — so `guard::allow` refuses everything but `STAGE_COMMANDS` from the `stage` label, and an *unknown* label is treated as Stage. `capabilities/audience.json` narrows what it can do with the core verbs, which is all a capability file can do.
- **One `Mutex<Host>`, not four locks.** Every service is single-writer and the operator is one human at one keyboard, so splitting the lock wins no concurrency and buys the chance of taking two in a different order in two commands. One lock makes every command atomic against every other and makes the lock order unspellable.
- **The event log is not in the 100ms emission.** Timeline reads it with `play_events`; `operator.eventCount` is what rides the tick.
- **`OverlayTarget` did not become a wire type.** A two-field tuple variant has no good JSON shape, and reshaping a P5 argument type to please serde would be the wire dictating the Rust. The payload is spelled at the boundary (`OverlaySpec` in `crates/app`), which is where a wire format belongs.
- **The bulk question from P5 is closed: yes.** §2.19 gives a batch one confirm, so it gets one transaction and one fsync — a 200-row archive drops from ~0.8 s to one commit. Everything is validated before anything is written, so a bad row at index 199 leaves the library untouched rather than half-edited; an id that does not exist aborts an archive batch the same way.
- **Stage's fixture strip stays as the no-host *fallback*.** The roadmap said P6 removes it; what P6 actually needs is that it never renders inside the app, and `stageHost()` returning `null` is what decides. Keeping it means screen work does not need a database, and it keeps both feeds of "renders identically fixture-fed or host-fed" alive.
- **One dev origin, and the path matches the bundle.** A webview pointed at an *external* URL is `remote` to Tauri's ACL even on `localhost`, and a remote webview is denied every command and `event.listen` — which is exactly what an external `WebviewUrl` produced on the first run. Both Vite configs now set a `base` that matches their place under `frontendDist`, Studio proxies `/stage` to the Stage server, and both windows open with `WebviewUrl::App`. Granting a remote origin would have meant hand-writing a permission file per command (tauri-build generates none for app commands) — a third copy of the §13 list.
- **A Restart empties the queue and then opens with its own first token.** Nothing enqueued for the old Play may play over the new one, but the new Play's opening token is a cause like any other; the rest of the diff is meaningless across two Plays, because a fresh ring is not an advance of the old one.
- **A `MatchService` bug surfaced and was fixed:** `reveal_leaderboard_rank` refused a `completed` Play, so the final leaderboard could never be revealed — the board is exhausted before the standings go up. It now accepts `playing | paused | completed`, like `undo_turn`.

**Not done here, on purpose**

- `stats_query` is P11's; `health` has no producer until P10.
- The Studio surface is a **P6 harness**, not the shell: one button per command, no chrome, no store. P7 replaces it whole.
- Two exit criteria need hardware to see rather than to assert: a second physical display, and Stage on a projector. The logic behind both is tested against the fake monitor list.

---

## P7 — Studio shell and libraries  ☐

**Install:** [`@tanstack/react-query`](https://tanstack.com/query/latest), [`@tanstack/react-table`](https://tanstack.com/table/latest), [`@tanstack/react-form`](https://tanstack.com/form/latest), [`@tanstack/react-virtual`](https://tanstack.com/virtual/latest), `@tanstack/react-pacer`, [`zustand`](https://zustand.docs.pmnd.rs), [`@iconify/react`](https://iconify.design/docs/icon-components/react), [`@phosphor-icons/react`](https://phosphoricons.com), [`motion`](https://motion.dev/docs/react).

**Read the `heroui-react` skill first.** v3 only.

`@tauri-apps/api` and the host command seam (`apps/studio/src/host/host.ts`) arrived at P6; P7 builds the shell on top of them and deletes the P6 harness in `apps/studio/src/App.tsx`.

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
| ~~Default Stage monitor with several externals~~ | ~~P6~~ | **Closed 2026-09-06: there is no default.** Stage is *ready* — fullscreen on primary from first Control Load — and the host never picks a display. The first send is manual (Control's top picker or Settings ▸ Monitors) and is remembered in `stage.monitor_id`; a remembered display that comes back is taken automatically outside a Play, and mid-Play `stage.reattach` decides (`ask` by default: stay put, offer a *Move Stage* notice). Two identical panels answer to one key, and that case asks rather than guessing. |
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
