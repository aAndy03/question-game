# Skill run: codebase-design — re-verified against the locked stack

Skill: `codebase-design` (mattpocock/skills, installed 2026-09-04 via `npx skills@latest add`). Vocabulary from that skill only: **module**, **interface**, **implementation**, **adapter**, **depth**, **seam**, **leverage**, **locality**. Not "engine layer 4", "service layer", "API", "boundary".

Two passes are recorded here:

- **Pass 1** (original) judged `02_spec-v1/` as a design of modules.
- **Pass 2** (this run) re-judges the same design against the dependencies actually locked in `optimized_first_spec.md` §6, §7 and §13 — TanStack, Zustand, GSAP, Calligraph, Howler, rusqlite, Tantivy, `availableMonitors`.

Durable product decisions still live in `optimized_first_spec.md`. This file decides **module shape** only. Where the two touch (`§6`, `§7`, `§13`), optimized wins on *what exists*; this file wins on *how it is cut*.

---

## Pass 1 — spec-v1 as a design of modules

| spec-v1 name | Interface (what a caller must know) | Depth |
| --- | --- | --- |
| Question / Domain / Teams / Award / Settings "engines" | Almost the whole noun | **Shallow** — one module per word. Deleting Award just dumps scoring into Control and Stage. |
| Screens engine + Animation engine | Current screen + every GSAP timeline | **Shallow pair** — callers must know both to change a slide. |
| Control engine | Play/Pause + reveals + ring + settings | **Shallow** if it owns rules. **Deep** if it only sends commands. |
| Play / Timeline | Run + events | Deep *if* one interface (`play_*` + append-only events). |
| Health / Files / Search | OS + disk + Tantivy | Real seams (two adapters: prod OS vs test fake). |

Deletion test on the spec-v1 Layer 2–4 binders: delete "the Layer 3 engine that binds Layer 2 + Layer 1" and no complexity disappears — it was a pass-through. Optimized already dropped that cake (§2.9: "Layer-1 modules + a few facades + one host runtime").

### Deepening already chosen (do not undo)

- Many Layer-1 nouns collapsed behind **`MatchService`** (ring, session, timer, award, consume). Small interface, large implementation. **Leverage**: Action Panel and Viewer call the same commands (§11.H: "Viewer click and Action Panel button are the same commands").
- **`PresentationService`** hides GSAP + the overlay queue.
- **`CatalogService`** hides SQLite + archive + overlays.
- **`FlagService`** hides global + recipe + runtime-derived flags (§2.16: "the only flag reader").

### Still shallow if implemented as spec-v1 words it

- Control panels each talking to Domain engine *and* Question engine *and* Award engine.
- Screens tab writing layout *and* live Play state.
- Statistics writing scores.

Keep those three as **projectors**: they read `play-state` and write nothing. §11.K already says Statistics "reads projections, never writes rules".

---

## Pass 2 — the four modules, restated as interfaces

Interface here means everything a caller must know: signatures, invariants, ordering, error modes. All four are in-process Rust modules (§6). None of them is a network hop.

### `MatchService`

**Interface.** `play_load|start|pause|resume|restart|abandon|get_state`, `choose_domain`, `set_selection`, `lock_selection`, `start_timer`, `pause_timer`, `reveal_outcome`, `give_token`, `reorder_ring`, `undo_turn`, `redo_turn`. Plus the invariants a caller cannot discover from the signatures:

- Ordering: `Select → Lock → Reveal`. Reveal is the only scoring and consumption point (§2.4).
- The round invariant (§5.4, restated generally below) — `give_token` and `reorder_ring` reject illegal targets rather than silently reordering.
- Error modes are the reject table in §5.3, plus `feature_off` from `FlagService`.
- Emission: `remaining_ms` every 100ms while a timer runs. No caller may run a clock that can pass host zero.

**Depth: deep.** ~17 commands hide the ring, the session machine, the timer, three award modes, the cap/bonus, per-Play consumption, and the append-only log with inversions.

**Dependency category: 1 (in-process).** The ring and the award formulas are pure computation over materialized state. No adapter is needed to test them — call the interface directly. This is the cheapest high-value test surface in the project; the generalized round invariant belongs here as a property test over N teams, not as a fixture with four.

**Deletion test:** delete it and the ring rule reappears in the Action Panel, the Viewer, the Timeline and the auto-reveal path — four callers, four chances to disagree. It earns its keep.

### `CatalogService`

**Interface.** `catalog_list|get|upsert|archive|restore|search`, `asset_put`, `recipe_*`, `recipe_set_overlay`. Invariants: archive is `archived_at`, never a hard delete; `recipe_upsert` is one transaction; a row that a recipe or an open Play points at cannot be purged; overlay resolution order is question overlay → recipe → globals.

**Depth: deep.** Small verb list over SQLite, the archive scope per tab, the recipe-overlay patch model, and the Tantivy sidecar.

**Dependency category: 2 (local-substitutable).** `rusqlite` (chosen over `tauri-plugin-sql`, 2026-09-05) has an in-memory stand-in — `Connection::open_in_memory()`. That makes the storage seam **internal** to `CatalogService` — do not expose a `Repository` port at its external interface.

**Tantivy is a hypothetical seam.** One adapter exists and no second is planned (§2.13). Keep search as `catalog_search` on this interface. Do not define a `SearchService` port; that is indirection, not a seam.

### `PresentationService`

**Interface.** `show_screen`, `stage_set_monitor`, `overlay_ack_complete`, plus the reveal commands `reveal_stem` / `reveal_next_option`, and the `anim-complete { key }` signal coming back from Stage. Invariants: every `(from, to)` pair has a base transition; the overlay queue is *current + at most one pending, newer replaces older*; a base transition never starts under a running overlay; overlays never remount a screen or reset reveal state.

**Depth: deep at the queue, thin at the tween.** The queue rule, the busy/pending flags and the "auto-reveal cannot outrun GSAP" handshake are the implementation. The GSAP timelines themselves are the **adapter** on the far side of the seam.

**Dependency category: 2.** Two adapters justify the seam: the real Stage webview running `useGSAP` timelines, and a test stub that acks `anim-complete` immediately. That is what makes the §17 overlay examples runnable as tests rather than as prose.

**Design tension to settle before coding.** `reveal_stem` / `reveal_next_option` look like pure presentation, but reveal counts must survive undo and must be identical in Stage and Viewer, so they live on the Play in `play-state` (§13). Resolution: they stay **commands on `PresentationService`** for callers, and `PresentationService` writes them through `MatchService`, which remains the only writer of a Play. Do not give the frontend a second path.

### `FlagService`

**Interface.** `settings_get|set_global|set_current_game`, `settings_set_shortcut`, plus flag reads for the other three modules. Invariants: three flag kinds (feature root `feat.*`, policy key, derived runtime flag); game-affecting keys freeze at `play_start` and become *visible but disabled*, never hidden; every write must leave a legal document (§4.2 interlocks); a feature root that is off makes commands reject `feature_off`.

**Depth: deep.** One reader hides the §2.18 timer cascade, the §4.2 interlock table, and the freeze rule that otherwise every settings surface would re-implement.

**Deletion test:** delete it and the cascade is re-derived in the Game tab, the Control float, the Settings tab and the question-issue path. Keep.

---

## Seams that earn a keep (two adapters each)

1. **Host command seam** — Studio/Stage `invoke` / `emitTo`. Adapters: real Tauri; in-process test harness. Interface = the §13 command list.
2. **Play write seam** — only `MatchService` mutates a Play. Tests drive `choose_domain` / `lock_selection` / `reveal_outcome`. No second React writer.
3. **Presentation seam** — `show_screen`, overlay queue, `anim-complete`. Stage GSAP is an adapter; tests stub the ack.
4. **Catalog seam** — `catalog_*` / `recipe_*`. SQLite adapter + memory adapter.
5. **Monitor seam** — `availableMonitors` is **category 4 (true external)**: the OS is not yours. Inject it as a port with a fake monitor list so "unplug the Stage monitor, pull the window back, Play stays `playing`" (§11.J) is a test and not a hope.
6. **Audio seam** — the interface is the **cue key** (lock, correct, wrong, overlay start, play start, timer start, timer pause, timer expired), never a file path. Howler is today's only adapter, so this is a *hypothetical* seam — but the cue-key interface is worth having anyway, because `feat.audio.synth` (§2.25) and v2 user packs are the second and third adapters already named.

**Hypothetical seams — do not invent ports today:** HeroUI vs "generic widget"; Tantivy vs "search interface"; EvilCharts vs "chart interface".

---

## Pass 2 — verdicts on the locked frontend stack

The rule that decides every row: **the host is the only source of truth; the React tree projects it.** A library that stores state is either chrome-only or it is a second writer.

| Dependency | Role in this design | Verdict |
| --- | --- | --- |
| `@tanstack/react-query` | An **adapter** over the catalog read seam. Keys mirror `catalog_*` / `recipe_*` / `stats_query`; invalidate on `catalog-changed` / `recipe-changed`. | Fine. **Never cache `play-state`** — that would put a second, stale copy of the Play behind a cache, which is exactly the drift the Play write seam exists to prevent. |
| `zustand` | Chrome only: grid\|table preference, mosaic draft, notice-stack open, settings inner-tab. | Fine while it holds nothing the host owns. The moment a score, a ring or a session field lands in a store, the Play write seam is broken. Treat that as the review trigger. |
| `@tanstack/react-table` / `react-form` | Headless **engines**; HeroUI `Table` / `Form` are styled **shells**. | Fine. Do not mount two form states on one screen (already in §7). Editors write through `catalog_*` / `recipe_*` only. |
| `@tanstack/react-virtual` / `react-pacer` | Long lists; the 400ms layout debounce and bulk batching. | Fine — no state ownership. The debounce is an implementation detail of the Screens canvas, not part of `recipe_set_layout`'s interface. |
| `@tanstack/react-hotkeys` | Chords resolve to the same §13 commands. | Fine, and a **leverage** win: shortcut, Action Panel button and Viewer click are three call sites of one interface. `ignoreInputs: true`; not mounted on Stage. |
| GSAP + `@gsap/react` | Stage adapter behind `PresentationService`. | Keep the timelines **internal**. A caller that has to know a timeline name has been handed an implementation detail. |
| `motion/react` | Studio chrome only. | Fine. It must never animate anything whose truth is in `play-state`. |
| `calligraph` | Text **transitions** in Studio, behind the `Text` module (§2.29). | Resolved. `calligraph` is "fluid text transitions powered by Motion" — an animation library, not a typography primitive, and Motion is barred from Stage. `Text` is the deep module: `variant` + `transition: none \| swap \| count`, with Calligraph implementing Studio transitions and GSAP implementing Stage ones. Static text mounts no animation runtime. Two adapters, so this is a **real seam**. |
| `howler` + `@web-kits/audio` | Cue playback; synth is off. | Behind the cue-key interface above. |
| EvilCharts / ECharts | Statistics only, read-only. | Fine, isolated. Statistics is a projector. |
| `@dnd-kit/react`, DialKit | Screens canvas. | Fine. The canvas writes through `recipe_set_layout` and nothing else. |
| HeroUI v3 / Base UI / Iconify / Phosphor | Presentation, in **both** webviews. | No seam — the difference between Studio and Stage is the CSS-variable token scope, not a swapped implementation (§2.30). Base UI leads on Stage because unstyled primitives restyle cleanly; HeroUI leads in Studio. A "generic widget" port would be indirection over one adapter. |

---

## The round invariant, stated for N teams

Pass 1 left this as a four-team array copied from the notes. That is a worked example, not the rule. The rule is:

> Let the active teams be `T`, and let `turns[t]` be the number of tokens team `t` has received in this Play. The engine keeps `max(turns) − min(turns) ≤ 1` across `T`. A team may receive its `r+1`-th token only once every active team has received `r`.

Equivalently, with `round_index = r`: the legal targets of `give_token` are the active teams whose `turns[t] == r − 1` — the ones not yet served this round — and never the team that currently holds the token (no consecutive self-override).

This holds for any team count, including the one-team rehearsal Play, where every round has a single legal target and self-override is simply unavailable.

Because `MatchService` is a category-1 dependency, this is testable as a property over generated team counts and override sequences. The four-team array stays in the docs as an illustration under that rule.

---

## Recommendation

Treat `02_spec-v1/04-layered-engines.md` as a **job list**, not an interface. Implement the four host modules. Put the tests on their interfaces — not on React, not on GSAP internals, and not on rusqlite.
