# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository status

**P0 is scaffolded** (`docs/v1/04_ROADMAP.md`). npm workspaces monorepo, git initialised, GPLv3. The Rust host does not exist yet — `crates/` is empty and Tauri arrives at P6. No `.rs` file, no `Cargo.toml`.

```bash
npm run dev:stage      # Stage webview, port 5180
npm run dev:studio     # Studio webview, port 5181
npm run typecheck      # tsc --build across all project references
npm test               # vitest run (packages + jsdom projects per app)
npm run lint           # eslint, including the atomic + design-system boundaries
```

`npm run lint` is not cosmetic here — it is where the architecture rules are enforced. See "Atomic design" below.

## Layout

- `docs/v1/optimized_first_spec.md` — **the durable decision file.** Locked product rules (§2), domain model and settings document (§4), runtime logic (§5), dependency choices (§7), feature families (§11), host command/event list (§13). Start here.
- `docs/v1/01_codebase-design-spec-v1.md` — module shape, re-verified against the locked stack with the `codebase-design` skill vocabulary. Decides how the system is cut.
- `docs/v1/04_ROADMAP.md` — **the v1 build plan.** Thirteen phases with deliverables, per-phase installs, and testable exit criteria; plus the risk register and the decisions that block phases.
- `docs/v1/03_CONTEXT.md` — the **vocabulary contract**. Read before writing any identifier, UI string, or doc.
- `docs/questiongame Design System/readme.md` — the Stage visual language, derived from the Figma source. Binding for anything rendered on Stage. Its tokens and decorative SVGs now live in `packages/design-stage/`.
- `docs/v1/02_spec-v1/01..16` — a reading split of the original notes by concern. Each file ends with *This file owns / Depends on / Talks to*.
- `docs/v1/00_first_spec.txt` — the original brain-dump prompt. **Reference only**; it has gaps and open questions, and its examples are illustrations, not rules.
- `packages/design-stage/` — questiongame tokens, self-hosted fonts, decorative SVGs, and `stage.css` (the Stage token scope).
- `packages/design-studio/` — `globals.css` and `studio.css` (the Studio token scope). Never loaded by Stage.
- `packages/contract/` — screens, node ids, reveal keys, command and event names. The only package both webviews and the host schema share.
- `packages/text/` — the `Text` module (§2.29).
- `.agents/skills/` — skills installed from `mattpocock/skills` (37) and `heroui-inc/heroui` (3: `heroui-react`, `heroui-native`, `heroui-migration`), symlinked into `.claude/skills`. Use `heroui-react` before writing HeroUI v3 markup — v3 dropped `HeroUIProvider` and framer-motion, so v2 habits are wrong. Not project source; exclude from the repo when git is initialized.

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
- **`PresentationService`** — hides GSAP and the overlay queue behind `show_screen`, `stage_set_monitor`, `overlay_ack_complete`, the reveal commands, and the `anim-complete` signal. Reveal counts must survive undo and match in Stage and Viewer, so it writes them *through* `MatchService`.
- **`CatalogService`** — hides SQLite, archive scopes, recipe overlays, and the Tantivy sidecar behind `catalog_*` / `recipe_*`.
- **`FlagService`** — the only flag reader: feature roots (`feat.*`), policy keys, and derived runtime flags (`session.locked`, `overlay.busy`, `play.status`). It owns the timer cascade and the settings interlocks; Studio never keeps a second flag store.

These are in-process Rust modules, not network hops.

### Seams worth keeping

Two adapters each: host command seam (real Tauri `invoke`/`emitTo` vs in-process test harness); Play write seam (`MatchService`); Presentation seam (GSAP vs a stub that acks `anim-complete`); Catalog seam (SQLite vs in-memory); monitor seam (`availableMonitors` vs a fake monitor list, so the unplug-Stage path is testable). The audio seam's interface is the **cue key**, never a file path.

**Do not introduce a port with only one adapter.** Tantivy-vs-search-interface, HeroUI-vs-generic-widget, and EvilCharts-vs-chart-interface are named as hypothetical seams. Search stays as `catalog_search` on `CatalogService`.

Tests sit on these interfaces, not on React, GSAP, or rusqlite internals. `MatchService` is pure in-process computation — the round invariant and the award formulas want property tests over generated team counts, not four-team fixtures.

### Rust vs TypeScript

Rust (behind Tauri 2) owns all truth: game rules and settings, award calculation, turn-order enforcement, libraries/metadata/archive/atomic saves, Play and Restart records, Timeline events, Tantivy search, file paths and install/uninstall, OS display detection and permissions, health checks.

TypeScript/React owns presentation only: Studio shell and tabs, Control panel layout, Viewer overlays, Screens-tab canvas, Stage rendering, GSAP transitions and reveals, sound playback, charts. **A visual state changes because the backend changed it**, never because the frontend decided.

Studio surfaces that merely display Play state (Statistics, Screens tab, Control panels) are **projectors** — they read, they do not write.

Frontend → host is `invoke("lock_selection", { playId })`. Host → Stage is `emitTo("stage", "play-state", …)` (stripped; `"main"` gets the full snapshot). Other events: `catalog-changed`, `recipe-changed`, `health`, `monitors-changed`, `anim-complete`. The Viewer click and the Action Panel button and the keyboard chord are three call sites of one command — that shared interface is the point.

### Game rules that constrain the model

- A team keeps its token until it answers wrong; a correct answer lets it continue in the same domain or switch domains.
- Teams choose a **domain**, never a question or difficulty — difficulty walks easy→hard automatically inside the domain.
- **Round invariant** (any team count `n`, including `n = 1`): with `turns[t]` = tokens team `t` has received this Play, the engine keeps `max(turns) − min(turns) ≤ 1` over the active teams. A team gets its `r+1`-th token only once every active team has received `r`, so `give_token`'s legal targets are the teams not yet served this round — never the team currently holding the token. The engine completes the round rather than skipping a team to satisfy an override. Four-team arrays in the docs are illustrations; the invariant is the rule (`optimized_first_spec.md` §5.4).
- Consume is per-Play, not per-library. A resolved question never returns to the pool for the next team.
- The Play ends when every snapshot question is consumed; ties are legal at every place (competition rank `1,1,3`).
- **`Select → Lock → Reveal`.** Select does not stop the timer. Lock stops it and stores `remaining_ms_at_lock`. **Reveal is the only point that scores and consumes** — lock does not score, and an override does not score.
- Scoring: `points = floor(base * (1 + speed_weight * remaining_ms_at_lock / timer.duration_ms))`, where `base` is flat or `f(difficulty)`. Lock-speed is both an exclusive mode and an option on the other two — do not double-apply. Wrong or empty reveal is `0`. Defaults: no partial credit, option order irrelevant (`{A,C}` equals `{C,A}`).
- Timer cascade at question issue: question overlay duration → recipe `timer.duration_ms` → `globals.timer.duration_ms`. Disabled at the winning level means **operator pace** (no countdown, no auto-lock, lock-speed weight disabled, Stage clock hidden). The host emits `remaining_ms` every 100ms; no frontend clock may pass host zero.
- Game-affecting settings freeze at `play_start` and stay **visible but disabled**, never hidden. Pause is not a back door into award edits.

### Stage motion model

Every Screen has a base transition to every other Screen (the operator can jump anywhere). **Overlay animations** are drawn on top of the current screen for information the operator skipped (e.g. a turn handoff when jumping Idle→ChooseDomain). They do not remount the screen and do not reset reveal state. Only one overlay plays at a time with at most one pending override queued behind it; a wrong answer never auto-advances Stage.

Question and FinalLeaderboard have an operator-timed **reveal layer** after the transition completes (stem, then each answer individually; leaderboard from last place upward), switchable to automatic in the Control Game panel.

## Design system

Import the token files rather than hardcoding values. The palette is a stark black-on-white base (`--ink`, `--paper`, `--gray-500/200`) plus semantic states (`--state-correct` green, `--state-incorrect` red, `--state-info` blue, `--state-leader` gold, `--state-accent` yellow). Type is Space Grotesk (display) / Space Mono, with a very large Stage-oriented scale (up to `--text-mega` 160px) and negative tracking tokens. Spacing is an 8px base; radii are small (0/4/8px) and borders are heavy (1/2/3px).

## Planned stack (locked in `optimized_first_spec.md` §7; nothing installed yet)

**Host** — Rust stable, Tauri 2, `@tauri-apps/api` (`availableMonitors`, `WebviewWindow`, `emitTo`, `listen`, `convertFileSrc`; convert physical `Monitor` pixels with `toLogical(scaleFactor)`), `serde`, `tokio`, `rusqlite` or `tauri-plugin-sql`, `thiserror`, `tracing`, `uuid`, `tantivy`.

**Studio** — React 19 (follow the React 19 API docs and provider patterns), Tailwind v4, HeroUI v3 (`@heroui/react@^3.2.4`, `@heroui/styles`), Base UI where HeroUI has no fit, Iconify + Gravity UI as default icons with Phosphor duotone as supplement, `@dnd-kit/react` + `@dnd-kit/helpers`.

**HeroUI is v3 only — pin `@heroui/react@^3.2.4`.** Invoke the `heroui-react` skill before writing HeroUI markup and never answer from memory: v3 is Tailwind v4 + React Aria, with **no `HeroUIProvider`**, no framer-motion, and oklch theme variables, so v2 knowledge is actively wrong. Canonical index: `https://heroui.com/react/llms.txt`; components at `heroui.com/en/docs/react/components/<name>`.

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
- **TanStack Table/Form** are the headless engines; HeroUI `Table`/`Form` are the styled shells. Never mount two competing form states on one screen.
- **TanStack Virtual / Pacer** for long lists, the 400ms layout debounce, search debounce, bulk batching. **TanStack Hotkeys** on `main` only, `ignoreInputs: true`, never on Stage; HeroUI `Kbd` only paints keys.
- **GSAP + `@gsap/react`** (`Physics2DPlugin`, `InertiaPlugin`) is **Stage only** and stays internal to `PresentationService` — no caller should need a timeline name. `motion/react` is **Studio chrome only** and must never animate anything whose truth is in `play-state`.
- **One `Text` module** owns every readable string: `Text({ as, variant, transition: "none" | "swap" | "count" })`. `variant` resolves to the design tokens; `transition` describes what happens when the content *changes*. Default `none` renders a plain node with no animation runtime. **Calligraph** (Motion-based, for text transitions — not a typography primitive) implements `swap`/`count` in Studio; **GSAP inside the screen timeline** implements them on Stage, so the overlay queue and `anim-complete` stay authoritative. No component imports `calligraph` directly. See `optimized_first_spec.md` §2.29.
- **Howler** plays the bundled default cue pack. `@web-kits/audio` is installed but inactive (`feat.audio.synth` off). User-replaceable packs are v2.
- **EvilCharts/ECharts** isolated under Statistics, read-only.

Explicitly **dropped**: `@svgdotjs/svg.js`, `matter-js`, `framer-motion`, legacy dnd-kit, haptics, Three.js in v1.

## Product constraints

Offline-first, desktop-only, Windows and macOS. GPLv3, open source, **monorepo** (Rust host + Studio webview + Stage webview in one repo). Not a live-broadcast tool — the show is recorded and post-produced, and the same binary should also work for a classroom or a group of friends. Stage is a separate fullscreen `WebviewWindow` created on first Control Load (not at boot), sent to a chosen real monitor; one display is a valid fallback (Stage fullscreen, Studio via Alt-Tab). Unplugging the Stage monitor pulls the window back and raises a notice — the Play stays `playing`.

Persistence is atomic: events append first, projections rebuild on boot, recipe save is one transaction, layout auto-save debounces 400ms into one `rev`. Hard delete is not v1.

Background health monitoring stays silent until there is an error, warning, or something the operator must know. Notices are one frontend family: host emits `{ code, severity, target_path, actions[] }` with **2, max 3** solve actions; further confirms stack inside the same component rather than opening a new dialog. Uninstall offers separate removal of app files and generated user files.
