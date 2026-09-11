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
| Canvas | Resizable desktop chrome | Fixed 1920×1080, 64px padding — *fitted* to the window, never reflowed |
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
    │                             ├─ P6 → P7 → P8 → P9 → P10 → P11 → P11.1 → P12
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

- Fixed 1920×1080, 64px outer padding, 40px header/body gap. **Fixed, and therefore fitted** — see below.

**Scaling and aspect ratio (P11.6, 2026-09-10).** The canvas is a design decision and stays 1920×1080; the *window* is whatever display Stage is sent to, and `apps/stage/src/templates/StageFit.tsx` is the one place the two meet. It scales the canvas by `min(w/1920, h/1080)` — one scalar for both axes, so the canvas never distorts — and centres it on a `--stage-letterbox` ground. A **16:9** viewport of any resolution and any DPI scaling therefore fills edge to edge with no bars, which is the case the product is built for; 16:10 letterboxes, 21:9 pillarboxes, and a 4K display gets an upscaled full-bleed canvas rather than a 1920×1080 island in one corner.

Until P11.6 only the *Viewer* fitted the canvas; the Stage window laid it out at 1:1 CSS pixels under `body { overflow: hidden }` and simply clipped what did not fit. That is invisible on a 1:1 1080p monitor and wrong everywhere else — most of all on a TV, because Windows ships an external 1080p display at **150% scaling**, CSS pixels are logical pixels, and a fullscreen webview there has a **1280×720** viewport: the audience saw the top-left 44% of every screen. The aspect ratio was never the problem (1280×720 is 16:9); the missing fit was. `StageFit` scales an *ancestor* of the frame, so GSAP still owns `transform` inside it and the layout applier still owns `translate` — and nothing may add `will-change: transform` there, which would pin the raster at layout resolution and soften the whole surface on camera.

The same DPI scaling is why the display list carries **two** sizes (`MonitorInfo.size` logical, `physicalSize` the panel's mode). The operator is shown the physical one — a 1080p TV is a 1080p TV, and Windows' own display settings say so with the scaling as a separate percentage — and `MonitorKey` is derived from it too, so changing a display's scaling no longer changes its identity, which used to lose Stage's remembered pick.
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

- ☑ Every fixture renders at 1920×1080 (fitted to the window since P11.6) with no horizontal scroll and no layout shift between fixture swaps (browser sweep over all 25 fixtures, 2026-09-04; `exit.test.tsx` asserts the frame tokens per fixture).
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

## P7 — Studio shell and libraries  ☑

**Goal:** the operator app exists. Sidebar, top bar, status bar, the four library tabs, one component system, and no second writer of anything.

**Design file:** `05_STUDIO_DESIGN.md` — the Studio counterpart to the Stage design system: tokens, the fixed vocabularies (chips, empty states, row actions, toolbar order), the atom / molecule / organism / template / page catalog, and the interaction rules. Binding for anything rendered in the `main` webview.

**Installed:** `@tanstack/react-query`, `@tanstack/react-table@^8`, `@tanstack/react-virtual`, `@tanstack/react-pacer`, `zustand`, `@iconify-json/gravity-ui` (the JSON only), `motion`, `calligraph` (inside `packages/text`), `@fontsource-variable/geist`, `@heroui/react`, `@heroui/styles`, `@base-ui/react`, `tailwind-variants`; `@testing-library/user-event` for tests.

**Deliverables by atomic level** (`apps/studio/src/`) — all ☑

| Level | Components |
| --- | --- |
| **atoms** (22) | `Button` · `IconButton` · `Icon` (generated Gravity UI bodies, no icon runtime) · `Text` (Studio impl of §2.29; Calligraph behind `@questiongame/text/studio`) · `Chip` + `MeaningChip` (the fixed vocabulary) · `StatusDot` · `Kbd` · `Avatar` / `InitialsAvatar` · `Swatch` · `Panel` · `Separator` · `Skeleton` · `Spinner` · `Tooltip` + `DisabledReason` · `TextField` · `TextAreaField` · `NumberField` · `SelectField` · `SwitchField` · `CheckboxField` · `SliderField` |
| **molecules** (25) | `PageHeader` · the toolbar parts (`SearchField` with a 200ms Pacer debounce, `ViewSwitch`, `ArchiveToggle`) · `RecordRow` (one row, grid and table layouts) · `BulkBar` · `EmptyState` (four kinds) · `InlineNotice` (2–3 actions, stacked confirm frames inside) · `ConfirmDialog` (arm → confirm) · `DirtyGuard` · `ScopeConfirm` · `EditorFooter` · `SidebarItem` · `NavCrumbs` · `MetaList` · `StatCard` · `SettingRow` (with the host's disabled reason) · `TeamMark` · `OperatorBadge` · `PlayStatusPill` · `ActionMenu` · `DifficultyField` · `OptionRow` · `DomainForm` · `DomainPicker` (create in place, §2.22) |
| **organisms** (17) | `HostBridge` · `SidebarNav` (expanded / rail / hidden with left-edge peek) · `TopBar` · `StatusBar` · `NoticeCollector` (+ the `block` dialog) · `LibraryList` (TanStack Table engine, `RecordRow` renderer, virtualised above 200 rows) · `TeamEditor` / `TeamDetail` · `QuestionEditor` / `QuestionDetail` · `DomainPane` · `OperatorEditor` / `OperatorDetail` · `RosterSection` · `BoardSection` · `RulesSection` · `PlaysSection` · `DevHarness` (dev builds only) |
| **templates** (5) | `ShellLayout` · `LibraryTabLayout` (list + aside at ≥1280px) · `SplitLayout` · `RecordPageLayout` · `BlankLayout` |
| **pages** (12) | Teams · Team · Domains+Questions · Question · Games · Game (Roster / Board / Rules / Plays rail) · Operators · Operator · Control (stub; hosts the harness in dev) · Screens · Statistics · Settings (stubs) |

Sidebar has three states. Per-tab archive with Active | Archived. grid | table persisted per operator per tab (`localStorage`, keyed by the active operator id, which is host truth).

**Exit criteria — all met 2026-09-06** (363 TypeScript tests: 306 + 57 Studio; 194 host + 19 app Rust.)

- ☑ **Renaming a team updates every surface via host events — no second store, no manual refetch.** `apps/studio/src/host/bridge.test.tsx` renders the whole `App` against the in-memory host, renames a team through the host's own verb, and asserts that the list row and the aside both show the new name with the only refetch being the bridge's invalidation.
- ☑ **Zustand holds only chrome state.** `apps/studio/src/chrome/chrome.test.ts` walks every store's live state shape and fails on a `score|ring|session|timer|team|domain|question` key — a grep that survives a rename.
- ☑ **`play-state` never appears in a TanStack Query key.** `apps/studio/src/host/queries.test.ts` checks every key the factory can make, and that the key roots are exactly the §13 read verbs.
- ☑ **No `apps/studio` file imports `design-stage`.** `npm run lint` — the boundary block in `eslint.config.js`.

**Also delivered**

- **`GlobalSetting::ActiveOperatorId`** and `GlobalSettings.active_operator_id` (`#[serde(default)]`, so an older stored document still loads). The Tauri command refuses an unknown or archived operator; `FlagService` stores what it is given. The top bar's name and every per-operator preference key off it.
- **`OperatorState.recipe_id`** — the Play's recipe, additive and on the `main` emission only. The top bar names the recipe and the Game page freezes itself from it instead of guessing from a Play id.
- **An in-memory host (`apps/studio/src/host/fake.ts`)** — the second adapter behind `HostTransport`: the catalog and recipe verbs, `settings_get` / `settings_set_global`, `referenced_by`, and the events. It runs the page tests and, with `?fake` on a dev URL, lets `npm run dev:studio` show the shell with a demo library and no Rust — the Studio counterpart to Stage's fixture strip. It cannot start a Play and is unreachable inside the app.
- **`useDraft` / `useDirtyGuard`** — one form state per editor, dirty by structural comparison, and a nav guard that holds a navigation until Save / Discard / Keep editing.
- **The Studio type roles** `studio-display|title|heading|body|label|caption|mono` in `packages/text`, resolving to `--text-studio-*` in `design-studio/tokens/theme.css`.
- **Geist self-hosted** (`@fontsource-variable/geist`), so the HeroUI look is the HeroUI look offline.

**Decisions made while building it (2026-09-06)**

- **Navigation is a typed route stack in Zustand, not a URL router.** One desktop window, no deep links, and §12's "the stack remembers the referrer" is a stack. `useRoute` / `useNavigate` are the whole surface a page sees; moving to TanStack Router later touches `chrome/nav.ts` and nothing else.
- **Studio keeps HeroUI's own `--success` / `--danger`** rather than borrowing Stage's mint and coral (closes the "Studio theme reconciliation" question). The two surfaces agree on meaning; each keeps its hue.
- **Fields get a hairline edge and, in dark, a lifted background.** HeroUI's shipped dark theme gives a field the same colour as a surface, so an unfocused input on a panel vanished. `studio.css` sets `--field-border` / `--field-border-width` and a dark `--field-background`; nothing else in the theme was touched.
- **Icons are generated, not fetched.** `scripts/studio-icons.ts` writes the Gravity UI bodies for exactly the keys in `atoms/icons.ts` (`npm run studio:icons`), so `@iconify/react` is not installed and the app ships 71 icons rather than a 438 KB set.
- **Calligraph lives inside `packages/text`** (`@questiongame/text/studio`), because the lint rule that says "nothing imports `calligraph`" is right and the Studio atom is not an exception to it.
- **TanStack Table is pinned to v8.** v9, the current major, replaced `useReactTable` with a different API; the documented v8 API is what `LibraryList` needs and nothing more.
- **TanStack Form is not installed.** Editors are three to eight fields with the rules on the host; a short draft hook keeps one form state with no schema to duplicate. The §7 row stays provisional; if P8's Control float or P10's Settings tab want it, it comes in then.
- **The P6 harness stays as `DevHarness`**, under Control, dev builds only, restyled with the new atoms — so a show can still be driven end to end until P8.
- **Board difficulty overrides use a `window.prompt`** for the value and `ScopeConfirm` for the scope. An inline number field on every board row is P8's inline-edit work; the ScopeConfirm path is what P7 had to prove.
- **Roster order is up / down buttons.** dnd-kit arrives with P8 as planned.

**Not done here, on purpose:** first run, the pin, Monitors, the Shape manager, hotkey chords, the window-close dirty guard (P12), Toasts (none in v1 unless a later phase names a use).

---

## P8 — Control tab  ☑

**Goal:** the room where the show is run. Six panels over the Play, one command seam under every button, chord and Viewer click.

**Design:** `05_STUDIO_DESIGN.md` §10 (mosaic, Viewer protocol, panels, hotkeys, rules). **Installed:** `react-mosaic-component` (the tiling mosaic), `@dnd-kit/react` + `@dnd-kit/helpers` (ring drag), `@tanstack/react-hotkeys`, `sonner` (toasts — decided 2026-09-06 at the user's request).

**Deliverables by atomic level** — all ☑

| Level | Components |
| --- | --- |
| **atoms** | `TransportButton` (`rest \| active \| armed`) · `HitTarget` (`legal \| illegal`) |
| **molecules** | `TimerCluster` (icon-only start/pause + clock, hidden at operator pace) · `RevealControls` · `RingRow` (the nine variants) · `ScreenStrip` · `OverlayStrip` · `MosaicPanel` (density from its own box) · `DisplayPicker` · `EventRow` |
| **organisms** | `Viewer` (the Stage iframe + hit targets) · `GamePanel` · `ActionPanel` · `StripsPanel` · `TimelinePanel` · `SettingsFloat` (Global \| Current game) · `ControlTopBar` · `useControlHotkeys` |
| **templates** | `MosaicLayout` (react-mosaic restyled by `design-studio/mosaic.css`) |
| **pages** | Control (replaces the P7 stub; `DevHarness` is gone) |

Density: each panel branches on the density `MosaicPanel` measures (`comfortable \| compact \| dense`, floored by the host's `control.mosaic_density`). Vertical scroll only. Hotkeys on `main` only, `ignoreInputs: true`, mounted by the Control page alone.

**Exit criteria — all met 2026-09-06** (`apps/studio/src/pages/control.test.tsx`, `host/ring.test.ts`, `apps/stage/src/host/viewer.test.tsx`.)

- ☑ **Viewer click, Action Panel button, and keyboard chord dispatch the *same* command** — the test drives all three against the fake host and finds them in one call log, through `useHostCommand` and nothing else.
- ☑ **Every illegal ring drop is refused with `drop-illegal`, at 2, 3, 5, and 8 teams.** `host/ring.ts` classifies rows from the round invariant; the test tries every (from, to) pair at each count and expects exactly the future×future drops to be legal, with `reorderedRing` returning null for the rest.
- ☑ **Undo, restart, and abandon are blocked with a wait notice while an overlay is busy.** Disabled with the reason on the control; the host refuses too.
- ☑ **No operator chrome ever appears in the Stage webview.** `viewer.test.tsx` renders Stage in viewer mode and asserts its tree equals the host-fed tree with zero interactive elements.

**Also delivered**

- **The Viewer protocol** (`packages/contract/src/viewer.ts`): Studio → Stage `play-state` / `measure`, Stage → Studio `ready` / `nodes` (the rects of every `data-node-id` element in frame coordinates). Stage's `viewerHost()` is the third host adapter; `animComplete` is a no-op there because the Stage *window* acks the queue.
- **Toasts, with Sonner** (`chrome/toast.ts`): transient, action-free feedback only — saves, restores, "loaded into Control", layout reset. Anything with an action or a `block` severity is still a notice.
- **`?fake&play=<fixture>`** hands the fake host a Play built from a contract fixture plus a synthesised operator half, so Control can be worked on in a browser.
- **`Load into Control`** now toasts and navigates to Control.

**Decisions made while building it (2026-09-06)**

- **The Viewer embeds the real Stage** rather than a rebuilt copy: pixel-identical to the camera, transitions and overlays included, no Stage tokens in Studio, and one more adapter behind the seam Stage already had.
- **react-mosaic, not a hand-rolled grid** (the user's call): free-form re-splitting and tab stacking for the price of one stylesheet (`mosaic.css`) that removes its default look.
- **The mosaic layout is chrome in `localStorage` per operator** until P10's paths work gives it a home in `control_layout.json` (§5.10).
- **Timeline is a Query keyed on `(playId, eventCount)`**, refreshed by the tick's count, never a Play field.
- **Reveal & pass is arm → confirm on the ring row** when `override.after_lock = allow`; with `refuse_until_reveal` the rows are `override-blocked` and say "Reveal first" (§2.6).
- **Chords default in copy** (`HOTKEYS.defaults`) and are overridden by the host's shortcut table; P10's Shortcuts tab writes that table.

**Not done here, on purpose:** the Shape manager (Game tab, P8+ in the spec — not required by any Control criterion, left for P9/P10), first run, pin, Monitors tab.

---

## P9 — Screens tab canvas  ☑

**Goal:** a recipe's own look for its Stage screens, saved onto that recipe and nowhere else.

**Design:** `05_STUDIO_DESIGN.md` §11. **Installed:** nothing new that stayed — DialKit was tried and dropped (see decisions).

**Deliverables** — all ☑

- ☑ **The layout document has a shape** (`packages/contract/src/layout.ts`): `version · decor · nodes · screens`, validated by `parseLayout`, which drops unknown keys, unknown node ids and out-of-range values. `applyToAllScreens` copies a style by slot.
- ☑ **`play-state.layout`** (`{ nodes, screens }`, additive) — `PresentationService` holds it next to `decor`; `play_load` and `recipe_set_layout` set both; the fixtures and `stage_contract.rs` carry the new key.
- ☑ **Stage applies overrides at the root** (`apps/stage/src/layout/apply.ts`): one DOM applier writes each node's entry as inline style onto the element carrying its `data-node-id`, re-applying after React re-renders through a `MutationObserver`; offsets use the `translate` property so GSAP's `transform` tweens are never fought. `useScreenBox` gives `DecorField` the per-screen boundary and anchor. No Stage component knows a layout exists.
- ☑ **Route blocked while a Play is `playing|paused`** with *Go to Control* and *Stop playing* → stacked "Are you sure?" → `abandon`, all inside one notice.
- ☑ **The canvas**: the same Stage iframe as Control's Viewer, fed a preview Play built from the recipe (`host/previewPlay.ts`), with `NodeHandle`s over the node rects Stage reports. Click selects, drag or arrow keys nudge, the inspector edits font size / colour (token or literal) / family / offset / size / hidden, *Apply to all screens* copies by slot, per-node and per-screen resets.
- ☑ **Decor dials** bound to `layout.decor` (mode, drift, attraction, bounce, spin, max speed, the anchor's on/off, attract, repel, strength) and to this screen's boundary box and anchor point, live on the canvas.
- ☑ **Auto-save** through a 400ms Pacer debounce into one `recipe_set_layout`, one `rev`; leaving mid-debounce flushes.

**Exit criteria — all met 2026-09-06** (`packages/contract/src/layout.test.ts`, `apps/studio/src/pages/screens.test.tsx`, `crates/host/tests/stage_contract.rs`, the Stage host/fixture diff tests.)

- ☑ **An override saved here appears on Stage in the next Play of that recipe, and nowhere else.** The Studio test edits a node and asserts exactly one `recipe_set_layout`, for that recipe id, whose document round-trips through `parseLayout` unchanged; the host copies `recipe.layout` into the emission at `play_load`, which the contract test checks key for key.
- ☑ **Viewer overlays are never persisted as Stage design.** The document has four keys and the validator drops anything else; handles live in Studio's DOM.
- ☑ **A recipe with no overrides plays correctly on built-in defaults.** The applier writes nothing for an empty layout; the existing "fixture-fed equals host-fed" Stage test still passes byte for byte.

**Decisions made while building it (2026-09-06)**

- **A root DOM applier, not a hook in every component.** Fourteen elements carry node ids and more will; one applier keeps the Stage tree unchanged and is the only place an override becomes CSS.
- **`translate`, not `transform`, for offsets** — GSAP owns `transform` on the same elements during transitions and reveals.
- **DialKit dropped.** Its `Slider` renders at zero height outside its own floating panel, and a second look inside the inspector was the wrong trade. The dials are the design system's `SliderField`; the §7 row is closed as tried-and-replaced.
- **Colour tokens by name** (`ink`, `paper`, `correct`, …) resolve to Stage variables on Stage; a literal CSS colour is also accepted.
- **The wordmark now follows `currentColor`** for named fills too, so a colour override reaches it like any text.
- **Preview Play is client-side only** and never a `play-state`; it is what the canvas draws, not what the host knows.

---

## P10 — Settings, first run, notices, audio, health  ☑

**Install:** [`howler`](https://howlerjs.com).

**Deliverables:** first run (paths → first operator, required before Play → sample catalog skip/load → optional Settings; demo defaults award `difficulty`, lock-speed off, timer 30s, cap and bonus off); sample recipe `"Demo"` (2 teams, 2 domains, 3 questions each at 10/20/30, single-answer, timer on, rows `origin = seed`, **Restore Demo** in Settings); Settings inner tabs Monitors \| Settings \| Keyboard shortcuts; Operators tab with optional hashed pin gating operator switch, uninstall-data, and wipe-plays but **never** a live Play command; the notice family (host emits `{ code, severity, target_path, actions[] }`; inline / destructive dialog / collector float; 2 max 3 actions; confirms stack in the same component); audio behind the cue-key interface with the bundled pack and Howler adapter, `feat.audio.synth` **off**; health engine silent until error/warn, always paired with a suggestion.

**Exit criteria**

- ☑ Play is blocked until at least one team and one board question exist —
  `build_snapshot` refuses both with a `target_path`, and the Games page
  turns each into its own notice.
- ☑ No notice anywhere offers more than three actions — `notice::new`
  asserts it in the host, `chrome/notices.ts` throws on a wider one, and
  `copy/notices.test.ts` walks the whole copy table.
- ☑ Muting and volume take effect mid-Play; scoring settings cannot —
  `flag_service.rs::audio_is_live_mid_play_and_scoring_is_not`.
- ☑ No generated tone is ever produced with the synth flag off — there is no
  synth adapter to switch off, and `apps/stage/src/audio/no-synth.test.ts`
  greps the whole Stage tree for the synthesis APIs.

**As built:** the design section is `05_STUDIO_DESIGN.md` §12, with §12.11
recording the three departures — first run latches so the wizard survives
creating its own operator, `useHostCommand().run.ok` reports the verdict of
the many commands that answer `()`, and the fake host now answers
`settings_get.disabled`. `crates/host/src/catalog/seed.rs` replaced the P6
dev-only `crates/app/src/demo.rs`.

---

## P11 — Statistics  ☑

**Install:** [ECharts](https://echarts.apache.org) (`echarts` in `apps/studio`), isolated under Statistics only. **EvilCharts is not installed** — it is a Recharts component collection, and one themed wrapper over ECharts is less surface than a second chart runtime.

**Deliverables:** Live view of the current Play; All-data view with compound filters (variables + time); optional Statistics window on a second monitor; results table default with optional entity cards.

**Exit criteria**

- ☑ Statistics issues no writing command at all — `pages/statistics.test.tsx`
  greps the whole surface for the command hook and for `@tauri-apps/api`, and
  a run of both views asserts every command it issued is a read. The host side
  is `guard::STATS_COMMANDS`.
- ☑ The Statistics window is never a second Stage —
  `windows::the_statistics_window_is_studio_not_stage` pins it to Studio's
  bundle (`studio/index.html?stats`), and `guard::statistics_may_only_read`
  refuses every write *and* Stage's own `stage_ready` /
  `overlay_ack_complete`.

**As built:** the design section is `05_STUDIO_DESIGN.md` §13. `stats_query` is one command over one document: `crates/host/src/stats.rs` folds a Play log into `TurnFact`s and aggregates them (pure, ten unit tests), and `CatalogService::stats_query` decides which logs to read and relabels rows from the current catalog (§12's rename rule). There is no `StatsService` — Statistics owns no state. The optional Statistics window is opened by the operator alone (`stats_window`, added to §13's list on 2026-09-07): `stats.monitor_id` says where it *would* go, `stats.fullscreen` says how, and nothing in the host puts it on a display.

---

## P11.1 — The show that could not go on  ☑

Not a phase: a day of fixes from the first end-to-end runs of the Demo on real
hardware (2026-09-07). Every one of them was the same shape — **the host was
right and Studio had no door** — so they are recorded together, with the
scenarios that now hold them down.

**What was wrong**

- **Both webviews received each other's events.** `listen()` with no target
  registers `EventTarget::Any`, and Tauri lets an `Any` listener past the
  `emit_to` filter entirely, so Studio also got the *stripped* `play-state`
  meant for Stage — no `operator` half, and `TopBar` threw on the first load,
  taking the window down while Stage kept drawing. Stage, symmetrically, was
  receiving the operator half on camera. Both now listen as their own label,
  and the Statistics window is addressed rather than overhearing.
- **A reload left its listeners registered.** Tauri drops a JS listener only on
  `unlisten`, and the callback ids live in `window`, which a reload clears — so
  the 100ms show loop wrote `[TAURI] Couldn't find callback id …` ten times a
  second for the life of the app. Subscriptions are released on `pagehide`, and
  `bridge.tsx` no longer loses one that resolves after unmount.
- **The operator could not issue a second question.** `play.session` is only
  ever *replaced*, never cleared, so `session !== null` is true from the first
  question to the end of the Play — and every surface that read it as "a
  question is in progress" went inert after the first reveal. There was then no
  way to call `choose_domain` at all.
- **The overlay queue stopped for good.** Stage keyed its overlay layer on the
  request's *value*, so a promoted duplicate — one overlay button pressed twice,
  `round-advance` on the same round — looked like "still the same run": nothing
  played, nothing was acked, and the queue advances only on an ack.
- **The end of a Play was a dead end.** `PlayCompleted` was appended correctly;
  Control went on showing the finished question's disabled controls, offered
  no `reveal_leaderboard_rank`, and disabled Restart on the one status where
  restarting is the obvious next act.
- **A loaded recipe could not be put down** — the only way out of Control was
  to load a different one.

**What changed**

| | |
| --- | --- |
| Events | Each webview listens as its own label; `main`, `stage` and `stats` each get what is addressed to them, and `null`/the empty projection when there is no Play |
| Contract | v4 → **v5**: `StageOverlay.run_id`, the occurrence a request is on. Two identical requests are two runs |
| Studio | `host/session.ts` — `liveSession` / `canChooseDomain` / `controlPhase` / `nextLeaderboardRank`; the Action Panel draws **one phase block** and the ring rows say what they are (`ringRole`) |
| Host | `play_unload { discard }`, `CatalogService::play_delete`, `stage::empty_game`, `restart` restricted to Playing/Paused/Completed, `reveal_leaderboard_rank` refuses a rank nobody holds |

**Exit criteria**

- ☑ The Demo plays start to finish and back out again with no dead end —
  `crates/host/tests/demo_scenarios.rs`, fifteen scenarios written in the
  Demo's own vocabulary (Red · Blue, Geography · Science, 10/20/30), each
  ending on *is there a legal way on?*
- ☑ Control's predicate and the host's rule agree at every beat of a turn —
  `the_predicate_matches_the_command_at_every_step`.
- ☑ The same overlay twice is two runs, host and Stage —
  `the_same_overlay_twice_is_two_runs` and the Stage page test.
- ☑ No subscription outlives the component or the page —
  `bridge.test.tsx` and `host/host.test.ts`.

---

## P11.2 — Panels that fit, and an editor that lets go  ☑

Not a phase either: the second pass of fixes from operating the built app
(2026-09-08). Four of them are one sentence — **a control the operator cannot
aim at is not a control** — and two are the state machinery underneath.

**What was wrong**

- **The Strips panel got worse as it got wider.** `ScreenStrip` was one
  `fullWidth` `ToggleButtonGroup`, so seven labelled screens were laid out on a
  single row that no mosaic tile is wide enough for; the panel clips
  horizontally by design (§8), so the operator was handed half a word at each
  end and no whole target. The overlay pills, in the other direction, shrank to
  the first two letters of the kind — *To*, *Ro*, *Mu*.
- **The Control settings float was a 30rem popover with a 20rem control
  column.** That left about eight characters for the label, so every label and
  description broke one word per line, and the wider controls (the segmented
  density and reattach rows) ran off the edge.
- **The Game panel stepped down too early and dropped the score.** `compact`
  started at 360px and `dense` at 220px, and `dense` rendered the team mark
  alone — a ring row with no number on it. Nothing adapted to the panel's
  *height*, so a roster longer than two teams simply scrolled at full row
  height, and the board's remaining questions disappeared entirely at `dense`.
- **An operator had run no Plays, ever.** `operators.plays_run` was a stored
  counter that no command incremented, and nothing recorded *who* ran a Play:
  `OperatorSwitched` was appended only on a mid-Play switch, and only while the
  status was `playing | paused` — never at `play_load`, where the fact is
  always available. Statistics grouped by operator was empty for the same
  reason.
- **Saving an editor asked whether to save.** `useDirtyGuard` registered a
  guard closed over a rendered `isDirty`; an editor saves and navigates in one
  act, so at the moment `go` consulted the guard React had not re-rendered and
  the flag was still `true`. The operator got "Unsaved changes" *after* the row
  was written — and answering *Save* ran the whole save body a second time.
- **…against a draft that had been blanked.** `QuestionEditor` re-derived a new
  question's blank inside a `useMemo` keyed on the domain list, which the save
  itself invalidates. The second save therefore wrote an empty stem, and the
  host's "a question needs a stem" was the correct answer to the wrong question.

**What changed**

| | |
| --- | --- |
| Strips | Both strips **wrap**. `ScreenStrip` is a detached `ToggleButtonGroup` with `flex-wrap` and no `fullWidth`; labels below `comfortable` move to tooltips, and overlay pills keep their whole label at every density |
| `SettingRow` | A container query: two columns at ≥ 34rem, stacked below, nesting indent included. The Control float is `min(34rem, 92vw)`, so every row in it stacks |
| `MosaicPanel` | Steps at 300px / 180px, not 360px / 220px — a step down removes information, so it is the last resort. The render prop also receives the measured box, and `fills` hands a panel the full height when it scrolls its own list |
| Game panel | Fixed round header, the ring scrolling in its own column, the domain footer always present; the roster's height steps the row density down further when the tile is short. `RingRow` keeps the score at `dense` and hangs the name on a tooltip |
| Host | `plays.operator_id` (migration 3), `PlayRecord.operator_id`, `Play::operator_id()`; `operator_switched` appends while `Loaded` too, `play_load` records the active operator and `restart` carries it over. `operators.plays_run` is now `COUNT(*)` over started Plays — derived, never stored |
| Studio | `Draft.isDirtyNow()` — the live flag the nav guard reads; `useDirtyGuard(draft)`. A new question's blank is minted once and never re-derived |

**Exit criteria**

- ☑ Every Control panel is usable at every width the mosaic allows: no clipped
  label, no two-letter button, no row without its score.
- ☑ An operator's card counts the Plays the log says they ran, survives a
  projection rebuild, and does not move on a rename —
  `an_operator_counts_the_plays_the_log_says_they_ran`.
- ☑ Saving a new question writes it once, raises no dialog and lands on the row
  it wrote — `the question editor saves once and leaves`.

---

## P11.3 — Controls that are controls  ☑

A third pass from operating the app (2026-09-08).

**What was wrong**

- **Every settings switch was decorative markup.** HeroUI v3's `Switch` root is
  React Aria's `SwitchField` — a field wrapper with no input and no ARIA — and
  the clickable `SwitchButton` is `Switch.Content`. `SwitchField` rendered
  `Switch.Content` only when there was a visible label to put in it, and every
  `SettingRow` passes `hideLabel`, so the whole Settings tab and the Control
  float shipped switches that rendered `<div class="switch">` and nothing else:
  no input, no `role`, no `aria-label`, no click target. Nothing failed, because
  nothing was ever asked.
- **A table row painted square over a rounded container.** The list container
  is rounded and bordered; the rows are plain rectangles, so the first and last
  rows' hover background, selection tint and `isCurrent` ring covered the
  corners — and the ring, being drawn outside the row, was a rectangle laid
  over a rounded box.
- **Nothing counted the rows.** A long table gave the operator no way to say
  where they were in it.

**What changed**

| | |
| --- | --- |
| `SwitchField` | `Switch.Content` is always rendered and always wraps the control; only the `Label` inside it is conditional, and `Description` stays its sibling |
| `LibraryList` | the table container is `overflow-hidden`, so every row's hover and selection is clipped to the container's radius at any row count |
| `RecordRow` | a table row's `isCurrent` ring is `ring-inset` (a card's stays outside, because a card owns its whole outline); the last row drops its separator |
| `RecordRow` | a new `index` — the row's 1-based place in the list **as currently filtered and sorted**, printed in table layout only. A running count, not an id: an archived row does not keep a number to come back to |

**Exit criteria**

- ☑ A settings switch is an operable control and the host hears about it —
  `a settings switch is an operable control and reaches the host`, which asks
  for `role="switch"` and for the command, not for pixels.
- ☑ Hover and selection respect the container's corners at the first row, the
  last row and a list of one.
- ☑ Table rows are numbered from one, and the numbers follow the filter and
  the sort rather than the row's identity.

**The freeze, and what it turned out to be**

The archived path itself was clean — `catalog_list(kind, Archived)` answers in
~30 µs against a real library, `ArchiveToggle` switches in isolation, all four
library tabs switch scope, an archived row renders, and none of it breaks with
an open Play ticking at 10 Hz. The freeze was never in the feature.

One detail from the operator settled it: **Ctrl+R did nothing either**. A stuck
JS thread still reloads; a window that will not even reload is a window whose
*host* thread is not processing messages. And the main thread is exactly where
the synchronous commands run — `get_state`, `settings_get`, `health_get`,
`monitors_list`, `catalog_seed_status` — every one of which calls
`AppState::lock`.

`monitors_list` is synchronous, runs at boot and on every monitors refetch, and
took the lock **and then** called `windows::refresh`, whose first act is
`available_monitors`. On Windows that pumps the message loop, which dispatches
the next queued IPC onto the same thread, which calls `lock()` on a
non-reentrant `Mutex` — and the app waits for a guard only that thread can
release. `stage_set_monitor` (`ensure_stage` + `apply` under the guard),
`play_load` (`ensure_stage` under the guard) and the monitor watch had the same
shape. Clicking a library tab does not cause it; it *loads the queue*, which is
why it looked like Archived.

| | |
| --- | --- |
| `windows::refresh` | takes `&AppState`, not a guard: read the OS, decide under one short lock, then act. `follow_stats` is handed the list it already fetched |
| `monitors_list` · `stage_set_monitor` · `play_load` · the monitor watch | window and display work moved out from under the guard |
| `AppState::lock` | returns a `HostGuard` that counts itself; `state::assert_unlocked` is a `debug_assert!` on every window and monitor entry point, so the next violation is a panic naming the call site rather than a hang |

Then the operator narrowed it further: **Domains & Questions ▸ Archived
works; Teams, Operators and Games freeze.** The four pages are structurally
identical — same hooks, same `useArchive`, same toggle, same empty state — so
an asymmetry between them is not a difference in logic. It is a race, which is
what a lock deadlock looks like from the outside.

That pointed at the second half, which is the architectural one:

**No command may run on the event-loop thread.** `get_state`, `settings_get`,
`health_get` and `monitors_list` were plain `#[tauri::command]`, and a plain
command runs on the thread that pumps window messages. They were synchronous
because they are cheap — but cheapness was never the question. Each takes the
host lock, so *any* other command holding it stopped being a slow reply and
became a frozen window: no repaint, no input, no reload. Which command you were
waiting on decided nothing; what you had clicked decided everything, and that
is why one tab looked innocent and three looked guilty.

| | |
| --- | --- |
| The five plain commands | all `(async)` now; the crate has no synchronous command left |
| `AppState::lock` | `debug_assert!`s it is not on the event-loop thread, so a plain command added later panics in dev with its own name on the stack |
| The boot health report | moved into the health watch's first tick; computing it in `setup` took the lock on the event loop |

- ☑ Both rules are tests, not comments —
  `the_guard_counts_itself_and_assert_unlocked_reads_it` and
  `the_event_loop_thread_may_not_take_the_lock`.
- ☑ The app boots clean with both assertions armed, through
  `settings_get` · `health_get` · `get_state` · `monitors_list`.
- ☒ **Both fixes are real; neither was this freeze.** The operator measured it:
  the window's **title bar still works** — it can be dragged — while the
  content is dead, CPU sits at 8–10% and RSS climbs by ~200 MB and stays there.
  A blocked event loop drags no windows. So the host was never stuck; the
  *webview* is spinning, in a scheduled loop (a pegged core would be 100% of
  one, not 10%) that allocates as it goes. The lock work stands on its own
  merits and is not withdrawn — it was two genuine defects — but it did not
  cause this.

**Where it actually is**

Two facts narrow it hard. The host log shows **no repeated commands** after the
click, so the loop issues no host traffic and is entirely client-side. And the
one archive toggle that works — Domains & Questions' left rail — is the one
that does not go through `LibraryList`: `DomainPane` renders its own
`EmptyState` (`DomainPane.tsx`), while Teams, Operators and Games all render
`LibraryList`'s empty branch. The questions list on that same tab uses
`LibraryList` too and is expected to fail with them.

It does not reproduce against the fake host in a browser — 0 DOM mutations per
second on the empty archived list, with and without an open Play — so it needs
something the real webview has. That is what the diagnostics below are for.

**Diagnostics (P11.3)**

`client_log` + `chrome/diagnostics.ts`: uncaught errors, rejections and
`console.error`/`console.warn` (deduplicated), plus a render-loop watchdog
counting React commits through a `Profiler` around the routed page. All of it
lands in `questiongame.log` beside the host's lines, which is the only place it
can survive a window that has to be killed. Verified end to end — `studio
ready … heapMb=28` appears in the file on boot, and it caught a real
`[TAURI] Couldn't find callback id …` warning on the first reload.

- ☐ **Still open.** Awaiting one reproduction with the watchdog armed.

**Second pass on the evidence (2026-09-08, evening)**

Three corrections to the paragraphs above, from reading the log the watchdog
produced rather than the theory it was built on:

1. **The crumbs were not synchronous, so their absence proved nothing.**
   `send` went through `HostTransport.invoke`, which `await`s a dynamic
   `import('@tauri-apps/api/core')` before it posts. A crumb dropped inside a
   task that never yields therefore never leaves the webview, and neither
   does the click's own `. scope`. `diagnostics.ts` now posts on
   `window.__TAURI_INTERNALS__.invoke` directly, on the calling stack, and
   falls back to the transport only outside the desktop app.
2. **The Domains & Questions toggle that had been exercised was the domain
   pane's, not the question list's.** `DomainPane` keeps its scope in
   `useState` and never renders `LibraryList`; the question list's toggle
   goes through the chrome store and `LibraryList` like the other three —
   and, tested afterwards, it froze exactly like them.
3. **8–10% CPU on this machine is one core.** Twelve threads; one spinning
   reads as 8.3%. "A scheduled loop, not a pegged core" is withdrawn.

**What it was.** With the crumbs synchronous, the next reproduction wrote it
down: `. scope teams=archived`, then `LibraryList` rendering `teams
rows=none` **twenty-one times in forty seconds at the crumb throttle** — i.e.
continuously — the watchdog reporting 120 commits a second and the heap
climbing 44 → 80 → 152 MB, and **no `catalog_list` for the archived scope
ever reaching the host.**

`LibraryList` handed TanStack Table `data: rows ?? []` — a **new array on
every render** while the query had not answered. TanStack Table memoizes the
core row model on the identity of `data`, and every change runs
`_autoResetPageIndex`, which queues `resetPageIndex()` on a **microtask**
(`table-core` 8.21.3, `_queue`). That is a `setState` on `useReactTable`'s
own state, so the list renders again, builds another `[]`, changes the data
again, queues another reset. Nothing in the cycle is an update scheduled
*during* a commit, so React's nested-update limit never trips and no
"Maximum update depth" is thrown; and the cycle never yields to a task, so the
IPC reply that would have made `rows` an array — the one thing that would
have ended it — never got a turn. Why it looked fine at boot: the auto-reset
only *registers* on its first sight of the data and resets from the second
on, so the boot render registered and the toggle's render, seconds later,
was the second. Why one tab looked innocent: `DomainPane` does not use
`LibraryList`. Why it "did not reproduce in a browser": it does — the
Archived click on `?fake` at this commit hangs a plain Chromium the same way,
with or without `&slow=`. Whatever the earlier 0-mutations measurement
observed, it was not this list at this commit.

| | |
| --- | --- |
| `LibraryList` | `data: rows ?? NO_ROWS`, one module-level empty array. That is the whole fix |
| `organisms/LibraryList.test.tsx` | renders the list with `rows` undefined three times, spaced across microtask turns, and asserts three commits — the buggy list commits fifteen and counting |
| `host/devFake.ts` | `?fake&slow=<ms>` answers every command a task later, the way the real IPC does, so a page that only stays healthy because the fake is instant can be caught in a browser |
| `chrome/diagnostics.ts` `send` | synchronous, see (1) |
| `windows::debuggable` (`crates/app`) | Windows debug builds start WebView2 with `--remote-debugging-port=9222` (`QUESTIONGAME_DEBUG_PORT` overrides), through the builder because wry sets `AdditionalBrowserArguments` itself; release builds add nothing |
| `scripts/js-stack.mjs` (`npm run js-stack`) | attaches over the Chrome DevTools Protocol, sends `Debugger.pause` — a V8 interrupt, delivered inside a loop that never yields — and prints every frame. Not needed in the end; kept because the next hang will not announce itself either |

- ☑ **Closed.** All four Archived toggles render "Nothing archived" under
  `?fake&slow=400`; the regression test is red on the old list and green on
  the new one.

---

## P11.4 — The Studio process that grew  ☑

From operating the app (2026-09-09): Studio started at ~200 MB and stood at
2.8 GB after three or four Plays, growing by roughly 10 MB a minute whatever
the operator did. The JS heap said nothing — `heapMb` stayed near 40 the whole
time — and the log said nothing either, because nothing in it measured
process memory.

**How it was found**

Not by reading code: none of the stores grow (`playState.ts` holds one Play,
the Query cache is bounded, the notice store is replaced wholesale), and a
read-through of every Play-shaped path in both webviews turned up nothing that
retains. It was measured instead, over the Chrome DevTools Protocol the debug
build already exposes (P11.3):

1. **Counters under GC, per scenario.** `Memory.getDOMCounters` and
   `Runtime.getHeapUsage` after `HeapProfiler.collectGarbage`, at t0 and t90,
   in five conditions — no Play; a Play loaded and nothing ticking; a
   countdown ticking with Control open; the same with Control closed; the
   Stage window on its own. Growth in every condition with a Play loaded, so
   the tick was not the cause; growth with Control closed, so the Viewer and
   the panels were not either.
2. **Heap snapshots diffed by constructor.** Two `HeapProfiler.takeHeapSnapshot`
   per scenario, aggregated by `(type, name)` and diffed. One row dominated
   every diff: `native:PerformanceMeasure`, +691,654 objects and +81 MB in 90
   idle seconds; 1.94 million on the page by then.
3. **Who calls `performance.measure`.** A wrapper over it for four seconds,
   counting by name and stack: every call came from `logComponentRender` in
   `react-dom`'s development build.

**What it was**

React 19.2's development build records a Component Performance Track: on
every commit, for every component whose props object changed identity (which
is every component whose parent re-rendered), it calls `performance.measure()`
with a props diff in `detail`. Browsers keep user-timing entries until
something clears them and never trim the buffer. Studio commits ten times a
second under the show loop, the tree has a few hundred components, and each
entry carries its diff strings — ~1.4 KB apiece, 1,900–7,700 a second
depending on what was mounted. That is the whole 2.8 GB, and it is why the
V8 heap never moved: the entries are Blink objects.

The production build never measures, so a packaged release (P12) would not
have had it. Every show so far has run under `tauri dev`.

**What changed**

| | |
| --- | --- |
| `chrome/diagnostics.ts` (Studio) · `diagnostics.ts` (Stage) | the user-timing buffer is swept every 2 s in every webview, host or not. Stage's own sweep matters because the Viewer is the Stage bundle in an iframe with a `performance` buffer of its own that Studio's cannot reach |
| both diagnostics | a **memory line** every 30 s through `client_log`: JS heap, live DOM elements, commits and user-timing entries swept since the last line, and each as a rate per minute |
| `crates/app/src/memory.rs` · `tick.rs` | the host logs the **working set of its own process and every WebView2 child** every 30 s, with the delta and rate since the last line. This is the number Task Manager shows and the one the JS heap cannot; Windows only, elsewhere the line says so |

**Exit criteria**

- ☑ Re-measured on the fixed build with the same harness: 60 s idle, heap
  60.3 → 61.1 MB; 60 s ticking with Control open, 61.0 → 62.7 MB;
  `PerformanceMeasure` capped at one sweep window (~8 k entries) instead of
  growing without bound.
- ☑ Both memory lines appear in `questiongame.log` 30 s apart
  (`memory totalWsMb=… mbPerMin=…` from the host, `memory … heapMbPerMin=…
  userTimingPerMin=…` from each webview).
- ☑ The sweep and the line format are unit-tested against an in-memory
  buffer in both apps; `memory::tests` cover the rate arithmetic and that a
  real sample contains the process itself.

**What it is not**

The DOM-node and listener counts oscillate between GC runs (detached nodes
waiting for collection) and show no trend over a minute; nothing in the
React tree leaks. Second-order and left alone: the sidebar re-renders at
10 Hz during a countdown because `Shell` reads the whole Play for its status
pill, which is harmless with the buffer swept but is where the next
"why does idle Control commit so much" question will land.

---

## P11.5 — The performance log  ☑

P11.4 was found with a harness bolted on from outside. This is the same
measurement built in, so the next question of that kind is answered by
reading a file rather than by writing a probe: **one JSON line per second**,
what the machine saw, what the host did, what each webview did, and — on a
second that was abnormal — what explains it. Written for two readers: a
developer with `jq`, and an agent handed the file.

**Where and when**

`<app data>/perf/perf-<UTC stamp>-<pid>.jsonl`, one file per run, the ten
newest kept (`perf::prune` at boot). Dev builds write it by default; a release
build only with `QUESTIONGAME_PERF=1`, and `QUESTIONGAME_PERF=0` turns it off
in either. `questiongame.log` names the path at boot (`perf log path=…`).

**The line**

| key | from | what |
| --- | --- | --- |
| `t`, `sec` | writer | UTC time; seconds since the file opened |
| `os` | `sysinfo` | every process in our tree — `host`, and each WebView2 child by its `--type=` (`renderer`, `gpu-process`, `utility`, `browser`) — with CPU % of one core and working set; totals; the size of the database, its WAL, the log and this file, and free space |
| `host` | the `tracing` layer | per command: count, lock time held (sum and max); refused commands; `play-state` emissions and their bytes; appends that reached `play_persist` and the fsync time; show-loop ticks |
| `main`, `stage`, `stats` | `perf_report` | heap, live DOM elements, React commits (Studio), user-timing entries swept, long tasks and the longest; Studio adds the route, the Play (id, status, Control phase, screen); Stage adds the screen, the overlay on air, whether a transition or overlay timeline is running, and the decor body count. A webview that stopped reporting is a missing key |
| `spike` | writer | only when the second crossed a threshold: `trigger` (working set +20 MB, any process ≥ 25 % CPU, one command ≥ 100 ms of lock, ≥ 60 commits, a task ≥ 100 ms), the five commands with the longest lock, and each webview's `top` — the five components with the most render time and the five longest tasks with their first script |

The detail is collected every second and written only on a spike, so a quiet
minute is sixty short lines and a bad second explains itself.

**How attribution works without touching the commands**

Every command already passes `guard::allow`, every lock is a `HostGuard`,
every append goes through `Host::write`, every emission through
`emit::play_state`. Each now emits one `tracing::trace!(target: "perf", …)`
event; `perf::PerfLayer` sees only that target and adds it to the current
second, and the two text sinks never print it. The guard also remembers the
command on the thread it is running on, so the guard drop can say whose lock
time it was; the show loop names itself `tick`. Nothing here takes the host
lock, and the writer runs on the tokio runtime beside the other watches.

The components come from the same `performance.measure` entries that were the
P11.4 leak: the sweep hands them to the accumulator before clearing them, so
React's own render attribution costs nothing extra.

| | |
| --- | --- |
| `crates/app/src/perf/` | `line` (shape, spike decision — pure), `layer` (the tracing layer), `os` (`sysinfo`), `mod` (writer, prune, the `perf_report` inbox, the enable switch) |
| `perf_report` | a new §13 command, in `STAGE_COMMANDS` and `STATS_COMMANDS` like `client_log` |
| `apps/studio/src/chrome/perf.ts` · `apps/stage/src/perf.ts` | the accumulator, the `PerformanceObserver`, the second's post |
| removed | `memory.rs` and the 30-second memory lines of P11.4, which this supersedes |

**Exit criteria**

- ☑ `line::build`, the layer's fold and reset, the prune, the file name and
  the report inbox are unit-tested with literals; the OS sampler's test
  finds the test process itself.
- ☑ The webview accumulators are tested against fake entries: top-five by
  render time, the longest task, reset on take.
- ☑ Verified on the built app: the file appears at boot with `os` and `host`
  on every line, `main` and `stage` once the webviews are up, and a spike
  with `trigger` and `top` on the second a Play loads.

---

## P11.6 — Stage fits the display  ☑

The canvas stays a fixed 1920×1080 design surface and is **fitted** to
whatever window it gets. See "Scaling and aspect ratio (P11.6)" under P2 for
the rule and the reasoning. `MonitorInfo` now carries the panel's physical mode
next to the logical size, and `MonitorKey` is derived from the physical one, so
a display's identity survives a change of DPI scaling.

**Exit criteria**

- ☑ A 1280×720 viewport (a 1080p panel at Windows' default 150%) draws the
  whole canvas: measured `visibleFraction` 0.444 before, 1.0 after.
- ☑ 16:9 at 1280×720, 1920×1080 and 2560×1440 leaves no bars at all; 1920×1200
  letterboxes 60px a side and 2560×1080 pillarboxes 320px a side, in
  `--stage-letterbox`.
- ☑ The Viewer is unchanged — same fit, same node rects, hit targets still land
  (`StageFit.test.tsx`, `viewer.test.tsx`, and the Control panel in a browser).
- ☑ Settings ▸ Monitors and the Control picker show the panel's mode, with the
  scale factor beside it when it is not 1.
- ☑ A `stage.monitor_id` written under the old logical key still resolves, and
  changing a display's scaling does not lose the pick (`monitor.rs` tests).

---

## P11.7 — The Play is read twice, at two rates  ☑

P11.5's log was built so the next question of its kind could be answered by
reading a file. The first question it answered was its own operator's: *the
app's memory fluctuates, is that a leak?* It was not — heap, DOM and working
set all returned to baseline — but the log showed why it looked like one.

With Control open and a Play running the Studio renderer sat at **77% of a
core**, committing **28 times a second**, ~245 components a commit, with
`MosaicLayout` at 16 ms a render and ~7,000 `performance.measure()` calls a
second behind it. All of it traced to one line: `ControlPage` called
`usePlayState()` for a value it used only as `play !== null`, the store handed
every consumer a new object on every 100 ms emission, and the inline
`renderTile` then rebuilt `react-mosaic`, its dnd provider, six panels and
every `Tooltip` under them. The only thing that had actually moved was the
countdown.

**Deliverables:** the two-rate store (`usePlayState` stable + selector,
`usePlayClock` live); the countdown split into leaves; `renderTile` hoisted and
`MosaicLayout` memoised; the emission digest replacing a per-tick deep clone
and a per-tick `to_vec` measurement; the user-timing fold sampled.

**Exit criteria**

- ☑ Thirty simulated ticks on Control commit at most thirty times — one per
  tick, for the countdown, not the page (`pages/control.test.tsx`).
- ☑ A whole-object `usePlayState()` reader does not render on a bare tick, and
  a selector reader does not render when its answer is unchanged
  (`host/playState.test.ts`).
- ☑ Nothing outside an atom, a molecule or a test names `remainingMs` or
  `elapsedMs` without importing `usePlayClock` (grep test).
- ☑ `emission_changed` answers from a digest, still gates the tick, and reports
  the payload size it counted (`host_wiring.rs`).
- ☑ Every sweep is counted; one in `USER_TIMING_INSPECT_EVERY` is folded
  (`diagnostics.test.ts`, both webviews).
- ☐ Re-measured on the built app: a fresh perf log with Control open and a Play
  running, against `perf-2026-09-10T09-53-12Z-9668.jsonl` (77% renderer,
  28 commits/s, 1.35 GB peak).

---

## P11.8 — A warning the app raised against itself  ☑

The status-bar dot turned amber the moment a game was loaded into Control and
stayed amber after unloading it, after closing the Stage window, until the app
was restarted — while the notices panel it opened said *No notices yet*, and
the audio played perfectly throughout.

Three faults stacked. `howlerAudio` starts all eight cue preloads during
render; `main.tsx` renders under `StrictMode`, so React mounts `useAudio`'s
effect and immediately unmounts it, and the cleanup calls `unload()` on eight
Howls still in flight. Howler delivers an aborted decode through the same
`onloaderror` a genuinely missing file uses, so eight `audio_missing_cue`
reports left Stage in one millisecond, every single open. `HealthState` had no
way to withdraw one — `missing_cue` only ever added. And the notice they
produced is addressed to `audio.cues`, which `surfaceOf` routes to `inline`,
so it rendered in neither the collector nor the status-bar text while the dot,
which reads the report's status directly, went amber over it.

**Deliverables:** an epoch per cue in `howlerAudio` so a deliberately retired
Howl cannot report; `audio_ok` from Stage and `HealthState::cue_ok` so a
finding can be withdrawn; the collector's "needs attention elsewhere" line.

**Exit criteria**

- ☑ A `dispose()` that aborts all eight preloads reports nothing, and a cue
  that genuinely fails still does (`audio/howler.test.ts`).
- ☑ A changed cue map retires the old file silently.
- ☑ A cue that loads after having been reported sends `audio_ok`; a healthy
  open sends nothing at all.
- ☑ `cue_ok` clears exactly its cue and returns the report to `ok`
  (`host_wiring.rs`).
- ☑ The collector names an inline finding and offers the way to it, groups
  several by place, and still shows the empty state when there is nothing
  (`NoticeCollector.test.tsx`).
- ☐ Verified on the built app: load a game, and the dot stays green.

**Left alone deliberately:** `audio_failed` — a playback fault, where the file
is present and the browser refused to sound it — is still reported as
`health.audio_missing_cue`. The remedy the operator is offered is the same;
the wording is wrong, and it wants its own notice code rather than a wider
change here.

---

## P11.9 — The show loop sends two numbers  ☑

P11.7 stopped Studio *re-rendering* on a tick but left the tick itself intact:
the host still projected the whole Play three times, digested 8.4 KB and sent
it to three webviews, ten times a second, to say that a countdown had gone down
by 100 ms. Deferred at the time because it is a contract change and because the
wire cost was hidden under a render storm an order of magnitude larger. With
that gone, it is the largest thing left.

`play-state` is event-driven now. The show loop sends `play-tick` —
`{ playId, remainingMs, elapsedMs, running }` — and the host asks
`MatchService::tick_due` first: a tick mutates a Play only through the T=0
table, and everything else that can move one arrives as a command, so when T=0
is not due nothing but the clock can differ. That is 999 ticks in 1000, and on
each of them the two projections inside `Host::write`'s overlay diff, the third
in `emit::play_state`, the digest and three 8.4 KB emissions all go away.

Studio also publishes the clock at the resolution it *prints* it. `fmt.clock`
is `Math.ceil(ms / 1000)`, so nine ticks in ten drew digits that had not
changed — with `transition="count"` behind them, which put `motion.span`,
`AnimatePresence` and `NumberRenderer` at the top of the Studio profile once
P11.7 had cleared everything above. Stage is deliberately not rounded: it may
interpolate, and its clock is the one on camera.

**Deliverables:** `PlayTick` and the `play-tick` event (contract v6);
`tick_due` / `zero_due`; `stage::tick`; `emit::play_tick` and the clock gate;
`applyTick` on both Stage adapters and a `tick` message in the Viewer protocol;
`receivePlayTick` and a rounded `usePlayClock`; `health.audio_cue_failed` so a
playback fault stops reading as a missing file.

**Exit criteria**

- ☑ A tick is due only when the timer reaches zero, and a tick that is not due
  appends nothing (`host_wiring.rs`).
- ☑ The clock gate stays quiet when neither number moves, so a paused Play is
  still silent on the wire.
- ☑ A whole-object `usePlayState()` reader does not render on a tick; a tick
  for another Play is dropped (`host/playState.test.ts`).
- ☑ `usePlayClock` renders once a second, not ten times, and rounds the way
  `fmt.clock` rounds so the digits are unchanged.
- ☑ Three seconds of show loop commit **three** times on Control — measured,
  down from thirty after P11.7 and ~80 before it (`pages/control.test.tsx`).
- ☑ A cue that is present and will not sound reads as its own finding, with
  *Show Stage* as the remedy (`health.rs`).
- ☐ Re-measured on the built app, against
  `perf-2026-09-10T10-54-23Z-18096.jsonl` (30% renderer, 11.7 commits/s,
  ~29 MB of `emit_bytes`).

---

## P11.10 — Stage stops rebuilding for the clock  ☑

The two things the P11.9 measurement left at the top of the list, both on the
Stage side.

**Stage's tree re-rendered ten times a second.** The same split Studio got in
P11.7 and P11.9, one layer down: `StageHost` gained a clock channel, and the
two components that draw a clock — the header and the Question timer panel —
subscribe to it on their own. Everything above them was rebuilding for numbers
it does not show. Stage is deliberately not rounded the way Studio is: it may
interpolate between ticks and its clock is the one on camera, so thirty ticks
are still thirty commits — of two leaves, with the tree handed zero new Plays.

**The Viewer ran a second physics world.** For as long as Control was open,
the iframe stepped its own matter-js world at 60 Hz — the same bodies, the same
collisions — for a preview nobody films. It now draws the shapes where the
settle put them and does not simulate. The Stage window also pauses while
`document.hidden`, and `STEP_HZ` is now the single constant everything else
derives from, so trading fidelity for CPU is one number rather than four.

`will-change: transform` on the decor shapes was investigated and left alone:
measured at two shapes and ~0.74 MB of layer texture on the Question screen, it
is not where the GPU process's growth comes from.

**Exit criteria**

- ☑ Thirty ticks hand the Stage tree **zero** new Plays, and the clock still
  moves (`host/host.test.tsx`).
- ☑ A `clock()` that returns a fresh object cannot loop the provider — the
  identity is held there, not trusted from the host.
- ☑ `StageRoot` and both clock leaves still draw the right clock rendered
  standalone, from the state they are handed (`organisms.test.tsx`,
  `pages.test.tsx`).
- ☑ The Viewer draws decor at its settled positions and does not move it —
  verified in a browser, shapes unchanged over 900 ms, hit targets intact.
- ☑ Re-measured on the built app (`perf-2026-09-10T12-31-33Z-16616.jsonl`):
  the Stage renderer 8–12% (was ~17%), Studio 6–25% — ~22% while the operator
  is working, ~7% while they are watching — the whole tree ~50% (was ~130%
  before P11.7), React commits ~5.5/s (was 27.5), `play-state` emissions 200
  over nine minutes (was 3,396), host tick lock 0.15 ms each (was 0.81), and
  Stage's JS heap peak 19 MB (was 61). Working-set peak 917 MB, down from
  1,352, still climbing ~16–22 MB/min under Control — the residual is ~400
  `performance.measure()` calls a second from React's **development** build,
  which a production bundle removes.
- ☑ `play-tick` is counted on the wire. It shipped in P11.9 without a `kind`
  in `perf::PerfLayer`, so the first measurement read `emit_bytes` 1.66 MB over
  a run that had put roughly 2.6 MB out. `tick_emits` sits beside `emits` and
  the bytes join the total.

---

## P11.11 — Stage on several displays at once  ☑

The operator has three displays and no HDMI splitter, so the app is one. One
**pacer** — the Stage window that has always existed — and N **mirrors**
showing the identical picture.

Spec: `docs/superpowers/specs/2026-09-10-multi-display-stage-design.md`.
Plan: `docs/superpowers/plans/2026-09-10-multi-display-stage.md`.

A mirror differs in exactly two behaviours, and both are load-bearing. It makes
no sound, because every Stage window playing every cue is a flam and the OS
mixes them to one device anyway. And it does not acknowledge an animation:
two displays play the same timeline, and the second ack would retire an overlay
the operator has not seen finish, or promote a pending one twice. The pacer is
the one window in charge, and it is the one that has always been in charge —
never promoted, never demoted, so who paces the show is not a moving target
mid-show.

`StageDisplay::live_mirrors()` is the whole contract with the app crate: which
connected displays should carry a mirror right now. `windows::reconcile_mirrors`
makes the windows match. Declarative rather than a diff of opens and closes,
because reconciling to a set is idempotent — the monitor watch calls it on every
display change without remembering what it did last time, and a missed close
cannot leave a window standing on a display that is gone.

**P11.6 is load-bearing here.** The operator's three displays are three
different CSS viewports — 1920×1080, 1366×768 and 1280×720 — and `StageFit` is
the only reason the same fixed canvas lands correctly on all of them.

**Exit criteria**

- ☑ `stage_mirror_ids` sits beside `stage_monitor_id`, so there is no settings
  migration and every `monitor.rs` test from P6 passes unchanged — the check
  that single-display behaviour did not move (`flag_service.rs`).
- ☑ One pane per display, both ways round: a mirror on the pacer's display is
  refused, and sending the pacer to a mirrored display retires that mirror
  (`stage_mirrors.rs`).
- ☑ Unplugging a mirror's display drops that mirror and leaves the others; the
  pick is remembered, so the cable coming back restores it. Nothing on the path
  reaches a Play (`stage_mirrors.rs`).
- ☑ `live_mirrors()` gives the same answer asked twice, which is what lets the
  windows be reconciled to it.
- ☑ `stage-2` may call `STAGE_COMMANDS` and nothing else; `is_stage_label` is
  shared by the guard and the emission loop, so a window one admits and the
  other skips cannot exist (`guard.rs`, `host_wiring.rs`).
- ☑ Sending Stage to a second display makes it a mirror, removing it gives the
  display back, and the pacer's card never offers Remove
  (`MonitorsSettings.test.tsx`, and checked in a browser).
- ☑ A mirror is decided by the URL, synchronously (`mirror.test.tsx`).
- ☑ Stage shows on the display it is **actually** on, not the one remembered,
  and "no window yet" is not the same as "on primary"
  (`MonitorsSettings.test.tsx`). Two defects latent since P6 and found on a
  three-display desk: `ensure_stage` built the window on primary without
  consulting the pick — while the monitor watch had already claimed that pick,
  so no later tick would ever correct it — and Studio read the *pick* where the
  *place* was meant.
- ☐ Verified on the operator's own three displays: identical picture on two,
  one cue per event, one Timeline entry per overlay, and both restored after a
  restart.

---

## P11.12 — Rules you can see, awards you can explain  ☑

The operator can set fourteen keys that move a number and had no way to see
what any of them did, alone or together. Four of them silently neutralise
others. One of them — `scoring.difficulty_map` set to **Bands** — rendered
*nothing at all* in Game ▸ Rules, so the operator picked it and the panel went
blank; that is most of why nobody could say what Bands did.

Spec: `docs/superpowers/specs/2026-09-10-rules-transparency-design.md`.

**One arithmetic.** `crates/host/src/explain.rs` holds the formula and
`award_points` is `explain(..).points`, so the Statistics ledger explains the
number the scoreboard was actually paid. Before the split, a second copy of the
formula was the obvious way for the two to drift — and writing the property
tests over the single copy immediately found two real defects: a partial share
could exceed the whole award when a judgement claimed more correct locks than
existed, and two bands sharing a ceiling produced an overlapping span the
ladder would have drawn as a range.

**Two new scoring keys, both defaulting to the old behaviour.** `speed_window`
says where the speed bonus reaches zero — a share of that question's clock
(`Fraction(1.0)` is the whole clock, which is the P4 formula byte for byte) or
absolute milliseconds, which is what makes the same answer *time* worth the
same on every question whatever its countdown. `speed_steps` quantizes the
bonus into equal bands, so two answers the operator cannot tell apart cannot
score differently. Both carry `#[serde(default)]`, so an old `PlaySnapshot`
deserialises into the rules it was played under and **no recipe pays anything
different than it did yesterday**.

**Uneven domains are not an award problem**, and the answer is in the Board
section rather than in Rules. The award never reads domain membership, so
difficulty 21 pays the same in a three-question domain and a thirty-question
one; what uneven domains change is the ceiling and the walk. `BoardShape`
classifies the board and the readout **adapts**: `Aligned` — same count *and*
the same ladder everywhere — collapses to one rung table, because then one
table is the whole truth; `Uniform` and `Ragged` show the ladders side by side
with the divergence marked.

**Exit criteria**

- ☑ `explain(..).points == award_points(..)` over the generated compound space
  — mode × lock-speed base × option × weight × window × steps × linear|bands ×
  partial × order × cap × bonus × cascade (`award_compound.rs`).
- ☑ The award is a pure function of `(difficulty, verdict, lock progress,
  streak)` and the frozen settings: an incorrect verdict is always 0, operator
  pace and "never locked" always give ×1.0, the speed factor is applied exactly
  once, and a partial share is never more than the whole (`award_compound.rs`).
- ☑ `Fraction(1.0)` with no steps reproduces the pre-P11.12 formula exactly, so
  the two new keys cannot change an existing Play (`award_compound.rs`).
- ☑ `speed_steps: Some(n)` pays every lock inside a band the identical
  multiplier, and a lock past the window is the bare base with
  `SpeedOff::OutsideWindow` saying so (`award_compound.rs`).
- ☑ A band table's reachable spans tile 1..=100 with no gap and no overlap, and
  an unreachable band is marked rather than dropped (`award_compound.rs`,
  `preview.rs`).
- ☑ Every ledger row's recomputed total equals the `TurnResolved` the log
  recorded, across a whole Demo with wrong answers, a handover and an undo
  (`demo_scenarios.rs` s16).
- ☑ Choosing Bands in Game ▸ Rules renders an editable band table, and the new
  speed controls are controls — asserted by role (`RulesSection.test.tsx`).
- ☑ The ledger rides on the Live view's existing `stats_query` through
  `detail`, asked exactly once, and the TOTAL column is the recorded number
  (`statistics.test.tsx`).
- ☑ Statistics is still a projector: `AwardLedger` is under the same grep, and
  no file on the surface imports `useHostCommand` (`statistics.test.tsx`).
- ☑ An aligned board reports `Aligned`, changing one domain's count makes it
  `Ragged`, and a per-question duration raises the comparability warning
  (`preview.rs`).
- ☑ Nothing in Studio recomputes an interlock: `RulesSection`'s client-side
  `weightInert` / `timerOff` are gone, replaced by `rules_preview.effects` —
  the same §4.2 table, run over a recipe that need not be in Control.
- ☑ Checked in a browser under `?fake`: the matrix, the effects table, the
  ragged board readout and the ledger's working columns.
- ☑ The effects table keeps `Off` and `Disabled` apart, and every key
  reports its current value — a switch that is off never reads as *in use*
  (`preview.rs`, `RulesSection.test.tsx`). Found in the built app the day it
  shipped: the table asked the host only "is this key disabled", and a
  usable-but-off switch has no interlock entry, so it fell through to "In
  use". Two different questions had one answer between them.
- ☐ Verified against a real show's numbers on the operator's own library.

---

## P11.13 — One question per difficulty, per domain  ☑

A board could select two difficulty-10 history questions, and nothing said
otherwise. That is two rungs of the easy→hard walk that are the same rung:
teams choose a **domain**, never a question, and the award is a pure function
of `(difficulty, verdict, lock progress, streak)` — it never reads *which*
question it was. So the two pay the same, they are indistinguishable to the
team choosing, and `BoardShape`'s ladder has a step of zero in the middle of
it. Locked as §2.31.

**The library keeps its freedom.** A domain may hold as many questions at one
difficulty as the author writes; §11.A refuses none of them. The rule lives
where a show is *prepared* — Game ▸ Board — and the point of it is the swap:
tick a question and its twins grey out with the reason, untick it and they
come back.

**One rule, one module.** `crates/host/src/board.rs` is pure and is the only
place the rule is spelled; every enforcement point adapts its own data into
`(id, effective difficulty)` pairs and calls it. `apps/studio/src/host/board.ts`
does the same job for the Board section that `host/session.ts` does for the
Action Panel — it spells the host's rule so the operator does not have to be
refused in order to discover it.

**Two doors, not one.** `recipe_upsert` is the funnel for the checkbox and for
every other recipe write, but `recipe_set_overlay` writes overlays directly and
bumps `rev` on its own — so the inline difficulty override is a second door,
and a *reset* is one too, since it hands a question back its catalog
difficulty. Both are checked on the recipe the write would produce, before
anything is written.

**A board can become illegal from outside.** Re-grading a question in the
Questions tab can collide a board that was legal when it was saved, and the
library deliberately does not veto an edit on a recipe's behalf — that is what
`referenced_by` is for. `build_snapshot` is therefore the second line, refusing
before a Stage window exists, and `PreviewWarning::DuplicateDifficulty` says it
in Game ▸ Rules so Load is not the first anyone hears of it.

**Exit criteria**

- ☑ The rule is one pure function with its own tests, and every enforcement
  point calls it rather than restating it (`board.rs`).
- ☑ `recipe_set_membership` refuses a domain holding one difficulty twice, and
  a refused write leaves `rev` where it was (`catalog_service.rs`).
- ☑ A `ThisGame` difficulty override that would collide is refused and not
  written; so is `Original`, and the catalog row is untouched
  (`catalog_service.rs`).
- ☑ The same override on a domain member that is **not** on the board is
  accepted — the library is not the thing being constrained
  (`catalog_service.rs`).
- ☑ The same difficulty in two different domains stays legal
  (`snapshot.rs`, `preview.rs`).
- ☑ A clash is measured on the **effective** difficulty, so a recipe overlay
  that collides is caught where a check reading catalog rows would miss it
  (`snapshot.rs`).
- ☑ A board written by an older build refuses the Play with the domain and the
  difficulty in the `target_path`, and raises `DuplicateDifficulty` in the
  Rules preview first (`snapshot.rs`, `preview.rs`).
- ☑ Ticking one question disables its twins with the reason and leaves the
  other difficulties alone; unticking frees them; a question already on the
  board is never disabled (`BoardSection.test.tsx`).
- ☑ Add domain ticks one question per difficulty, `difficulty ASC, id ASC`
  (`board.test.ts`).
- ☑ The fake host refuses what the app refuses, `Original` included
  (`board.test.ts`).
- ☑ Checked in a browser under `?fake`, which now seeds a second
  difficulty-20 history question so the rule has something to show: the twin
  is dimmed and disabled behind the one on the board, unticking the holder
  frees it, and ticking the twin dims the holder in its place.
- ☐ Checked in the built app against the operator's own library.

---

## P11.14 — A team's Play count was a column nobody wrote  ☑

The Teams tab reported **0 Plays** for teams that had played all season, and
the detail card's *Last play* was empty beside it. Not a projection bug and not
a query cache: `teams.play_count` and `teams.last_play_at` are stored columns
with a `DEFAULT 0`, faithfully carried through every `team_upsert` — and
written by nothing at all. There is no `UPDATE teams SET play_count` anywhere
in the crate, and never was.

This is `operators.plays_run` exactly, one entity over, and it takes the same
fix (P11.1): the number is **derived from the `plays` projection**, which is
itself rebuilt from the log at every open, so it cannot drift from what
happened. A Play's roster is the key set of its `scores_json` — `record_of`
maps over the snapshot's teams, so a team that scored nothing is still in
there — and a Play that was loaded and never started is not one anybody
played. The stored columns stay in the schema, dead, next to `plays_run`;
dropping a column is not a forward-only migration worth writing.

One host change fixes all three surfaces, because they read one field: the
Teams list row meta, and the two `StatCard`s on the team detail.

**Exit criteria**

- ☑ A started Play makes every team on its roster report one Play and that
  Play's start as its last, and a team in the library that was not in it still
  reports none (`catalog_service.rs`).
- ☑ A Play loaded and put down before it began counts for nobody
  (`catalog_service.rs`).
- ☑ Derived, not stored: throwing the projection away and rebuilding it from
  the log lands on the same number, and a rename does not touch it
  (`catalog_service.rs`).
- ☑ An abandoned Play still happened, and a second show makes the count 2 with
  the later start as the last play (`catalog_service.rs`).
- ☑ The same body passes against both storage adapters, so the JSON query is
  not a memory-only trick (`each_adapter`).
- ☐ Checked in the built app against the operator's own library.

---

## P11.17 — Incomplete questions, import, and a second Demo  ☑

The operator writes questions in batches — often in a document, often with a
language model — and wanted to bring them in at once rather than one editor at
a time. A file like that is rarely finished: a question without its
difficulty, a list of options with no answer ticked, no domain. The library
refused every one of those, so the choice was *finish it all first* or *type it
all again*.

The rule changed rather than the importer working around it
(`optimized_first_spec.md` §2.32): **the library may hold an incomplete
question; a Play may not.** A question is stored if it has text or one option;
the five things that make it playable — text, two options, a correct mark, a
difficulty, an active domain — are *gaps*, spelled once in
`crates/host/src/catalog/complete.rs`, marked wherever the question is listed,
found by an *Incomplete* filter, and finished in the editor the operator
already knows. A board refuses one at both doors a board has, and Load refuses
one that became incomplete underneath it. `Question.difficulty` became
`Option<u8>`, stored as `0` so no table had to be rebuilt.

Import is one command, `catalog_import_questions`, over a pure planner run
twice — once for the preview, once for the one-transaction write — so the
report the operator confirms is the plan that lands. The file is JSON in the
editor's shape; unknown domains are created, exact duplicates skipped, and
anything the file carried wrongly is dropped *and listed*.

And a second sample game, *Demo (Română)* — five domains, fifteen questions at
10/50/100, Stage in Romanian — ships beside the English one, sharing no row,
restorable on its own, and seeded by first run alongside it. Both are ordinary
release-build commands.

**Exit criteria**

- ☑ The five gaps, alone and together, and the floor (`complete.rs`,
  `model.rs`); the same matrix on the Studio side (`host/question.test.ts`).
- ☑ An unset difficulty round-trips on both adapters, and the library stores an
  incomplete question while refusing an empty one (`catalog_service.rs`).
- ☑ A board cannot select an incomplete question through `recipe_upsert` or an
  `Original` edit; a this-game difficulty completes one for that show only;
  Load refuses one made incomplete in the library, and the Rules preview
  counts it (`catalog_service.rs`, `snapshot.rs`, `preview.rs`).
- ☑ The import planner: stem only and options only are incomplete, neither is
  rejected, an unknown domain is created once for two spellings with the
  Domain form's code, duplicates are skipped, dropped values are listed, a
  file that cannot be read is refused whole with its line and column
  (`import.rs`); the fake's mirror agrees case for case (`fake/import.test.ts`).
- ☑ The preview writes nothing and the commit writes what it showed; a second
  import of one file is all duplicates (`catalog_service.rs`).
- ☑ The Romanian Demo is five domains of three at 10/50/100, complete, in
  comma-below Romanian, shares no row with the English one, restores on its
  own, and loads into a Play with Stage in Romanian (`seed.rs`,
  `catalog_service.rs`, `host_wiring.rs`).
- ☑ Studio: the mark only on incomplete rows and gone once finished, the
  filter narrowing the list (`pages/library.test.tsx`); the editor saving an
  incomplete question and listing its gaps (`pages/pages.test.tsx`); the dialog
  previewing, refusing, and committing (`ImportQuestionsDialog.test.tsx`); the
  Board dimming an incomplete member and keeping a selected one
  (`BoardSection.test.tsx`); one Restore row per Demo and first run seeding
  both (`pages/settings.test.tsx`).
- ☑ Checked in the app against the operator's own library (2026-09-11): a
  test file covering every import case — complete, each gap, an unknown
  domain, a domain by code, duplicates against the library and within the
  file, ignored fields, rejected rows — previewed and imported as the report
  said.

---

## P12 — Packaging and release  ☐

**Deliverables:** Windows and macOS bundles; install paths vs user-data separation; uninstall screen offering app files and generated user files independently; processes visible in Task Manager / Activity Monitor; GPLv3 notices; offline verification.

The full design is `docs/superpowers/specs/2026-09-11-packaging-release-design.md` and the task list `docs/superpowers/plans/2026-09-11-packaging-release.md`. **P12.0 (2026-09-11) shipped the minimum that makes an installable 1.0.0**: two identities (`org.questiongame.desktop` installed, `org.questiongame.app` dev, refused when crossed), a boot-failure message box and a logged panic hook, version `1.0.0` in the three files, the NSIS per-user installer, the app icon. Everything else in the plan — host-side perf log in release, log rotation, dev-only webview diagnostics, Settings ▸ Data paths, single-instance focus, the close guard, in-app uninstall, third-party notices, About, the release check — is deferred to P12.1+.

**Exit criteria**

- ☐ Clean install → first run → Demo recipe → full Play to `Completed` on both OSes. (Windows installer built and installed 2026-09-11; the full Play is the operator's check.)
- ☐ A run with the network disabled behaves identically.
- ☐ Uninstall removes exactly what the operator selected. (The NSIS uninstaller's *Delete application data* box removes `org.questiongame.desktop` only; the in-app data removal is deferred.)
- ☐ No memory growth across three consecutive Plays.

---

## Explicitly not in v1

Wager/stake · CSV import/export (JSON question import landed in P11.17; export is still later) · user-replaceable audio packs · `@web-kits/audio` synth · Three.js / WebGL · haptics · mobile · livestream output · git-style branching in the operator UI · hard delete · a pack editor.

---

## Open decisions that block phases

| Decision | Blocks | Note |
| --- | --- | --- |
| ~~Studio theme reconciliation~~ | ~~P7~~ | **Closed 2026-09-06: no.** Studio keeps HeroUI's `--success` / `--danger`; the surfaces agree on meaning, not hue (`05_STUDIO_DESIGN.md` §2.1). |
| **Missing design-system files** | P2 | The design system readme indexes `styles.css`, `assets/`, `components/core/`, `ui_kits/questiongame/` (13 screens), `guidelines/`, and `SKILL.md`. **None are in this repo** — only `tokens/` and four decorative SVG folders. If they exist elsewhere, that is most of P2 already built. |
| ~~Default Stage monitor with several externals~~ | ~~P6~~ | **Closed 2026-09-06: there is no default.** Stage is *ready* — fullscreen on primary from first Control Load — and the host never picks a display. The first send is manual (Control's top picker or Settings ▸ Monitors) and is remembered in `stage.monitor_id`; a remembered display that comes back is taken automatically outside a Play, and mid-Play `stage.reattach` decides (`ask` by default: stay put, offer a *Move Stage* notice). Two identical panels answer to one key, and that case asks rather than guessing. |
| ~~Archive view visual design~~ | ~~P7~~ | **Closed 2026-09-06.** Active \| Archived is a secondary `Tabs` in each library tab's toolbar; archived rows render at 70% with an `archived` chip; restore is a row action and a bulk action (`05_STUDIO_DESIGN.md` §4.2, §4.6). |

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
