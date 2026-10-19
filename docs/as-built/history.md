# Phase history

What each phase built and why, in order. `docs/v1/04_ROADMAP.md` is the plan and its exit criteria; this is the story.

**P0–P11 are done, plus P11.1 through P11.18** (`docs/v1/04_ROADMAP.md`). npm workspaces monorepo, GPLv3. **The two tracks met at P6:** Stage no longer reads fixtures, it reads the host. `crates/host` holds `MatchService`, `FlagService`, `CatalogService` and `PresentationService` and is still a plain library with zero `tauri::` imports; `crates/app` is the Tauri 2 shell around it.

**P7 built the Studio shell** — sidebar, top bar, status bar, the four library tabs (Teams, Domains+Questions, Games, Operators), one component system (`docs/v1/05_STUDIO_DESIGN.md`).

**P8 built the Control tab** — the mosaic, the Viewer (the real Stage in an iframe), the Action Panel, Strips, Timeline, the settings float, hotkeys (`05_STUDIO_DESIGN.md` §10).

**P9 built the Screens canvas** — the recipe layout document, `play-state.layout`, the root DOM applier on Stage, the canvas with handles, inspector and decor dials (`05_STUDIO_DESIGN.md` §11).

**P10 built everything around a show** — first run, the Settings tab, pins, the notice family, audio behind the cue key, health, and the Demo seed (`05_STUDIO_DESIGN.md` §12).

**P11 built Statistics** — `stats_query`, the Live and All-data views, the charts, and the optional Statistics window (`05_STUDIO_DESIGN.md` §13).

**P11.1 fixed what the first end-to-end runs of the Demo found** — the event target leak, the leaked subscriptions, the resolved-session lock-out, the overlay queue's value-keyed jam, the dead end at the end of a Play, and the missing way out of Control; `crates/host/tests/demo_scenarios.rs` is the replay suite that holds them down.

**P11.2 fixed what operating the built app found next** — the Control panels that got worse as they got wider, the settings float's one-word-per-line rows, the Game panel dropping the score to fit, an operator whose Play count was a counter nobody incremented, and an editor that asked whether to save *after* saving.

**P11.3 made the controls controls** — the settings switches that rendered as inert markup, the table rows that painted square over a rounded container, and the Archived freeze: `LibraryList` handing TanStack Table a new `[]` every render while a query was still open, which the table's microtask-queued page-index reset turned into a re-render loop that never yielded to the host's reply.

**P11.4 found why Studio grew to 2.8 GB over three Plays** — not a store, not the tick, not the Viewer: React's *development* build calls `performance.measure()` for every component whose props changed on every commit, browsers never trim the user-timing buffer, and 1.9 million `PerformanceMeasure` entries at ~1.4 KB each is the whole number while the JS heap sat at 40 MB. Both webviews now sweep the buffer every 2 s; `scripts/leak-probe.mjs` is the CDP harness that found it.

**P11.5 built the performance log** — one JSON line a second in `<app data>/perf/`, every build (host-side only in a release, P12.1): the process tree from `sysinfo`, the host's commands, lock times, emissions and persists from a `tracing` layer, each webview's heap, DOM, commits, components and long tasks from `perf_report`, and a `spike` section only on a second that crossed a threshold.

**P11.6 made Stage fit the display it is sent to** — the canvas is still a fixed 1920×1080 design surface, but `templates/StageFit.tsx` now scales it into whatever viewport the window has instead of laying it out at 1:1 and clipping; and the display list carries the panel's physical mode next to the logical size, because a 1080p TV at Windows' default 150% is a 1280×720 CSS viewport and was being reported — and drawn — as a 720p display.

**P11.7 fixed the fluctuation P11.5's own log exposed** — not a leak: Control was re-rendering 28 times a second because the store handed every `usePlayState()` consumer a new object on every 100ms emission, when the only thing that moved was the countdown.

**P11.8 fixed a health warning that was the app's own doing** — StrictMode's double-mount unloads the eight cue `Howl`s mid-preload, Howler reports each aborted decode as a load error, and `missing_cues` had no way back, so the status dot sat amber over an empty notices panel for the life of the process while the audio played perfectly.

**P11.9 split the wire** — `play-state` is event-driven now and the 100 ms show loop sends `play-tick`, two numbers, because a tick that cannot fire the T=0 table cannot have changed anything else; the host stopped projecting the whole Play three times a tick to discover the countdown had moved.

**P11.10 applied the same split to Stage** — two components draw a clock and the rest of the tree was rebuilding ten times a second alongside them — and stopped the Viewer running a second physics world at 60 Hz for a preview nobody films.

**P11.11 put Stage on several displays at once** — the operator has two audience screens and no HDMI splitter, so the app is one: a **pacer** (`stage`) and N **mirrors** (`stage-2`, …) showing the identical picture.

**P11.12 made the rules legible and the awards explainable** — the operator could set fourteen keys that move a number, four of which silently neutralise others, and one of which (`difficulty_map` set to Bands) rendered *nothing at all* in Game ▸ Rules; the formula now lives in one place (`crates/host/src/explain.rs`, with `award_points` as `explain(..).points`), `rules_preview` says what a recipe would pay before a Play and `stats_query { detail }` says what it did pay and why after one.

**P11.13 locked one question per difficulty per domain on a board** — two difficulty-10 history questions on one board are two rungs of the easy→hard walk that are the same rung, since teams choose a *domain* and the award never reads which question it was; the library keeps every twin it holds, and `crates/host/src/board.rs` is the one place the rule is spelled.

**P11.14 fixed a Play counter nobody wrote** — `teams.play_count` was a stored column with a `DEFAULT 0` that no command ever incremented, so the Teams tab said 0 Plays for a team that had played all season; it is derived from the `plays` projection now, the same fix `operators.plays_run` got in P11.1.

**P11.15 taught Stage Romanian** — every authored string on Stage (HUD labels, screen titles, verdicts, tags; never a team, domain or question) now lives in one table per language in `apps/stage/src/copy/tables.ts`, `stage.language` is a Game-tab key that stays live, and `play-state.language` (contract v7) picks the table through one `CopyProvider`.

**P11.16 made the show's own words editable** — the eyebrow every header carries, the tagline, the session line, the screen titles, the two labels on a team row and the word before a domain are edited from the Screens Inspector per language and saved as `layout.text` (contract v8), merged over the table in `resolveCopy` and nowhere else; and the five overlays joined the Screens tab, drawn at rest by the canvas iframe's `?viewer&hold`.

**P11.17 let the library hold what is not ready yet** — a question may lack text, options, a correct answer, a difficulty or a domain and still be stored, marked, filtered and finished in the editor, but never go on a board; `catalog_import_questions` brings in many from one JSON file, previewed then written as one transaction; and a second sample game, *Demo (Română)*, ships beside the English one.

**P11.18 named the panels and found the recorder** — an Atomos plugged into the laptop arrived as a Windows *Duplicate* of the built-in panel, which is one display to `available_monitors`, so it showed the picture and appeared in no list; `crates/app/src/topology.rs` reads `QueryDisplayConfig` and `MonitorInfo` now carries `friendlyName` (the EDID name, never the key) and `alsoOn` (the Duplicate group), a connected panel Windows is not using is `health.display_unused`, and `windows::refresh` logs every display the OS handed over.

**P12.0 built the installer** — `npm run release` runs `tauri build` and produces `target/release/bundle/nsis/questiongame_1.0.0_x64-setup.exe`, a per-user NSIS installer; the installed app is `org.questiongame.desktop` and the dev build stays `org.questiongame.app` (`crates/app/tauri.dev.conf.json`, passed by `npm run dev:app`), so the two never open each other's library, and `identity::check` refuses a binary that carries the wrong one for what it is. `boot::fail` shows a boot failure in a message box (a release build has no console) and `boot::install_panic_hook` writes every panic to the log.

**P12.1 made the installed app report on itself** — it keeps a host-side performance log (`"build": "release"` on every line, ten runs and 100 MB kept), its webviews compile out everything diagnostic except error forwarding, `questiongame.log` rotates past 10 MB, and Settings ▸ Data shows where the library, the log and the perf log live.

**P12.2 made it behave like an installed app** — a second launch focuses the running Studio (`tauri-plugin-single-instance`), closing Studio asks first when an editor is dirty or a game is loaded and a second press exits regardless, *Remove generated data* also clears the WebView2 profile, and Settings ▸ Data offers *Uninstall questiongame…* where the Windows uninstaller sits beside the exe. The version is 1.0.1.

**P12.3 made it shippable** — `npm run build` audits every shipped dependency's licence and writes the third-party notices, Settings ▸ About shows the version, the GPL, the GSAP permission and those notices, `npm run release:check` refuses a `dist/` that loads from the network or ships dev code, and `.github/workflows/release.yml` builds the Windows installer and a universal macOS disk image on a `v*` tag and publishes both as a GitHub Release.

**P12.4 checked the 1.0.1 installer on Windows** — one process on a second launch, the close guard round-trip, a host-only perf log, and the dev library untouched; a full Play, three-Play memory, the uninstall outcomes, offline and macOS remain the operator's to run (`04_ROADMAP.md`).

**P12.5 brought every dependency a month forward** for 1.0.2 — Vite 8, Vitest 4, ESLint 10, TypeScript 6, rusqlite 0.40, Tantivy 0.27, argon2 0.6 and the rest — holding back only TanStack Table 9 (an API rewrite of the table P11.3 fixed) and TypeScript 7 (`typescript-eslint` stops at 6.0); the library lock is std's `File::try_lock` now, and a pin hashed by 1.0.1 is a test.

**P12.6 copies the library before an update changes it** — `backups/questiongame-<old version>-<stamp>.sqlite3`, taken before any migration or write, five kept, and no copy means no change.

**P12.7 lets a game repeat a difficulty** — `board.allow_repeated_difficulty`, a per-game switch on Game ▸ Board, off by default and frozen at Play start; with it on, several questions at one difficulty in a domain are asked one after the other, `id ASC`, each paying the same.

**P12.8 makes a refused Load say why from anywhere** — pressed on Roster for a Board problem, it opens the collector naming *Game ▸ Board* with *Show*, marks Board in the rail and the status bar, stops stacking repeats, and clears once a write fixes it; it also put the collector back on the right after HeroUI 3.2.6 moved it.

**P12.9 says when a newer release exists** — once per session, never during a game, from `update_check` in Rust (the app's only network call, rustls with the OS roots, silent offline), with *Check for updates* and an off switch in Settings ▸ About; it never installs anything.

**P12.10 says what changed** — the first launch after an update opens *What's new*, written for operators in plain words in English and Romanian, once, never over a game, and again from Settings ▸ About.

**P12.12 closed what the 1.0.2 review deferred** — a fresh install is never shown 1.0.1's notes, a Board refusal fixed from the library clears (checked against `rules_preview`, never assumed), the update request runs on the blocking pool and a failure is logged, and CI's actions run on Node 24.

**P12.13 added the codebase map** — `codemap.yaml`, generated by `npm run map` from a `syn` reader and the TypeScript compiler, checked for staleness in CI and `release`, so a version's surface changes are one diff.

**P12.14 added the end-to-end suite** — WebdriverIO through `tauri-driver` on the real app under its own identity (`org.questiongame.e2e`): first run, a show onto Stage, a refused Load, and an update's backup and *What's new*; CI runs it before building.
