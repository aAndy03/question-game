# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository status

Shipped: **1.0.2**; main is at P13.4 — questiongame Beta (P13.1) and stable 1.1's library views (P13.2–P13.4, also on `release/1.x`, not yet tagged). The plan and each phase's exit criteria are `docs/v1/04_ROADMAP.md`; what each phase built and why is `docs/as-built/history.md`. Next: **Beta 2.0 — workspaces** (roadmap ▸ Next). **Which branch?** Stable fixes on `release/1.x`, merged forward into `main`; Beta work on `main` only — `docs/as-built/release.md` ▸ Channels.

## As built — read the area's file before changing it

Each file holds the rules a later change must not undo, with the incident that taught each one.

| Changing… | Read first |
| --- | --- |
| a host service — Play, catalog, flags, presentation, monitor, award, board rules, incomplete questions | `docs/as-built/host.md` |
| a command, the lock, logging, the performance log, webview diagnostics (`crates/app`) | `docs/as-built/app-shell.md` |
| Studio — shell, notices, editors, Control, Screens, Settings, health, Statistics | `docs/as-built/studio.md` |
| Stage — languages, editable words, fitting the display, the clock, the Viewer, motion | `docs/as-built/stage.md` |
| `play-state` / `play-tick`, emission rates, Studio's `playState` store | `docs/as-built/wire.md` |
| identities and channels, the installer, a version bump, the licence audit, CI, backups, updates, *What's new* | `docs/as-built/release.md` |
| the end-to-end suite or the codebase map | `docs/as-built/tooling.md` |

**Data folders are off-limits**: `org.questiongame.desktop` (the installed app) and `org.questiongame.app` (the dev build) hold real libraries. Read them on a copy; ask before writing or deleting anything in them; copy a `.sqlite3` and its `-wal` together. The e2e suite owns `org.questiongame.e2e` and nothing else.

```bash
npm run dev:app        # the desktop app (tauri dev + the dev identity overlay) — starts both dev servers itself
npm run dev:stage      # Stage alone, http://localhost:5180/stage/ — fixture-fed
npm run dev:studio     # Studio alone, http://localhost:5181/studio/ — says "no host"
npm run typecheck      # tsc --build across all project references
npm test               # vitest run (packages + jsdom projects per app)
npm run lint           # eslint, including the atomic + design-system boundaries
npm run test:host      # cargo test — host unit, integration and property tests
npm run test:app       # cargo test -p questiongame-app
npm run lint:host      # cargo clippy --all-targets -D warnings
npm run lint:app       # the same, for the Tauri crate
npm run test:all       # all four suites (packages + apps, host, app, tools/codemap)
npm run e2e            # the end-to-end suite: builds the e2e app, drives it through tauri-driver (Windows)
npm run map            # regenerate codemap.yaml (every IPC, event, contract, setting, schema and public-API surface)
npm run map:check      # fail if codemap.yaml is stale — CI and `release` run it
npm run release        # typecheck, lint, test:all, then tauri build (the Windows installer)
```

`npm run dev:app` starts both Vite dev servers itself (`beforeDevCommand` → `scripts/dev-webviews.mjs`). That script spawns Vite's own entry with this Node — no npm wrapper, no shell — because closing the app terminates the tree, and an npm wrapper answers a terminated child with a "Lifecycle script `dev` failed" block that reads like a crash; a child killed on shutdown now exits 0 quietly, while a real crash still takes the other server down. `npm run dev:stage` on its own has no Rust behind it and falls back to the P2/P3 fixture strip — that is the point: screen work does not need a database. **`npm run dev:studio` with `?fake` on the URL** (`http://localhost:5181/studio/?fake`, dev builds only) installs the in-memory host with a demo library, so shell work does not need Rust either; without `?fake` Studio says "No host". `npm run studio:icons` regenerates `apps/studio/src/atoms/icons.generated.ts` after a key is added to `atoms/icons.ts`. **`?fake&play=<fixture>`** (a `packages/contract` fixture name, e.g. `question-issued`) also hands Control a Play to draw, and `?fake` always carries a canned `stats_query` answer so the Statistics tab has something to render.

**Both webviews are served under the path they occupy in the bundle** — `/studio/` and `/stage/` — in dev too, and Studio's dev server proxies `/stage` to Stage's so the app has **one dev origin**. This is load-bearing: Tauri's capabilities scope permissions to `URL: local`, and a webview pointed at an *external* URL is remote to the ACL **even on localhost** — a remote webview is denied every command and `event.listen`. One origin keeps both windows local and means there is no `is_dev()` branch in `crates/app`. Do not "simplify" `windows.rs` back to an external dev URL.

`npm run lint` is not cosmetic here — it is where the architecture rules are enforced. See "Atomic design" below.

## Layout

- `docs/v1/optimized_first_spec.md` — **the durable decision file.** Locked product rules (§2), domain model and settings document (§4), runtime logic (§5), dependency choices (§7), feature families (§11), host command/event list (§13). Start here.
- `docs/v1/01_codebase-design-spec-v1.md` — module shape, re-verified against the locked stack with the `codebase-design` skill vocabulary. Decides how the system is cut.
- `docs/v1/04_ROADMAP.md` — **the build plan**: every phase with deliverables, installs and testable exit criteria, the risk register, and what is next.
- `docs/as-built/` — **what was built and the rules it must keep**, one file per area (see the table above), plus `history.md`.
- `docs/v1/03_CONTEXT.md` — the **vocabulary contract**. Read before writing any identifier, UI string, or doc.
- `docs/questiongame Design System/readme.md` — the Stage visual language, derived from the Figma source. Binding for anything rendered on Stage. Its tokens and decorative SVGs now live in `packages/design-stage/`.
- `docs/v1/05_STUDIO_DESIGN.md` — **the Studio design system** (P7): tokens and their meaning, the fixed vocabularies (chips, empty states, row actions, toolbar order), the full atom / molecule / organism / template / page catalog with props and variants, and the interaction rules. Binding for anything rendered in the `main` webview. Read it before adding a Studio component; add to its vocabularies rather than inventing at a call site.
- `docs/v1/02_spec-v1/01..16` — a reading split of the original notes by concern. Each file ends with *This file owns / Depends on / Talks to*.
- `docs/v1/00_first_spec.txt` — the original brain-dump prompt. **Reference only**; it has gaps and open questions, and its examples are illustrations, not rules.
- `packages/design-stage/` — questiongame tokens, self-hosted fonts, decorative SVGs, and `stage.css` (the Stage token scope).
- `packages/design-studio/` — `globals.css` and `studio.css` (the Studio token scope). Never loaded by Stage.
- `packages/contract/` — screens, node ids, reveal keys, command and event names, `PlayStateForStage` and `PlayStateForMain`. The only package both webviews and the host schema share.
- `packages/text/` — the `Text` module (§2.29).
- `crates/host/` — the four services. A plain library; a test sweeps its `src` tree for `tauri` and fails on a hit.
- `crates/app/` — the Tauri 2 shell (P6). Depends on `questiongame-host`; nothing depends on it.
- `e2e/` — the end-to-end suite (WebdriverIO through `tauri-driver`, Windows) and `tools/codemap/` — the Rust half of the codebase-map generator; both in `docs/as-built/tooling.md`.
- `codemap.yaml` — **generated** by `npm run map`: every IPC command, event, contract export, settings key, migration and public API. `git diff <tag> -- codemap.yaml` is what a release changed; never edit it by hand.
- `fixtures/` — contract fixtures (`PlayStateForStage` at named moments) that `stage_contract.rs`, Stage's fixture strip and `?fake&play=` all read.
- `dist/` — where both webviews build (`dist/studio`, `dist/stage`). Tauri's `frontendDist` points at it, so the directory has to exist for `cargo build` to run its codegen; only `dist/README.md` is tracked.
- `.agents/skills/` — skills installed from `mattpocock/skills` (37) and `heroui-inc/heroui` (3: `heroui-react`, `heroui-native`, `heroui-migration`), symlinked into `.claude/skills`. Use `heroui-react` before writing HeroUI v3 markup — v3 dropped `HeroUIProvider` and framer-motion, so v2 habits are wrong. Not project source.

### Document precedence

`optimized_first_spec.md` (product rules) → `01_codebase-design-spec-v1.md` (module shape) → `03_CONTEXT.md` (names) → `02_spec-v1/*` → `00_first_spec.txt`. `04_ROADMAP.md` sequences the work and does not overrule any of them; the Design System readme is binding for Stage visuals only.

`optimized_first_spec.md` states its own layering and says it **absorbs** accepted detail specs; `spec-v1/` is a reading split, not a second decision file. If a later `N-details spec.md` contradicts optimized, stop and ask which wording to keep rather than resolving it.

## Vocabulary is enforced

`docs/v1/03_CONTEXT.md` fixes the domain language and lists banned synonyms. Use these names in code, types, commands, and UI:

- **Recipe** — the prepared package (roster, board, settings, layout, overlays). Its operator tab is labeled **Game**. Not "template" or "match".
- **Play** — one run of a recipe. Not "session" (reserved for a question session) and not "game".
- **Snapshot** — recipe + overlay-applied bodies, copied at Play start or Restart.
- **Event** — append-only fact in a Play. Undo appends an inverting event; it never rewrites history.
- **Restart** (new Play now, same recipe) vs **Replay** (another Play another day).
- **Session** — an issued question until resolved; **Select** (working choice, timer runs) → **Lock** (frozen, timer stops) → **Reveal** (result, scoring, question consumed).
- **Consume** — a resolved question is not re-issued *in this Play*; the library keeps it.
- **Overlay** is ambiguous by design: *recipe overlay* = per-recipe patch of a catalog field; *Overlay animation* = Stage turn-handoff animation. Always qualify.
- **Studio** (operator app) / **Stage** (fullscreen audience surface) / **Viewer** (Control's preview of Stage plus operator hit targets — never rendered on Stage).
- **Archive** — soft delete, restorable. Never hard-delete library rows.
- **Screen** — one Stage layout (Idle, TeamOrder, ChooseDomain, Question, Scoreboard, FinalLeaderboard). Not "slide".
- **Control-behaviour** setting (may change mid-Play) vs **Game-affecting** setting (frozen at Play start).

## Architecture

### Four deep host modules, not per-noun engines

`00_first_spec.txt` and `02_spec-v1/04-layered-engines.md` propose one engine per noun (Question, Domain, Teams, Award, Settings, Screens, Animation…) plus Layer 2/3/4 binders. `01_codebase-design-spec-v1.md` rejects that as shallow — the Layer-3 binders are pass-throughs, and per-noun engines force Control panels to talk to three engines at once. **Treat the engine list as a glossary of jobs, not as the interface.** Implement instead:

- **`MatchService`** — collapses ring/turn order, question session, timer, award, cap/bonus, and per-Play consume behind one small interface (`play_*`, `choose_domain`, `set_selection`, `lock_selection`, `start_timer`, `reveal_outcome`, `give_token`, `reorder_ring`, `undo_turn`). It is the *only* writer of a Play. No second React-side writer.
- **`PresentationService`** — hides the overlay queue and the screen behind `show_screen`, `show_overlay`, `overlay_ack_complete`, the reveal commands, and the `anim-complete` signal. Reveal counts must survive undo and match in Stage and Viewer, so it writes them *through* `MatchService`. GSAP is on the other side of the wire (`apps/stage/src/presentation/`); this module never names a timeline. `stage_set_monitor` is its command but the state behind it is `monitor::StageDisplay`.
- **`CatalogService`** — hides SQLite, archive scopes, recipe overlays, and the Tantivy sidecar behind `catalog_*` / `recipe_*`.
- **`FlagService`** — the only flag reader: feature roots (`feat.*`), policy keys, and derived runtime flags (`session.locked`, `overlay.busy`, `play.status`). It owns the timer cascade and the settings interlocks; Studio never keeps a second flag store.

These are in-process Rust modules, not network hops.

### Seams worth keeping

Two adapters each: host command seam (real Tauri `invoke`/`emitTo` vs a stub `StageHost` / a bare `Host`); Play write seam (`MatchService`); Presentation seam (GSAP vs `motionConfig.immediate`, which jumps every timeline to its end synchronously and still reports once); Catalog seam (SQLite vs in-memory); monitor seam (`availableMonitors` vs a `Vec<MonitorInfo>` literal, so the unplug-Stage path is testable). The audio seam's interface is the **cue key**, never a file path.

Three of those are **parameters, not traits** — the monitor list, the catalog location, the reveal modes. A trait with one real implementation is indirection; a value the test can supply is a seam.

**Do not introduce a port with only one adapter.** Tantivy-vs-search-interface, HeroUI-vs-generic-widget, and EvilCharts-vs-chart-interface are named as hypothetical seams. Search stays as `catalog_search` on `CatalogService`.

Tests sit on these interfaces, not on React, GSAP, or rusqlite internals. `MatchService` is pure in-process computation — the round invariant and the award formulas want property tests over generated team counts, not four-team fixtures.

### Rust vs TypeScript

Rust (behind Tauri 2) owns all truth: game rules and settings, award calculation, turn-order enforcement, libraries/metadata/archive/atomic saves, Play and Restart records, Timeline events, Tantivy search, file paths and install/uninstall, OS display detection and permissions, health checks.

TypeScript/React owns presentation only: Studio shell and tabs, Control panel layout, Viewer overlays, Screens-tab canvas, Stage rendering, GSAP transitions and reveals, sound playback, charts. **A visual state changes because the backend changed it**, never because the frontend decided.

Studio surfaces that merely display Play state (Statistics, Screens tab, Control panels) are **projectors** — they read, they do not write.

Frontend → host is `invoke("lock_selection", …)`. Host → Stage is `emitTo("stage", "play-state", …)` (stripped); `"main"` gets the same shape plus `operator` (`OperatorState`) — legal token targets, undo/redo availability, the §4.2 `disabled` list. Other events: `catalog-changed`, `recipe-changed`, `health`, `monitors-changed`, `notice`, `anim-complete`, to `main` — and `play-state`, `catalog-changed` and `recipe-changed` also to `stats`, which is Studio on another display and draws Live from the same shape. **Each webview must listen as its own label** (`{ target: { kind: 'AnyLabel', label } }`): a bare `listen()` registers `EventTarget::Any`, and Tauri lets an `Any` listener past the `emit_to` filter entirely, so Studio would receive the stripped Stage emission (no `operator` — every organism reading it throws) and Stage would receive the operator half on camera. Stripping in `emit.rs` is only half of §5.7; the target is the other half. The Viewer click and the Action Panel button and the keyboard chord are three call sites of one command — that shared interface is the point.

**Stage may call exactly two commands** (`overlay_ack_complete`, `stage_ready`) and both are it reporting on itself; `crates/app/src/guard.rs` refuses the rest by webview label.

### Game rules that constrain the model

- A team keeps its token until it answers wrong; a correct answer lets it continue in the same domain or switch domains.
- Teams choose a **domain**, never a question or difficulty — difficulty walks easy→hard automatically inside the domain.
- **A board holds one question per difficulty within a domain** (§2.31) unless the game switches on `board.allow_repeated_difficulty` (P12.7). The library may hold many; the board picks one, so the walk is strictly increasing — or, with repeats on, asks them one after the other `id ASC`, each paying the same. Cross-domain is untouched — History 10 and Science 10 are two different walks.
- **A board holds only complete questions** (§2.32). The library may hold incomplete ones — text or one option is the floor — and a Play never sees one.
- **Round invariant** (any team count `n`, including `n = 1`): with `turns[t]` = tokens team `t` has received this Play, the engine keeps `max(turns) − min(turns) ≤ 1` over the active teams. A team gets its `r+1`-th token only once every active team has received `r`, so `give_token`'s legal targets are the teams not yet served this round — never the team currently holding the token. The engine completes the round rather than skipping a team to satisfy an override. Four-team arrays in the docs are illustrations; the invariant is the rule (`optimized_first_spec.md` §5.4).
- Consume is per-Play, not per-library. A resolved question never returns to the pool for the next team.
- The Play ends when every snapshot question is consumed; ties are legal at every place (competition rank `1,1,3`).
- **`Select → Lock → Reveal`.** Select does not stop the timer. Lock stops it and stores `remaining_ms_at_lock`. **Reveal is the only point that scores and consumes** — lock does not score, and an override does not score.
- Scoring: `points = floor(base * (1 + speed_weight * progress))`, where `base` is flat or `f(difficulty)` and `progress` is how much of `scoring.speed_window` the lock had left (P11.12; the default window is the whole clock, which is `remaining_ms_at_lock / timer.duration_ms`). Lock-speed is both an exclusive mode and an option on the other two — do not double-apply. Wrong or empty reveal is `0`. Defaults: no partial credit, option order irrelevant (`{A,C}` equals `{C,A}`).
- Timer cascade at question issue: question overlay duration → recipe `timer.duration_ms` → `globals.timer.duration_ms`. Disabled at the winning level means **operator pace** (no countdown, no auto-lock, lock-speed weight disabled, Stage clock hidden). The host emits `remaining_ms` every 100ms; no frontend clock may pass host zero.
- Game-affecting settings freeze at `play_start` and stay **visible but disabled**, never hidden. Pause is not a back door into award edits.

## Design system

Import the token files rather than hardcoding values. The palette is a stark black-on-white base (`--ink`, `--paper`, `--gray-500/200`) plus semantic states (`--state-correct` green, `--state-incorrect` red, `--state-info` blue, `--state-leader` gold, `--state-accent` yellow). Type is Space Grotesk (display) / Space Mono, with a very large Stage-oriented scale (up to `--text-mega` 160px) and negative tracking tokens. Spacing is an 8px base; radii are small (0/4/8px) and borders are heavy (1/2/3px).

## Stack (locked in `optimized_first_spec.md` §7)

**Host** — Rust stable, Tauri 2, `@tauri-apps/api` (`availableMonitors`, `WebviewWindow`, `emitTo`, `listen`, `convertFileSrc`; convert physical `Monitor` pixels with `toLogical(scaleFactor)`), `serde`, `tokio`, `rusqlite` (`bundled`), `thiserror`, `tracing`, `uuid`, `tantivy`. **`rusqlite`, not `tauri-plugin-sql`** (decided 2026-09-05): the plugin needs Tauri inside the host crate and hands the webview its own SQL API — a second writer of the catalog. WAL + `synchronous = FULL`, one writer connection behind a `Mutex` inside `CatalogService`, handwritten forward-only migrations on the `user_version` pragma.

**Studio** — React 19 (follow the React 19 API docs and provider patterns), Tailwind v4, HeroUI v3 (`@heroui/react@^3.2.6`, `@heroui/styles`), Base UI where HeroUI has no fit, Iconify + Gravity UI as default icons with Phosphor duotone as supplement, `@dnd-kit/react` + `@dnd-kit/helpers`.

**A HeroUI v3 control is only a control if its interactive subcomponent is rendered.** `Switch`'s root is React Aria's `SwitchField` — no input, no ARIA — and the clickable `SwitchButton` is **`Switch.Content`**; render it always and put the control inside it, or the switch is a `<div>` that cannot be pressed and reports nothing. Assert the *role* in a test (`getByRole('switch')`), never just that the thing is on screen.

**Two HeroUI v3 overlay rules, learned the hard way:** the **trigger is the button itself** — `Dropdown.Trigger` / `Popover.Trigger` wrap their child in a pressable of their own, so a `Button` inside one is two nested `<button>`s — and a **controlled overlay starts at `.Backdrop`**, with no `<Drawer>` / `<AlertDialog>` root, because the root exists only to wire a trigger and otherwise warns `PressResponder without a pressable child` on every render.

**HeroUI is v3 only — pin `@heroui/react@^3.2.6`.** Invoke the `heroui-react` skill before writing HeroUI markup and never answer from memory: v3 is Tailwind v4 + React Aria, with **no `HeroUIProvider`**, no framer-motion, and oklch theme variables, so v2 knowledge is actively wrong. Canonical index: `https://heroui.com/react/llms.txt`; components at `heroui.com/en/docs/react/components/<name>`.

### Two design systems, one component stack (§2.30)

Both webviews are TypeScript + React 19 and both use HeroUI v3 and Base UI. **What differs is the token scope, not the stack.**

| | Studio (`main`) | Stage (`stage`) |
| --- | --- | --- |
| Tokens | `packages/design-studio/globals.css` — HeroUI theme as shipped | `packages/design-stage/tokens/*` — questiongame |
| Look | HeroUI defaults, oklch, `--radius: 0.75rem` | Ink on white, radius 0, inset borders, no shadows |
| Type | HeroUI sans stack | Space Grotesk + Space Mono |
| Motion | `motion/react` | GSAP only |
| Components | HeroUI first, Base UI on gaps | **Base UI first** (unstyled restyles cleanly), HeroUI *display* components under the Stage theme scope |

HeroUI v3 themes through CSS variables, so the Stage root redefines them onto the questiongame palette (`--success` → mint, `--danger` → coral, `--radius` → 0, `--font-sans` → Space Grotesk). **Never import `globals.css` into Stage; never import questiongame tokens into Studio** — enforced by a lint boundary between `design-stage` and `design-studio`.

Stage screens are component-shaped (sequence table, domain card grid, answer card grid, timer readout, result widget), so they compose library primitives rather than raw markup. But **avoid interactive widgets on Stage** (`Button`, `Input`, `Select`, `Modal`): nobody touches it, the design system defines no hover or press state, and focus rings and ARIA semantics are noise on a camera-facing surface. Viewer hit targets and Screens-canvas handles render in the *Studio* webview over a copy of the Stage tree and may use the kit freely.

### Atomic design

Both webviews organise components as `atoms / molecules / organisms / templates / pages`. `eslint.config.js` enforces four rules, so a violation is a failing `npm run lint`, not a review comment:

1. Dependencies point one way — `pages → templates → organisms → molecules → atoms`.
2. **Only organisms and pages may import `PlayStateForStage` or `@tauri-apps/api`** — the Play write seam as a directory rule. Reveal state lives on organisms; an atom unmounting would break §2.6.
3. `apps/stage` cannot import `design-studio` or `motion`; `apps/studio` cannot import `design-stage`.
4. Nothing imports `calligraph` except `packages/text`.

When editing that config: flat config **replaces** rule options rather than merging them, so each file group needs one fully-composed `no-restricted-imports` — several partial blocks silently cancel each other. Empty `patterns`/`paths` arrays fail the rule schema.

**Ownership rules that constrain how these are used** — these matter more than the package list:

- **TanStack Query** covers catalog list/get/search and `stats_query` only; invalidate on `catalog-changed` / `recipe-changed`. **Never cache `play-state`** — a stale cached Play is exactly the drift the Play write seam exists to prevent.
- **Zustand** is chrome only (grid|table preference, mosaic draft, notice-stack open, settings inner-tab). A score, ring, or session field landing in a store means the Play write seam is broken.
- **TanStack Table/Form** are the headless engines; HeroUI `Table`/`Form` are the styled shells. Never mount two competing form states on one screen. **Library lists do not use TanStack Table** since stable 1.1: the list-view model (`host/listView.ts`) sorts, filters, groups and pages — `docs/as-built/studio.md` ▸ Library views.
- **TanStack Virtual / Pacer** for long lists, the 400ms layout debounce, search debounce, bulk batching. **TanStack Hotkeys** on `main` only, `ignoreInputs: true`, never on Stage; HeroUI `Kbd` only paints keys.
- **GSAP + `@gsap/react`** (`Physics2DPlugin`, `InertiaPlugin`) is **Stage only** and stays internal to `PresentationService` — no caller should need a timeline name. `motion/react` is **Studio chrome only** and must never animate anything whose truth is in `play-state`.
- **One `Text` module** owns every readable string: `Text({ as, variant, transition: "none" | "swap" | "count" })`. `variant` resolves to the design tokens; `transition` describes what happens when the content *changes*. Default `none` renders a plain node with no animation runtime. **Calligraph** (Motion-based, for text transitions — not a typography primitive) implements `swap`/`count` in Studio; **GSAP inside the screen timeline** implements them on Stage, so the overlay queue and `anim-complete` stay authoritative. No component imports `calligraph` directly. See `optimized_first_spec.md` §2.29.
- **Howler** plays the bundled default cue pack. `@web-kits/audio` is installed but inactive (`feat.audio.synth` off). User-replaceable packs are v2.
- **ECharts** (`echarts`, P11) isolated under Statistics, read-only — imported by `molecules/StatsChart.tsx` and nowhere else. EvilCharts is not installed: it is a Recharts component collection, and one themed wrapper is less surface than a second chart runtime.

Explicitly **dropped**: `@svgdotjs/svg.js`, `framer-motion`, legacy dnd-kit, haptics, Three.js in v1. **`matter-js` is Stage decor only**: the decorative bodies (`apps/stage/src/decor/`) live in a matter world that runs for the life of a screen — `collide` by default, `collide-attract` as a per-recipe option, both tuned by `StageDecorSettings` in play-state. It never touches anything whose truth is game state, never reports `anim-complete`, and writes DOM transforms directly so React does not re-render per frame.

## Product constraints

Offline-first — the one network call is the update check (P12.9), and it can be turned off — desktop-only, Windows and macOS. GPLv3, open source, **monorepo** (Rust host + Studio webview + Stage webview in one repo). Not a live-broadcast tool — the show is recorded and post-produced, and the same binary should also work for a classroom or a group of friends. Stage is a separate fullscreen `WebviewWindow` created on first Control Load (not at boot), sent to a chosen real monitor; one display is a valid fallback (Stage fullscreen, Studio via Alt-Tab). Unplugging the Stage monitor pulls the window back and raises a notice — the Play stays `playing`.

Persistence is atomic: events append first, projections rebuild on boot, recipe save is one transaction, layout auto-save debounces 400ms into one `rev`. Hard delete is not v1. An update copies the library before it migrates or writes anything (P12.6).

Background health monitoring stays silent until there is an error, warning, or something the operator must know. Notices are one frontend family: host emits `{ code, severity, target_path, actions[] }` with **2, max 3** solve actions; further confirms stack inside the same component rather than opening a new dialog. Uninstall offers separate removal of app files and generated user files.
