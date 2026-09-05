# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository status

**P0–P7 are done** (`docs/v1/04_ROADMAP.md`). npm workspaces monorepo, GPLv3. **The two tracks met at P6:** Stage no longer reads fixtures, it reads the host. `crates/host` holds `MatchService`, `FlagService`, `CatalogService` and `PresentationService` and is still a plain library with zero `tauri::` imports; `crates/app` is the Tauri 2 shell around it. **P7 built the Studio shell** — sidebar, top bar, status bar, the four library tabs (Teams, Domains+Questions, Games, Operators), one component system (`docs/v1/05_STUDIO_DESIGN.md`). P8 builds the Control tab.

```bash
npm run dev:app        # the desktop app (tauri dev) — starts both dev servers itself
npm run dev:stage      # Stage alone, http://localhost:5180/stage/ — fixture-fed
npm run dev:studio     # Studio alone, http://localhost:5181/studio/ — says "no host"
npm run typecheck      # tsc --build across all project references
npm test               # vitest run (packages + jsdom projects per app)
npm run lint           # eslint, including the atomic + design-system boundaries
npm run test:host      # cargo test — host unit, integration and property tests
npm run test:app       # cargo test -p questiongame-app
npm run lint:host      # cargo clippy --all-targets -D warnings
npm run lint:app       # the same, for the Tauri crate
npm run test:all       # all three suites
```

`npm run dev:app` starts both Vite dev servers itself (`beforeDevCommand` → `scripts/dev-webviews.mjs`). `npm run dev:stage` on its own has no Rust behind it and falls back to the P2/P3 fixture strip — that is the point: screen work does not need a database. **`npm run dev:studio` with `?fake` on the URL** (`http://localhost:5181/studio/?fake`, dev builds only) installs the in-memory host with a demo library, so shell work does not need Rust either; without `?fake` Studio says "No host". `npm run studio:icons` regenerates `apps/studio/src/atoms/icons.generated.ts` after a key is added to `atoms/icons.ts`.

**Both webviews are served under the path they occupy in the bundle** — `/studio/` and `/stage/` — in dev too, and Studio's dev server proxies `/stage` to Stage's so the app has **one dev origin**. This is load-bearing: Tauri's capabilities scope permissions to `URL: local`, and a webview pointed at an *external* URL is remote to the ACL **even on localhost** — a remote webview is denied every command and `event.listen`. One origin keeps both windows local and means there is no `is_dev()` branch in `crates/app`. Do not "simplify" `windows.rs` back to an external dev URL.

`npm run lint` is not cosmetic here — it is where the architecture rules are enforced. See "Atomic design" below.

## Layout

- `docs/v1/optimized_first_spec.md` — **the durable decision file.** Locked product rules (§2), domain model and settings document (§4), runtime logic (§5), dependency choices (§7), feature families (§11), host command/event list (§13). Start here.
- `docs/v1/01_codebase-design-spec-v1.md` — module shape, re-verified against the locked stack with the `codebase-design` skill vocabulary. Decides how the system is cut.
- `docs/v1/04_ROADMAP.md` — **the v1 build plan.** Thirteen phases with deliverables, per-phase installs, and testable exit criteria; plus the risk register and the decisions that block phases.
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
- `dist/` — where both webviews build (`dist/studio`, `dist/stage`). Tauri's `frontendDist` points at it, so the directory has to exist for `cargo build` to run its codegen; only `dist/README.md` is tracked.
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

Frontend → host is `invoke("lock_selection", …)`. Host → Stage is `emitTo("stage", "play-state", …)` (stripped); `"main"` gets the same shape plus `operator` (`OperatorState`) — legal token targets, undo/redo availability, the §4.2 `disabled` list. Other events: `catalog-changed`, `recipe-changed`, `health`, `monitors-changed`, `notice`, `anim-complete`, all to `main` only. The Viewer click and the Action Panel button and the keyboard chord are three call sites of one command — that shared interface is the point.

**Stage may call exactly two commands** (`overlay_ack_complete`, `stage_ready`) and both are it reporting on itself; `crates/app/src/guard.rs` refuses the rest by webview label.

### The Rust host as built (P4–P6)

`crates/host` is a Cargo workspace member and a plain library — a test asserts zero `tauri::` imports over the whole `src` tree, and **P6 kept it that way**: Tauri lives in `crates/app`, which depends on the host and is depended on by nothing. Four services live in the host, and they compose without knowing about each other:

```text
FlagService::freeze()  →  CatalogService::build_snapshot()  →  MatchService::play_load()
                                                                        ↓
                                                          CatalogService::play_persist()
```

Module map (`crates/host/src/`): `service` (the §13 command surface, the only writer of a Play) → `play` (the materialized projection, a pure fold) → `event` (the append-only log) → `ring` · `session` · `timer` · `award` · `rules` · `snapshot` · `settings` · `stage`; `flags` (`FlagService`); `catalog/` (`service` · `model` · `snapshot` · `store` · `search` · `db` · `error`); `presentation` (`PresentationService`) · `monitor` (where the Stage window stands) · `notice` (the §14 shape).

Rules a later phase must not accidentally undo:

- **No clock inside the host.** Every command — catalog writes included — takes `now_ms`; a running timer is `remaining as of running_since`. A tick never mutates a Play: `tick` only applies the T=0 table, and it applies it at the *computed* zero instant, so poll cadence cannot change a score and a replay lands on the same millisecond. P6 emits every 100ms by **reading** `stage::project`.
- **The log only grows.** Undo appends `TurnInverted { target_event_id, from_seq, to_seq }` and the projection is rebuilt; redo appends `TurnReapplied` and is legal only while the undo is still the last event. `events` is append-only in SQLite too, and the `plays` table is a projection rebuilt from it at `CatalogService::open`.
- **`FrozenSettings` live in `PlaySnapshot`, `LiveSettings` on the service.** There is no command that writes a frozen key — that is how §2.5 is enforced, not by disabling a control. `FlagService::settings_set_current_game` refuses a game-affecting key while a Play is open, and `play_load` re-validates the snapshot's settings against the §4.2 interlocks in case the row came from an older build.
- **`stage::project` emits the game half of `PlayStateForStage`**; `currentScreen`, `overlay`, `revealModes` and `decor` are `PresentationService::play_state`'s to merge (`revealModes` comes from `FlagService::reveal_modes`, never a second store). Keep the split: the 100ms tick re-projects the game half and must not touch the queue. `crates/host/tests/stage_contract.rs` checks both the half and the whole emission against every `fixtures/*.json`, so bump `stage::CONTRACT_VERSION` and `packages/contract` together.
- **`give_token` is refused while a question is issued and unrevealed**, in both `override.after_lock` modes; the setting decides the Control affordance (`FlagService::show_give_token`), and `allow` pairs with `reveal_and_pass` (§2.6 path 2).

#### `PresentationService` (P6)

What the operator has chosen to show: the **current screen**, the **overlay queue**, and the recipe's **decor settings**. Everything else it appears to own it borrows.

- **Reveals are Play state.** `reveal_stem`, `reveal_next_option` and `reveal_leaderboard_rank` take `&mut MatchService` and delegate. There is no way to spell a second writer.
- **`revealModes` and `overlay_animations.enabled` are passed in per call**, from `FlagService`. A stored copy is the drift §2.16 forbids — the same discipline that keeps `play.status` out of `FlagService`.
- **The queue advances on an ack, never on a clock** (§2.6): one active, at most one pending, a newer pending replacing an older. `anim_complete(key, …)` is the single door for Stage's handshake; an unmatched key advances nothing and is not an error, because Stage reports *every* timeline it plays.
- **Overlays are enqueued from a diff of the projection** (`observe(prev, next)`), not from the command: §5.6 says a kind is enqueued when its **cause** occurs, and the same cause arrives from a resolve, an override and an undo. `current-team` has no automatic cause of its own; it stays operator-called.
- **Auto reveal chains host-side.** A beat is an append, so Stage driving it would be a second writer. `reveal.outcome` has no chained command — the outcome node appears as part of `reveal_outcome`, the only thing that scores.
- `show_screen` refuses everything but Idle before `play_start`: nothing else has a roster, a board or a score to draw.

#### `monitor` — where Stage stands (P6, §9)

**The host never picks a display.** Stage is *ready*: fullscreen on primary from first Control Load, waiting. The first send is manual and is remembered in `stage.monitor_id`; a remembered display that reappears is taken automatically **outside** a Play, and mid-Play `stage.reattach` (`ask` | `auto` | `stay`, default `ask`) decides. Unplugging pulls the window back to primary with a warn notice and **does not touch the Play** — nothing in this module can reach one. Two identical panels collide on one key, and that case asks rather than guessing.

The OS list arrives as `Vec<MonitorInfo>` in **logical** pixels; that parameter *is* the monitor seam, and an unplug test needs nothing more than a shorter vector. Do not add a trait for it.

#### `FlagService` (P5)

The §4.2 document and the only flag reader. It holds the globals, the recipe in Control, and the live control-behaviour copy — and **never** `play.status`, `session.locked` or `overlay.busy`: those arrive as a `RuntimeContext` built from `MatchService` at the call site, because a stored copy is exactly the drift §2.16 forbids.

- Every write lands on a **clone**, the clone is validated whole, and only a legal document is committed. A refused write changes nothing.
- The interlocks live on the settings types (`ScoringSettings::validate`, `TurnSettings::validate`, `TimerLevel::validate`), so `FlagService` and `MatchService::play_load` run the same table.
- `feat.*` is a **graph**: a child root is off whenever an ancestor is, whatever its own switch says. `require_feature` is the `feature_off` gate.
- `disabled(ctx)` returns every key that is frozen, inert or feature-off, with the reason — §4.2's "UI disables the illegal sibling first", computed once here rather than four times in Studio.
- `reveal.*` is the one Game-tab key that does **not** freeze: §4.2 lists it as a Game default *and* Control live.

#### `CatalogService` (P5)

`rusqlite` with `bundled`, WAL + `synchronous = FULL`, one writer connection behind a `Mutex`, handwritten forward-only migrations on `user_version`. The interface never hands a `Connection` out, and `catalog/store.rs` — every SQL statement in the project — is `pub(super)`. That is what "the storage seam is internal" means; do not add a `Repository` port, and do not add a `SearchService` (search is `catalog_search`).

- `catalog_*` covers teams, domains, questions, operators and assets. **Recipes are not reachable through it** — §11.A and §11.B are two verb lists, and `catalog_list`/`catalog_get` refuse `CatalogKind::Recipe` on purpose.
- Archive is `archived_at`. There is no hard-delete path in the crate; `referenced_by` reports what a row is used by.
- `recipe_upsert` is one transaction and advances `rev` once. `recipe_set_membership` / `set_settings` / `set_layout` / `set_overlay` are the same write, named.
- `recipe_set_overlay` carries ScopeConfirm (§2.17): `ThisGame` writes the patch, `Original` writes the catalog row, drops *this* recipe's patch, and leaves every other recipe's patch standing. A per-question duration has no original.
- `build_snapshot` applies overlays to bodies (§4.3) and **refuses a board that names an archived or missing row** rather than quietly dropping a question.
- The Tantivy index is in RAM, rebuilt at open from the catalog, updated by every write, and committed lazily on the next search. Terms match exactly or by prefix.
- Bulk (§2.19) is **one transaction and one fsync per batch**: `catalog_upsert_many` / `catalog_archive_many` / `catalog_restore_many`. The whole batch is validated before anything is written, so a bad row at index 199 leaves the library untouched.
- Tests: `CatalogLocation::Memory` is the adapter, and `tests/catalog_service.rs` runs the same bodies against memory *and* a real file.

#### The Tauri shell (`crates/app`, P6)

A thin adapter and nothing more. When a function in it starts branching on the state of a Play, the branch belongs in the host — that is the whole test for which side of the line a change goes on.

```text
state         the four services behind one `Mutex<Host>`, and the only clock (`now_ms`)
commands/     the §13 surface, one file per service
emit          host → webview events; the only sender
guard         which webview may call what (§5.7)
windows       the two webviews, and moving the Stage one between displays
monitors      `availableMonitors` + `toLogical(scaleFactor)` → `MonitorInfo`
tick          the 100ms show loop and the 1s monitor watch
decor · demo · error
```

- **A plain `#[tauri::command]` runs on the main thread**; only `#[tauri::command(async)]` moves off it. Every command that can reach the database is `(async)` — `play_persist` is a ~2.5 ms fsync and follows every command that appends. `get_state` and `settings_get` stay synchronous.
- **`Host::write` persists only when the log grew.** That is why the show loop never touches disk: the 100ms tick goes through the same path and appends nothing 999 times in 1000. The emission is deduplicated too, so an idle Play costs nothing on the wire.
- **One lock, not four.** Every service is single-writer and the operator is one human; one lock makes every command atomic against every other and makes lock order unspellable.
- **`main` gets `PlayStateForStage` + `OperatorState`; `stage` gets the stripped shape.** A leak here is a leak on camera. The event **log** is in neither — Timeline reads it with `play_events`.
- **Tauri does not gate app-defined commands behind capabilities**, so `guard::allow` is the §5.7 boundary: the `stage` label may call only `STAGE_COMMANDS` (`overlay_ack_complete`, `stage_ready`), and an unknown label is treated as Stage. Keep that list identical to `packages/contract`.
- `crates/app/src/demo.rs` + `seed_demo_library` are a **dev-build harness** so P6 can be run before P7 has library tabs; §10's sample catalog replaces them.

#### The Studio shell as built (`apps/studio`, P7)

The design file is `docs/v1/05_STUDIO_DESIGN.md`; this is the part a later phase must not undo.

```text
host/     host.ts (command/on over an injectable HostTransport) · types.ts (wire shapes,
          mirrored from the Rust serde attributes) · queries.ts (TanStack Query keys + hooks,
          catalog/recipe/settings/monitors/plays only) · playState.ts (play-state as a
          useSyncExternalStore store) · commands.ts (useHostCommand: a refusal becomes a
          notice) · bridge.tsx (the one event subscriber) · fake.ts (in-memory host, the
          second adapter) · devFake.ts (`?fake` on a dev URL)
chrome/   nav.ts (typed route stack, back/forward, guard) · chrome.ts (sidebar, theme,
          grid|table per tab — persisted per operator) · notices.ts (§14 owner) · theme.ts
copy/     every operator-readable string
atoms → molecules → organisms → templates → pages   (eslint-enforced, one way)
```

- **Three stores, three jobs, and none of them is the Play.** TanStack Query holds catalog reads and is invalidated by `catalog-changed` / `recipe-changed` in `bridge.tsx` — no component refetches after a write. `play-state` is `playState.ts`, read with `usePlayState()` by organisms and pages. Zustand holds chrome; `chrome.test.ts` fails on any Play-shaped key. The tests behind the P7 exit criteria are `host/bridge.test.tsx`, `host/queries.test.ts` and `chrome/chrome.test.ts`.
- **The active operator is host truth** (`settings_get.globals.active_operator_id`, written with `settings_set_global { key: 'active_operator_id' }`). The chrome store keys its per-operator document off it. Pin gating is P10.
- **`OperatorState.recipeId`** is how Studio knows which recipe a Play runs. The Game page freezes itself when that recipe's Play is `playing|paused`; the top bar names it.
- **Every interactive atom takes `disabledReason`** and renders it as a tooltip on a still-visible control (§4.2). `SettingRow` turns the host's `disabled` entry into that text with `disabledReasonText`; nothing recomputes an interlock.
- **A refused command is a notice, never a toast.** `useHostCommand` routes `CatalogError::Invalid`'s `<path>: <reason>` to the field with that path (`noticesAt`); `block` severity opens the dialog; the rest go to the collector and the status bar. There is no Toast in Studio.
- **Editors are `useDraft` + `useDirtyGuard`** (one form state, dirty by structural comparison, a nav guard until Save / Discard / Keep editing), with `EditorFooter` pinned inside the scroll column. An organism never imports a template — that is a lint error — so editors render their own `PageHeader` and footer and the page wraps them in `RecordPageLayout`.
- **Organisms may not import `@/templates`**, and atoms/molecules may not import `@/chrome`'s nav or host anything. `LibraryList` takes `RecordView` rows; each page maps its entity to that shape once.
- **Icons are generated** (`npm run studio:icons` → `atoms/icons.generated.ts`) from the keys in `atoms/icons.ts`; there is no icon runtime and no `@iconify/react`. Calligraph is imported only by `packages/text/src/studio.tsx`.
- **Fields on panels:** `studio.css` gives fields a hairline edge and, in dark, a lifted background. Do not "restore HeroUI defaults" here — the shipped dark theme makes an unfocused input on a surface invisible.
- `DevHarness` (dev builds only, under Control) is the P6 harness restyled; P8's Control replaces it.

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

Overlay kinds (`token-handoff`, `round-advance`, `multiple-answers`, `outcome`, `current-team`) are enqueued automatically by their cause **and** callable by the operator at any time over any screen with `show_overlay`. `outcome` is half-screen and transparent so the question stays visible.

## Design system

Import the token files rather than hardcoding values. The palette is a stark black-on-white base (`--ink`, `--paper`, `--gray-500/200`) plus semantic states (`--state-correct` green, `--state-incorrect` red, `--state-info` blue, `--state-leader` gold, `--state-accent` yellow). Type is Space Grotesk (display) / Space Mono, with a very large Stage-oriented scale (up to `--text-mega` 160px) and negative tracking tokens. Spacing is an 8px base; radii are small (0/4/8px) and borders are heavy (1/2/3px).

## Planned stack (locked in `optimized_first_spec.md` §7; installed per phase)

**Host** — Rust stable, Tauri 2, `@tauri-apps/api` (`availableMonitors`, `WebviewWindow`, `emitTo`, `listen`, `convertFileSrc`; convert physical `Monitor` pixels with `toLogical(scaleFactor)`), `serde`, `tokio`, `rusqlite` (`bundled`), `thiserror`, `tracing`, `uuid`, `tantivy`. **`rusqlite`, not `tauri-plugin-sql`** (decided 2026-09-05): the plugin needs Tauri inside the host crate and hands the webview its own SQL API — a second writer of the catalog. WAL + `synchronous = FULL`, one writer connection behind a `Mutex` inside `CatalogService`, handwritten forward-only migrations on the `user_version` pragma. **Installed (P6):** `serde`, `serde_json`, `thiserror`, `uuid`, `rusqlite` (`bundled`), `tantivy`, `tracing`, `proptest` in `crates/host`; `tauri`, `tauri-build`, `tokio`, `tracing-subscriber` in `crates/app` — edition 2024, workspace deps in the root `Cargo.toml`. **`tokio` waited for P6 on purpose**: nothing in the host is asynchronous (`rusqlite` and Tantivy's writer are both sync, and avoiding async catalog calls was half the reason for choosing `rusqlite`), so until something awaited, a runtime was weight rather than readiness. What awaits is Tauri's async commands and the 100ms tick.

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

Explicitly **dropped**: `@svgdotjs/svg.js`, `framer-motion`, legacy dnd-kit, haptics, Three.js in v1. **`matter-js` is Stage decor only**: the decorative bodies (`apps/stage/src/decor/`) live in a matter world that runs for the life of a screen — `collide` by default, `collide-attract` as a per-recipe option, both tuned by `StageDecorSettings` in play-state. It never touches anything whose truth is game state, never reports `anim-complete`, and writes DOM transforms directly so React does not re-render per frame.

## Product constraints

Offline-first, desktop-only, Windows and macOS. GPLv3, open source, **monorepo** (Rust host + Studio webview + Stage webview in one repo). Not a live-broadcast tool — the show is recorded and post-produced, and the same binary should also work for a classroom or a group of friends. Stage is a separate fullscreen `WebviewWindow` created on first Control Load (not at boot), sent to a chosen real monitor; one display is a valid fallback (Stage fullscreen, Studio via Alt-Tab). Unplugging the Stage monitor pulls the window back and raises a notice — the Play stays `playing`.

Persistence is atomic: events append first, projections rebuild on boot, recipe save is one transaction, layout auto-save debounces 400ms into one `rev`. Hard delete is not v1.

Background health monitoring stays silent until there is an error, warning, or something the operator must know. Notices are one frontend family: host emits `{ code, severity, target_path, actions[] }` with **2, max 3** solve actions; further confirms stack inside the same component rather than opening a new dialog. Uninstall offers separate removal of app files and generated user files.
