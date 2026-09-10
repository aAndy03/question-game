# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository status

**P0–P11 are done, plus P11.1, P11.2, P11.3 and P11.4** (`docs/v1/04_ROADMAP.md`). npm workspaces monorepo, GPLv3. **The two tracks met at P6:** Stage no longer reads fixtures, it reads the host. `crates/host` holds `MatchService`, `FlagService`, `CatalogService` and `PresentationService` and is still a plain library with zero `tauri::` imports; `crates/app` is the Tauri 2 shell around it. **P7 built the Studio shell** — sidebar, top bar, status bar, the four library tabs (Teams, Domains+Questions, Games, Operators), one component system (`docs/v1/05_STUDIO_DESIGN.md`). **P8 built the Control tab** — the mosaic, the Viewer (the real Stage in an iframe), the Action Panel, Strips, Timeline, the settings float, hotkeys (`05_STUDIO_DESIGN.md` §10). **P9 built the Screens canvas** — the recipe layout document, `play-state.layout`, the root DOM applier on Stage, the canvas with handles, inspector and decor dials (`05_STUDIO_DESIGN.md` §11). **P10 built everything around a show** — first run, the Settings tab, pins, the notice family, audio behind the cue key, health, and the Demo seed (`05_STUDIO_DESIGN.md` §12). **P11 built Statistics** — `stats_query`, the Live and All-data views, the charts, and the optional Statistics window (`05_STUDIO_DESIGN.md` §13). **P11.1 fixed what the first end-to-end runs of the Demo found** — the event target leak, the leaked subscriptions, the resolved-session lock-out, the overlay queue's value-keyed jam, the dead end at the end of a Play, and the missing way out of Control; `crates/host/tests/demo_scenarios.rs` is the replay suite that holds them down. **P11.2 fixed what operating the built app found next** — the Control panels that got worse as they got wider, the settings float's one-word-per-line rows, the Game panel dropping the score to fit, an operator whose Play count was a counter nobody incremented, and an editor that asked whether to save *after* saving. **P11.3 made the controls controls** — the settings switches that rendered as inert markup, the table rows that painted square over a rounded container, and the Archived freeze: `LibraryList` handing TanStack Table a new `[]` every render while a query was still open, which the table's microtask-queued page-index reset turned into a re-render loop that never yielded to the host's reply. **P11.4 found why Studio grew to 2.8 GB over three Plays** — not a store, not the tick, not the Viewer: React's *development* build calls `performance.measure()` for every component whose props changed on every commit, browsers never trim the user-timing buffer, and 1.9 million `PerformanceMeasure` entries at ~1.4 KB each is the whole number while the JS heap sat at 40 MB. Both webviews now sweep the buffer every 2 s and write a memory line every 30 s, and the host logs the working set of its process tree; `scripts/leak-probe.mjs` is the CDP harness that found it. P12 (packaging and release) is next.

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

`npm run dev:app` starts both Vite dev servers itself (`beforeDevCommand` → `scripts/dev-webviews.mjs`). That script spawns Vite's own entry with this Node — no npm wrapper, no shell — because closing the app terminates the tree, and an npm wrapper answers a terminated child with a "Lifecycle script `dev` failed" block that reads like a crash; a child killed on shutdown now exits 0 quietly, while a real crash still takes the other server down. `npm run dev:stage` on its own has no Rust behind it and falls back to the P2/P3 fixture strip — that is the point: screen work does not need a database. **`npm run dev:studio` with `?fake` on the URL** (`http://localhost:5181/studio/?fake`, dev builds only) installs the in-memory host with a demo library, so shell work does not need Rust either; without `?fake` Studio says "No host". `npm run studio:icons` regenerates `apps/studio/src/atoms/icons.generated.ts` after a key is added to `atoms/icons.ts`. **`?fake&play=<fixture>`** (a `packages/contract` fixture name, e.g. `question-issued`) also hands Control a Play to draw, and `?fake` always carries a canned `stats_query` answer so the Statistics tab has something to render.

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

Frontend → host is `invoke("lock_selection", …)`. Host → Stage is `emitTo("stage", "play-state", …)` (stripped); `"main"` gets the same shape plus `operator` (`OperatorState`) — legal token targets, undo/redo availability, the §4.2 `disabled` list. Other events: `catalog-changed`, `recipe-changed`, `health`, `monitors-changed`, `notice`, `anim-complete`, to `main` — and `play-state`, `catalog-changed` and `recipe-changed` also to `stats`, which is Studio on another display and draws Live from the same shape. **Each webview must listen as its own label** (`{ target: { kind: 'AnyLabel', label } }`): a bare `listen()` registers `EventTarget::Any`, and Tauri lets an `Any` listener past the `emit_to` filter entirely, so Studio would receive the stripped Stage emission (no `operator` — every organism reading it throws) and Stage would receive the operator half on camera. Stripping in `emit.rs` is only half of §5.7; the target is the other half. The Viewer click and the Action Panel button and the keyboard chord are three call sites of one command — that shared interface is the point.

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
- **The queue counts occurrences, not values** (`StageOverlay.run_id`, contract v5). Two identical requests are two runs: `round-advance` on the same round, or the operator pressing one overlay button twice, produce an `active` equal by value to the run that just finished. Keyed on the value, Stage saw "still the same run", played nothing, acked nothing — and since the queue advances only on an ack, every overlay for the rest of the Play sat in `pending` (2026-09-07). `run_id` is bumped in `run()`, the one place a request goes on air, and `OverlayLayer` keys on it.
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
- **An operator's `plays_run` is derived, not stored.** It is `COUNT(*)` over `plays` rows with a `started_at_ms` and that operator's `operator_id`, which the log supplies (`play_load` appends `OperatorSwitched`, `restart` carries it over). The `operators.plays_run` column is still in the schema and nothing reads it — it was a counter no command ever incremented, so every operator had run 0 Plays.
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

- **Every command is `#[tauri::command(async)]`. There are no synchronous ones left** (reversed 2026-09-08). A plain `#[tauri::command]` runs on the **event-loop thread**, which is the thread that pumps window messages: while it waits, the app does not repaint, does not take input and cannot even be reloaded. `get_state`, `settings_get`, `health_get` and `monitors_list` were synchronous because they are cheap — but cheapness was never the question, *who is waiting* was. Each took the host lock, so any other command holding it turned into a frozen window rather than a slow reply, and the freeze landed on whatever the operator happened to click. `AppState::lock` now `debug_assert!`s it is not on that thread, so a plain command added later panics in dev with its own name on the stack instead of hanging a show. The old reason still holds too: everything that can reach the database is async because `play_persist` is a ~2.5 ms fsync after every append.
- **`Host::write` persists only when the log grew.** That is why the show loop never touches disk: the 100ms tick goes through the same path and appends nothing 999 times in 1000. The emission is deduplicated too, so an idle Play costs nothing on the wire.
- **One lock, not four.** Every service is single-writer and the operator is one human; one lock makes every command atomic against every other and makes lock order unspellable.
- **`main` gets `PlayStateForStage` + `OperatorState`; `stage` gets the stripped shape.** A leak here is a leak on camera. The event **log** is in neither — Timeline reads it with `play_events`.
- **Tauri does not gate app-defined commands behind capabilities**, so `guard::allow` is the §5.7 boundary: the `stage` label may call only `STAGE_COMMANDS` (`overlay_ack_complete`, `stage_ready`), and an unknown label is treated as Stage. Keep that list identical to `packages/contract`.
- **One library, one process.** SQLite in WAL lets several processes open the same file, and a second `dev:app` on a taken port still starts the binary — so two copies ran at once on 2026-09-08, both migrating, both rebuilding projections, both reindexing, and one listed six teams the file did not contain. `state::take_single_instance_lock` takes an exclusive OS lock on `questiongame.lock` before anything opens the database and holds it for the life of the process; a second instance refuses to start and says why.
- **`crumb()` is for a hang, `onPageCommit` is for a loop.** A render that never returns completes no commit, so the Profiler watchdog counts nothing and no effect runs — the log shows the click and then silence. `crumb()` posts *before* the step it names, so the last crumb in the file is the step that did not return. `LibraryList` traces its render this way; `setArchiveScope` crumbs the click itself. **A crumb posts on `window.__TAURI_INTERNALS__.invoke`, synchronously** — not through `HostTransport`, whose `invoke` `await`s a dynamic `import()` first. Inside a task that never yields, that microtask never runs, and every crumb of the render that hung was lost along with the click's own (2026-09-08). Keep the diagnostics path direct.
- **A hung webview can be inspected from outside.** Windows debug builds start WebView2 with `--remote-debugging-port=9222` (`windows::debuggable`, through the builder because wry sets `AdditionalBrowserArguments` itself; `QUESTIONGAME_DEBUG_PORT` overrides), and `npm run js-stack` attaches over CDP, sends `Debugger.pause` — a V8 interrupt, delivered even inside a loop that never yields — and prints every frame. Release builds add nothing.
- **The webview logs to the same file.** `client_log` (§13, callable by every webview because it touches nothing) writes a line through the host's `tracing`, and `chrome/diagnostics.ts` feeds it three things: uncaught errors, rejected promises and `console.error`/`console.warn` (deduplicated — a render loop emits one warning ten thousand times), and a **render-loop watchdog**. The watchdog counts React commits through a `Profiler` around the routed page: past 120 commits in a second the page is spinning rather than rendering, and it says so once with the route and the heap. A webview's console dies with the window and a wedged window cannot be inspected, so this is the only way any of it survives.
- **Memory is measured, not inferred, and the JS heap is the wrong number.** Studio grew to 2.8 GB over three Plays while `usedJSHeapSize` stayed at 40 MB (2026-09-09): the growth was 1.9 million `PerformanceMeasure` entries — Blink objects, invisible to V8's counters — that React's development build creates with `performance.measure()` for every component whose props changed, on every commit, and that the browser never trims. Three things hold it down. Both webviews **sweep the user-timing buffer every 2 s** (`chrome/diagnostics.ts` in Studio, `diagnostics.ts` in Stage — Stage's matters because the Viewer iframe has a `performance` of its own); nothing in the app reads that buffer, so do not start. Both write a **memory line every 30 s** through `client_log` (heap, live DOM elements, commits and entries swept, each as a rate per minute). And `crates/app/src/memory.rs` logs the **working set of the host process and every WebView2 child** every 30 s with its rate — the number Task Manager shows. A leak is a `mbPerMin` that never comes down; read those lines before reading code. `scripts/leak-probe.mjs` is how this one was found: over CDP, counters under forced GC and heap snapshots diffed by constructor, per scenario, so a growth rate can be pinned to a part. The production build never measures; every show so far has run under `tauri dev`.
- **The app always logs to a file, at `debug`.** `npm run dev:app` does print stderr — but the default filter is `info`, and nothing in the app logs at `info` once it is up: every command's line is `guard::allow`'s `debug!`. So clicking around produced no output at all, and neither did a window that had stopped responding. `tracing_logging` runs inside `setup` (it needs Tauri to resolve the app-data directory) and installs two sinks: stderr at the quiet default (`RUST_LOG` overrides it), and `<app data>/questiongame.log` at **debug** for both crates. It **appends**, with a `---- run start ---- pid=…` banner: two copies of the app can be alive at once (a dev launch that failed on a taken port still starts the binary, and an orphan outlives the `tauri dev` that spawned it), they share this path, and truncating meant the newer process erased the older one's evidence — which is the evidence anyone is reading it for. A hang is then "the last line names a command that never came back" — and the file is still there after the window is killed.
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
- **A subscription is released, always.** Tauri keeps a JS listener registered on the Rust side until `unlisten` — a reload does not clear it, while the callback ids live in `window`, which a reload does clear — so a leaked subscription becomes `[TAURI] Couldn't find callback id …` on every emission, ten a second under the show loop. `host.ts` tracks every live `on()` and releases them on `pagehide`; `bridge.tsx` holds a `live` flag because `listen` resolves after StrictMode has already unmounted the first effect. Never push an unsubscribe from inside a `then` without one.
- **The active operator is host truth** (`settings_get.globals.active_operator_id`, written with `settings_set_global { key: 'active_operator_id' }`). The chrome store keys its per-operator document off it. Pin gating landed in P10.
- **`OperatorState.recipeId`** is how Studio knows which recipe a Play runs. The Game page freezes itself when that recipe's Play is `playing|paused`; the top bar names it.
- **Every interactive atom takes `disabledReason`** and renders it as a tooltip on a still-visible control (§4.2). `SettingRow` turns the host's `disabled` entry into that text with `disabledReasonText`; nothing recomputes an interlock.
- **A refused command is a notice, never a toast.** `useHostCommand` routes `CatalogError::Invalid`'s `<path>: <reason>` to the field with that path (`noticesAt`); `block` severity opens the dialog; the rest go to the collector and the status bar. There is no Toast in Studio.
- **Editors are `useDraft` + `useDirtyGuard`** (one form state, dirty by structural comparison, a nav guard until Save / Discard / Keep editing), with `EditorFooter` pinned inside the scroll column. **The guard reads `draft.isDirtyNow()`, not the rendered flag**: an editor saves and navigates in one act, and React has not re-rendered in between — reading the flag raised "unsaved changes" *after* the row was written, and answering Save ran the save body twice. For the same reason a **new** record's blank is minted once and never re-derived from a query: the second save landed on a draft the refetch had reset. An organism never imports a template — that is a lint error — so editors render their own `PageHeader` and footer and the page wraps them in `RecordPageLayout`.
- **Organisms may not import `@/templates`**, and atoms/molecules may not import `@/chrome`'s nav or host anything. `LibraryList` takes `RecordView` rows; each page maps its entity to that shape once.
- **Icons are generated** (`npm run studio:icons` → `atoms/icons.generated.ts`) from the keys in `atoms/icons.ts`; there is no icon runtime and no `@iconify/react`. Calligraph is imported only by `packages/text/src/studio.tsx`.
- **Fields on panels:** `studio.css` gives fields a hairline edge and, in dark, a lifted background. Do not "restore HeroUI defaults" here — the shipped dark theme makes an unfocused input on a surface invisible.
- **Toasts are Sonner** (`chrome/toast.ts`) and only for transient, action-free feedback (saved, restored, loaded into Control, layout reset). A notice with actions, a `targetPath` or `block` severity is never a toast.

#### The Control tab as built (`apps/studio`, P8)

- **The Viewer is the real Stage in an iframe** (`/stage/?viewer`), fed the stripped `PlayStateForStage` over `postMessage` (`packages/contract/src/viewer.ts`). Stage's `viewerHost()` is its third host adapter and **never acks**: the Stage window acks the overlay queue, the Viewer only reports node rects. Hit targets (`HitTarget`) are Studio DOM over the iframe, mapped node → command by the table in `05_STUDIO_DESIGN.md` §10.2. Do not put anything interactive in Stage's tree for the Viewer's sake — `viewer.test.tsx` diffs the two trees.
- **A resolved session is not a live one.** `play.session` is only ever *replaced* — by the next `QuestionIssued` — never cleared, because Stage goes on drawing the question with its outcome. `session !== null` is therefore true from the first question to the end of the Play, and reading it as "a question is in progress" locked the operator out of `choose_domain` for the rest of the show (2026-09-07). `host/session.ts` spells the host's own rule (`liveSession` · `isSessionLive` · `canChooseDomain` = issued **and unresolved**); the Viewer's domain targets, the number chords and the Action Panel all read it, and `crates/host/tests/demo_scenarios.rs` checks the predicate against the command at every beat of a turn.
- **`play_unload` is the way out of Control**, legal whenever a recipe is loaded. Anything not already closed is closed on the way out — a Play that vanished while `playing` would be resumed at boot, and a `loaded` row is reached by no cleanup — and `discard` deletes that one Play's log (`CatalogService::play_delete`), the only hard delete besides `wipe_plays`. **The Stage window is never touched**: it stays on its display and goes back to Idle, because `stage_state` is total (`stage::empty_game` when no Play is loaded) and `main`/`stats` get `null`.
- **A ring row says what it is** (`ringRole` in `host/ring.ts`): `holder · next · override · reveal-first · served · inactive · solo · closed`. The Action Panel and the Viewer both label from `RING_ROLE`, so "next in order" and "out of order" read the same wherever the operator meets them.
- **Control draws one phase at a time.** `controlPhase` (`host/session.ts`) is `ready · question · resolved · handover · standings · ended`; the Action Panel renders transport, that phase's one block, then the token rows. Disabled-with-a-reason is for an illegal control *within* a phase (§4.2); a control belonging to another phase is hidden, because the host would refuse it. `standings` is what a completed Play gets — *Reveal next place* (the lowest unrevealed rank, ties sharing one), *Show final leaderboard*, and Restart — and it replaced the spent question controls that left the operator stuck at the end of a show.
- **The Action Panel offers the next question.** One button per domain, from any screen: a correct answer leaves the token where it is and the usual next act is another question, so the operator is not required to be standing on ChooseDomain. Before it existed, a domain card in the Viewer was the only door.
- **One command, three call sites.** Hit target, Action Panel button and chord all call `useHostCommand().run`. `useControlHotkeys` is mounted by `ControlPage` only, `ignoreInputs: true`; chords come from `settings_get.globals.shortcuts` with `HOTKEYS.defaults` as the fallback.
- **The ring is derived, never stored** (`host/ring.ts`): history / current / future from `turnsTaken` and `roundIndex`; a drop is legal only future→future and `reorderedRing` builds the full order for `reorder_ring`. `RingRow` carries the nine spec variants; the variant is the whole visual state.
- **The mosaic is `react-mosaic`** restyled by `packages/design-studio/mosaic.css`; the tree is chrome, persisted per operator in `chrome/control.ts`. `MosaicPanel` measures its box and hands each panel a density; panels branch on it and never scroll horizontally.
- **Timeline** reads `play_events` through a Query keyed on `(playId, eventCount)`; the tick's `eventCount` is what refreshes it.
- **`useReactTable`'s `data` must be referentially stable, including while it is empty.** TanStack Table memoizes the core row model on the identity of `data`, and every change queues `resetPageIndex` on a *microtask*: a `setState`, a re-render, and — with `rows ?? []` — a new array, so another change. Nothing in that cycle is an update React would refuse as too deep, and it never yields to a task, so the host reply that would have filled `rows` never arrived: Studio froze on every Archived toggle whose list was empty, at ~120 commits a second (2026-09-08). `LibraryList` uses one module-level `NO_ROWS`; `LibraryList.test.tsx` renders the undefined-rows list three times and asserts three commits. The same rule holds for any array or object handed to a memoizing library from a render.
- **`?fake&slow=<ms>` answers every command a task later**, the way the real IPC does. A page that only stays healthy because the fake answers in a microtask is exactly the page that freezes in the app; test shell work with it before calling a loop "does not reproduce in a browser".
- **A panel wraps before it abbreviates, and steps down last.** `MosaicPanel` measures its tile and hands the panel a density, but a step down *removes information*, so the steps sit low (300px / 180px) and both strips wrap instead: `ScreenStrip` is a **detached, wrapping** `ToggleButtonGroup` — never `fullWidth`, because seven labelled screens fit no row the mosaic offers, and the tile clips horizontally by design (§8) — and `OverlayStrip` keeps every pill's whole label. `RingRow` keeps the score at every density. The render prop also gets the measured box, which is how the Game panel steps its rows down when the *roster* outgrows the tile's height rather than its width.
- **Armed states** (Reveal & pass, restart, abandon) are component state and reset on unmount; nothing on Control is remembered except the layout.

#### The Screens tab as built (P9)

- **`recipe.layout` has a shape now**: `packages/contract/src/layout.ts` (`version · decor · nodes · screens`); `parseLayout` is the validator and drops anything foreign. The host still stores it opaquely and passes `{ nodes, screens }` through as `play-state.layout` (`PresentationService::set_layout`, next to `set_decor`; both are set at `play_load` and `recipe_set_layout`).
- **Stage applies overrides in one place**: `apps/stage/src/layout/apply.ts` writes inline styles onto `[data-node-id]` elements and re-applies after re-renders. Offsets are the `translate` property — never `transform`, which GSAP owns. Do not add per-component style merging; add a node id and the applier covers it.
- **The canvas is the Viewer again** (same iframe, same protocol) fed a preview Play from `host/previewPlay.ts`; `NodeHandle`s are Studio DOM and never enter the saved document. Decor nodes get no handle — the dials tune them.
- **Auto-save** is one `recipe_set_layout` per 400ms debounce, one `rev`; `LayoutEditor` keeps the draft dirty until the host confirms.
- **DialKit is not used** (it needs its own panel to render); dials are `SliderField`.

#### Settings, first run, notices, audio, health as built (P10)

The design is `docs/v1/05_STUDIO_DESIGN.md` §12; §12.11 records the departures. What a later phase must not undo:

- **`run` is the payload, `run.ok` is the verdict.** Most §13 commands answer `()`, which reaches the webview as `null` — the same `null` `useHostCommand` returns for a refusal. A `()` command therefore asks `run.ok(name, args)`; `await run('play_load', …) !== null` is always false. Commands that answer with a value (`wipe_plays`, `catalog_upsert`, `catalog_seed_demo`, `recipe_set_layout`) still read `run(…)`.
- **First run latches in `App`.** The operator step creates and activates a row, so the condition that raised the wizard goes false mid-flow; `App` keeps the wizard up until `FirstRunPage` reports `onDone`. Do not "simplify" it back to a derived boolean — the sample and defaults steps disappear.
- **The Demo lives in the host** (`crates/host/src/catalog/seed.rs`, `seed_demo` with `missing` | `overwrite`, rows `origin = seed`), and replaced P6's dev-only `crates/app/src/demo.rs`. **Restore Demo** in Settings asks `catalog_seed_status` first; an edited seed row is only overwritten after a confirm.
- **A pin is hashed in the host and nowhere else** (`crates/host/src/operator.rs`, argon2id). Studio sends the digits as typed; the row carries an opaque `pin_hash`. A gated command (`wipe_plays`, `uninstall_data`) refuses a loaded Play **before** it looks at a pin — the pin is not what protects the show — and no gated command can touch a live Play.
- **Audio's interface is the cue key.** `apps/stage/src/audio/port.ts` has two adapters — `howlerAudio` on the Stage window, `silentAudio` in the Viewer, the fixture strip and tests — and cues are derived from a play-state diff (`cuesFor`). `feat.audio.synth` is a switch with nothing behind it: `no-synth.test.ts` greps the Stage tree for the synthesis APIs, so keep the placeholder pack generated offline by `scripts/audio-placeholders.ts`.
- **Health is chrome, not Play.** `crates/host/src/health.rs` is silent until there is something to say and pairs every item with at least one action; `chrome/health.ts` keeps only the headline for the status dot, and the items are ordinary §14 notices, replaced wholesale on each report.
- **`settings_get.disabled` is the only source of a disabled reason**, in the fake host too — Studio renders it and never recomputes an interlock.

#### Statistics as built (P11)

The design is `docs/v1/05_STUDIO_DESIGN.md` §13. Statistics is a **projector**, and that is enforced on both sides:

- **One command, one document.** `stats_query` takes `{ filter, groupBy, metrics, limit }` and answers `{ rows, totals, playCount, turnCount }`. The same command feeds the Live tiles, the All-data table, the entity cards and every chart — there is no second stats verb, and no `StatsService`, because Statistics owns no state.
- **`crates/host/src/stats.rs` is a pure fold**, next to `play.rs`: `facts(events) -> [TurnFact]` (one resolved turn each, with the snapshot's names and difficulty) then `aggregate(facts, query)`. `CatalogService::stats_query` only decides which logs to read — SQL stays in `catalog/store.rs`. An **undone turn is not a fact** (the same inversion spans the projection uses), a metric with nothing to average is `None` **not zero**, and a rehearsal (one team) is excluded unless asked for.
- **Rows are relabelled from the catalog** (`relabel`): the fold labels a row as the Play knew it, and §12's "rename team → Statistics" is that one lookup. A row whose subject was archived keeps the Play's label.
- **Studio cannot write here.** No file under the Statistics surface imports `useHostCommand` — `pages/statistics.test.tsx` greps for it — and the host refuses regardless: `guard::STATS_COMMANDS` is the read-only list the `stats` webview may call.
- **The Statistics window is Studio, not Stage**: `studio/index.html?stats`, the same bundle and tokens, the Statistics page alone. **The operator opens it and nothing else does** — `stats_window { open }` is the only door, `stats.monitor_id` says where it would go and `stats.fullscreen` how, and a display coming back never re-opens a window that was closed. Whether it is up is window state (`monitors-changed.statsOpen` → `chrome/windows.ts`), never a setting. Stage's display is refused; unplugging its own closes it with a notice and touches no Play. It is addressed like any other webview: `emit::play_state` sends it the `main` shape and the two catalog events, and it listens as `stats` (it used to see everything only because a bare `listen()` is an `Any` listener).
- **Never touch a window or the display list while the host lock is held**, and the rule is now enforced: `AppState::lock` hands back a `HostGuard` that counts itself, and `state::assert_unlocked` — called by `windows::ensure_stage` / `open_stats` / `close_stats` / `open_studio` / `apply` / `place` and by `monitors::list` / `physical_origin` — is a `debug_assert!`, so a violation is a panic naming the call site instead of a hang. Every one of those pumps the OS message loop, and pumping it dispatches whatever IPC the webview has queued; if that is one of the **synchronous** commands (`get_state`, `settings_get`, `health_get`, `monitors_list`, `catalog_seed_status`) it runs on the *same* thread and calls `lock()`, which is a plain non-reentrant `Mutex`. The app then waits for a guard only that thread can release: no repaint, no input, not even a reload, and no second thread to blame in a dump. `windows::refresh` therefore takes `&AppState` rather than a guard — read the OS, decide under one short lock, then act (2026-09-08; it had been violated by `monitors_list`, `stage_set_monitor`, `play_load` and the monitor watch).
- **ECharts is imported in exactly one file** (`molecules/StatsChart.tsx`), themed from the Studio CSS variables; a test pins that. EvilCharts is not installed.

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

**A HeroUI v3 control is only a control if its interactive subcomponent is rendered.** `Switch`'s root is React Aria's `SwitchField` — no input, no ARIA — and the clickable `SwitchButton` is **`Switch.Content`**; render it always and put the control inside it, or the switch is a `<div>` that cannot be pressed and reports nothing. Assert the *role* in a test (`getByRole('switch')`), never just that the thing is on screen.

**Two HeroUI v3 overlay rules, learned the hard way:** the **trigger is the button itself** — `Dropdown.Trigger` / `Popover.Trigger` wrap their child in a pressable of their own, so a `Button` inside one is two nested `<button>`s — and a **controlled overlay starts at `.Backdrop`**, with no `<Drawer>` / `<AlertDialog>` root, because the root exists only to wire a trigger and otherwise warns `PressResponder without a pressable child` on every render.

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
- **ECharts** (`echarts`, P11) isolated under Statistics, read-only — imported by `molecules/StatsChart.tsx` and nowhere else. EvilCharts is not installed: it is a Recharts component collection, and one themed wrapper is less surface than a second chart runtime.

Explicitly **dropped**: `@svgdotjs/svg.js`, `framer-motion`, legacy dnd-kit, haptics, Three.js in v1. **`matter-js` is Stage decor only**: the decorative bodies (`apps/stage/src/decor/`) live in a matter world that runs for the life of a screen — `collide` by default, `collide-attract` as a per-recipe option, both tuned by `StageDecorSettings` in play-state. It never touches anything whose truth is game state, never reports `anim-complete`, and writes DOM transforms directly so React does not re-render per frame.

## Product constraints

Offline-first, desktop-only, Windows and macOS. GPLv3, open source, **monorepo** (Rust host + Studio webview + Stage webview in one repo). Not a live-broadcast tool — the show is recorded and post-produced, and the same binary should also work for a classroom or a group of friends. Stage is a separate fullscreen `WebviewWindow` created on first Control Load (not at boot), sent to a chosen real monitor; one display is a valid fallback (Stage fullscreen, Studio via Alt-Tab). Unplugging the Stage monitor pulls the window back and raises a notice — the Play stays `playing`.

Persistence is atomic: events append first, projections rebuild on boot, recipe save is one transaction, layout auto-save debounces 400ms into one `rev`. Hard delete is not v1.

Background health monitoring stays silent until there is an error, warning, or something the operator must know. Notices are one frontend family: host emits `{ code, severity, target_path, actions[] }` with **2, max 3** solve actions; further confirms stack inside the same component rather than opening a new dialog. Uninstall offers separate removal of app files and generated user files.
