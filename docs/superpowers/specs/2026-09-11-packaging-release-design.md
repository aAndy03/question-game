# P12 — Packaging and release

**Status:** design, approved in conversation 2026-09-11; awaiting review of
this file. Implementation plan to follow in
`docs/superpowers/plans/2026-09-11-packaging-release.md`.

**Where this ends up:** working material for one phase. As each slice ships,
the durable record goes where this repo keeps it: a `## P12` section in
`docs/v1/04_ROADMAP.md`, the rules a later phase must not undo in
`CLAUDE.md`, and any Settings surface in `docs/v1/05_STUDIO_DESIGN.md`.
Nothing here overrules `optimized_first_spec.md`.

---

## 1. Scope

The roadmap's P12 deliverables are Windows and macOS bundles, install paths
kept apart from user data, an uninstall that offers app files and generated
user files independently, processes visible in Task Manager, GPLv3 notices,
and offline verification. This design narrows that list in three places:

- **Windows ships now, macOS is prepared.** Tauri cannot build a macOS bundle
  on Windows. The macOS config, icons and minimum OS are written so the bundle
  builds unchanged on a Mac later. The macOS exit criteria stay open, marked
  *needs a Mac*.
- **The operator verifies offline behaviour** personally. This phase only adds a
  build-time scan that fails if the bundle references an external URL (§6.5).
- **Two things the operator asked for** shape most of the work:
  1. The installed app must never touch the dev library.
  2. The installed app keeps a performance log, **host-side only**. No webview
     instrumentation ships in production.

## 2. Decisions taken

| Question | Answer |
| --- | --- |
| macOS | Windows now; macOS config prepared, built and verified later on a Mac |
| Code signing | Unsigned for v1; the README documents the one-time SmartScreen click |
| Production library | Starts fresh (first run → Demo). No copy from dev, ever, in either direction |
| Dev/prod separation | Two app identifiers (§3), not a subfolder or an env override |
| Production perf log | Host and OS only. The webviews' per-second reports, the Profiler watchdog, the user-timing sweep and breadcrumbs are dev-only |
| Webview error forwarding | Kept in production: uncaught errors, rejected promises, `console.error`/`warn` from Studio. It costs nothing until something breaks |
| GSAP's license | A GPLv3 §7 additional permission, added by the copyright holder (§7.3) |
| Version | `1.0.0` |

## 3. Two identities

### 3.1 The problem

Tauri derives every per-app location from the `identifier` in
`tauri.conf.json`, and dev and a packaged build use the same one today
(`org.questiongame.app`). So an installed build would:

- open the dev library (`%APPDATA%\org.questiongame.app\questiongame.sqlite3`);
- share the single-instance lock, so dev and prod could not run at once;
- share the WebView2 profile (`%LOCALAPPDATA%\org.questiongame.app\EBWebView`),
  including the chrome preferences Studio keeps in `localStorage`;
- have the uninstaller's *Delete the application data* box run
  `RmDir /r "$APPDATA\${BUNDLEID}"` and `RmDir /r "$LOCALAPPDATA\${BUNDLEID}"`,
  which deletes the dev library.

The Tauri CLI also warns that an identifier ending in `.app` clashes with the
macOS bundle extension, so the production identifier has to change regardless.

### 3.2 The split

| | Dev (`npm run dev:app`) | Production (installed) |
| --- | --- | --- |
| Identifier | `org.questiongame.app` (**unchanged**) | `org.questiongame.desktop` |
| Library, log, perf, lock | `%APPDATA%\org.questiongame.app\` | `%APPDATA%\org.questiongame.desktop\` |
| WebView2 profile | `%LOCALAPPDATA%\org.questiongame.app\` | `%LOCALAPPDATA%\org.questiongame.desktop\` |
| App files | the repo and `target\` | `%LOCALAPPDATA%\questiongame\` (NSIS, per user) |
| Studio window title | `questiongame Studio (dev)` | `questiongame Studio` |

Dev keeps its existing identifier, so **nothing on disk moves**. The Tauri CLI
will keep printing its `.app` warning during `tauri dev`. That is cosmetic, and
it is the price of not relocating 15.8 MB of library and 251 MB of WebView2
profile.

### 3.3 How the split is made

- `crates/app/tauri.conf.json` is **production**: `identifier:
  "org.questiongame.desktop"`. `tauri build` needs no flags.
- `crates/app/tauri.dev.conf.json` is a merge patch containing only
  `{ "identifier": "org.questiongame.app" }`.
- `npm run dev:app` becomes
  `tauri dev --config crates/app/tauri.dev.conf.json`.
- **The boot identity check.** Forgetting the flag must be impossible to miss,
  in both directions. As the first step of `setup`, before anything resolves a
  path, the app compares `tauri::is_dev()` with whether the identifier is the
  dev one:

  ```text
  is_dev()  identifier                 result
  true      org.questiongame.app       run (dev)
  false     org.questiongame.desktop   run (production)
  true      org.questiongame.desktop   refuse: "this dev build carries the production identity; run it with npm run dev:app"
  false     org.questiongame.app       refuse: "this release build carries the dev identity; build it with npm run release"
  ```

  `tauri::is_dev()` is Tauri's own definition of dev: the frontend is loaded
  from `devUrl` rather than embedded. That is exactly the line between the
  two identities. A refusal is shown with the boot-failure message box (§4.5).
  The two identifiers and the check live in a new
  `crates/app/src/identity.rs` (`DEV_IDENTIFIER`, `RELEASE_IDENTIFIER`,
  `check(is_dev, identifier) -> Result<(), String>`), a pure function the
  table above is the test for.
- `crates/app/tests/identity.rs` reads both config files. It fails if the two
  identifiers are equal, if the overlay changes anything besides
  `identifier`, or if either identifier differs from the constants the boot
  check uses.

### 3.4 What is deliberately not done

No migration and no copy: production starts empty and goes through first run.
The two identities never read each other's folders. As a side effect, a dev
build running a newer migration can never upgrade the library the installed
release depends on. `catalog/db.rs` already refuses a database newer than the
binary; separation means that refusal never fires on the operator's show
library because of dev work.

## 4. Production observability

### 4.1 The performance log, host side

- `perf::enabled()` defaults to **on in every build**. `QUESTIONGAME_PERF=0`
  (or `off` / `false`) still turns it off.
- A production line carries these sections, all measured by the Rust process:
  - `os`: the process tree from `sysinfo`, meaning `questiongame.exe` and every
    WebView2 process, each with CPU and working set (the Task Manager numbers).
  - `host`: commands, lock hold times, emissions and bytes, persists.
  - `spike`: present only on an abnormal second.
- Every line gains `"build": "dev" | "release"`, taken from `tauri::is_dev()`.
  In a release line the `main` / `stage` / `stats` keys are absent by design.
  Without the field, a reader would take that absence for a webview that
  stopped reporting.
- **Retention** is the newest 10 runs **and** at most 100 MB across them. The
  oldest runs are pruned first, and the current run is never pruned. At the
  ~1.3 KB/line measured on the operator's machine, a three-hour show is about
  14 MB.
- Cost in production is one `sysinfo` refresh and a few atomic counters per
  second, written by a task that takes no host lock (unchanged from P11.5).

### 4.2 The webviews in production

A production build of either webview does **no per-second diagnostic work**:

| | Dev | Production |
| --- | --- | --- |
| `perf_report` (heap, DOM, commits, components, long tasks) | ✓ | — |
| User-timing sweep | ✓ | — |
| Render-loop watchdog (`Profiler` → `onPageCommit`) | ✓ | — (React's production build never calls `onRender`) |
| `crumb()` breadcrumbs, the `studio ready` line | ✓ | — |
| Studio: uncaught errors, rejected promises, `console.error`/`warn` → `client_log` | ✓ | ✓ |
| Stage | sweep + `perf_report` | nothing (it forwarded no errors before, and does not start now) |

- The gate is `import.meta.env.DEV` inside `installDiagnostics()` (Studio) and
  `installStageDiagnostics()` (Stage). Vite replaces it with a constant at build
  time, so the dev-only code is not merely skipped in production; it is
  tree-shaken out of the bundle.
- **Proof, not intent.** `scripts/release-check.mjs` (§6.5) fails if the string
  `perf_report` appears anywhere under `dist/`. A unit test per webview stubs
  `DEV=false` and asserts `installDiagnostics()` starts no interval and posts
  nothing but errors.
- Production already drops a great deal without any change here:
  - React's development build, including its per-component
    `performance.measure` (the P11.4 2.8 GB growth);
  - StrictMode's double renders and double effects;
  - both Vite/Node dev servers and HMR;
  - Rust's unoptimised debug build;
  - `debug_assert!`-based lock discipline;
  - the CDP debug port.

  The production perf log is how those savings get *measured* rather than
  assumed.

### 4.3 `questiongame.log`, rotated

It stays at `debug` for both crates (every command's `guard::allow` line). At
boot, before the file is opened, a log over **10 MB** rotates:
`questiongame.2.log → .3`, `.1 → .2`, current `→ .1`. The oldest is dropped.
That caps the log at about 40 MB. A rename that fails (another process holds
the file) is ignored and the run appends as before. The `---- run start ----`
banner stays.

### 4.4 Panics reach the log

A release build has no console (`windows_subsystem = "windows"`), so today a
panic disappears. Right after the tracing subscriber is installed, a
`std::panic::set_hook` writes `tracing::error!` with:

- the payload;
- the `file:line` from `PanicHookInfo::location()`, which needs no debug info;
- the thread name;
- a backtrace when one can be captured.

It then calls the previous hook. `panic` stays `unwind` (§6.4), so a panicking
command fails that one command and the show goes on.

### 4.5 Boot failures are shown

Two kinds of boot failure leave a release build with a silent exit today:

- `setup` returns an error: the data directory is unwritable, the database is
  refused or corrupt, or the identity check fails (§3.3);
- the process-lock fallback trips (§6.1).

On any of these, a native message box (the `rfd` crate) shows the reason and
the log file's path before the process exits. `rfd` is called synchronously
on the main thread, which is where `setup` runs.

### 4.6 Settings ▸ Data shows where things are

- `paths_get` gains `logFile`, `perfDir` and `uninstaller: string | null`.
- The Data group lists the data folder (with *Open*), the log file and the perf
  folder.
- `cuePack` becomes `string | null`. In a production build the pack is embedded
  in the binary: `resource_dir()/stage/audio` does not exist, and *Reveal* would
  fail. The host returns `null` when the directory is absent, and the row
  hides. User-replaceable packs are v2.

## 5. Installer and uninstall

### 5.1 Windows installer

`bundle.targets: ["nsis"]`. MSI is dropped: it needs WiX at build time,
installs per-machine only, and has no data checkbox.

| Key | Value | Why |
| --- | --- | --- |
| `bundle.windows.nsis.installMode` | `currentUser` | no admin prompt; installs to `%LOCALAPPDATA%\questiongame` |
| `bundle.windows.webviewInstallMode` | default (`downloadBootstrapper`) | Windows 11 ships WebView2; only a Windows 10 machine without it needs the network once, at install |
| `bundle.licenseFile` | `../../LICENSE` (unchanged) | the GPL on the installer's license page, verbatim |
| `bundle.publisher` | `questiongame contributors` | shown in Add/Remove Programs |
| `bundle.copyright` | `© 2026 questiongame contributors — GPL-3.0-or-later` | |
| `bundle.category` | `Education` | |
| `bundle.shortDescription` | `An offline quiz show: an operator studio and a fullscreen audience stage.` | |
| `bundle.longDescription` | `questiongame runs a quiz show from one computer. Studio is where the operator prepares teams, domains, questions and games and runs each Play; Stage is the fullscreen audience surface, on one display or several. Everything works offline.` | |

Task Manager shows the process as `questiongame`, with its WebView2 children
grouped under it. No work is needed here beyond `productName`.

### 5.2 Three outcomes, two doors

| Outcome | Where | What goes |
| --- | --- | --- |
| App only | Windows uninstaller, box unchecked | `%LOCALAPPDATA%\questiongame\`, shortcuts, the Add/Remove entry |
| App and data | Windows uninstaller, *Delete the application data* checked (Tauri's own) | the above plus `%APPDATA%\org.questiongame.desktop\` and `%LOCALAPPDATA%\org.questiongame.desktop\` |
| Data only | Settings ▸ Data ▸ *Remove generated data* (`uninstall_data`, exists since P10) | `%APPDATA%\org.questiongame.desktop\` and the WebView2 profile's contents (§5.3) |

None of the three can touch a dev folder: they are named after a different
identifier. The exit criteria check this directly (§8).

### 5.3 *Remove generated data* also clears the webview profile

Today `uninstall_data` removes the Roaming folder and leaves the WebView2
profile behind: about 250 MB of cache, plus the chrome preferences in
`localStorage`. It gains one step before quitting:
`WebviewWindow::clear_all_browsing_data()` on the Studio window. The profile is
shared by every webview, so one call covers them all. The existing guards are
unchanged: the command is pin-gated and refused while a Play is loaded.

**Risk:** WebView2 clears asynchronously. If the process exits before the
clear finishes, part of the profile survives. P12.4 verifies this. If it fails,
the fallback is a detached cleanup that deletes `%LOCALAPPDATA%\<identifier>`
once the WebView2 processes have exited.

### 5.4 *Uninstall questiongame…* from inside the app

The Data group gains one button, **Uninstall questiongame…**, so one screen
offers app files and generated data. The host answers `paths_get.uninstaller`
with the path of `uninstall.exe` beside the running executable, or `null`
when there is none: in dev, or on macOS. The button shows only when the path is
non-null, which means no `is_dev()` branch in Studio.

The new command `app_uninstall` has the same refusals as `uninstall_data`:
pin-gated, and refused while a Play is loaded. It spawns the uninstaller and
quits. The uninstaller's own page is where the operator ticks, or does not
tick, the data box.

### 5.5 macOS, prepared

- `crates/app/tauri.macos.conf.json` (Tauri merges platform files
  automatically) sets:
  - `bundle.targets: ["app", "dmg"]`;
  - `bundle.macOS.minimumSystemVersion: "13.0"`;
  - `bundle.macOS.signingIdentity: "-"` (ad-hoc, so Apple Silicon launches it).
- Icons come from `npx tauri icon`, which adds `icon.icns` (§6.6).
- Documented, not built:
  - First launch of an unsigned app goes through System Settings ▸ Privacy &
    Security ▸ *Open Anyway*.
  - Removing data uses the same in-app button; removing the app is dragging it
    to the Trash.
  - Data lives in `~/Library/Application Support/org.questiongame.desktop`.
- Known unknowns for the Mac session:
  - Stage fullscreen on a second display (macOS fullscreen is a Space);
  - Cmd+Q through the close guard (`RunEvent::ExitRequested`);
  - `sysinfo` not seeing WebKit's XPC processes as children, so the `os`
    section under-reports there.

## 6. Production hardening

### 6.1 One instance, and a second launch focuses it

`tauri-plugin-single-instance`, registered first on the builder. Its callback
unminimises and focuses the Studio window. Today a second launch dies silently:
the lock error goes to stderr, which a release build does not have. The plugin
keys on the identifier, so dev and production each get their own. The
`questiongame.lock` file lock stays as the database's own guard. If it ever
trips, it goes through §4.5.

### 6.2 The window-close guard (deferred from P7)

Closing Studio currently calls `app.exit(0)` at once. A stray click on the X,
or an Alt+F4, mid-show blacks out Stage.

```text
Studio CloseRequested
  ├─ a close is already pending?  → exit now      (the escape hatch: a hung Studio cannot trap the operator)
  └─ otherwise                    → prevent_close, mark pending, emit `close-requested` to `main`
Studio (bridge.tsx → a QuitGuard organism)
  ├─ no dirty editor and no Play loaded → invoke `app_quit`
  └─ otherwise → ConfirmDialog, at most 3 actions:
        dirty editor:  Save and quit · Quit without saving · Keep working
        Play loaded:   Quit · Keep working   ("The Play is saved; it resumes next time")
        Keep working → invoke `app_close_cancelled` (clears pending)
```

- The dirty state comes from the existing nav guard (`useDirtyGuard` /
  `draft.isDirtyNow()`), so this adds no second notion of "unsaved".
- Play loaded comes from `usePlayState((s) => s !== null)`.
- New commands, `main` only: `app_quit` (exits 0) and `app_close_cancelled`.
  Both go into `packages/contract`'s command groups. Stage and `stats` are
  refused by `guard::allow` as they are for every command outside their lists.
- New event: `close-requested`, to `main` only.

### 6.3 One version

`1.0.0`, with `[workspace.package].version` in `Cargo.toml` as the source.
`version` is removed from `tauri.conf.json`, so Tauri reads Cargo's. If the CLI
does not resolve workspace inheritance, `tauri.conf.json` keeps an explicit
`"version"` instead. Either way, a test fails when `package.json`, `Cargo.toml`
and whatever `tauri.conf.json` says disagree.

### 6.4 Release profile

```toml
[profile.release]
lto = "thin"
codegen-units = 1
# panic stays "unwind": one panicking command must not end the show.
```

### 6.5 `npm run release` and the release check

`npm run release` runs, and stops at the first failure:

1. `typecheck` → `lint` → `test:all`;
2. `tauri build` (production identity; frontend via `beforeBuildCommand`);
3. `scripts/release-check.mjs` over `dist/`, which fails on:
   - any `http://` / `https://` **load**: `src`, `href`, `url(…)`, `fetch(`,
     `import(`. XML namespaces and licence-comment URLs are allowlisted;
   - the string `perf_report` (§4.2);
   - the literal `__QG_FAKE_HOST__`, a marker constant added to
     `apps/studio/src/host/fake.ts` for this check, which proves the in-memory
     host was tree-shaken out.

The artifact is `target/release/bundle/nsis/questiongame_1.0.0_x64-setup.exe`.

### 6.6 Icons

`npx tauri icon crates/app/icons/icon.png` regenerates the full set, including
`icon.icns` and the Windows Store sizes. The source is the current `icon.png`
unless the operator supplies a better one. `bundle.icon` lists what the command
writes.

## 7. GPLv3 notices

### 7.1 Settings ▸ About

A fourth inner tab: **Monitors | Settings | Keyboard shortcuts | About**. It
reads a new read-only command, `app_info`:

```ts
{ version: string; build: 'dev' | 'release'; identifier: string }
```

It renders:

- the name and version;
- a GPL-3.0-or-later summary (you may redistribute and modify it under the
  GPL's terms; it comes with no warranty);
- the full LICENSE text;
- the GSAP permission (§7.3);
- the third-party notices.

`app_info` is callable by `main` only, and joins `packages/contract`'s command
groups like the §6.2 commands.

### 7.2 Third-party notices, and the licence audit they imply

`scripts/notices.mjs`, run by Studio's `prebuild`, writes
`apps/studio/public/notices/THIRD-PARTY-NOTICES.txt` and a copy of `LICENSE`.
Vite copies both into `dist/studio/`, so they are embedded, served
same-origin, and need no resource config and no command. The output is
gitignored. In dev, About says the notices are generated by release builds.

The generator is also **the licence audit**. It reads:

- `cargo metadata` for every crate in the `questiongame-app` dependency graph
  (normal dependencies, not dev or build);
- the `dependencies` of `apps/*` and `packages/*`, walked transitively.

It **fails** on any licence outside this allowlist:

- MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, Zlib, 0BSD, BSL-1.0;
- Unicode-3.0, Unicode-DFS-2016, MPL-2.0, CC0-1.0, Unlicense, OFL-1.1;
- plus an explicit per-package exception list that holds exactly `gsap` and
  `@gsap/react`.

The fonts (Space Grotesk, Space Mono, Geist) are listed with the OFL-1.1 text.

### 7.3 The GSAP permission

`gsap` and `@gsap/react` ship under GSAP's *Standard "no charge" license*
(https://gsap.com/community/standard-license/, effective 2025-04-30). The
installed `gsap@3.15.0` names it in its own `package.json` `license` field,
so it is the licence that applies to the version this app bundles. It is free
of charge, including for commercial use, but it is not a free-software licence:

- it forbids use in "tools that allow users to build visual animations without
  code" that compete with Webflow;
- Webflow may revoke it for non-compliance;
- it grants no right to modify.

Those are restrictions GPLv3 §10 does not let a conveyor add, and they are
exactly the freedoms the GPL hands downstream. questiongame is not such a tool,
but a GPL recipient may modify it into anything. As the copyright holder, the
operator grants an additional permission under GPLv3 §7, following the FSF's
template for GPL-incompatible libraries:

> **Additional permission under GNU GPL version 3 section 7.** If you modify
> this Program, or any covered work, by linking or combining it with GSAP (or
> a modified version of that library), containing parts covered by the terms
> of the GSAP Standard License, the licensors of this Program grant you
> additional permission to convey the resulting work.

It goes in `README.md` (a *License* section), in About, and at the top of the
notices file. `LICENSE` stays the verbatim GPL text, since the GPL forbids
changing it. This design flags the conflict; it is not legal advice.

## 8. Slices, tests and exit criteria

Each slice is one commit on `master`, titled `P12.N: …`, with the docs updated
in the same commit (the repo's phase convention).

| Slice | Contents | Tests |
| --- | --- | --- |
| **P12.1** Two identities, host-side monitoring | §3 in full; §4.1–4.6 | `tests/identity.rs`; the boot identity-check table; perf `enabled()` default and env override; retention by count and by size, never the current run; log rotation; the `build` field; the webview `DEV=false` tests; `cuePack: null` when absent |
| **P12.2** Installer, uninstall, hardening | §5; §6.1–6.4 | bundle config test (targets, install mode, identifier); `app_uninstall` / `app_quit` / `app_close_cancelled` in the guard lists and the contract; `QuitGuard` behaviour (nothing dirty → quits; dirty → three actions; Play loaded → two; cancel clears pending); `uninstaller` is `null` without `uninstall.exe`; version agreement |
| **P12.3** Notices and licence | §6.5–6.6; §7 | the notices generator fails on a non-allowlisted licence and passes today's tree; the About tab renders version, GPL and the GSAP permission; `release-check.mjs` fails on a planted external URL and on `perf_report` |
| **P12.4** The release, checked on the installed build | no new code, except the §5.3 fallback if needed | the exit criteria below |

**Exit criteria (P12.4), on Windows:**

- ☐ Clean install (no `org.questiongame.desktop` folders beforehand) → first
  run → Demo recipe → a full Play to `Completed`.
- ☐ **Dev untouched.** `%APPDATA%\org.questiongame.app\questiongame.sqlite3*`
  are byte-identical (hash) before the install and after every step below,
  including all three uninstall outcomes.
- ☐ Dev and the installed app run side by side, each on its own library.
- ☐ Each uninstall outcome in §5.2 removes exactly its set and nothing else.
- ☐ No memory growth across three consecutive Plays on the installed build.
  Total working set (`os`) at each Play's `Completed` screen: the third is at
  most 110% of the first.
- ☐ The installed build's perf log carries `"build": "release"`, no webview
  sections, and stays within its retention.
- ☐ A second launch focuses Studio. The close guard asks with a dirty editor
  and with a loaded Play. A second close exits.
- ☐ About shows `1.0.0`, the GPL and the GSAP permission.
- ☐ A run with the network disabled behaves identically. **Verified by the
  operator.**
- ☐ macOS: clean install → full Play; uninstall. **Needs a Mac; stays open.**

## 9. Risks

| Risk | Mitigation |
| --- | --- |
| `clear_all_browsing_data` finishes after the process exits | Verified in P12.4; fallback is a detached post-exit delete (§5.3) |
| The Tauri CLI does not read a workspace-inherited version | Explicit `version` in `tauri.conf.json`, held equal by a test (§6.3) |
| A Windows 10 machine without WebView2, offline | Documented; `offlineInstaller` (+~130 MB) is the switch if it ever matters |
| SmartScreen on the unsigned installer | Documented one-time *More info → Run anyway* |
| Someone runs `target/debug/questiongame.exe` directly | The identity check refuses it with instructions (§3.3) |
| macOS behaviour is unverified | Config prepared; the unknowns are listed in §5.5 for the Mac session |

## 10. Not in P12

Auto-update (it needs a server and the network), code signing, notarisation,
Linux bundles, MSI, any dev↔prod library copy, the CDP port in release builds,
webview perf reporting in release builds, and forwarding Stage errors to the
log.
