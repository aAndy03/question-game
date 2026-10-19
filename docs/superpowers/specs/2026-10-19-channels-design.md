# Release channels — design

*2026-10-19. Status: approved 2026-10-19. Release A of four (A channels → B stable 1.1 → C beta 2.0 workspaces → D groups, bulk actions, tags).*

## Intent

questiongame has real users on 1.0.2. The next big work — workspaces — changes how the library is stored, so it cannot be tried by everyone at once. This release makes it possible to ship **two products side by side**: a **stable** app people run shows on, and a **beta** app that carries the next major version to the people who opt in. Their data never meet unless the user asks for a copy, and then only stable → beta, read-only.

Success: a user can install *questiongame Beta* next to *questiongame*, is told plainly on first launch that Beta has its own library, chooses to start empty or from a copy of their stable library, and nothing they do in Beta ever changes their stable library. The maintainer can work on stable fixes and beta features in parallel, bump versions with one command, and nothing is published until they tag it.

## Decided by the maintainer

- **Separate data per channel**, and users are told so with a notice.
- **Beta offers a copy** of the stable library on first launch: *Start empty* or *Copy my stable library*.
- **When 2.0 reaches stable**, each 1.x library is backed up and moved into **one workspace the user names** (no name suggested). *(Release C's concern; recorded here so A does not contradict it.)*
- **Order**: A channels → B stable 1.1 (filters, sort, list headers, pagination) → C beta 2.0 workspaces → D groups, bulk actions, tags.
- **Versioning**: `npm run version:stable` / `version:beta` bump and commit; **tagging = publishing, only on the maintainer's word**.
- Stable improvements must also be in beta.
- Sonnet proposes test lists; only the main implementer writes code.

## Goals

1. A third shipped identity: **questiongame Beta** — `org.questiongame.beta`, product name `questiongame Beta`, its own icon (a visible Beta badge), its own library, log, perf log, WebView2 profile, single-instance key and uninstaller entry. Installs beside stable on Windows and macOS.
2. **Beta never writes the stable folder.** Enforced in code: the only access a Beta build has to `org.questiongame.desktop` is a read-only copy at first run.
3. **First Beta launch**: a notice that Beta keeps its own library, then *Start empty* / *Copy my stable library*.
4. **A Beta mark** in Studio (sidebar header) so the operator always knows which app is open.
5. **Branches**: `main` is the beta line; `release/1.x` is stable; stable merges forward into `main`.
6. **Publishing per tag**: `v1.*.*` → stable build, normal release; `v*-beta.*` → Beta build, GitHub pre-release. CI refuses a tag that does not match the branch's version.
7. **Updates per channel**: stable sees stable releases only; Beta sees pre-releases too and is told when a stable release is newer.
8. **Version bumper** commands.
9. **Tests**: e2e on both channels, plus specs for the Beta notice and the copy.

## Non-goals

- Workspaces, or any library schema change (that is C). This release changes no table.
- Automatic installation of updates (still mention-only).
- A beta → stable copy. Data flows stable → beta only.
- Publishing anything. The first beta tag is the maintainer's call, after C has something worth testing.

## Anti-goals

- Any code path by which Beta could modify, lock for writing, migrate or delete the stable library.
- A beta that silently looks like stable (same name, same icon, no mark).
- Stable fixes that never reach beta, or beta work leaking into a stable build.

## Constraints (from the repo)

- Identities today: `org.questiongame.desktop` (release), `org.questiongame.app` (dev), `org.questiongame.e2e` (e2e) — `crates/app/src/identity.rs`, overlays `tauri.dev.conf.json`, `tauri.e2e.conf.json`, held together by `crates/app/tests/identity.rs`.
- The version lives in three files held by `crates/app/tests/bundle.rs`.
- Updates: `crates/app/src/update.rs` (`parse_latest` ignores prereleases; `/releases/latest`).
- What's new: `apps/studio/src/copy/whatsNew.ts` (`compareVersions` splits on dots — not prerelease-aware), host side `crates/app/src/whats_new.rs`.
- Backups/stamps: `crates/host/src/catalog/{db,backup}.rs` (`open_guarded`, `VACUUM INTO`).
- `codemap.yaml` must stay current and `mismatches:` empty; docs per `docs/as-built/`; phase commits on the branch they belong to.

---

## 1. The Beta identity

- `crates/app/tauri.beta.conf.json` overlay: `identifier: org.questiongame.beta`, `productName: "questiongame Beta"`, `bundle.icon` → `icons/beta/…` (the stable icon with a Beta badge, all sizes incl. `.ico`/`.icns`), NSIS display name follows the product name so both appear separately in *Apps*.
- `identity.rs`: `BETA_IDENTIFIER`; `check(is_dev, id)` admits it only in a built app; `build_label_for` returns `"beta"`; `channel(identifier, e2e_channel) -> Channel { Stable, Beta, Dev, E2e(Stable|Beta) }` is the one place the channel is decided. `e2e_channel` is the runtime env var `QUESTIONGAME_E2E_CHANNEL` (`stable` default | `beta`), read at boot and **ignored by every identity but `org.questiongame.e2e`**. *(Builder's call: a runtime read, so CI builds one e2e binary and runs the stable and Beta specs against it; a separate e2e-beta identity would mean a second build.)* Every "Beta builds only" guard asks `channel(..).is_beta()`, which is true for `Beta` and `E2e(Beta)` and nothing else.
- `crates/app/tests/identity.rs` extended: four sibling folders, the beta overlay changes identifier + productName + icons only.
- The e2e identity is unaffected.

## 2. Beta never writes stable

- New `crates/app/src/stable_copy.rs`. **"Never writes" means not one byte and not one new file in the stable folder** — not even the `-wal`/`-shm` sidecars a SQLite read-only open can create. *(Builder's call: the strict reading.)* So SQLite never opens the stable file in place:
  1. Resolve the stable folder (`<roaming>/org.questiongame.desktop`, from the app-data root's parent + the release identifier; for `E2e(Beta)`, from `QUESTIONGAME_E2E_STABLE_DIR`, honoured by the e2e identity only).
  2. **Refuse while stable is running**: open stable's `questiongame.lock` read-only and `try_lock_shared`; held → *"Close questiongame first, then copy."* with *Try again* / *Start empty*. (A lock taken on a read-only handle writes nothing.) This also makes the copy consistent — no writer mid-copy.
  3. Byte-copy `questiongame.sqlite3` and a `-wal` if present (read-only handles) into a temp folder **inside the Beta folder**, open that copy, `VACUUM INTO` the Beta library path, delete the temp folder.
  Nothing else in a Beta build names the stable folder.
- A test greps `crates/app/src` for `RELEASE_IDENTIFIER` / `org.questiongame.desktop` and allows it only in `identity.rs` and `stable_copy.rs`.
- The copy is then opened through the normal `open_file` path: it is a library 1.x left (unstamped, or stamped by stable), so it is **backed up and stamped** like any upgrade, and *What's new* shows Beta's notes.
- Stable app running at copy time: refused, as above. Stable library missing: the choice offers only *Start empty*. Copy fails: say why, offer *Start empty*, stable untouched.

## 3. First launch of Beta

- Shown before the existing first-run wizard, once per Beta library (meta row `beta.welcome_seen`).
- Copy (EN/RO, in the same plain words as *What's new*): *"This is questiongame Beta. It keeps its own library, separate from questiongame. Nothing you do here changes your stable library."* Buttons: **Copy my stable library** (only when one exists) and **Start empty**.
- *Copy* → host command `beta_copy_stable_library` (Beta builds only; guarded; refuses if the Beta library already has rows) → restart the library in place (reopen through `open_file`) → continue to the shell (the operator from stable comes along, so first run is skipped). *Start empty* → the normal first-run wizard.
- A **Beta** chip in the sidebar header, always visible in Beta builds (from `app_info.build == "beta"`).

## 4. Branches and merge-forward

- **Release A lands in two halves, and `release/1.x` is cut between them.** *(Builder's call.)*
  - **A1, channel-agnostic, on `main`**: `scripts/version.ts`, the tag routing and `channel` input in `release.yml` (GitHub runs the workflow file at the tagged commit, so stable needs it), `update.rs`'s `channel` parameter, the semver-aware `compareVersions`, the `channel()` table. Stable runs every one of them with `Channel::Stable` and behaves exactly as 1.0.2 does.
  - **Cut `release/1.x` from `main` here.** Stable phases (release B) land there.
  - **A2, Beta-only, on `main` only**: `tauri.beta.conf.json` and its icons, `stable_copy.rs`, `beta_copy_stable_library`, the first-launch notice, the Beta chip, the Beta e2e spec. Stable 1.1 does not carry them, not even unused.
- After each stable release, `release/1.x` is **merged** into `main` (not cherry-picked). Conflicts are resolved on `main`.
- `main` moves to `2.0.0-beta.0` (unpublished) when release C starts.
- Documented in `docs/as-built/release.md`; a short "which branch?" line in CLAUDE.md.

## 5. Publishing per tag

- `release.yml`:
  - Tag matching `v[0-9]+.[0-9]+.[0-9]+` → stable: base config, `prerelease: false`, release named *questiongame vX.Y.Z*.
  - Tag matching `v*-beta.*` → beta: `--config crates/app/tauri.beta.conf.json` added to the build args, `prerelease: true`, named *questiongame Beta vX.Y.Z-beta.N*, release body says it is a beta with separate data.
  - The existing version-vs-tag check stays; a beta tag on a non-beta version (or the reverse) fails.
  - e2e runs on both (the e2e identity is channel-agnostic).
- *Run workflow* (build-only) gains a `channel` input (stable | beta). **A build-only Beta run takes whatever version the branch has** — during A that is `questiongame Beta 1.0.2`, unpublished, and it is how A's "installs beside stable on Windows and macOS" is checked. Only a **tag** enforces beta-tag ↔ beta-version. *(Builder's call.)* A Beta running a non-prerelease version compares by semver like any other: it is told of any newer release, prerelease or not.

## 6. Updates per channel

- `update.rs`: `check(fetch, current, channel)`.
  - Stable: `/releases/latest` as today (GitHub excludes prereleases).
  - Beta: `/releases?per_page=20`, newest by semver **including** prereleases; reports `newer` against the running beta; separately reports a stable release newer than the running beta's base (e.g. 2.0.0 > 2.0.0-beta.3) so Beta can say *"questiongame 2.0.0 is out"*.
  - Semver prerelease ordering via the `semver` crate (already a dependency).
- `whatsNew.ts`: `compareVersions` becomes semver-aware (`2.0.0-beta.2 < 2.0.0-beta.10 < 2.0.0`); entries may be beta versions; a stable release's entry is written for stable users (it summarises its betas — the maintainer's copy).

## 7. Version bumper

- `scripts/version.ts` (vite-node), npm scripts `version:stable [patch|minor|major]` and `version:beta`:
  - Refuses on the wrong branch (`version:stable` only on `release/1.x`, `version:beta` only on `main`), with a dirty tree, or when `WHATS_NEW` has no entry for the target version.
  - Writes the three version files, updates `crates/app/tests/bundle.rs`'s expected version, regenerates lock versions and `codemap.yaml`, runs `npm run typecheck` and the bundle test, commits `Version X.Y.Z` with the co-author line. Never tags, never pushes.
  - `version:beta` from `2.0.0-beta.0` → `2.0.0-beta.1`; from a stable `1.x` base it refuses (the move to `2.0.0-beta.0` is a deliberate one-time step, documented).
- Pure version arithmetic in `scripts/lib/version.ts`, tested.

## 8. Tests (Sonnet proposes the full list; these are the floor)

- Unit: identity/channel table (the env var ignored outside the e2e identity); `stable_copy` leaves the stable folder **byte- and listing-identical** (same files, same bytes, same mtimes — no sidecar appears), refuses while stable's lock is held, copies a library with a pending `-wal` completely, and cleans its temp folder on success and failure; semver ordering incl. prereleases; beta update selection (newest prerelease, stable-newer notice); version arithmetic and every refusal of the bumper; release.yml tag routing (a parsed check, like `bundle.rs`).
- e2e: a **Beta first launch** spec runs the same e2e binary with `QUESTIONGAME_E2E_CHANNEL=beta`; the "stable library" it copies from is a seeded fixture in a temp folder named by `QUESTIONGAME_E2E_STABLE_DIR`. Every write stays in `org.questiongame.e2e` or that temp folder, which `folders.ts` creates and is the only thing allowed to delete. CI runs both channels' specs on every run.
- Migration: none (no schema change) — but a stable-1.0.2 library copied into Beta must open, back up and stamp.

## Left to the builder

- The Beta badge artwork (derived from the existing icon; plain, legible at 32 px).
- Exact notice layout (HeroUI as shipped, consistent with first run).
- How the copy restarts the library in place vs. relaunching the app.
- The exact `release/1.x` cut commit (after A1; see §4).
- Commit split (P13.0 channels…; numbering is the builder's, following the phase convention on each branch).
