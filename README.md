# questiongame

A desktop quiz-show engine for a recorded show. An operator drives it from
**Studio**; the audience, the teams and the camera see only **Stage**, a
fullscreen window on a second display.

Offline-first, Windows and macOS, GPLv3. Built as one repo: a Rust host that
owns every fact, and two React webviews that only draw.

> **Status: P0–P7 of thirteen.** The engine, the library, the Tauri wiring and
> the **Studio shell** are done: Stage reads live state from the host, and the
> operator app has its sidebar, top bar, status bar and the four library tabs
> (Teams, Domains+Questions, Games, Operators). Control arrives with P8. See
> [`docs/v1/04_ROADMAP.md`](docs/v1/04_ROADMAP.md).

---

## Running it

```bash
npm install
npm run dev:app
```

That is the whole story: `tauri dev` starts both Vite dev servers itself
(`beforeDevCommand`), compiles the Rust host, and opens the Studio window. The
first Rust build takes a few minutes; after that it is seconds.

The Studio window opens on **Teams**. Build a library in the four tabs on the
left, then open a game and press **Load into Control**, which creates the Stage
window fullscreen on your primary display. Until P8's Control tab lands, the
**Control** tab carries a dev-only harness — one button per host command — so a
show can still be driven end to end:

1. **Seed demo** on the harness writes a four-team, three-domain library
   through the ordinary catalog commands. Dev builds only.
2. **Control Load** puts the recipe into Control and opens Stage.
3. **Start**, then a domain, an answer, **Lock**, **Reveal outcome**.
4. The screen buttons (`idle`, `chooseDomain`, `question`, …) drive Stage.

One display is a valid setup: Stage goes fullscreen on it and Studio is an
Alt-Tab away. With an external display connected, **Stage display ▸ \<name\>**
sends Stage there and remembers it.

### Working on Stage alone

```bash
npm run dev:stage      # http://localhost:5180/stage/
```

No Rust behind it, so Stage falls back to the P2/P3 **fixture strip**: every
screen and every state, switchable in place, no database. That fallback is
unreachable inside the app — if there is a host, the host wins.

```bash
npm run dev:studio     # http://localhost:5181/studio/?fake
```

Studio alone says "No host" — unless the URL carries `?fake`, which installs an
in-memory host with a demo library (dev builds only). Every tab, editor and
dialog then works in a plain browser; only a Play cannot be started. That is
the Studio counterpart to Stage's fixture strip, and it is unreachable inside
the app: a real host always wins.

---

## Verifying

```bash
npm run test:all       # 363 TypeScript + 213 Rust
npm run typecheck      # tsc --build across all project references
npm run lint           # eslint — this is where the architecture rules live
npm run lint:host      # clippy over the host crate
npm run lint:app       # clippy over the Tauri crate
```

`npm run lint` is not cosmetic. `eslint.config.js` enforces the atomic-design
dependency direction, the rule that only organisms and pages may touch
`play-state` or the host, and the wall between the two design systems. A
violation is a failing lint, not a review comment.

```bash
npm run build          # both webviews into dist/
npm run tauri build     # the installer
```

---

## Layout

```
apps/
  stage/      the audience surface. Base UI + GSAP, questiongame tokens.
  studio/     the operator app. HeroUI v3 + Motion, HeroUI tokens.
              host/ (the command seam, queries, play-state, the fake host),
              chrome/ (nav, preferences, notices), copy/, then atoms →
              molecules → organisms → templates → pages.
packages/
  contract/   play-state, screens, node ids, reveal keys, command names.
              The only package both webviews and the Rust host share.
  design-stage/  questiongame tokens, fonts, decorative SVGs
  design-studio/ globals.css, the HeroUI theme scope
  text/       the Text module — one readable-string primitive, two impls
crates/
  host/       the four services. A plain library: a test sweeps its whole src
              tree for `tauri` and fails on a hit.
  app/        the Tauri 2 shell around it. Depends on the host; nothing
              depends on it.
dist/         where both webviews build. Tauri's frontendDist points here.
fixtures/     play-state JSON — the frontend's dev data and the host's
              integration assertions, the same files.
docs/v1/      the specs and the build plan
```

### The one rule everything else follows

**Rust owns all truth. TypeScript owns only presentation.** A visual state
changes because the backend changed it, never because the frontend decided to.

```text
FlagService::freeze  →  CatalogService::build_snapshot  →  MatchService::play_load
                                                                    ↓
                                                    CatalogService::play_persist
```

- **`MatchService`** is the only writer of a Play. Undo appends an inverting
  event; the log never shrinks and is never edited.
- **`CatalogService`** is the only thing that runs SQL. `store.rs` is
  `pub(super)`; no interface hands a connection out.
- **`FlagService`** is the only flag reader, and stores nothing derived from a
  Play.
- **`PresentationService`** owns the screen and the overlay queue, and writes
  reveals *through* `MatchService` — there is no way to spell a second writer.
- **No clock inside the host.** Every command takes the millisecond it happened
  at, which is what makes a Play replayable and the tests deterministic. The
  only clock in the project is `crates/app/src/state.rs`.

---

## Two webviews, one origin

Both frontends are served under the path they occupy in the bundle —
`/studio/` and `/stage/` — in dev as well as in the installer. Studio's dev
server proxies `/stage` to Stage's.

That is not tidiness. Tauri's capability files scope permissions to
`URL: local`, and a webview pointed at an **external** URL is remote to the
ACL even when it is `localhost` — a remote webview is denied every command and
even `event.listen`. Sharing one origin keeps both windows local, keeps
`crates/app/capabilities/` tight, and means the app takes the same code path in
dev and in the bundle. There is no `is_dev()` branch anywhere.

**Stage may call exactly two commands** — `stage_ready` and
`overlay_ack_complete` — and both are it reporting on itself. Tauri does not
gate app-defined commands behind capabilities, so `crates/app/src/guard.rs`
refuses the rest by webview label. Stage is a projection, not a controller.

Set `RUST_LOG=questiongame_app=debug` to watch every invoke arrive with the
webview that sent it.

---

## Where to read next

| You want to know | Read |
| --- | --- |
| What the product *is*, and every locked rule | [`docs/v1/optimized_first_spec.md`](docs/v1/optimized_first_spec.md) |
| How the system is cut into modules, and why | [`docs/v1/01_codebase-design-spec-v1.md`](docs/v1/01_codebase-design-spec-v1.md) |
| What is built, what is next, and what each phase decided | [`docs/v1/04_ROADMAP.md`](docs/v1/04_ROADMAP.md) |
| What a word means before you name anything | [`docs/v1/03_CONTEXT.md`](docs/v1/03_CONTEXT.md) |
| How Stage is allowed to look | [`docs/questiongame Design System/readme.md`](docs/questiongame%20Design%20System/readme.md) |
| How Studio is allowed to look, and which component does what | [`docs/v1/05_STUDIO_DESIGN.md`](docs/v1/05_STUDIO_DESIGN.md) |
| The conventions an agent must not undo | [`CLAUDE.md`](CLAUDE.md) |

`optimized_first_spec.md` is the decision file. Where the code and that
document disagree, the document is right and the code is a bug.

---

## Licence

GPL-3.0-or-later. See [`LICENSE`](LICENSE).
