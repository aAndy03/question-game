# Release channels (A): the test list

*Proposed by Sonnet 5.5 (medium) on 2026-10-19 from the design and the code; sorted and decided by the implementer. Each task in `2026-10-19-channels.md` names the ids it owns. **Kinds:** U unit · I integration · E e2e. **[MUST]** = must land with its task. Dropped ids say why.*

Shared helpers: `snapshot(dir)` → `(relative path, size, bytes, mtime)` per entry, **atime excluded** (NTFS/macOS update it on read); equality = byte-, listing- and mtime-identical. `make_stable(dir, …)` builds a library through `crates/host/examples/e2e_library.rs`. Fault injection: `stable_copy` takes a `fail_at: Option<Stage>` test hook (`CopyDb · CopyWal · Open · Vacuum · Rename`).

## Decisions on the flags

| # | Flag | Decision |
|---|---|---|
| 1 | `VACUUM INTO` refuses an existing target | Already planned: compact into `questiongame.copy.sqlite3`, drop the connection, remove the old file + sidecars, rename. |
| 2 | Lock window | **The shared lock is held for the whole copy.** A stable started mid-copy says "already running" for those seconds — acceptable, and it is what makes the copy consistent. (SC12) |
| 3 | Stable newer than Beta | `CopyError::StableNewer` when the copy's `user_version` > Beta's migrations, checked before compacting. (SC26) |
| 4 | Disk preflight | **No preflight** (YAGNI): disk full is an ordinary failure path that cleans up (SC38–39). SC37 dropped. |
| 5 | What "rows" means | Empty = no operators, teams, domains, questions, recipes, plays, assets. Settings and meta rows don't count. (CMD06) |
| 6 | Chip under `E2e(Beta)` | Already planned: `AppInfo.channel`, not `build`. |
| 7 | Unknown `QUESTIONGAME_E2E_CHANNEL` | **Fail loudly** for the e2e identity: `channel` returns `Err`, boot shows it. A typo must not run stable specs green. (ID08) |
| 8 | `Channel::Beta` on `release/1.x` | The table (`BETA_IDENTIFIER`, `Channel::Beta`, `Line::Beta`) is A1 data; no Beta *path* is reachable on stable because `check` refuses the beta identifier there until A2. REG12 checks `release/1.x` has no `stable_copy`, welcome or beta overlay. |
| 9 | Tag globs | Trigger stays `v*`; `release-route.ts` classifies and refuses. WF11 dropped. |
| 10 | Two messages for one fact | `stable_newer` only when the **running** version is a prerelease. (UPD14) |
| 11 | Icons elsewhere in config | Base config lists icons only in `bundle.icon`; ID16 keeps that true. |
| 12 | Real Beta identity not in CI | Manual: the build-only Beta run, installed beside stable (Task 12). |
| 13 | Grep fragility | Comments stripped, and the test asserts both expected files match. (ID19) |
| 14 | atime | Excluded from `snapshot`. |
| 15 | macOS | `cfg(unix)` variants of SC07 and SC51; no e2e. |
| 16 | Crash between swap and row | `beta_welcome_get` shows only on an empty library, so after a crash it does not show; Studio treats `LibraryNotEmpty` as done. (CMD18) |
| 17 | Stored paths | `assets.path` holds whatever the user picked; the host never writes data-folder paths. SC50 kept as a cheap guard. |
| 18 | `stats` webview | Studio-only: `stats` may not call the beta commands. (CMD03) |

Also corrected by this list: the welcome copy is **EN and RO** (the design says so; the plan had EN only), with the same language toggle *What's new* uses.

## 1. Identity and channel — Task 1, Task 7

- ID01 U `check(false, BETA) == Ok`. *(T7)*
- ID02 U `check(true, BETA)` errs naming `npm run release`. *(T7)*
- ID03 U full matrix: 4 ids × `is_dev` + 2 unknown; exactly (true,DEV) (false,RELEASE) (false,E2E) (false,BETA) Ok. *(T7)*
- ID04 U the three 1.0.2 error strings unchanged byte for byte; the unknown-id text lists beta. *(T7)*
- ID05 U `build_label_for(false|true, BETA) == "beta"`; e2e and release unchanged. *(T7)*
- ID06 [MUST] U env ignored outside e2e: `channel(RELEASE, Some("beta")) == Ok(Stable)`, `(DEV, …) == Ok(Dev)`, `(BETA, Some("stable")) == Ok(Beta)`. *(T1)*
- ID07 U e2e: `None`/`"stable"` → `E2e(Stable)`, `"beta"` → `E2e(Beta)`. *(T1)*
- ID08 U e2e: `""`, `"BETA"`, `" beta"`, `"gamma"` → `Err` naming the variable. *(T1)*
- ID09 U the env is read only for the e2e identity (injected getter panics otherwise). *(T1)*
- ID10 [MUST] U `is_beta` exhaustive over the enum (a `match` with no `_`). *(T1)*
- ID11 I beta overlay key sets: `{identifier, productName, bundle}`, `bundle = {icon}`. *(T7)*
- ID12 I RFC 7396 merge of base + beta: everything but identifier, productName, icons equals base. *(T7)*
- ID13 I four ids pairwise distinct, case-insensitively too, no slashes, none a prefix of another. *(T7)*
- ID14 I every beta icon exists, `.ico` and `.icns` present, each differs from its stable twin. *(T7)*
- ID15 I beta icon pixel sizes equal the stable twins; the 32 px PNG is not fully transparent. *(T7)*
- ID16 I base config names icons only under `bundle.icon`. *(T7)*
- ID17 I `package.json` has `build:beta` with `--config crates/app/tauri.beta.conf.json`, without `--no-bundle`. *(T7)*
- ID18 I lock paths differ per data dir; a lock on one does not block the other. *(T7)*
- ID19 [MUST — via SC grep] I only `identity.rs` and `stable_copy.rs` name the stable folder, comments stripped, both files found. *(T8)*
- ID20 I `tauri.macos.conf.json` still has no identifier or productName. *(T7)*

## 2. stable_copy — Task 8

Never writes stable: **SC01 [MUST]** success → `snapshot` equal · SC02 with a 1 MB pending `-wal` → equal · SC03 after refusal → equal · SC04 every fault stage → `Err` and equal · SC05 read-only attributes on db and wal → still succeeds · **SC06 [MUST]** listing stays exactly `[questiongame.sqlite3]`, no sidecar, no lock file created · **SC07 [MUST]** exclusive lock held → `Err(Running)`, Beta unchanged · SC08 release the lock → second call Ok · **SC09 [MUST]** no lock file → proceeds, none created · SC10 stale unheld lock file → Ok · SC11 a shared holder → Ok · SC12 the shared lock is held between the db and wal copies (exclusive attempt fails mid-copy, succeeds after) · SC13 lock released on every error path.

Completeness: **SC14 [MUST]** 500 rows only in the `-wal`, no `-shm` → all 500 copied, logical dump equal · SC15 a 4 MB+ wal · SC16 zero-byte wal · SC17 orphan wal, no db → `Missing` · SC18 a stray `-shm` is neither read nor copied · SC19 torn wal tail → last intact commit, `integrity_check` ok · SC20 `journal_mode=DELETE` stable db · SC21 no stable folder → `Missing`, nothing created · SC22 folder but no db → `Missing` · SC23 zero-byte db → `Missing` · **SC24 [MUST]** 4 KB random bytes → `Err(Sqlite)`, temp gone, both sides untouched · SC25 truncated db → same · SC26 `user_version` above Beta's → `Err(StableNewer)`, nothing written · SC27 *(cfg windows)* db held with share mode 0 → `Err(Io)`, clean. *SC28 ACL denial: dropped — needs ACL tooling CI does not have; SC27 covers an unreadable source.*

Temp and Beta side: SC29 temp is under the Beta dir, not `temp_dir()`, not stable · **SC30 [MUST]** no temp entry left after success and every fault stage · SC31 a stale temp folder from a crash is removed, not reused · SC32 two concurrent calls → one Ok, one refused, one valid library · **SC33 [MUST]** parent named `Ștefan-Ădrian Pânză 日本語 😀` → Ok, dump equal · SC34 `O'Brien` path (bound parameter), a spaced path, a >260-char path on Windows · SC35 `#[ignore]` a junction-redirected stable folder · SC36 an 8 MB library in the suite, `#[ignore]` 1.5 GB · SC38 [MUST] write fails with ENOSPC after N bytes → `Err(Io)` "not enough space", clean · SC39 `SQLITE_FULL` at Vacuum → same · SC40 [MUST] a populated Beta library → refused, bytes equal *(owned by T9 as CMD05)* · SC41 [MUST] replaces the boot-time empty Beta library and its sidecars *(T9)* · SC42 failure just before the rename → the old empty library opens *(T9)*. *SC37 preflight: dropped (flag 4).*

Fidelity: SC43 [MUST] stamped 1.0.2 → `open_file` with Beta's options: `previous_version == Some("1.0.2")`, backup in Beta's backup dir, stamp moves; nothing in stable's backups · SC44 unstamped → `previous_version == None`, `since(None, …) == Show("1.0.1")` · SC45 `app.last_seen_version` carried · SC46 every table (archived rows, plays, events, a `playing` Play) count- and row-hash equal · SC47 proptest generated libraries → `dump` equal · SC48 after open: `wal`, `FULL`, `user_version == MIGRATIONS.len()` · SC49 Beta's search finds a copied question · SC50 no TEXT column of the copy names the stable folder.

Resolution: SC51 `stable_dir(Beta, …/org.questiongame.beta)` → sibling `org.questiongame.desktop` (Windows and mac shapes) · SC52 override honoured only by `E2e(Beta)`; `Stable`, `Dev`, `E2e(Stable)` → `None` · SC53 empty, relative or missing override → `None` · SC54 stable dir == Beta dir (case-insensitive) → refused · SC55 the e2e override pointing at a folder named `org.questiongame.desktop` → refused.

## 3. The copy command and guards — Task 9

**CMD01 [MUST]** `Stable`, `Dev`, `E2e(Stable)` → `NotBeta` before any resolver runs · CMD02 `Beta`, `E2e(Beta)` reach it · **CMD03 [MUST]** `stage` and `stats` refused, `main` allowed; Stage's list still exactly two · CMD04 in `COMMAND_GROUPS`, `generate_handler!`, callers `[main]` · **CMD05 [MUST]** one team → `LibraryNotEmpty`, bytes unchanged · CMD06 only an archived question / a recipe / a Play / an operator / an asset → refused; settings and meta only → allowed · CMD07 a loaded Play → refused · CMD08 a second call after success → refused · CMD09 stable running → code `beta.stable_running` · CMD10 no stable → `beta.no_stable` · CMD11 the serialised error JSON for each variant is pinned · CMD12 the host lock is not held during the byte copy (check, release, copy, re-lock, re-check, swap): `app_info` answers in < 200 ms during an injected 1 s copy · CMD13 after success `catalog_list` shows the copy; `catalog-changed` and `recipe-changed` reach `main` and `stats`, nothing reaches Stage · **CMD14 [MUST]** reopen fails → an empty library is open at the Beta path, the host answers, stable untouched · **CMD15 [MUST]** one new backup in Beta's backups, prune honours `keep` · CMD16 the copy's log line lands in Beta's log only · CMD17 two concurrent invokes → one Ok, one refused · CMD18 the welcome row is written right after the swap; with rows and no row, `beta_welcome_get` says `show: false`.

## 4. The welcome — Task 9 (host), Task 10 (Studio)

WEL01 empty Beta library, no row → `show: true` · **WEL02 [MUST]** Stable: `show: false`, and a stable boot writes no `beta.*` row (globals row-set against a golden) · WEL03 both paths write the row; twice is idempotent · WEL04 survives a reopen · WEL05 a deleted Beta library shows it again · WEL06 the welcome renders before the wizard; the wizard's heading is absent until a choice · WEL07 `stable: 'missing'` → no Copy button · WEL08 EN and RO sentences equal the design's, language parity, the dev-word filter from `whatsNew.test.ts` · WEL09 two quick clicks → one invoke, buttons busy · **WEL10 [MUST]** Copy resolves → shell, never the wizard · WEL11 stable running → the refusal sentence, *Try again* re-invokes, *Start empty* moves on · WEL12 other errors name the cause and keep *Start empty* · WEL13 *Start empty* → no copy invoke, row written, wizard renders · WEL14 a page, not a dialog: Escape does nothing; closing the window mid-choice leaves the row unwritten · WEL15 one `h1`, focus on the first button, no `console.error` · WEL16 *What's new* and the update notice wait until the welcome is gone; after a copy, *What's new* shows · WEL17 `?fake&channel=beta` renders it, dev builds only.

## 5. The Beta chip — Task 10

CHIP01 `channel: 'beta'` → chip `Beta`, accessible name contains *questiongame Beta* · CHIP02 `stable` / `dev` → no chip, header DOM equals today's snapshot · CHIP03 `E2e(Beta)` answers `channel: 'beta'` (host test, T1) · CHIP04 visible in rail mode · CHIP06 Settings ▸ About shows the build and channel. *CHIP05 Stage leak: dropped — Stage renders nothing of Studio's.*

## 6. Updates — Task 3

**UPD01 [MUST]** every existing test passes with `Line::Stable` · UPD02 stable fetches exactly `/releases/latest` · UPD03 beta exactly `/releases?per_page=20` · **UPD04 [MUST]** newest by semver, not list order (`beta.10` over `beta.2`, `beta.3`) · UPD05 a draft with the highest version ignored · UPD06 the tag decides, not the `prerelease` flag · UPD07 `nightly`, `v1.2`, `v1.2.3.4`, `""`, `vx.y.z`, `V1.0.0` skipped one by one; all malformed → `Err` · UPD08 a rate-limit object, HTML, empty → `Err`, no panic · UPD09 `[]` → `Err` · UPD10 equal and pulled-release cases → `newer: false`; url built from the parsed version · UPD11 `+build` metadata on current · **UPD12 [MUST]** `2.0.0-beta.3` with `2.0.0` (and `2.0.1`) listed → `stable_newer` · UPD13 lower stables or prereleases only → `None`; several stables → the highest · UPD14 a Beta on `1.0.2` with `1.0.3` listed → `newer`, `stable_newer: None` (flag 10) · UPD15 unreadable current → `newer: false`, `None` · **UPD16 [MUST]** stable JSON keys exactly `current, latest, url, newer` (`stableNewer` skipped when `None`) · UPD17 beta JSON has `stableNewer`; `types.ts` matches · UPD18 a hostile tag never reaches the url · UPD19 Studio: `stableNewer` → `update.stable_available` **instead of** `update.available`; the code is in the notice copy · **UPD20 [MUST]** offline → silent; switch off → no call; a loaded Play → no call; once per session · UPD21 `#[ignore]` live, both paths.

## 7. Versions and *What's new* — Task 2

VER01 the three old asserts · **VER02 [MUST]** `beta.2 < beta.10 < 2.0.0` · VER03 `beta.1 < rc.1`, numeric < alphanumeric, `beta < beta.1`, `1.0.2 > 1.0.2-beta.9` · VER04 `+meta` ignored · VER05 `''`, `'v1.0.2'`, `'1.0'`, `'garbage'` sort lowest and never throw; `notesAfter('garbage', '1.0.2')` returns every entry ≤ 1.0.2 · VER06 `fixtures/versions.json` ascending list; TS and Rust `semver` agree pairwise (Rust test in `crates/app/tests/update.rs`) · VER07 a generated loop over `a.b.c`: same sign as the old function · VER08 `notesAfter('1.0.2', '2.0.0-beta.2')` → `[beta.2, beta.1]` · VER09 `('2.0.0-beta.3', '2.0.0')` → only 2.0.0; a 1.1.0 user gets no beta entries · VER10 every `WHATS_NEW.version` parses, unique, strictly descending · VER11 host `since(Some("2.0.0-beta.1"), _)` unchanged · VER12 *(T10)* closing *What's new* on `2.0.0-beta.2` writes that version.

## 8. The bumper — Task 5

BUMP01 patch/minor/major, default patch · BUMP02 `huge` → refusal listing the three · BUMP03 stable from a prerelease → refused · BUMP04 `beta.9 → beta.10` · BUMP05 beta from `1.0.2`, `2.0.0`, `2.0.0-rc.1`, `2.0.0-beta` → distinct refusals · **BUMP06 [MUST]** beta from a stable base names `--start` · BUMP07 wrong branches each way, detached HEAD, `release/1.xy` · BUMP08 modified, staged, untracked → refused; ignored → fine · BUMP09 no entry, or EN without RO → refused · BUMP10 after every refusal, `git status --porcelain` empty and version files unchanged · BUMP11 the commit touches exactly `Cargo.toml`, `Cargo.lock`, `package.json`, `package-lock.json`, `crates/app/tauri.conf.json`, `crates/app/tests/bundle.rs`, `codemap.yaml` · BUMP12 line endings, indentation and key order preserved · **BUMP13 [MUST]** a dependency pinned at the same version string is untouched · BUMP14 the bundle-test pattern missing → refused before writing · BUMP15 a failing check → no commit, files restored · BUMP16 one commit, `Version X`, co-author trailer · BUMP17 tags and remote refs unchanged · BUMP18 a failing hook surfaces; `--no-verify` never passed · BUMP19 `npm run version:stable -- minor` passes the argument · BUMP20 generated versions: the bump parses, is greater, and `route` accepts its tag. *(BUMP07–18 run against a temp git repo with a bare remote, in `scripts/version.test.ts`.)*

## 9. Routing — Task 4

WF01 `workflow_dispatch.inputs.channel` choice `[stable, beta]`, default `stable` · WF02 `v1.0.2`, `v1.2.10`, `v2.0.0` → stable; `v2.0.0-beta.1`, `-beta.10` → beta; `v1.0.0-rc.1`, `v1.0`, `V1.0.2`, `v1.0.2-beta`, `v01.0.2`, `v1.0.2+meta`, `vbeta` → refused · WF03 stable: `prerelease: false`, name `questiongame <tag>`, no beta config · WF04 beta: the config exactly once, `prerelease: true`, name `questiongame Beta <tag>`, body says beta and separate library · WF05 macOS keeps `--target universal-apple-darwin` and adds the config · **WF06 [MUST]** tag ↔ version table (`v2.0.0-beta.1`/`1.0.2` fails, `v1.0.2`/`1.0.2-beta.1` fails, …) · WF07 dispatch: no version check, overlay added, artifacts named `questiongame-Beta-<os>` · WF08 the Beta body names the Beta installer file · WF09 one `npm run e2e` step covers both channels; `build` still needs `[test, e2e]`. *WF10 snapshot of the 1.0.2 workflow and WF11 glob emulation: dropped (flag 9; the workflow changes on purpose).*

## 10. e2e — Task 11

E2E01 `beta-no-stable`: the sentence, only *Start empty* · E2E02 `beta-start-empty`: wizard after *Start empty*, chip visible · **E2E03 [MUST]** `beta-copy`: N teams and M questions in the fixture; after Copy the shell shows them, no wizard, *What's new* shows, a backup appears in `org.questiongame.e2e\backups`, the fixture is byte-identical · E2E04 `beta-stable-running`: `cargo run -p questiongame-app --example hold_lock -- <fixture>` holds the lock; the refusal shows; killing it and *Try again* succeeds · E2E05 `beta-corrupt`: garbage fixture → the error, *Start empty* works · E2E07 the four existing specs run with both env vars **deleted** explicitly and pass unchanged · E2E10 `folders.test.ts`: the fixture helper refuses anything but `<tmp>/questiongame-e2e-stable`, `..` traversal, the real stable folder · E2E11 `CHANNELS` beside `SEEDS`; an unknown spec throws · **E2E12 [MUST]** `onPrepare`/`onComplete` snapshot `%APPDATA%\org.questiongame.desktop` and `org.questiongame.app` read-only and assert equal · E2E13 the fixture is removed by `folders.ts` only. *E2E06 merged into E2E02; E2E08 (a full Play on Beta) dropped — the Play is channel-blind and `show` covers it; E2E09 merged into E2E03.*

## 11. 1.0.2 behaviour preserved — Tasks 1, 3, 6, 9

REG01 stable `app_info` keys are 1.0.2's plus `channel`, `build: "release"` · REG02 a stable boot on a 1.0.2 library writes no `beta.*` row · REG04 for `Stable`: data dir, log, lock and backups names as 1.0.2 · REG05 no migration added; a fresh library's `sqlite_master` equals the golden · REG06 `tauri.conf.json` equals 1.0.2's except `version` · REG07 `notesAfter(x, '1.0.2')` over a grid equals the old results · REG09 a 1.0.2 library written by `e2e_library` copies, opens, backs up, stamps, passes `integrity_check` · REG10 the stable library afterwards still reads `previous_version == "1.0.2"` · REG11 Beta's and stable's locks can be held at once · REG12 on `release/1.x`: no `stable_copy.rs`, `commands/beta.rs`, `tauri.beta.conf.json`; the full suite passes there. *REG03, REG08 duplicate ID04/UPD16/CHIP02.*

## 12. Codemap — Tasks 6, 9, 12

MAP01 `map:check` exits 0, `mismatches: []` · MAP02 a fixture with a contract-only `beta_copy_stable_library` yields the mismatch · MAP03 `BETA_IDENTIFIER`, `channel`, `Channel` appear · MAP04 the overlay identifier check already covers `tauri.beta.conf.json` · MAP06 `UpdateStatus` and `types.ts` agree on `stableNewer`. *MAP05 env-var tracking: dropped — the codemap tracks no env vars today.*
