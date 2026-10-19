# Tests and tooling as built

The end-to-end suite and the codebase map. The rules here are binding; `CLAUDE.md` points here instead of carrying them.

## The end-to-end suite (P12.14)

`e2e/` drives the **real app** through WebDriver: WebdriverIO, `tauri-driver` and the WebView2 driver (`cargo install tauri-driver --locked`; `msedgedriver-tool` fetches the driver matching the installed WebView2). **Windows only** — macOS's WKWebView has no WebDriver. CI runs it in its own job, and the release builds wait for it.

- **It drives a third identity, `org.questiongame.e2e`** (`tauri.e2e.conf.json`, `npm run e2e:build` = `tauri build --debug --no-bundle` with that overlay), so its library, log and WebView2 profile are folders no show lives in. `identity::check` admits it only in a built app, never a dev server. **`e2e/support/folders.ts` is the only code that deletes anything**, and it refuses any folder not named `org.questiongame.e2e` — keep it that way; never point the suite at `org.questiongame.desktop` or `org.questiongame.app`.
- **Every spec starts from a reset folder** and, if `SEEDS` names one, a library written by `cargo run -p questiongame-host --example e2e_library` — the Demo, an active operator, **unstamped as 1.0.1 left it** (so the app backs it up and opens *What's new*; `closeWhatsNew()` for specs about something else), and `--broken-board` for a board re-graded from the library.
- Specs: `first-run` (operator, Demo, shell), `show` (Load opens Stage on Idle, Start Play, a domain, *Question* on air — Stage changes screen only when the operator picks one), `load-refusal` (P12.8 from the Roster), `upgrade` (P12.6 backup + P12.10 *What's new*). A new spec must be added to `SEEDS`, or the run refuses it.
- **Read the page the way a person does**: `press(name)` prefers a `<button>` with that text over any other element of the same accessible name (the sidebar's *Show* heading vs the collector's *Show*); Stage's screen is its `data-screen`. A failed step leaves a screenshot and the page source in `e2e/.artifacts/` (a CI artifact).
- Not here: several displays, the Atomos, the installer itself (it would overwrite the machine's installed app). Those stay manual.

## The codebase map (P12.13)

`codemap.yaml` at the root is **generated** — `npm run map` — and never edited by hand. It lists the surfaces that break across versions: every IPC command (params, return, which webviews may call it, and which Studio files call it), every event and its payload, the contract exports and `CONTRACT_VERSION` on both sides, every settings key with `GAME_AFFECTING_KEYS`, the migrations and meta keys, the host crate's public API and the app crate's modules. File paths, no line numbers, sorted, so **`git diff v1.0.2 -- codemap.yaml` is what changed in a release**; consts carry a short hash so a changed value shows even when its name does not.

- **`npm run map:check` fails when the committed copy is stale**, in CI and in `npm run release`: a change to any of those surfaces is not done until the map is regenerated and the diff read.
- **`mismatches:` must stay empty.** It cross-checks the Rust commands against the contract's lists and `generate_handler!`, the events, and the two `CONTRACT_VERSION`s; its first run found the contract's `STAGE_COMMANDS` missing `client_log` and `perf_report`, which `guard.rs` allowed.
- Rust is read by `tools/codemap` (a dev-only `syn` crate, outside the licence audit's graph — `test:tools`, `lint:tools`); TypeScript by `scripts/lib/codemap.ts` (the `typescript` compiler API, a hand-rolled YAML emitter, no YAML dependency). A Studio call whose command is not a string literal is listed under `dynamic_call_files` rather than guessed.
