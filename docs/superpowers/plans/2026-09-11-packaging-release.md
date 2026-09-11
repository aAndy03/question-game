# P12 — Packaging and Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship questiongame 1.0.0 as a per-user Windows installer. The installed app must never touch the dev library, must keep a host-side performance log, and must offer app-file and data removal independently.

**Architecture:** Two Tauri app identifiers:
- `org.questiongame.desktop` in `tauri.conf.json` is production;
- `org.questiongame.app` comes from a dev overlay passed by `npm run dev:app`.

A boot check in `crates/app` refuses a binary whose identity does not match `tauri::is_dev()`. Production keeps the Rust-side perf log (OS + host sections). Webview diagnostics other than error forwarding compile out under `import.meta.env.DEV`. The installer is NSIS `currentUser`. A close guard, single instance, an About tab, generated third-party notices (which double as the licence audit), and a release check over `dist/` complete the slice set.

**Tech Stack:** Rust 2024 (Tauri 2.11, `rfd` 0.16, `tauri-plugin-single-instance` 2), React 19 + HeroUI v3 (Studio), Vite 7, Vitest 3.2, vite-node, NSIS via the Tauri CLI 2.11.

**Spec:** `docs/superpowers/specs/2026-09-11-packaging-release-design.md`. Read it first; section numbers below (§3.3 etc.) refer to it.

## Global Constraints

- Dev identifier `org.questiongame.app` (unchanged); release identifier `org.questiongame.desktop`.
- Version `1.0.0`: `[workspace.package]` in `Cargo.toml`, `tauri.conf.json` and the root `package.json` must agree.
- Windows only for this phase. macOS config is written but not built.
- Unsigned installer. No updater, no MSI, no code signing.
- Production perf log carries `os`, `host` and `spike` only. It is written in every build unless `QUESTIONGAME_PERF` is `0`/`off`/`false`. Retention is 10 runs **and** ≤ 100 MB of old runs.
- Production webviews forward only errors: Studio's uncaught errors, rejected promises and `console.error`/`warn`. No `perf_report`, sweep, watchdog, breadcrumb or `studio ready` line in a release bundle.
- `questiongame.log` rotates at boot when > 10 MB and keeps 3 rotated files.
- `panic` stays `unwind`.
- **Never touch a window while the host lock is held** (`state::assert_unlocked`). Every command is `#[tauri::command(async)]`.
- Every new command goes into three places in the same task: `packages/contract/src/commands.ts` `COMMAND_GROUPS`, `crates/app/src/lib.rs` `generate_handler!`, and the fake host (`apps/studio/src/host/fake.ts`). `contract.test.ts` compares the first two.
- Operator-readable strings live in `apps/studio/src/copy/*`. Vocabulary follows `docs/v1/03_CONTEXT.md`: Play, recipe = "game" in UI, Stage, Studio.
- Commits follow the repo convention: **one commit per slice** (`P12.1: …` … `P12.4: …`) on `master`, with prose body and docs in the same commit, ending with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Tasks inside a slice stage their files; the slice's last task commits. Do **not** commit `docs/superpowers/`.
- Verification commands: `npm run typecheck`, `npm test`, `npm run lint`, `npm run test:app`, `npm run lint:app`, `npm run test:host`.

## File map

| File | Slice | Responsibility |
| --- | --- | --- |
| `crates/app/src/boot.rs` (new) | P12.1 | boot-failure message box, panic hook |
| `crates/app/src/identity.rs` (new) | P12.1 | the two identifiers, the boot check, `build_label` |
| `crates/app/src/logfile.rs` (new) | P12.1 | rotating `questiongame.log` |
| `crates/app/tauri.dev.conf.json` (new) | P12.1 | dev overlay: identifier only |
| `crates/app/tests/identity.rs` (new) | P12.1 | configs ↔ constants |
| `crates/app/src/lib.rs` | all | setup order, `start()`, plugins, window events, handlers |
| `crates/app/src/perf/{mod,line}.rs` | P12.1 | on everywhere, size cap, `build` field |
| `crates/app/src/windows.rs` | P12.1 | `studio_title` |
| `crates/app/src/commands/flags.rs` | P12.1, P12.2 | `paths_get` fields; `uninstall_data` clears the webview profile |
| `crates/app/src/quit.rs` (new) | P12.2 | close-guard state |
| `crates/app/src/commands/app.rs` (new) | P12.2, P12.3 | `app_quit`, `app_close_cancelled`, `app_uninstall`, `app_info` |
| `crates/app/src/emit.rs` | P12.2 | `close_requested` |
| `crates/app/tauri.conf.json`, `tauri.macos.conf.json` (new) | P12.2, P12.3 | bundle config |
| `crates/app/tests/bundle.rs` (new) | P12.2 | bundle config + version agreement |
| `apps/studio/src/chrome/diagnostics.ts`, `apps/studio/src/App.tsx`, `apps/stage/src/diagnostics.ts` | P12.1 | dev-only diagnostics |
| `apps/studio/src/chrome/quit.ts` (new), `organisms/QuitGuard.tsx` (new) | P12.2 | close guard UI |
| `apps/studio/src/chrome/nav.ts`, `organisms/useDraft.ts` | P12.2 | `QUIT_ROUTE`, `askLeave`, save-then-quit |
| `apps/studio/src/organisms/DataActions.tsx` | P12.1, P12.2 | paths rows, uninstall-app row |
| `apps/studio/src/organisms/AboutPanel.tsx` (new), `pages/SettingsPage.tsx` | P12.3 | About tab |
| `scripts/lib/notices.ts` (new), `scripts/notices.ts` (new) | P12.3 | notices + licence audit |
| `scripts/lib/release-check.ts` (new), `scripts/release-check.ts` (new) | P12.3 | bundle scan |
| `packages/design-stage/fonts/OFL.txt` (new) | P12.3 | font licence |

---

# Slice P12.1 — Two identities, host-side monitoring

### Task 1: Boot failures are shown, panics are logged

**Files:**
- Create: `crates/app/src/boot.rs`
- Modify: `crates/app/src/lib.rs` (module list, `run()` setup, new `start()`)
- Modify: `Cargo.toml` (workspace deps), `crates/app/Cargo.toml`

**Interfaces:**
- Produces: `boot::message(reason: &str, log: Option<&Path>) -> String`, `boot::fail(reason: &str, log: Option<&Path>) -> !`, `boot::describe_panic(payload: &(dyn Any + Send), location: Option<(&str, u32)>, thread: Option<&str>) -> String`, `boot::install_panic_hook()`.
- Produces: `fn start(handle: &tauri::AppHandle, data_dir: Option<PathBuf>) -> AppResult<()>` in `lib.rs` (private). Task 2 adds the identity check before it; Task 9 adds a plugin to the builder.

- [ ] **Step 1: Add the dependency**

In root `Cargo.toml`, under `[workspace.dependencies]`, after the `sysinfo` entry:

```toml
# P12.1. A release build has no console, so a boot failure needs a window of
# its own to be seen at all. The crate tauri-plugin-dialog is built on; used
# directly because the message is shown before Tauri's event loop exists.
rfd = "0.16"
```

In `crates/app/Cargo.toml` `[dependencies]`, add `rfd = { workspace = true }`.

- [ ] **Step 2: Write the failing tests**

Create `crates/app/src/boot.rs`:

```rust
//! When the app cannot start, or panics after it has (P12.1).
//!
//! A release build has no console (`windows_subsystem = "windows"`), so two
//! things that used to end on stderr ended nowhere: a `setup` that returned an
//! error, and a panic. The first now shows a message box and exits; the second
//! is written to the log before the previous hook runs.

use std::any::Any;
use std::path::Path;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_box_names_the_log_when_there_is_one() {
        let text = message(
            "the library is newer than this app",
            Some(Path::new("C:/data/questiongame.log")),
        );
        assert!(text.starts_with("the library is newer than this app"), "{text}");
        assert!(text.contains("questiongame.log"), "{text}");
        assert_eq!(message("no data folder", None), "no data folder");
    }

    #[test]
    fn a_panic_is_described_by_payload_place_and_thread() {
        let borrowed: Box<dyn Any + Send> = Box::new("index out of bounds");
        assert_eq!(
            describe_panic(borrowed.as_ref(), Some(("src/tick.rs", 42)), Some("tokio-runtime-worker")),
            "panic on thread `tokio-runtime-worker` at src/tick.rs:42: index out of bounds"
        );
        let owned: Box<dyn Any + Send> = Box::new(String::from("formatted 7"));
        assert!(describe_panic(owned.as_ref(), None, None).ends_with("an unknown location: formatted 7"));
        let other: Box<dyn Any + Send> = Box::new(7_u8);
        assert!(describe_panic(other.as_ref(), None, Some("main")).contains("non-text payload"));
    }
}
```

Add `pub mod boot;` to the module list in `crates/app/src/lib.rs` (alphabetical, before `pub mod commands;`).

- [ ] **Step 3: Run to verify failure**

Run: `cargo test -p questiongame-app boot::`
Expected: compile error: `message` / `describe_panic` not found.

- [ ] **Step 4: Implement**

Insert above the `#[cfg(test)]` block in `boot.rs`:

```rust
/// The text of the boot-failure box: the reason, and where to read more.
pub fn message(reason: &str, log: Option<&Path>) -> String {
    match log {
        Some(path) => format!("{reason}\n\nThe log is at:\n{}", path.display()),
        None => reason.to_string(),
    }
}

/// Show why the app cannot start, then exit. Never returns.
///
/// `rfd` draws the box synchronously on the calling thread, which is the main
/// thread here: `setup` runs there, before the event loop.
pub fn fail(reason: &str, log: Option<&Path>) -> ! {
    tracing::error!(reason, "boot failed");
    let _ = rfd::MessageDialog::new()
        .set_level(rfd::MessageLevel::Error)
        .set_title("questiongame could not start")
        .set_description(message(reason, log))
        .set_buttons(rfd::MessageButtons::Ok)
        .show();
    std::process::exit(1)
}

/// One line that says what panicked, where, and on which thread.
pub fn describe_panic(
    payload: &(dyn Any + Send),
    location: Option<(&str, u32)>,
    thread: Option<&str>,
) -> String {
    let what = payload
        .downcast_ref::<&str>()
        .map(|s| (*s).to_string())
        .or_else(|| payload.downcast_ref::<String>().cloned())
        .unwrap_or_else(|| "a panic with a non-text payload".to_string());
    let at = location.map_or_else(
        || "an unknown location".to_string(),
        |(file, line)| format!("{file}:{line}"),
    );
    format!("panic on thread `{}` at {at}: {what}", thread.unwrap_or("unnamed"))
}

/// Write every panic to the log, then let the previous hook do what it did.
/// `panic` stays `unwind`, so a panicking command fails that command and the
/// show goes on — this is how anyone finds out it happened.
pub fn install_panic_hook() {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let location = info.location().map(|l| (l.file(), l.line()));
        let thread = std::thread::current();
        let line = describe_panic(info.payload(), location, thread.name());
        let backtrace = std::backtrace::Backtrace::capture();
        if backtrace.status() == std::backtrace::BacktraceStatus::Captured {
            tracing::error!("{line}\n{backtrace}");
        } else {
            tracing::error!("{line}");
        }
        previous(info);
    }));
}
```

- [ ] **Step 5: Route `setup` through `start()`**

In `crates/app/src/lib.rs`, replace the whole `.setup(|app| { … })` closure with:

```rust
        .setup(|app| {
            let handle = app.handle().clone();
            // Logging first, and inside `setup`, because the log file lives in
            // the app-data directory and only Tauri can resolve it. The perf
            // layer is installed with the subscriber, so its counters exist
            // before the first command; the writer starts last (`start`).
            let perf_state = perf::PerfState::default();
            let perf_layer = perf::PerfLayer::new(perf_state.counters.clone());
            app.manage(perf_state);
            let data_dir = crate::state::user_data_dir(&handle).ok();
            tracing_logging(data_dir.as_deref(), perf_layer);
            // A release build has no console: from here on a panic is written
            // to the log, and a boot that fails says so in a box (P12.1).
            boot::install_panic_hook();
            // `setup` runs on the event loop, so this is where that thread is
            // identified — everything after it may be asserted against.
            crate::state::mark_main_thread();
            if let Err(error) = start(&handle, data_dir.clone()) {
                let log = data_dir.as_ref().map(|dir| dir.join(LOG_FILE));
                boot::fail(&error.to_string(), log.as_deref());
            }
            Ok(())
        })
```

Add below `run()`:

```rust
/// Everything after logging that can refuse to start: the one-process lock,
/// the library, Studio's window, the two loops. An error here is shown, not
/// swallowed (`boot::fail`).
///
/// The **Stage window is not created here**: §9 says first Control Load.
fn start(handle: &tauri::AppHandle, data_dir: Option<std::path::PathBuf>) -> error::AppResult<()> {
    // One library, one process — before anything opens the database.
    if let Some(dir) = &data_dir {
        crate::state::take_single_instance_lock(dir)?;
    }
    let host = Host::open(catalog_location(handle)?)?;
    handle.manage(AppState::new(host));
    windows::open_studio(handle)?;
    // The first health report is the watch's own first tick: computing it
    // here would take the host lock on the event-loop thread.
    tick::spawn(handle.clone());
    // The performance log, one line a second (`perf`). It takes no lock.
    perf::spawn(handle.clone(), data_dir);
    Ok(())
}
```

- [ ] **Step 6: Run tests and lint**

Run: `cargo test -p questiongame-app boot:: && npm run lint:app`
Expected: 2 passed; clippy clean.

- [ ] **Step 7: Stage**

```bash
git add Cargo.toml Cargo.lock crates/app/Cargo.toml crates/app/src/boot.rs crates/app/src/lib.rs
```

---

### Task 2: Two identities

**Files:**
- Create: `crates/app/src/identity.rs`, `crates/app/tauri.dev.conf.json`, `crates/app/tests/identity.rs`
- Modify: `crates/app/tauri.conf.json` (identifier), `package.json` (`dev:app`), `crates/app/src/lib.rs` (check), `crates/app/src/windows.rs` (title)

**Interfaces:**
- Consumes: `boot::fail` (Task 1).
- Produces: `identity::DEV_IDENTIFIER`, `identity::RELEASE_IDENTIFIER`, `identity::check(is_dev: bool, identifier: &str) -> Result<(), String>`, `identity::build_label(is_dev: bool) -> &'static str` (`"dev"` | `"release"`), `windows::studio_title(is_dev: bool) -> &'static str`.

- [ ] **Step 1: Write the failing tests**

Create `crates/app/src/identity.rs`:

```rust
//! Which app this binary is — the dev build or the installed one (P12.1).
//!
//! Tauri names every per-app folder after the identifier: the library, the
//! log, the lock, the WebView2 profile, and what the Windows uninstaller's
//! *Delete the application data* box removes. One identifier for both builds
//! meant an installed release would open the dev library, and uninstalling it
//! would delete it. So there are two, and a binary that carries the wrong one
//! for what it is refuses to start rather than open the other's folders.

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn each_build_runs_only_under_its_own_identity() {
        assert_eq!(check(true, DEV_IDENTIFIER), Ok(()));
        assert_eq!(check(false, RELEASE_IDENTIFIER), Ok(()));
        let dev_as_release = check(true, RELEASE_IDENTIFIER).unwrap_err();
        assert!(dev_as_release.contains("npm run dev:app"), "{dev_as_release}");
        let release_as_dev = check(false, DEV_IDENTIFIER).unwrap_err();
        assert!(release_as_dev.contains("npm run release"), "{release_as_dev}");
        assert!(check(false, "com.example.other").is_err());
    }

    #[test]
    fn the_build_label_is_what_the_log_and_about_call_it() {
        assert_eq!(build_label(true), "dev");
        assert_eq!(build_label(false), "release");
    }
}
```

Add `pub mod identity;` to `lib.rs`'s module list (after `pub mod guard;`).

Create `crates/app/tests/identity.rs`:

```rust
//! The two identities live in two config files and one constant module; this
//! holds the three together (P12.1).

use std::path::Path;

use questiongame_app::identity::{DEV_IDENTIFIER, RELEASE_IDENTIFIER};

fn json(rel: &str) -> serde_json::Value {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join(rel);
    let text = std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("{}: {e}", path.display()));
    serde_json::from_str(&text).unwrap_or_else(|e| panic!("{}: {e}", path.display()))
}

#[test]
fn the_base_config_is_the_installed_app() {
    assert_eq!(json("tauri.conf.json")["identifier"], RELEASE_IDENTIFIER);
}

#[test]
fn the_dev_overlay_changes_the_identity_and_nothing_else() {
    let overlay = json("tauri.dev.conf.json");
    let keys: Vec<&String> = overlay.as_object().expect("an object").keys().collect();
    assert_eq!(keys, vec!["identifier"]);
    assert_eq!(overlay["identifier"], DEV_IDENTIFIER);
}

#[test]
fn the_two_identities_are_two_sibling_folders() {
    assert_ne!(DEV_IDENTIFIER, RELEASE_IDENTIFIER);
    for id in [DEV_IDENTIFIER, RELEASE_IDENTIFIER] {
        assert!(!id.contains(['/', '\\']), "{id} is a folder name, not a path");
    }
}

#[test]
fn npm_run_dev_app_passes_the_overlay() {
    let pkg = json("../../package.json");
    let script = pkg["scripts"]["dev:app"].as_str().expect("a dev:app script");
    assert!(script.contains("--config crates/app/tauri.dev.conf.json"), "{script}");
}
```

- [ ] **Step 2: Run to verify failure**

Run: `cargo test -p questiongame-app identity`
Expected: compile error (constants missing).

- [ ] **Step 3: Implement the module**

Insert above the tests in `identity.rs`:

```rust
/// `npm run dev:app` (`crates/app/tauri.dev.conf.json`). The folder the dev
/// library has lived in since P5, kept so nothing on disk moves.
pub const DEV_IDENTIFIER: &str = "org.questiongame.app";
/// The installed app (`crates/app/tauri.conf.json`).
pub const RELEASE_IDENTIFIER: &str = "org.questiongame.desktop";

/// `is_dev` is `tauri::is_dev()`: the frontend comes from `devUrl` rather than
/// being embedded — Tauri's own line between the two builds.
pub fn check(is_dev: bool, identifier: &str) -> Result<(), String> {
    match (is_dev, identifier) {
        (true, DEV_IDENTIFIER) | (false, RELEASE_IDENTIFIER) => Ok(()),
        (true, RELEASE_IDENTIFIER) => Err(format!(
            "This dev build carries the installed app's identity ({RELEASE_IDENTIFIER}), \
             so it would open the installed app's library. Start it with `npm run dev:app`."
        )),
        (false, DEV_IDENTIFIER) => Err(format!(
            "This release build carries the dev identity ({DEV_IDENTIFIER}), \
             so it would open the dev library. Build it with `npm run release`."
        )),
        (_, other) => Err(format!(
            "Unknown app identity `{other}`: expected {DEV_IDENTIFIER} (dev) or {RELEASE_IDENTIFIER} (release)."
        )),
    }
}

/// What the performance log and Settings ▸ About call this build.
pub fn build_label(is_dev: bool) -> &'static str {
    if is_dev { "dev" } else { "release" }
}
```

- [ ] **Step 4: The configs and the script**

In `crates/app/tauri.conf.json` change `"identifier": "org.questiongame.app"` to `"identifier": "org.questiongame.desktop"`.

Create `crates/app/tauri.dev.conf.json`:

```json
{
  "identifier": "org.questiongame.app"
}
```

In root `package.json` change `"dev:app": "tauri dev"` to `"dev:app": "tauri dev --config crates/app/tauri.dev.conf.json"`.

- [ ] **Step 5: The boot check and the title**

In `lib.rs` `setup`, make the first two statements:

```rust
            let handle = app.handle().clone();
            // Before anything resolves a path — even the log's: the app must
            // know which set of folders is its own (P12.1, `identity`).
            if let Err(reason) = identity::check(tauri::is_dev(), &app.config().identifier) {
                boot::fail(&reason, None);
            }
```

In `crates/app/src/windows.rs`, add above `open_studio`:

```rust
/// Studio's window title. The dev build says so, because the two can run side
/// by side and the taskbar is where the operator tells them apart (P12.1).
pub fn studio_title(is_dev: bool) -> &'static str {
    if is_dev { "questiongame Studio (dev)" } else { "questiongame Studio" }
}
```

and in `open_studio` replace `.title("questiongame Studio")` with `.title(studio_title(tauri::is_dev()))`. At the end of `windows.rs` add:

```rust
#[cfg(test)]
mod title_tests {
    #[test]
    fn the_dev_window_says_it_is_dev() {
        assert_eq!(super::studio_title(true), "questiongame Studio (dev)");
        assert_eq!(super::studio_title(false), "questiongame Studio");
    }
}
```

- [ ] **Step 6: Run tests**

Run: `cargo test -p questiongame-app identity title_tests && npm run lint:app`
Expected: all pass. (The overlay test reads the real files.)

- [ ] **Step 7: Smoke-check dev still opens the dev library**

Run: `npm run dev:app`. Studio's title reads `questiongame Studio (dev)` and shows your existing library. The log line `---- run start ----` appends to `%APPDATA%\org.questiongame.app\questiongame.log`. Close the app.

- [ ] **Step 8: Stage**

```bash
git add crates/app/src/identity.rs crates/app/tauri.dev.conf.json crates/app/tests/identity.rs crates/app/tauri.conf.json package.json crates/app/src/lib.rs crates/app/src/windows.rs
```

---

### Task 3: The perf log in every build, host side, bounded by size

**Files:**
- Modify: `crates/app/src/perf/mod.rs`, `crates/app/src/perf/line.rs`

**Interfaces:**
- Consumes: `identity::build_label` (Task 2).
- Produces: `perf::enabled_from(var: Option<&str>) -> bool`, `perf::DIR: &str = "perf"`, `perf::MAX_OLD_BYTES: u64`, `perf::prune(perf_dir: &Path, keep: usize, max_bytes: u64) -> io::Result<Vec<PathBuf>>`, `line::Line.build` / `line::Inputs.build: &'static str`.

- [ ] **Step 1: Write the failing tests**

In `perf/mod.rs` tests module, change the existing call `prune(&dir, 3)` to `prune(&dir, 3, u64::MAX)` and add:

```rust
    #[test]
    fn every_build_writes_unless_told_not_to() {
        assert!(enabled_from(None));
        assert!(enabled_from(Some("1")));
        for off in ["0", "off", "false"] {
            assert!(!enabled_from(Some(off)), "{off}");
        }
    }

    #[test]
    fn prune_also_holds_the_old_runs_under_a_size() {
        let dir = std::env::temp_dir().join(format!("qg-perf-size-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        for i in 0..5 {
            std::fs::write(dir.join(format!("perf-2026-09-11T10-00-0{i}Z-1.jsonl")), "0123456789").unwrap();
        }
        let removed = prune(&dir, 10, 25).unwrap();
        assert_eq!(removed.len(), 3, "10 bytes each, 25 allowed: the newest two stay");
        let mut left: Vec<String> = std::fs::read_dir(&dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        left.sort();
        assert_eq!(left, vec!["perf-2026-09-11T10-00-03Z-1.jsonl", "perf-2026-09-11T10-00-04Z-1.jsonl"]);
        let _ = std::fs::remove_dir_all(&dir);
    }
```

In `perf/line.rs` tests, add `build: "dev",` to the `Inputs` literal in the `inputs()` helper (after `sec: 7,`), and add:

```rust
    #[test]
    fn a_line_says_which_build_wrote_it() {
        let mut i = inputs(os(300.0, 1.0), None);
        i.build = "release";
        let text = serde_json::to_string(&build(i)).unwrap();
        assert!(text.contains("\"build\":\"release\""), "{text}");
        assert!(!text.contains("\"main\""), "a release line carries no webview section: {text}");
    }
```

- [ ] **Step 2: Run to verify failure**

Run: `cargo test -p questiongame-app perf::`
Expected: compile errors (`enabled_from`, 3-argument `prune`, `build` field).

- [ ] **Step 3: Implement `line.rs`**

In `pub struct Line`, after `pub sec: u64,` add:

```rust
    /// `dev` or `release` (P12.1). A release line has no webview keys by
    /// design — this is what tells a reader that from a webview that stopped.
    pub build: &'static str,
```

In `pub struct Inputs`, after `pub sec: u64,` add `pub build: &'static str,`. In `build()`'s final `Line { … }`, after `sec: inputs.sec,` add `build: inputs.build,`.

- [ ] **Step 4: Implement `mod.rs`**

Replace the module doc's second paragraph (`` `<app data>/perf/perf-<timestamp>-<pid>.jsonl` … who will never read it. ``) with:

```rust
//! `<app data>/perf/perf-<timestamp>-<pid>.jsonl`, one file per run; old runs
//! are pruned to the newest ten **and** 100 MB. Every build writes it
//! (`QUESTIONGAME_PERF=0` turns it off) so the installed app can be monitored
//! too (P12.1). A release build's lines carry `os`, `host` and `spike` only:
//! its webviews post nothing, and `build` says so.
```

Replace `enabled()` with:

```rust
/// Whether this build writes the file: every build does, unless
/// `QUESTIONGAME_PERF` says `0`, `off` or `false` (P12.1).
pub fn enabled() -> bool {
    enabled_from(std::env::var("QUESTIONGAME_PERF").ok().as_deref())
}

/// [`enabled`], given the variable's value.
pub fn enabled_from(var: Option<&str>) -> bool {
    !matches!(var, Some("0" | "off" | "false"))
}
```

After `pub const KEEP_FILES: usize = 10;` add:

```rust
/// The run files' folder, under the data directory.
pub const DIR: &str = "perf";
/// Old runs kept at most this many bytes between them. The run being written
/// is not counted: pruning happens before it exists (P12.1).
pub const MAX_OLD_BYTES: u64 = 100 * 1024 * 1024;
```

In `file_for_run`, replace `dir.join("perf")` with `dir.join(DIR)`. Replace `prune` with:

```rust
/// Delete old run files until at most `keep` remain **and** they hold at most
/// `max_bytes` between them, oldest first. Called before this run's file is
/// created, so the run being written is never a candidate. Names sort by time.
pub fn prune(perf_dir: &Path, keep: usize, max_bytes: u64) -> std::io::Result<Vec<PathBuf>> {
    let mut files: Vec<(PathBuf, u64)> = std::fs::read_dir(perf_dir)?
        .filter_map(Result::ok)
        .map(|e| e.path())
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|n| n.starts_with("perf-") && n.ends_with(".jsonl"))
        })
        .map(|p| {
            let len = std::fs::metadata(&p).map_or(0, |m| m.len());
            (p, len)
        })
        .collect();
    files.sort();
    let mut total: u64 = files.iter().map(|(_, len)| len).sum();
    let mut removed = Vec::new();
    while !files.is_empty() && (files.len() > keep || total > max_bytes) {
        let (oldest, len) = files.remove(0);
        total = total.saturating_sub(len);
        if std::fs::remove_file(&oldest).is_ok() {
            removed.push(oldest);
        }
    }
    Ok(removed)
}
```

In `spawn`:
- change `tracing::debug!("perf log off (release build without QUESTIONGAME_PERF=1)");` to `tracing::debug!("perf log off (QUESTIONGAME_PERF=0)");`
- change `prune(&perf_dir, KEEP_FILES.saturating_sub(1))` to `prune(&perf_dir, KEEP_FILES.saturating_sub(1), MAX_OLD_BYTES)`
- before `async_runtime::spawn(`, add `let build = crate::identity::build_label(tauri::is_dev());`
- inside the loop's `line::build(Inputs { … })`, after `sec: started.elapsed().as_secs(),` add `build,`.

- [ ] **Step 5: Run tests and lint**

Run: `cargo test -p questiongame-app perf:: && npm run lint:app`
Expected: all pass.

- [ ] **Step 6: Stage**

```bash
git add crates/app/src/perf/mod.rs crates/app/src/perf/line.rs
```

---

### Task 4: `questiongame.log` rotates

**Files:**
- Create: `crates/app/src/logfile.rs`
- Modify: `crates/app/src/lib.rs` (`tracing_logging` + its doc comment; module list)

**Interfaces:**
- Produces: `logfile::ROTATE_AT_BYTES`, `logfile::KEEP_ROTATED`, `logfile::rotated_name(file: &str, n: usize) -> String`, `logfile::rotate(dir: &Path, file: &str, at_bytes: u64, keep: usize) -> io::Result<bool>`.

- [ ] **Step 1: Write the failing tests**

Create `crates/app/src/logfile.rs`:

```rust
//! `questiongame.log`, bounded (P12.1).
//!
//! The log appends — two processes may share it, and truncating erased the
//! older one's evidence (2026-09-08) — so without this it grew for the life of
//! the install. At boot, before the file is opened, a log past the threshold
//! is shifted: `.2 → .3`, `.1 → .2`, current `→ .1`, the oldest dropped.

use std::path::Path;

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("qg-log-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn a_rotated_name_keeps_the_extension() {
        assert_eq!(rotated_name("questiongame.log", 1), "questiongame.1.log");
        assert_eq!(rotated_name("noext", 2), "noext.2");
    }

    #[test]
    fn a_small_log_is_left_alone() {
        let dir = scratch("small");
        std::fs::write(dir.join("q.log"), "short").unwrap();
        assert!(!rotate(&dir, "q.log", 10, 3).unwrap());
        assert_eq!(std::fs::read_to_string(dir.join("q.log")).unwrap(), "short");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_large_log_shifts_and_the_oldest_falls_off() {
        let dir = scratch("large");
        std::fs::write(dir.join("q.log"), "current-log-over-ten").unwrap();
        std::fs::write(dir.join("q.1.log"), "one").unwrap();
        std::fs::write(dir.join("q.2.log"), "two").unwrap();
        std::fs::write(dir.join("q.3.log"), "three").unwrap();
        assert!(rotate(&dir, "q.log", 10, 3).unwrap());
        assert!(!dir.join("q.log").exists());
        assert_eq!(std::fs::read_to_string(dir.join("q.1.log")).unwrap(), "current-log-over-ten");
        assert_eq!(std::fs::read_to_string(dir.join("q.2.log")).unwrap(), "one");
        assert_eq!(std::fs::read_to_string(dir.join("q.3.log")).unwrap(), "two");
        assert!(!dir.join("q.4.log").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn no_log_yet_is_not_an_error() {
        let dir = scratch("none");
        assert!(!rotate(&dir, "q.log", 10, 3).unwrap());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
```

Add `pub mod logfile;` to `lib.rs` (after `pub mod identity;`).

- [ ] **Step 2: Run to verify failure**

Run: `cargo test -p questiongame-app logfile::`
Expected: compile error.

- [ ] **Step 3: Implement**

Insert above the tests:

```rust
/// A log past this size is rotated at boot.
pub const ROTATE_AT_BYTES: u64 = 10 * 1024 * 1024;
/// How many rotated files are kept beside the current one.
pub const KEEP_ROTATED: usize = 3;

/// `questiongame.log` → `questiongame.1.log`.
pub fn rotated_name(file: &str, n: usize) -> String {
    match file.rsplit_once('.') {
        Some((stem, ext)) => format!("{stem}.{n}.{ext}"),
        None => format!("{file}.{n}"),
    }
}

/// Rotate `dir/file` if it is larger than `at_bytes`. `Ok(true)` when it did.
pub fn rotate(dir: &Path, file: &str, at_bytes: u64, keep: usize) -> std::io::Result<bool> {
    let current = dir.join(file);
    let Ok(meta) = std::fs::metadata(&current) else {
        return Ok(false);
    };
    if meta.len() <= at_bytes || keep == 0 {
        return Ok(false);
    }
    let _ = std::fs::remove_file(dir.join(rotated_name(file, keep)));
    for n in (1..keep).rev() {
        let from = dir.join(rotated_name(file, n));
        if from.exists() {
            std::fs::rename(&from, dir.join(rotated_name(file, n + 1)))?;
        }
    }
    std::fs::rename(&current, dir.join(rotated_name(file, 1)))?;
    Ok(true)
}
```

- [ ] **Step 4: Call it**

In `lib.rs` `tracing_logging`, inside the `let file = dir.and_then(|dir| { … })` closure, between `std::fs::create_dir_all(dir).ok()?;` and `std::fs::OpenOptions::new()`, insert:

```rust
        // Bounded (P12.1). A rename that fails — another process holds the
        // file — is not an error; this run appends as before.
        let _ = logfile::rotate(dir, LOG_FILE, logfile::ROTATE_AT_BYTES, logfile::KEEP_ROTATED);
```

In the doc comment above `tracing_logging`, replace the sentence ``lost. `wipe_logs` is not a feature; delete the file between runs if it gets long.`` with `lost. It rotates at boot once past 10 MB, keeping three (`logfile`).`

- [ ] **Step 5: Run tests and lint**

Run: `cargo test -p questiongame-app logfile:: && npm run lint:app`
Expected: all pass.

- [ ] **Step 6: Stage**

```bash
git add crates/app/src/logfile.rs crates/app/src/lib.rs
```

---

### Task 5: Webview diagnostics are dev-only, errors excepted

**Files:**
- Modify: `apps/studio/src/chrome/diagnostics.ts`, `apps/studio/src/App.tsx`, `apps/stage/src/diagnostics.ts`
- Create: `apps/studio/src/chrome/diagnostics.release.test.ts`, `apps/stage/src/diagnostics.release.test.ts`

**Interfaces:**
- Consumes: nothing new. `installDiagnostics()`, `crumb()` and `installStageDiagnostics()` keep their signatures.
- Produces: a release bundle with no `postCommand('perf_report', …)` call site. Task 16's release check greps for it.

- [ ] **Step 1: Write the failing Studio test**

Create `apps/studio/src/chrome/diagnostics.release.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * P12.1: a release build of Studio forwards errors and does nothing else —
 * no per-second report, no user-timing sweep, no breadcrumbs. The gate is
 * `import.meta.env.DEV`, which Vite folds to a constant; here it is stubbed,
 * and the module is re-imported so its install-once flag starts fresh.
 */
describe('Studio diagnostics in a release build', () => {
  const original = { error: console.error, warn: console.warn }
  type WithTauri = Window & { __TAURI_INTERNALS__?: unknown }

  afterEach(() => {
    console.error = original.error
    console.warn = original.warn
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    delete (window as WithTauri).__TAURI_INTERNALS__
  })

  async function install(dev: boolean) {
    vi.stubEnv('DEV', dev)
    vi.resetModules()
    const invoke = vi.fn((_name: string, _args?: Record<string, unknown>) => Promise.resolve(null))
    ;(window as WithTauri).__TAURI_INTERNALS__ = { invoke }
    const host = await import('@/host/host')
    host.setHostTransport({ invoke: () => Promise.resolve(null as never), listen: () => Promise.resolve(() => {}) })
    const interval = vi.spyOn(globalThis, 'setInterval')
    const diagnostics = await import('./diagnostics')
    diagnostics.installDiagnostics()
    return { invoke, interval, diagnostics, host }
  }

  it('forwards an error and starts no timer, report or breadcrumb', async () => {
    const { invoke, interval, diagnostics, host } = await install(false)
    expect(interval).not.toHaveBeenCalled()
    diagnostics.crumb('list:enter', 'teams')
    console.error('boom')
    expect(invoke.mock.calls.map((c) => c[0])).toEqual(['client_log'])
    expect(invoke.mock.calls[0]?.[1]).toMatchObject({ level: 'error', message: 'boom' })
    host.setHostTransport(null)
  })

  it('a dev build still sweeps and reports', async () => {
    const { interval, invoke, host } = await install(true)
    expect(interval).toHaveBeenCalled()
    expect(invoke.mock.calls.some((c) => c[1] && (c[1] as { message?: string }).message === 'studio ready')).toBe(true)
    host.setHostTransport(null)
  })
})
```

- [ ] **Step 2: Write the failing Stage test**

Create `apps/stage/src/diagnostics.release.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'

/** P12.1: a release Stage runs no diagnostic at all. */
describe('Stage diagnostics in a release build', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('starts nothing', async () => {
    vi.stubEnv('DEV', false)
    vi.resetModules()
    const interval = vi.spyOn(globalThis, 'setInterval')
    const { installStageDiagnostics } = await import('./diagnostics')
    installStageDiagnostics()
    expect(interval).not.toHaveBeenCalled()
  })

  it('a dev Stage still sweeps', async () => {
    vi.stubEnv('DEV', true)
    vi.resetModules()
    const interval = vi.spyOn(globalThis, 'setInterval')
    const { installStageDiagnostics } = await import('./diagnostics')
    installStageDiagnostics()
    expect(interval).toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run apps/studio/src/chrome/diagnostics.release.test.ts apps/stage/src/diagnostics.release.test.ts`
Expected: the two release cases FAIL: `setInterval` was called and `client_log` debug crumbs were posted. The two dev cases pass.

- [ ] **Step 4: Gate Studio**

In `apps/studio/src/chrome/diagnostics.ts`, replace the body of `installDiagnostics()` from the `// The sweep runs whether or not there is a host` comment to the end of the function with:

```ts
  // Dev builds only (P12.1). `import.meta.env.DEV` is a constant Vite folds
  // at build time, so none of this reaches a release bundle — the error
  // forwarding above is the one thing a release webview posts, and
  // `scripts/release-check.ts` fails the build if `perf_report` is found.
  if (import.meta.env.DEV) {
    // The sweep runs whether or not there is a host: the buffer grows in a
    // plain browser too, and a `?fake` session is where a shell change gets
    // measured. What it removes is the performance log's view of which
    // components rendered, so the accumulator sees the entries first.
    startUserTimingSweep(performance, USER_TIMING_SWEEP_MS, {
      count: (held) => second.sweptCount(held),
      inspect: (entries) => second.sweptEntries(entries),
    })
    // The second, posted every second (`perf.ts`); quiet without a host.
    startPerfReporting()
    // One line, so the log shows the webview's own boot on the host's
    // timeline — and so "nothing from Studio" can be told apart from "Studio
    // never started".
    send('debug', 'studio ready', `heapMb=${heapMb() ?? 'n/a'} ua=${navigator.userAgent.slice(0, 80)}`)
  }
}
```

At the top of `crumb()`'s body, before `const key = …`, add:

```ts
  // A dev-build diagnostic: release builds keep only errors (P12.1).
  if (!import.meta.env.DEV) return
```

In the file's opening doc comment, after the numbered list, add the paragraph:

```ts
 * **A release build keeps only item 1** (P12.1). The watchdog, the report and
 * the breadcrumbs are dev-build tools and compile out of a release bundle.
```

- [ ] **Step 5: Gate the Profiler**

In `apps/studio/src/App.tsx`, replace:

```tsx
      <Profiler id="page" onRender={onPageCommit}>
        <Page route={route} />
      </Profiler>
```

with:

```tsx
      {import.meta.env.DEV ? (
        <Profiler id="page" onRender={onPageCommit}>
          <Page route={route} />
        </Profiler>
      ) : (
        // A release build has no watchdog (P12.1): React's production build
        // never calls `onRender`, and the code that would count is compiled out.
        <Page route={route} />
      )}
```

- [ ] **Step 6: Gate Stage**

In `apps/stage/src/diagnostics.ts`, replace `installStageDiagnostics` with:

```ts
/** Install once, before the first render. Safe to call again. */
export function installStageDiagnostics(): void {
  if (installed || typeof window === 'undefined') return
  installed = true
  // Dev builds only (P12.1): a release Stage runs no diagnostic at all. The
  // leak the sweep contains is React's development build, which a release
  // bundle is not, and the per-second report is a dev-build tool.
  if (!import.meta.env.DEV) return
  startUserTimingSweep(performance, USER_TIMING_SWEEP_MS, {
    count: (held) => second.sweptCount(held),
    inspect: (entries) => second.sweptEntries(entries),
  })
  startPerfReporting()
}
```

- [ ] **Step 7: Run tests, typecheck, lint**

Run: `npx vitest run apps/studio/src/chrome apps/stage/src/diagnostics && npm run typecheck && npm run lint`
Expected: all pass.

- [ ] **Step 8: Stage**

```bash
git add apps/studio/src/chrome/diagnostics.ts apps/studio/src/chrome/diagnostics.release.test.ts apps/studio/src/App.tsx apps/stage/src/diagnostics.ts apps/stage/src/diagnostics.release.test.ts
```

---

### Task 6: Settings ▸ Data shows where things are

**Files:**
- Modify: `crates/app/src/commands/flags.rs` (`AppPaths`, `paths_get`)
- Modify: `apps/studio/src/host/types.ts`, `apps/studio/src/host/fake.ts`, `apps/studio/src/organisms/DataActions.tsx`, `apps/studio/src/organisms/FirstRunFlow.tsx`, `apps/studio/src/copy/settings.ts`
- Test: `apps/studio/src/pages/settings.test.tsx`

**Interfaces:**
- Consumes: `crate::LOG_FILE`, `perf::DIR` (Task 3).
- Produces: wire shape `AppPaths { userData, catalog, logFile, perfDir, cuePack: string | null }`, and `FakeHost.paths: AppPaths` (mutable). Task 12 adds `uninstaller`.

- [ ] **Step 1: Write the failing Studio test**

In `apps/studio/src/pages/settings.test.tsx`, add `FAKE_PATHS` to the `@/host/fake` import (`import { createFakeHost, FAKE_PATHS, type FakeHost } from '@/host/fake'`), and inside `describe('Settings', …)` add:

```ts
  it('Data lists the data folder, the log and the performance log (P12.1)', async () => {
    mount()
    render(<App />)
    await act(async () => {
      await useNavStore.getState().go({ tab: 'settings', inner: 'settings' })
    })
    expect(await screen.findByText(FAKE_PATHS.logFile)).toBeTruthy()
    expect(screen.getByText(FAKE_PATHS.perfDir)).toBeTruthy()
    expect(screen.getByText(SETTINGS.paths.logFile)).toBeTruthy()
    expect(screen.getByText(SETTINGS.paths.perfDir)).toBeTruthy()
  })
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run apps/studio/src/pages/settings.test.tsx`
Expected: compile/type failure or FAIL. `FAKE_PATHS.logFile` does not exist.

- [ ] **Step 3: Host side**

In `crates/app/src/commands/flags.rs`, replace `pub struct AppPaths { … }` with:

```rust
pub struct AppPaths {
    pub user_data: String,
    pub catalog: String,
    /// `questiongame.log`, beside the library (P12.1).
    pub log_file: String,
    /// Where the performance log's run files go (P12.1).
    pub perf_dir: String,
    /// `None` when the folder is not on disk: a release build embeds the pack
    /// in the binary, so there is nothing to reveal (P12.1).
    pub cue_pack: Option<String>,
}
```

and replace the body of `paths_get` after the guard line with:

```rust
    let user_data = crate::state::user_data_dir(&app)?;
    let cue_pack = cue_pack_dir(&app).ok().filter(|dir| dir.is_dir());
    Ok(AppPaths {
        catalog: user_data.join("questiongame.sqlite3").display().to_string(),
        log_file: user_data.join(crate::LOG_FILE).display().to_string(),
        perf_dir: user_data.join(crate::perf::DIR).display().to_string(),
        user_data: user_data.display().to_string(),
        cue_pack: cue_pack.map(|dir| dir.display().to_string()),
    })
```

- [ ] **Step 4: Wire type and fake**

In `apps/studio/src/host/types.ts`, replace `export interface AppPaths { … }` with:

```ts
export interface AppPaths {
  readonly userData: string
  readonly catalog: string
  /** `questiongame.log`, beside the library (P12.1). */
  readonly logFile: string
  /** The performance log's folder (P12.1). */
  readonly perfDir: string
  /** Null in a release build: the pack is embedded, so there is no folder (P12.1). */
  readonly cuePack: string | null
}
```

In `apps/studio/src/host/fake.ts`:
- replace `FAKE_PATHS` with:

  ```ts
  export const FAKE_PATHS: AppPaths = {
    userData: 'C:\\Users\\operator\\AppData\\Roaming\\org.questiongame.desktop',
    catalog: 'C:\\Users\\operator\\AppData\\Roaming\\org.questiongame.desktop\\questiongame.sqlite3',
    logFile: 'C:\\Users\\operator\\AppData\\Roaming\\org.questiongame.desktop\\questiongame.log',
    perfDir: 'C:\\Users\\operator\\AppData\\Roaming\\org.questiongame.desktop\\perf',
    cuePack: 'C:\\questiongame\\packages\\design-stage\\audio',
  }
  ```

- in `interface FakeHost`, after `stageOpen: boolean`, add:

  ```ts
    /** What `paths_get` answers; a test may replace it. */
    paths: AppPaths
  ```

- change the handler `paths_get: () => FAKE_PATHS,` to `paths_get: () => fake.paths,`;
- in the `const fake: FakeHost = { … }` literal, after `stageOpen: false,`, add `paths: { ...FAKE_PATHS },`.

- [ ] **Step 5: Copy**

In `apps/studio/src/copy/settings.ts`, in `paths`, after `cuePack: 'Cue pack',` add:

```ts
    logFile: 'Log file',
    perfDir: 'Performance log',
```

- [ ] **Step 6: Render the rows**

In `apps/studio/src/organisms/DataActions.tsx`:
- change the molecules import to `import { ConfirmDialog, PathRow, SettingRow, type ConfirmFrame } from '@/molecules'`;
- in the returned fragment, before the first `<SettingRow label={SETTINGS.rows['data.wipe_plays'].label} …>`, insert:

  ```tsx
        {paths.data ? (
          // Where the generated files are (P12.1): the log and the performance
          // log live beside the library, so one Reveal shows all three.
          <div data-data-paths className="pb-2">
            <PathRow label={SETTINGS.paths.userData} path={paths.data.userData} onReveal={() => void run('paths_reveal', { which: 'userData' })} />
            <PathRow label={SETTINGS.paths.logFile} path={paths.data.logFile} />
            <PathRow label={SETTINGS.paths.perfDir} path={paths.data.perfDir} />
          </div>
        ) : null}
  ```

In `apps/studio/src/organisms/FirstRunFlow.tsx`, replace the cue-pack `PathRow` line with:

```tsx
              {paths.data.cuePack ? (
                <PathRow label={SETTINGS.paths.cuePack} path={paths.data.cuePack} onReveal={() => void run('paths_reveal', { which: 'cuePack' })} />
              ) : null}
```

- [ ] **Step 7: Run everything touched**

Run: `npx vitest run apps/studio && npm run typecheck && npm run lint && npm run test:app`
Expected: all pass.

- [ ] **Step 8: Stage**

```bash
git add crates/app/src/commands/flags.rs apps/studio/src/host/types.ts apps/studio/src/host/fake.ts apps/studio/src/organisms/DataActions.tsx apps/studio/src/organisms/FirstRunFlow.tsx apps/studio/src/copy/settings.ts apps/studio/src/pages/settings.test.tsx
```

---

### Task 7: P12.1 docs and commit

**Files:**
- Modify: `CLAUDE.md`, `docs/v1/04_ROADMAP.md`

- [ ] **Step 1: Run the full suite**

Run: `npm run typecheck && npm run lint && npm test && npm run test:host && npm run test:app && npm run lint:host && npm run lint:app`
Expected: all green. Fix anything red before writing docs.

- [ ] **Step 2: CLAUDE.md**

Make these edits:

1. In the code block, change the `dev:app` line to:

   ```
   npm run dev:app        # the desktop app (tauri dev + the dev identity overlay) — starts both dev servers itself
   ```

2. In the status paragraph, replace `P12 (packaging and release) is next.` with:

   > **P12.1 split the dev build from the installed one.** Tauri names every per-app folder after the identifier, and both builds used `org.questiongame.app`. An installed release would have opened the dev library, and its uninstaller's data box would have deleted it. Production is now `org.questiongame.desktop`. `npm run dev:app` passes `crates/app/tauri.dev.conf.json`, which keeps dev on the old identifier. A binary whose identity does not match `tauri::is_dev()` refuses to start. The installed app keeps a host-side performance log, and its webviews compile out everything diagnostic except error forwarding. P12.2 (the installer) is next.

3. Replace `one JSON line a second in `<app data>/perf/`, dev builds by default:` with `one JSON line a second in `<app data>/perf/`, every build (host-side only in a release, P12.1):`.

4. Replace `(`QUESTIONGAME_PERF=1|0` overrides; ten runs kept)` with `(`QUESTIONGAME_PERF=0` turns it off; ten runs and 100 MB of old runs kept)`.

5. Replace `The production build never measures; every show so far has run under `tauri dev`.` with `A release build measures from the host only — `os`, `host`, `spike`, and `"build": "release"` on every line (P12.1).`

6. Insert before `### Game rules that constrain the model`:

   ```markdown
   #### Two identities, and a release that reports on itself (P12.1)

   - **Dev and the installed app never share a folder.** `tauri.conf.json` is production (`org.questiongame.desktop`); `tauri.dev.conf.json` overrides only the identifier (`org.questiongame.app`, where the dev library has lived since P5). The library, the log, the lock, the WebView2 profile, the single-instance key, and what the uninstaller's *Delete the application data* box removes are all keyed on it. `crates/app/tests/identity.rs` holds the two files and `identity.rs`'s constants together.
   - **The identity check comes before anything resolves a path.** `identity::check(tauri::is_dev(), identifier)` refuses a dev binary with the release identity (a plain `cargo build` run by hand) and a release binary with the dev one, through the boot message box. Do not remove it to make a manual run work — run `npm run dev:app`.
   - **A release build's perf log is host-side.** `os` (every process in the tree, WebView2 included), `host` and `spike`, with `"build": "release"`. The webviews post nothing: `installDiagnostics` / `installStageDiagnostics` gate the sweep, `perf_report`, the watchdog's `Profiler` and `crumb()` on `import.meta.env.DEV`, which Vite folds so the code is not in the bundle. Studio's error forwarding (`error`, `unhandledrejection`, `console.error`/`warn`) is the one webview line a release keeps. Branch on `import.meta.env.DEV` directly — a parameter defaulted to it is not tree-shaken.
   - **Bounded files.** Old perf runs: ten and 100 MB (`perf::prune`, before the new run exists). `questiongame.log` rotates at boot past 10 MB, keeping three (`logfile::rotate`).
   - **A release has no console**, so `boot::install_panic_hook` writes panics to the log and `boot::fail` shows a boot failure in a message box (`rfd`) before exiting. `setup` is logging → panic hook → `start()`; an error from `start()` is shown, not swallowed.
   - `paths_get` answers `logFile`, `perfDir`, and `cuePack: null` when the pack folder is not on disk (a release embeds it).
   ```

- [ ] **Step 3: ROADMAP**

In `docs/v1/04_ROADMAP.md`, replace the whole `## P12 — Packaging and release  ☐` section (heading through its exit-criteria list, up to the `---` before `## Explicitly not in v1`) with:

```markdown
## P12 — Packaging and release  ☐

The app had only ever run under `tauri dev`. Packaging it meant deciding what a release build is: which folders it owns, what it logs, how it is installed and removed, and what it says about its licence. Four slices, one commit each.

**Deliverables:** a Windows installer (macOS prepared; built and verified later on a Mac); dev and installed builds on separate folders; a host-side performance log in the installed app; an uninstall offering app files and generated user files independently; single instance and a close guard; GPLv3 notices and a licence audit; a release check over the bundle.

### P12.1 — Two identities, host-side monitoring  ☑

- ☑ Production identifier `org.questiongame.desktop`; dev keeps `org.questiongame.app` through `tauri.dev.conf.json`; a binary with the wrong identity for its build refuses to start (`identity.rs`, `tests/identity.rs`).
- ☑ The perf log is written by every build; a release line is `os` + `host` + `spike` with `"build": "release"`; old runs capped at ten and 100 MB.
- ☑ Webview diagnostics compile out of a release except Studio's error forwarding.
- ☑ `questiongame.log` rotates past 10 MB; panics reach the log; a boot failure is a message box.
- ☑ Settings ▸ Data shows the data folder, the log and the performance log.

### P12.2 — The installer, uninstall, hardening  ☐

- ☐ NSIS, per user, unsigned, `1.0.0`; macOS config prepared.
- ☐ A second launch focuses Studio; closing Studio asks first with unsaved work or a loaded game.
- ☐ *Remove generated data* also clears the WebView2 profile; *Uninstall questiongame…* opens the Windows uninstaller.

### P12.3 — Notices and licence  ☐

- ☐ Settings ▸ About: version, build, GPL, the GSAP permission, third-party notices.
- ☐ Notices generated at build time; the generator fails on a licence outside the allowlist.
- ☐ `npm run release`; the release check fails on an external load, `perf_report`, or the fake host in `dist/`.

### P12.4 — The release, checked on the installed build  ☐

**Exit criteria** (on Windows)

- ☐ Clean install → first run → Demo → a full Play to `Completed`.
- ☐ The dev library's files hash the same before the install and after every step, including all three uninstall outcomes.
- ☐ Dev and the installed app run side by side, each on its own library.
- ☐ Each uninstall outcome removes exactly its set.
- ☐ No memory growth across three consecutive Plays (third `Completed` ≤ 110% of the first, total working set).
- ☐ The installed build's perf log: `"build": "release"`, no webview sections, within retention.
- ☐ Second launch focuses Studio; the close guard asks and a second close exits.
- ☐ About shows `1.0.0`, the GPL and the GSAP permission.
- ☐ A run with the network disabled behaves identically — verified by the operator.
- ☐ macOS: clean install → full Play; uninstall — needs a Mac.
```

- [ ] **Step 4: Commit P12.1**

```bash
git add CLAUDE.md docs/v1/04_ROADMAP.md
git commit -m "$(cat <<'EOF'
P12.1: the dev build and the installed one, apart

Tauri names every per-app folder after the identifier, and both builds used
org.questiongame.app: an installed release would have opened the dev library,
and its uninstaller's data box would have deleted it. Production is now
org.questiongame.desktop; npm run dev:app passes tauri.dev.conf.json, which
keeps dev on the old identifier so nothing on disk moves. A binary whose
identity does not match tauri::is_dev() refuses to start, in a message box.

The installed app keeps a performance log, host-side: the process tree, the
host's commands and emissions, spikes, and "build": "release" on every line.
Its webviews compile out the sweep, perf_report, the watchdog and the
breadcrumbs; Studio's error forwarding is the one line a release keeps. Old
perf runs are capped at ten and 100 MB, questiongame.log rotates past 10 MB,
panics reach the log, and Settings > Data shows where all of it lives.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

# Slice P12.2 — The installer, uninstall, hardening

### Task 8: Windows installer config, macOS prepared, one version

**Files:**
- Modify: `crates/app/tauri.conf.json`, `Cargo.toml`, `package.json`
- Create: `crates/app/tauri.macos.conf.json`, `crates/app/tests/bundle.rs`

**Interfaces:**
- Produces: version `1.0.0` everywhere; `bundle.targets = ["nsis"]`; `bundle.windows.nsis.installMode = "currentUser"`.

- [ ] **Step 1: Write the failing test**

Create `crates/app/tests/bundle.rs`:

```rust
//! What `tauri build` ships (P12.2): one per-user Windows installer, a macOS
//! bundle prepared for later, and one version number in three files.

use std::path::Path;

fn json(rel: &str) -> serde_json::Value {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join(rel);
    let text = std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("{}: {e}", path.display()));
    serde_json::from_str(&text).unwrap_or_else(|e| panic!("{}: {e}", path.display()))
}

/// `[workspace.package] version = "…"` from the root manifest, without a TOML
/// crate: the table header, then its `version` line.
fn workspace_version() -> String {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../Cargo.toml");
    let text = std::fs::read_to_string(path).expect("root Cargo.toml");
    let mut in_package = false;
    for line in text.lines().map(str::trim) {
        if line.starts_with('[') {
            in_package = line == "[workspace.package]";
            continue;
        }
        if in_package && let Some(rest) = line.strip_prefix("version") {
            return rest.trim_start().trim_start_matches('=').trim().trim_matches('"').to_string();
        }
    }
    panic!("no [workspace.package] version");
}

#[test]
fn one_version_in_three_files() {
    let version = workspace_version();
    assert_eq!(version, "1.0.0");
    assert_eq!(env!("CARGO_PKG_VERSION"), version);
    assert_eq!(json("tauri.conf.json")["version"], version.as_str());
    assert_eq!(json("../../package.json")["version"], version.as_str());
}

#[test]
fn windows_ships_one_per_user_installer() {
    let config = json("tauri.conf.json");
    let bundle = &config["bundle"];
    assert_eq!(bundle["targets"], serde_json::json!(["nsis"]));
    assert_eq!(bundle["windows"]["nsis"]["installMode"], "currentUser");
    assert_eq!(bundle["licenseFile"], "../../LICENSE");
    assert!(bundle["publisher"].as_str().is_some_and(|s| !s.is_empty()));
    assert!(bundle["copyright"].as_str().is_some_and(|s| s.contains("GPL-3.0-or-later")));
}

#[test]
fn macos_is_prepared_and_does_not_change_who_the_app_is() {
    let mac = json("tauri.macos.conf.json");
    assert_eq!(mac["bundle"]["targets"], serde_json::json!(["app", "dmg"]));
    assert_eq!(mac["bundle"]["macOS"]["minimumSystemVersion"], "13.0");
    assert_eq!(mac["bundle"]["macOS"]["signingIdentity"], "-");
    assert!(mac.get("identifier").is_none());
}

#[test]
fn every_listed_icon_exists() {
    let config = json("tauri.conf.json");
    let dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    for icon in config["bundle"]["icon"].as_array().expect("an icon list") {
        let rel = icon.as_str().expect("a path");
        assert!(dir.join(rel).is_file(), "{rel} is listed but missing");
    }
}
```

- [ ] **Step 2: Run to verify failure**

Run: `cargo test -p questiongame-app --test bundle`
Expected: FAIL: version is `0.0.0`, targets is `"all"`, and the macOS file is missing.

- [ ] **Step 3: Versions and profile**

In root `Cargo.toml`, set `[workspace.package]` `version = "1.0.0"`, and append at the end of the file:

```toml
# P12.2. The release build is what the operator runs on show day.
[profile.release]
lto = "thin"
codegen-units = 1
# panic stays "unwind" (the default): one panicking command must fail that
# command, not end the show. `boot::install_panic_hook` logs it.
```

In root `package.json`, set `"version": "1.0.0"`.

- [ ] **Step 4: The bundle config**

Replace `crates/app/tauri.conf.json` with:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "questiongame",
  "version": "1.0.0",
  "identifier": "org.questiongame.desktop",
  "build": {
    "frontendDist": "../../dist",
    "devUrl": "http://localhost:5181",
    "beforeDevCommand": "npm run dev:webviews",
    "beforeBuildCommand": "npm run build"
  },
  "app": {
    "windows": [],
    "security": {
      "csp": "default-src 'self'; img-src 'self' asset: http://asset.localhost data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self' ipc: http://ipc.localhost"
    }
  },
  "bundle": {
    "active": true,
    "targets": ["nsis"],
    "publisher": "questiongame contributors",
    "copyright": "© 2026 questiongame contributors — GPL-3.0-or-later",
    "category": "Education",
    "shortDescription": "An offline quiz show: an operator studio and a fullscreen audience stage.",
    "longDescription": "questiongame runs a quiz show from one computer. Studio is where the operator prepares teams, domains, questions and games and runs each Play; Stage is the fullscreen audience surface, on one display or several. Everything works offline.",
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/256x256.png", "icons/icon.ico", "icons/icon.png"],
    "licenseFile": "../../LICENSE",
    "windows": {
      "nsis": {
        "installMode": "currentUser"
      }
    }
  }
}
```

Create `crates/app/tauri.macos.conf.json` (Tauri merges it on macOS builds only):

```json
{
  "bundle": {
    "targets": ["app", "dmg"],
    "macOS": {
      "minimumSystemVersion": "13.0",
      "signingIdentity": "-"
    }
  }
}
```

- [ ] **Step 5: Run tests**

Run: `cargo test -p questiongame-app --test bundle --test identity`
Expected: all pass.

- [ ] **Step 6: Stage**

```bash
git add Cargo.toml Cargo.lock package.json package-lock.json crates/app/tauri.conf.json crates/app/tauri.macos.conf.json crates/app/tests/bundle.rs
```

---

### Task 9: A second launch focuses Studio

**Files:**
- Modify: `Cargo.toml`, `crates/app/Cargo.toml`, `crates/app/src/lib.rs`, `crates/app/src/windows.rs`

**Interfaces:**
- Produces: `windows::focus_studio(app: &AppHandle)`.

- [ ] **Step 1: Dependency**

Root `Cargo.toml` `[workspace.dependencies]`, after `rfd`:

```toml
# P12.2. A second launch focuses the running Studio instead of dying on the
# library lock with nowhere to say so. Keyed on the identifier, so dev and the
# installed app each have their own.
tauri-plugin-single-instance = "2"
```

`crates/app/Cargo.toml`: `tauri-plugin-single-instance = { workspace = true }`.

- [ ] **Step 2: `focus_studio`**

In `crates/app/src/windows.rs`, after `open_studio`:

```rust
/// A second launch of the app (P12.2): bring the running Studio to the front
/// rather than start a second copy of the library. Takes no host lock.
pub fn focus_studio(app: &AppHandle) {
    crate::state::assert_unlocked("windows::focus_studio");
    if let Some(main) = app.get_webview_window(MAIN) {
        let _ = main.unminimize();
        let _ = main.show();
        let _ = main.set_focus();
    }
}
```

- [ ] **Step 3: Register the plugin first**

In `lib.rs` `run()`, make the builder chain start:

```rust
    tauri::Builder::default()
        // First, by the plugin's own rule: a second process must find the
        // first before it builds anything (P12.2). The file lock in `start`
        // stays as the library's own guard.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            windows::focus_studio(app);
        }))
        .invoke_handler(handlers())
```

- [ ] **Step 4: Build and lint**

Run: `npm run test:app && npm run lint:app`
Expected: pass.

- [ ] **Step 5: Verify by hand**

Run `npm run dev:app` and wait for Studio. In a second terminal run `& .\target\debug\questiongame.exe`. Expected: the running Studio comes to the front, no second window opens, and a second later `(Get-Process questiongame).Count` is `1`. Close the app.

- [ ] **Step 6: Stage**

```bash
git add Cargo.toml Cargo.lock crates/app/Cargo.toml crates/app/src/lib.rs crates/app/src/windows.rs
```

---

### Task 10: The close guard, host side

**Files:**
- Create: `crates/app/src/quit.rs`, `crates/app/src/commands/app.rs`
- Modify: `crates/app/src/commands/mod.rs`, `crates/app/src/emit.rs`, `crates/app/src/lib.rs`, `crates/app/src/guard.rs` (tests), `packages/contract/src/commands.ts`

**Interfaces:**
- Produces: `quit::QuitState` (`on_close_requested(&self) -> CloseDecision`, `cancel(&self)`), `quit::CloseDecision::{Ask, Exit}`, `emit::close_requested(app: &AppHandle)`.
- Produces: commands `app_quit` and `app_close_cancelled`, both without arguments and answering `()`. Contract group `app` and event `close-requested` (payload `null`), `main` only.

- [ ] **Step 1: Write the failing tests**

Create `crates/app/src/quit.rs`:

```rust
//! Closing Studio asks first (P12.2; deferred from P7).
//!
//! Studio's close button — or Alt+F4 — used to end the process at once, so a
//! stray click mid-show blacked out Stage. Now the first press is held and
//! Studio is asked (`close-requested`); it answers `app_quit` or
//! `app_close_cancelled`. A **second press while the question is open exits
//! regardless**: a Studio that has stopped answering must not be able to keep
//! the operator in.

use std::sync::atomic::{AtomicBool, Ordering};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_first_press_asks_and_the_second_exits() {
        let quit = QuitState::default();
        assert_eq!(quit.on_close_requested(), CloseDecision::Ask);
        assert_eq!(quit.on_close_requested(), CloseDecision::Exit);
    }

    #[test]
    fn keep_working_makes_the_next_press_ask_again() {
        let quit = QuitState::default();
        assert_eq!(quit.on_close_requested(), CloseDecision::Ask);
        quit.cancel();
        assert_eq!(quit.on_close_requested(), CloseDecision::Ask);
    }
}
```

Add `pub mod quit;` to `lib.rs`'s module list (after `pub mod perf;`).

In `crates/app/src/guard.rs` tests module, add:

```rust
    /// P12.2: the close guard's answers are Studio's alone.
    #[test]
    fn only_studio_answers_the_close_guard() {
        for command in ["app_quit", "app_close_cancelled"] {
            assert!(allow(MAIN, command).is_ok());
            assert!(allow(STAGE, command).is_err(), "{command} from Stage");
            assert!(allow(STATS, command).is_err(), "{command} from Statistics");
        }
    }
```

- [ ] **Step 2: Run to verify failure**

Run: `cargo test -p questiongame-app quit::`
Expected: compile error. (The guard test already passes: `allow` lets `main` call anything and holds the other two labels to their lists. It is there to keep that true.)

- [ ] **Step 3: Implement `QuitState`**

Insert above the tests in `quit.rs`:

```rust
/// Whether a close request is waiting for Studio's answer.
#[derive(Debug, Default)]
pub struct QuitState {
    pending: AtomicBool,
}

/// What the window's close button does this time.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CloseDecision {
    /// Keep the window open and ask Studio.
    Ask,
    /// A request was already open: exit now.
    Exit,
}

impl QuitState {
    pub fn on_close_requested(&self) -> CloseDecision {
        if self.pending.swap(true, Ordering::SeqCst) {
            CloseDecision::Exit
        } else {
            CloseDecision::Ask
        }
    }

    /// Studio answered *keep working*.
    pub fn cancel(&self) {
        self.pending.store(false, Ordering::SeqCst);
    }
}
```

- [ ] **Step 4: The commands and the event**

Create `crates/app/src/commands/app.rs`:

```rust
//! The app itself (P12.2): quitting, and opening the uninstaller. Not a
//! service's surface — nothing here reads or writes a Play or the library,
//! beyond the refusals `app_uninstall` borrows from Settings ▸ Data.

use tauri::{AppHandle, State, WebviewWindow};

use crate::error::AppResult;
use crate::guard;
use crate::quit::QuitState;

/// Studio answered the close guard with *quit*. Studio only (`guard`).
#[tauri::command(async)]
pub fn app_quit(window: WebviewWindow, app: AppHandle) -> AppResult<()> {
    guard::allow(window.label(), "app_quit")?;
    tracing::info!("quit: confirmed in Studio");
    app.exit(0);
    Ok(())
}

/// Studio answered the close guard with *keep working*: the next press of the
/// close button asks again instead of exiting.
#[tauri::command(async)]
pub fn app_close_cancelled(window: WebviewWindow, quit: State<'_, QuitState>) -> AppResult<()> {
    guard::allow(window.label(), "app_close_cancelled")?;
    quit.cancel();
    Ok(())
}
```

In `crates/app/src/commands/mod.rs`, add `pub mod app;` before `pub mod catalog;`.

In `crates/app/src/emit.rs`, after `pub fn health(…)`:

```rust
/// Studio's close button was pressed (P12.2). The window is being held open
/// until Studio answers with `app_quit` or `app_close_cancelled`.
pub fn close_requested(app: &AppHandle) {
    let _ = app.emit_to(MAIN, "close-requested", ());
}
```

- [ ] **Step 5: Wire it in `run()`**

In `lib.rs`, replace the `.on_window_event(|window, event| { … })` block with:

```rust
        // Studio is the app. Stage and Statistics are surfaces it puts on
        // displays, so closing Studio ends the show — but not on one click:
        // the first press asks Studio, a second exits regardless (`quit`).
        .manage(quit::QuitState::default())
        .on_window_event(|window, event| {
            let tauri::WindowEvent::CloseRequested { api, .. } = event else {
                return;
            };
            if window.label() != guard::MAIN {
                return;
            }
            let app = window.app_handle();
            match app.state::<quit::QuitState>().on_close_requested() {
                quit::CloseDecision::Exit => app.exit(0),
                quit::CloseDecision::Ask => {
                    api.prevent_close();
                    emit::close_requested(app);
                }
            }
        })
```

In `handlers()`, add a group at the top of the list:

```rust
        // The app itself (P12.2)
        commands::app::app_quit,
        commands::app::app_close_cancelled,
```

- [ ] **Step 6: The contract**

In `packages/contract/src/commands.ts`, add as the last group in `COMMAND_GROUPS` (after `stats`):

```ts
  /** The app itself (P12): the close guard's answers and the uninstaller. */
  app: [
    /** Studio's answer to `close-requested`: quit now. */
    'app_quit',
    /** Studio's answer to `close-requested`: keep working; the next close asks again. */
    'app_close_cancelled',
  ],
```

In `EVENTS`, after `'anim-complete',` add:

```ts
  /**
   * Studio's close button was pressed (P12). The host holds the window open
   * until Studio answers with `app_quit` or `app_close_cancelled`; a second
   * press exits regardless. `main` only.
   */
  'close-requested',
```

- [ ] **Step 7: Run tests and lint**

Run: `cargo test -p questiongame-app && npx vitest run packages && npm run lint:app && npm run typecheck`
Expected: all pass. The contract test compares `generate_handler!` with `COMMANDS`, so both sides must list the two commands.

The fake host has no handler for the two commands yet; Task 11 adds them. No Studio code calls them before then.

- [ ] **Step 8: Stage**

```bash
git add crates/app/src/quit.rs crates/app/src/commands/app.rs crates/app/src/commands/mod.rs crates/app/src/emit.rs crates/app/src/lib.rs crates/app/src/guard.rs packages/contract/src/commands.ts
```

---

> Tasks 11–19 are written as **what and where**, not line by line. Follow the patterns established in Tasks 1–10 and the code they point at.

### Task 11: The close guard, Studio side

**Files:**
- Create: `apps/studio/src/chrome/quit.ts`, `apps/studio/src/organisms/QuitGuard.tsx`, `apps/studio/src/organisms/QuitGuard.test.tsx`, `apps/studio/src/organisms/useDraft.quit.test.tsx`
- Modify: `apps/studio/src/host/bridge.tsx`, `apps/studio/src/chrome/nav.ts`, `apps/studio/src/organisms/useDraft.ts`, `apps/studio/src/organisms/index.ts`, `apps/studio/src/App.tsx`, `apps/studio/src/copy/index.ts`, `apps/studio/src/host/fake.ts`

**What to build:**
- `chrome/quit.ts`: a zustand store `useQuitStore { requested: number; request(): void }`. It is a counter, so two requests are two changes.
- `bridge.tsx`: `add(on<null>('close-requested', () => useQuitStore.getState().request()))`.
- `nav.ts`:
  - `export const QUIT_ROUTE: Route = Object.freeze({ tab: 'settings' }) as Route`. It is a real route by value, so every guard can read it; `useDirtyGuard` compares it by identity.
  - New store method `askLeave(): Promise<boolean>` = `guard ? await guard(QUIT_ROUTE) : true`.
- `useDraft.ts` `saveAndGo`: after a successful save, `if (to === QUIT_ROUTE) { finish(true); return }`. Otherwise unchanged.
- `QuitGuard` organism:
  1. On each new `requested` value (track the last one handled in a ref), `await askLeave()`. If `false`, call `run.ok('app_close_cancelled')`.
  2. Otherwise, if `peekPlayState() !== null`, open a `ConfirmDialog`: `severity="warning"`, title `QUIT.title`, body `QUIT.playLoaded`, confirm `QUIT.quit` → `app_quit`, cancel `QUIT.keepWorking` → `app_close_cancelled`.
  3. Otherwise call `app_quit`.

  Use a `quitting` ref so `ConfirmDialog`'s post-confirm `onOpenChange(false)` does not also send `app_close_cancelled`.
- Mount in `App.tsx`: `{isStatsWindow() ? <StatsWindow /> : <><QuitGuard /><Shell /></>}`. Mounting outside `Shell` covers first run too.
- Copy: `QUIT = { title: 'Quit questiongame?', playLoaded: 'A game is loaded in Control. The Play is saved as it stands and resumes next time; Stage closes with Studio.', quit: 'Quit', keepWorking: 'Keep working' }`.
- Fake: `quits: number` and `closeCancels: number` on `FakeHost`, initialised to 0, plus handlers `app_quit` and `app_close_cancelled` that increment them.

**Tests:**
- `useDraft.quit.test.tsx` (renderHook on `useDirtyGuard` with a dirty draft):
  - no guard → `askLeave()` resolves `true`;
  - pending is `QUIT_ROUTE`, and a successful Save resolves `true`;
  - Discard → `true`;
  - Keep editing → `false`;
  - a failed save → `false`.
- `QuitGuard.test.tsx` (App + fake host, the pattern from `pages/settings.test.tsx`):
  - nothing dirty and no Play → `fake.quits === 1`;
  - Play loaded (`receivePlayState(OPEN_PLAY)`) → dialog → Keep working → `closeCancels === 1`, `quits === 0`;
  - Play loaded → Quit → `quits === 1`, `closeCancels === 0`.

**Verify:** `npx vitest run apps/studio && npm run typecheck && npm run lint`. Stage the files.

---

### Task 12: Uninstall — the webview profile, and the uninstaller from inside the app

**Files:**
- Modify: `crates/app/src/commands/flags.rs`, `crates/app/src/commands/app.rs`, `crates/app/src/lib.rs`, `crates/app/src/guard.rs` (test), `packages/contract/src/commands.ts`, `apps/studio/src/host/types.ts`, `apps/studio/src/host/fake.ts`, `apps/studio/src/organisms/DataActions.tsx`, `apps/studio/src/copy/settings.ts`, `apps/studio/src/pages/settings.test.tsx`

**What to build:**
- `uninstall_data`: after the host-lock block (never under it), call `app.get_webview_window(guard::MAIN)` → `clear_all_browsing_data()`, logging a warning on error. Then remove the directory as today.
- `commands/app.rs`:
  - `pub fn uninstaller_beside(exe: &Path) -> Option<PathBuf>` returns `exe.parent()/uninstall.exe` if it is a file.
  - `pub fn uninstaller_path()` calls it with `current_exe()`.
  - Command `app_uninstall { pin?: string }` refuses in this order:
    1. no uninstaller: `AppError::Window("this copy was not installed by the Windows installer…")`;
    2. `super::flags::refuse_while_play_loaded`;
    3. `super::flags::require_active_operator_pin`.

    Then it spawns the uninstaller and calls `app.exit(0)`.
  - Unit-test `uninstaller_beside` with a temp dir: absent → `None`; present → `Some`.
- `AppPaths` gains `uninstaller: Option<String>`, filled from `uninstaller_path()`.
- Register `app_uninstall` in `handlers()` and in the contract's `app` group. Extend the guard test to include it.
- Studio:
  - `AppPaths.uninstaller: string | null`.
  - Fake: `FAKE_PATHS.uninstaller = null`, and an `app_uninstall` handler that mirrors the host's refusal order and sets `fake.uninstallerStarted = true`.
- `DataActions`: add a third action `'app'`.
  - A row `data.uninstall_app`, rendered **only when** `paths.data?.uninstaller`.
  - Button `SETTINGS.data.uninstallApp`, disabled with `playOpen` while a Play is open.
  - The same arm → (pin) → confirm dialog, calling `run.ok('app_uninstall', { pin })`.
  - Refactor the per-action title/body/labels into one small table.
- Copy:
  - `rows['data.uninstall_app'] = { label: 'Uninstall questiongame', description: 'Opens the Windows uninstaller and quits. It asks there whether to delete generated data too.' }`.
  - `data.uninstallApp` 'Uninstall…', `uninstallAppTitle`, `uninstallAppBody` (mentions ticking "Delete the application data" to remove the library too), `uninstallAppArm` 'Uninstall', `uninstallAppArmed` 'Quit and uninstall'.
  - Update `uninstallBody` to say the app's browser storage is cleared too.

**Tests (settings.test.tsx):**
- no uninstaller → no `Uninstall…` button;
- `fake.paths = { ...fake.paths, uninstaller: 'C:\\…\\uninstall.exe' }` → click, arm, confirm → `fake.uninstallerStarted === true`;
- disabled with a reason while a Play is open.

**Verify:** `cargo test -p questiongame-app && npx vitest run && npm run typecheck && npm run lint && npm run lint:app`. Stage the files.

---

### Task 13: P12.2 docs and commit

- Run the full suite (Task 7 Step 1).
- `README.md`: add `## Building the installer`, covering:
  - `npm run release` and the output path `target/release/bundle/nsis/questiongame_1.0.0_x64-setup.exe`;
  - the SmartScreen click (*More info → Run anyway*);
  - where the installed app keeps its data (`%APPDATA%\org.questiongame.desktop`);
  - the three uninstall outcomes (§5.2);
  - that dev keeps `%APPDATA%\org.questiongame.app`.
- `CLAUDE.md`:
  - status: replace "P12.2 (the installer) is next." with a P12.2 sentence plus "P12.3 (notices) is next.";
  - add a section `#### The installer, uninstall, and the close guard (P12.2)`:
    - NSIS `currentUser`; version `1.0.0` held by `tests/bundle.rs`;
    - single-instance plugin first on the builder;
    - `QuitState`: first press asks, second exits; `QUIT_ROUTE` + `askLeave`; never add a close path that cannot be escaped;
    - `uninstall_data` clears the webview profile outside the lock;
    - `app_uninstall` exists only where `uninstall.exe` sits beside the exe.
- `docs/v1/05_STUDIO_DESIGN.md`: add `## 18. Production (P12)` with `### 18.1 The close guard` and `### 18.2 Settings ▸ Data` (paths rows, uninstall row).
- `04_ROADMAP.md`: tick P12.2 and mark it ☑.
- Commit `P12.2: an installer, a way out of it, and a close button that asks`, with a prose body and the co-author line.

---

# Slice P12.3 — Notices and licence

### Task 14: Third-party notices, and the licence audit they imply

**Files:**
- Create: `scripts/lib/notices.ts`, `scripts/lib/notices.test.ts`, `scripts/notices.ts`, `packages/design-stage/fonts/OFL.txt`
- Modify: `package.json` (`notices`, `build`), `vitest.config.ts` (a `scripts` project), `.gitignore`

**What to build:**
- `scripts/lib/notices.ts`, pure:
  - `ALLOWED`: MIT, MIT-0, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, Zlib, 0BSD, BSL-1.0, Unicode-3.0, Unicode-DFS-2016, MPL-2.0, CC0-1.0, Unlicense, OFL-1.1.
  - `EXCEPTIONS`: `gsap` and `@gsap/react` → "GSAP Standard License; combined under the GPLv3 §7 additional permission".
  - `licenceAllowed(expr)`: `/` becomes OR, drop parens, split on ` AND `; each part needs one ` OR ` alternative in `ALLOWED`, after stripping ` WITH …`.
  - `audit(pkgs)` → the refused list.
  - `cargoPackages(metadata, 'questiongame-app')`: walk normal-kind edges only, skip `questiongame*`.
  - `npmPackages(npmQuery)`: skip `questiongame` and `@questiongame/*`, dedupe name@version, normalise a `license` object.
  - `render(pkgs, readText, extras)`: header with the GPL line and the GSAP permission; fonts; then groups of packages sharing identical licence text; then a "ships no licence file" list.
- `scripts/notices.ts` (runner):
  - run `cargo metadata --format-version 1 --locked` and `npm query .prod` (through `process.env.npm_execpath` when set, otherwise `npm` with `shell` on win32);
  - read licence text from each package dir (`LICEN[CS]E*`, `COPYING*`, `NOTICE*`);
  - exit 1 with the list if the audit refuses anything;
  - write `apps/studio/public/notices/THIRD-PARTY-NOTICES.txt` and copy `LICENSE` → `LICENSE.txt`.
- `packages/design-stage/fonts/OFL.txt`:
  - "Copyright 2020 The Space Grotesk Project Authors (https://github.com/floriankarsten/space-grotesk)";
  - "Copyright 2016 Google Inc. All Rights Reserved." (Space Mono);
  - then the OFL-1.1 text copied verbatim from `node_modules/@fontsource-variable/geist/LICENSE`, from "This Font Software is licensed under…".
- `package.json`: `"notices": "vite-node scripts/notices.ts"`; `"build": "npm run notices && npm run build --workspaces --if-present"`.
- `.gitignore`: add `apps/studio/public/notices/`.
- `vitest.config.ts`: add project `{ test: { name: 'scripts', environment: 'node', include: ['scripts/**/*.test.ts'] } }`.

**Tests (`notices.test.ts`):**
- `licenceAllowed`:
  - allowed: `MIT`, `MIT/Apache-2.0`, `(MIT OR Apache-2.0) AND Unicode-3.0`, `Apache-2.0 WITH LLVM-exception`, `MIT OR Apache-2.0 OR LGPL-2.1-or-later`;
  - refused: `GPL-2.0-only`, `MIT AND GPL-2.0-only`, `null`, and the GSAP string.
- `audit` excepts gsap and refuses an unknown.
- `cargoPackages` excludes dev and build edges and the workspace crates (tiny fixture).
- `npmPackages` skips the workspace packages.
- `render` groups identical texts and lists text-less packages.

**Verify:** `npx vitest run scripts && npm run notices`. Expected: 0 refused (checked 2026-09-11: 143 npm + 496 cargo packages, only gsap/@gsap/react need the exception). Stage the files.

---

### Task 15: `app_info` and Settings ▸ About

**Files:**
- Modify: `crates/app/src/commands/app.rs`, `crates/app/src/lib.rs`, `packages/contract/src/commands.ts`, `apps/studio/src/host/{types,queries,fake}.ts`, `apps/studio/src/chrome/chrome.ts` and `chrome/nav.ts` (`SettingsInner` += `'about'`, both copies), `apps/studio/src/pages/SettingsPage.tsx`, `apps/studio/src/organisms/index.ts`, `apps/studio/src/copy/settings.ts`, `README.md`
- Create: `apps/studio/src/organisms/AboutPanel.tsx`, test in `apps/studio/src/pages/settings.test.tsx`

**What to build:**
- `app_info` → `{ version: app.package_info().version, build: identity::build_label(is_dev()), identifier }`, camelCase. `main` only by the guard; add it to the contract `app` group and the handler list.
- Studio:
  - `AppInfo` type;
  - `useAppInfo()` query (`keys.appInfo`, `staleTime: Infinity`);
  - fake `app_info` → `{ version: '1.0.0', build: 'dev', identifier: 'org.questiongame.app' }`.
- `SettingsPage`: `INNER` gains `'about'` → `<AboutPanel />`; `SETTINGS.inner.about = 'About'`.
- `AboutPanel`, made of `SettingsGroup`s:
  - name + version + build;
  - the GPL summary;
  - `SETTINGS.about.gsapPermission` (the §7.3 text);
  - LICENSE text and third-party notices, each fetched from `${import.meta.env.BASE_URL}notices/<file>`. Reject non-OK responses and any body starting with `<`, and show `SETTINGS.about.notGenerated` ("Generated by release builds") instead.
  - Long text is `<Text as="pre" variant="studio-mono" className="max-h-80 overflow-auto whitespace-pre-wrap">`.
- `README.md` `## Licence`: add the GSAP section with the §7.3 permission paragraph and a pointer to Settings ▸ About.

**Tests:** go to `{ tab: 'settings', inner: 'about' }` → the version `1.0.0` and the GSAP permission sentence render; the notices area shows the not-generated text in the test environment.

**Verify:** `cargo test -p questiongame-app && npx vitest run && npm run typecheck && npm run lint`. Stage the files.

---

### Task 16: The release check, `npm run release`, icons

**Files:**
- Create: `scripts/lib/release-check.ts`, `scripts/lib/release-check.test.ts`, `scripts/release-check.ts`
- Modify: `package.json`, `crates/app/tauri.conf.json` (`beforeBuildCommand`, `bundle.icon`), `apps/studio/src/host/fake.ts` (marker), `crates/app/tests/bundle.rs`, `crates/app/icons/*`

**What to build:**
- `scan(files) → Finding[]`, with rules by extension:
  - `.html`: `<script|link|img|iframe|audio|video|source … src|href="http(s)://`;
  - `.css` and `.js`: `url(http…`;
  - `.css`: `@import … http`;
  - `.js`: `fetch("http`, `import("http`;
  - any: `localhost:518[01]`;
  - `.js`: `\(\s*["'`]perf_report["'`]` (a call site, not the contract's array);
  - `.js`: `__QG_FAKE_HOST__`.
- The runner walks `dist/studio` and `dist/stage`, prints findings and exits 1. It also exits 1 if `dist/studio/index.html` is missing.
- Fake marker: `export const FAKE_HOST_MARKER = '__QG_FAKE_HOST__'`, plus a `readonly marker: typeof FAKE_HOST_MARKER` field on `FakeHost`, set in the literal. If the check finds it in `dist`, make `devFake.ts` import `./fake` dynamically inside its DEV branch.
- `package.json`: `"release:check": "vite-node scripts/release-check.ts"`, `"release": "npm run typecheck && npm run lint && npm run test:all && tauri build"`.
- `tauri.conf.json`: `"beforeBuildCommand": "npm run build && npm run release:check"`. Every production build is checked.
- Icons: `npx tauri icon crates/app/icons/icon.png -o crates/app/icons`; delete any generated `android/` and `ios/` folders; set `bundle.icon` to `["icons/32x32.png", "icons/128x128.png", "icons/128x128@2x.png", "icons/icon.icns", "icons/icon.ico"]`. Extend `bundle.rs` to assert `icon.icns` is listed.

**Tests:**
- Findings: a planted external `<script src>`, `fetch("https://…")`, `x("perf_report",{})`, `__QG_FAKE_HOST__` and `localhost:5181`.
- No findings: `"http://www.w3.org/2000/svg"`, `"https://react.dev/errors/…"` in a string, and `["client_log","perf_report"]`.

**Verify:** `npx vitest run scripts && npm run build && npm run release:check` (expected: clean) `&& cargo test -p questiongame-app --test bundle`. Stage the files.

---

### Task 17: P12.3 docs and commit

- Full suite.
- `CLAUDE.md`:
  - status sentence for P12.3;
  - section `#### Notices, the licence audit, and the release check (P12.3)`: the allowlist and exception list live in `scripts/lib/notices.ts`; a new dependency with another licence fails `npm run build`; `release-check` runs in `beforeBuildCommand`; the GSAP permission lives in README, About and the notices file; LICENSE stays verbatim;
  - add `npm run release` to the command block.
- `05_STUDIO_DESIGN.md` §18.3: About.
- `04_ROADMAP.md`: tick P12.3.
- Commit `P12.3: what the app is made of, and what it may ship`.

---

# Slice P12.4 — The release, checked on the installed build

### Task 18: Build, install, verify

Manual run on Windows, in this order. Record results in the commit body.

1. Close the dev app. Hash the dev library: `Get-FileHash "$env:APPDATA\org.questiongame.app\questiongame.sqlite3*" | Out-File $env:TEMP\qg-dev-before.txt`. Confirm `Test-Path "$env:APPDATA\org.questiongame.desktop"` is `False`.
2. `npm run release` → run `target\release\bundle\nsis\questiongame_1.0.0_x64-setup.exe` (SmartScreen: More info → Run anyway).
3. Launch from Start. First run → operator → Demo → Load into Control → full Play to `Completed`. Task Manager shows "questiongame" with WebView2 children.
4. Restart twice more for three consecutive Plays. Note the local time at each `Completed`. From the newest `%APPDATA%\org.questiongame.desktop\perf\*.jsonl`, read `os.total_ws_mb` at those seconds. Pass: third ≤ 110% of first. Also confirm every line has `"build":"release"` and no `"main"` / `"stage"` key.
5. Launch again from Start → the existing Studio is focused; `(Get-Process questiongame).Count` is 1.
6. Close guard:
   - New team + typed name → X → *Unsaved changes* → Keep editing (stays) → X → Discard → quits.
   - Relaunch, load a game → X → Quit dialog → Keep working → X, X → exits.
7. Settings ▸ About: `1.0.0`, `release`, GPL, GSAP permission, notices present.
8. Uninstall outcomes:
   - a. **Data only:** Settings ▸ Data ▸ Remove generated data. The Roaming folder is gone, and `%LOCALAPPDATA%\org.questiongame.desktop\EBWebView\Default\Local Storage` holds no data. **If the profile survived**, implement the §5.3 fallback in `uninstall_data`: after `remove_dir_all`, spawn detached `cmd /C timeout /T 3 /NOBREAK >NUL & rmdir /S /Q "<app_local_data_dir>"` with `CREATE_NO_WINDOW`. Rebuild and repeat 8a.
   - b. **App only:** relaunch → Settings ▸ Data ▸ Uninstall… → leave the box unchecked. `%LOCALAPPDATA%\questiongame` is gone; the data folders remain.
   - c. **App and data:** reinstall, launch once, uninstall from Windows Settings ▸ Apps with the box checked. Both `org.questiongame.desktop` folders are gone.
9. Re-hash the dev library, compare with `qg-dev-before.txt`: identical.
10. Reinstall; run the installed app and `npm run dev:app` side by side. Each shows its own library, and the titles differ.
11. (Operator) offline run. (Later, on a Mac) the macOS criteria.

### Task 19: P12.4 docs and commit

- `04_ROADMAP.md`: tick every verified exit criterion, leaving offline (operator) and macOS open as stated; mark P12 ☑ once all Windows criteria pass.
- `CLAUDE.md`: status "P12 done on Windows; macOS pending a Mac", plus any finding from Task 18 (e.g. the §5.3 fallback, if it was needed).
- Commit `P12.4: the release, checked on the installed build`, with measured numbers (working set per Play, installer size) in the body.

---

## Self-review

- **Spec coverage:**
  - §3 → Tasks 2, 7;
  - §4.1 → 3; §4.2 → 5, 16; §4.3 → 4; §4.4–4.5 → 1; §4.6 → 6;
  - §5.1 → 8; §5.2–5.4 → 12, 18; §5.5 → 8, 16;
  - §6.1 → 9; §6.2 → 10, 11; §6.3–6.4 → 8; §6.5–6.6 → 16;
  - §7.1 → 15; §7.2 → 14; §7.3 → 14, 15;
  - §8 exit criteria → 18.
- **Deviations from the spec:**
  - `tauri.conf.json` keeps an explicit `"version"` (§6.3 allowed it), held by `tests/bundle.rs`.
  - The notices generator lives in `scripts/` (vite-node) and runs from the root `build` script rather than Studio's `prebuild`.
- **Names used across tasks:** `identity::build_label`, `perf::DIR`, `QuitState`/`CloseDecision`, `QUIT_ROUTE`/`askLeave`, `FakeHost.paths`/`quits`/`closeCancels`/`uninstallerStarted`, and the `app` command group (`app_quit`, `app_close_cancelled`, `app_uninstall`, `app_info`).

