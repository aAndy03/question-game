# Stage as built

`apps/stage`: languages, the show’s own words, fitting the display, the clock, the Viewer, motion. The rules here are binding; `CLAUDE.md` points here instead of carrying them.

## Stage speaks two languages (P11.15)

`optimized_first_spec.md` §2.29 already split text into *derived* and *authored*; this makes the authored half translatable. What a later phase must not undo:

- **Only authored text is translated.** Team names, domain names, stems, options, codes and every number are shown as the author wrote them, in whichever language the show is in. A translation of a derived string is a second writer of the catalog.
- **One table per language, one shape.** `apps/stage/src/copy/tables.ts` holds `STAGE_COPY` (English) and `STAGE_COPY_RO`, both typed `StageCopy`, and `copy.test.tsx` asserts the key sets are equal and that every word Romanian does not share with the design system's formatting is actually different — a missed translation cannot hide behind "it matched". Formatting keys (delimiter, brackets, digits, joiners) are the design system's, not the language's, and are shared on purpose; the thousands separator is the one departure (`4.200 PCT`).
- **The pick is host truth.** `GameSettings.language` (`stage.language`) is modelled on `reveal`: a Game-tab default that is **not** game-affecting — a language switch mid-Play moves no score, so `is_game_affecting` is false and it is never frozen or refused. `#[serde(default)]` reads an older recipe row as English. It reaches Stage as `PlayStateForStage.language`, passed to `PresentationService::play_state` per call from `FlagService::language()` like `revealModes` — never stored twice.
- **`recipe_set_settings` pushes the key through when that recipe is in Control.** It is otherwise a pure catalog write (§4.3), but a language the operator picked and cannot see on Stage would read as a control that did nothing, so it goes through `settings_set_current_game` — which refuses nothing for this key — and re-emits.
- **One provider, no module-level reads.** `StageRoot` mounts `CopyProvider` from `state.language`; every component calls `useCopy()`, and every formatter in `copy/format.ts` takes the table as its first argument, so nothing can fall back to English behind the operator's back. The `resolveCopy(language, overrides)` seam is where the Screens-tab per-language overrides will merge, and nowhere else.
- **The header carries the idle eyebrow.** `headerBrand` / `headerPartner` are gone: the eyebrow is the show's name, written once, and the default reads `YOUR TEXT GOES HERE` / `Write your tagline` until the operator edits it (next slice).
- **`CONTRACT_VERSION` is 7.** A Stage that does not read `language` draws English over a Romanian show, which is exactly the silent wrongness the version exists to catch.

## The show's own words (P11.16)

`05_STUDIO_DESIGN.md` §16.5. Eleven authored strings name *this* show rather than the game, and the operator edits them; everything else authored is translated only.

- **`packages/contract/src/text.ts` is the whole list.** `TEXT_KEYS` says what is editable, `TEXT_KEYS_BY_NODE` (through `textKeysForNode`) says which canvas node edits which key — every `*.header` edits `idleEyebrow`, because the header *is* the eyebrow — and `parseText` is the validator (known languages, known keys, trimmed, ≤ 120 chars). Add a key there and in Stage's `resolveCopy`; nowhere else knows the list.
- **Overrides live in the layout document, per language**: `layout.text[language][key]`, beside `nodes` and `screens`, so they ride the same `recipe_set_layout` debounce, the same `rev`, and the same `PresentationService::set_layout` push that makes a Screens edit live on Stage mid-Play. `StageLayoutNodes::of` reads `text` opaquely like the other two; `layoutNodes()` carries it onto `play-state.layout`. `CONTRACT_VERSION` is 8.
- **`resolveCopy(language, overrides)` is the only merge.** The override keys are flat (`teamOrderTitle`) because the Inspector edits one string at a time; the four title keys land inside `screenTitle`, the rest are the table's own field names. `StageRoot` hands `state.layout.text?.[state.language]` to `CopyProvider`; the other language's block is not read, which is what lets one recipe carry both.
- **The Inspector edits the recipe's current language** (`recipe.settings.language`), says so in its hint, and shows no placeholder text: the canvas already draws the built-in word, and a placeholder would be a second copy of Stage's tables in Studio — the boundary lint forbids importing them. Empty means built-in.
- **Overlays on the Screens tab are views, not screens.** `CanvasView` is a screen or `overlay:<kind>`; `previewOverlay` puts one request on air over the last screen picked (`outcome` and `multiple-answers` take Question regardless). The canvas iframe is `/stage/?viewer&hold`: in hold mode `OverlayLayer` renders the sheet and never starts its timeline, so the overlay stands still and reports nothing. Control's Viewer does not set `hold` and still plays what the audience sees. An overlay has no node ids, so the canvas draws no handles and the Inspector says why.
- **Twelve tabs outgrow the toolbar.** `ScreenTabs` scrolls its list in its own box; a flex-wrap toolbar cannot wrap a single list, and letting it overflow pushed the whole page sideways.
- **In hold mode `OverlayLayer` is a projection, not a queue** (temporary; could be improved in future versions, `05_STUDIO_DESIGN.md` §16.6). It draws `state.overlay.active` directly, keyed on its kind. Its normal local `showing` copy is cleared only by the timeline's completion, and hold mode never starts one — so the first overlay picked on the canvas stayed on top of every screen after it, and a second overlay at the same `runId` was not seen as new. Overlay ↔ screen on the canvas is a cut; screen ↔ screen still transitions. Stage and the Viewer are untouched. `apps/stage/src/pages/hold.test.tsx`.

## Stage scales, it does not reflow (P11.6)

The canvas is **fixed 1920×1080** and every number downstream of it is a Figma number — layout tokens, decor manifests, `recipe.layout` node offsets, the `ViewerNodeRect` coordinates Control lays hit targets in. None of that becomes responsive. Instead `apps/stage/src/templates/StageFit.tsx` **fits** the canvas to the window: `min(w/1920, h/1080)`, one scalar for both axes so it never distorts, centred on a `--stage-letterbox` ground. A 16:9 viewport at any resolution and any DPI scaling fills edge to edge; 16:10 letterboxes, 21:9 pillarboxes, 4K upscales full-bleed.

- **The window is almost never 1920×1080 CSS pixels.** CSS pixels are *logical* pixels, and Windows ships an external 1080p display at **150%** — a fullscreen webview on that TV has a 1280×720 viewport. Before P11.6 only the Viewer fitted the canvas; the Stage window drew it at 1:1 under `body { overflow: hidden }`, so the audience saw its top-left **44%**. The aspect was never wrong (1280×720 is 16:9); the fit was missing.
- **The transform is on an ancestor of the frame.** GSAP owns `transform` inside it (`presentation/beats.ts`) and the layout applier owns `translate` on `[data-node-id]`; neither can see the wrapper. **Never add `will-change: transform` to it** — that pins the raster at layout resolution and softens the whole surface on camera. A static transform is re-rastered at the composited device scale, so on that TV the canvas is drawn at a full 1920 device pixels.
- **Anything measuring the DOM divides by the measured frame width**, never by 1920 — `DecorField.measureSolids` and `ViewerFed`'s node posting both already did, which is why neither needed changing.
- **`MonitorInfo` carries two sizes.** `size` is logical (window placement, and the CSS viewport Stage will get); `physicalSize` is the panel's mode and is **what the operator is shown**, because Windows' own display settings call that TV 1920×1080 with the scaling as a separate percentage. `MonitorKey` is derived from the physical size — a mode, not a preference — so changing a display's scaling no longer loses Stage's remembered pick; `MonitorInfo::matches` still answers to the old logical-size spelling so a pick written by an earlier build survives.

## Stage reads the clock separately too (P11.10)

The same split as Studio's, one layer down. `StageHost` has two channels — `subscribe`/`snapshot` for the Play, `subscribeClock`/`clock` for the countdown — and **only two components on Stage draw a clock**: the header's `[ hh:mm:ss ]` and the Question screen's timer panel. Everything above them (`LayoutProvider`, `StageFrame`, `StageRoot`, the current page, `DecorField`) was rebuilding ten times a second for numbers it does not show.

- **`StageClockProvider` holds the subscription itself** and renders `children` through, so a tick re-renders *it* and React bails on a `children` element whose identity did not change. Subscribing one level up — in `HostFed` — would make a new `<StageRoot>` element every tick and undo the whole thing.
- **The provider caches the clock's identity** rather than trusting the host's. `useSyncExternalStore` compares with `Object.is`, so a `clock()` that builds a fresh object every call is an infinite render loop that surfaces as *"Maximum update depth exceeded"* three frames deep in React, naming nothing. A host that breaks the contract should be wrong, not fatal.
- **`EnsureStageClock` keeps the tree self-sufficient.** `StageRoot` wraps itself in it, so rendering a page or a whole tree from a `PlayStateForStage` alone — in a test, on the Screens canvas — still draws the clock the state is carrying; a live provider above it wins because it is nearer. The two clock leaves take a `carriedMs` prop for the same reason, since both are also rendered standalone.
- **Stage is not rounded**, unlike Studio's `usePlayClock`: it may interpolate between ticks and its clock is the one on camera. Thirty ticks are thirty commits — of two leaves. `host.test.tsx` asserts the tree was handed **zero** new Plays across them.

## The Viewer does not simulate (P11.10)

`DecorField` returns before starting its loop in viewer mode. The Viewer was running a **second full matter-js world at 60 Hz** — same bodies, same collisions — for as long as Control was open, in an iframe nobody films. The shapes are drawn where the settle put them, which is what the operator is checking; motion belongs to the Stage window.

- **The Stage window pauses while `document.hidden`**, resetting its frame clock on the way back so it resumes rather than catching up on a burst.
- **`STEP_HZ` is the one number** to trade fidelity for CPU: `STEP_MS`, the px/s and deg/s conversions, `ATTRACT_ACCEL` and the settle all derive from it, so halving it halves `Engine.update` while the bodies keep the same speed in px/second. Kept at 60 because this is the filmed surface.
- **`will-change: transform` on the shapes is not the GPU cost** and was left alone — measured at two shapes and ~0.74 MB of layer texture on the Question screen.

## Stage motion model

Every Screen has a base transition to every other Screen (the operator can jump anywhere). **Overlay animations** are drawn on top of the current screen for information the operator skipped (e.g. a turn handoff when jumping Idle→ChooseDomain). They do not remount the screen and do not reset reveal state. Only one overlay plays at a time with at most one pending override queued behind it; a wrong answer never auto-advances Stage.

Question and FinalLeaderboard have an operator-timed **reveal layer** after the transition completes (stem, then each answer individually; leaderboard from last place upward), switchable to automatic in the Control Game panel.

Overlay kinds (`token-handoff`, `round-advance`, `multiple-answers`, `outcome`, `current-team`) are enqueued automatically by their cause **and** callable by the operator at any time over any screen with `show_overlay`. `outcome` is half-screen and transparent so the question stays visible.
