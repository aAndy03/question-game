# The wire as built

What crosses from host to webviews ten times a second, and how each side reads it. The rules here are binding; `CLAUDE.md` points here instead of carrying them.

## The show loop sends two numbers (P11.9)

`play-state` carries the whole projection and is **event-driven**. The 100 ms tick sends **`play-tick`** — `{ playId, remainingMs, elapsedMs, running }` — and nothing else.

```text
tick_due(now) == false   999 ticks in 1000. Emit `play-tick`. No projection.
tick_due(now) == true    T=0 fires: the ordinary write path, then `play-state`.
```

- **The invariant that makes it safe** is one the host already had: `MatchService::tick` mutates a Play only through the T=0 table, and every other thing that can move a Play arrives as a command. `MatchService::tick_due` is the same guard chain `tick` uses, factored into `zero_due` so there is one copy — four borrows and a comparison, no projection.
- **What a quiet tick used to cost:** `Host::write` projected the Play twice (the overlay diff's before/after), `emit::play_state` projected it a third time, digested ~8.4 KB, and sent that to three webviews. `stage::project` clones every team's name, short code, colour, logo and detail, every domain's name and code, the ring order and the revealed ranks — a few dozen allocations, thirty times a second, to discover a countdown had gone down by 100 ms. `stage::tick` is the cheap read that replaced it.
- **`clock_moved` / `remember_clock`** are the tick's gate, split in two so the caller can ask while it still borrows the Play the answer came from. A paused Play moves neither number and stays as quiet as it always did; a full emission calls `remember_clock` so the `play-tick` behind it is not sent twice.
- **Every consumer merges rather than replaces.** Stage's `applyTick` returns the *same object* when nothing moved; Studio's `receivePlayTick` updates `clock` and leaves `state` alone; the Viewer gets a `tick` message of its own because Control now posts the full state only when it changed. All three drop a tick whose `playId` is not the loaded Play — an unload and a load can leave one in flight, and the next show would open on the last one's clock.
- **`CONTRACT_VERSION` is 6.** No field changed; `play-state`'s *meaning* did. A webview that listens only to it draws a frozen countdown, which is exactly the silent wrongness the version exists to turn into `health.contract_mismatch`.
- **Studio publishes the clock at the resolution it prints.** `fmt.clock` is `Math.ceil(ms / 1000)`, so `usePlayClock` rounds both numbers to the second: nine ticks in ten now return the identical object and render nothing. Control commits **three times** over three seconds of show loop, measured (`pages/control.test.tsx`). Stage is *not* rounded — it may interpolate, and its clock is on camera.

## The Play is read twice, at two rates (P11.7)

`apps/studio/src/host/playState.ts` keeps **two** references to the emission, because the host emits ten times a second while a timer runs and **two scalars are all that move on a bare tick**: `session.timer.remainingMs` and `clock.elapsedMs`.

```text
live     every emission. `usePlayClock()` reads it — the countdown, and
         nothing else, because nothing else moves at 10 Hz.
stable   replaced only when the emission differs *outside* those two
         scalars. `usePlayState()` reads it, so a bare tick renders nothing.
```

- **What it cost before.** Every emission replaced the store's object, so all fifteen `usePlayState()` consumers re-rendered — including `SidebarNav`, `TopBar` and `StatusBar`, on every route. On Control `ControlPage` re-rendered, its inline `renderTile` was a new prop, and `react-mosaic` plus its dnd provider plus six panels plus every `Tooltip` under them rebuilt. The perf log measured it: **28 commits/sec, ~245 components a commit, `MosaicLayout` alone at 16 ms a render, the Studio renderer pinned at 77% of a core** and the working set swinging to 1.35 GB while the JS heap sat at 237 MB. Nothing on screen changed but two numbers. `pages/control.test.tsx` fires thirty ticks and holds the page to one commit each.
- **The stable snapshot's clock fields are as old as the last real change.** Read the countdown from `usePlayClock()` in the smallest component that draws it (`StatusClock`, `LiveTimerCluster`) — a panel subscribing to it re-renders at 10 Hz again, which is the thing the split exists to stop. `playState.test.ts` greps the tree: naming `remainingMs`/`elapsedMs` outside an atom, a molecule or a test requires importing `usePlayClock`.
- **`usePlayState(select, isEqual?)` narrows further**, with `shallow` for a selector that builds an object. `ControlPage` reads `(s) => s !== null` — it renders no field of a Play.
- **Anything handed to a memoizing library from a render must be stable.** `renderTile` is hoisted into `useCallback` on both sides (`ControlPage`, `MosaicLayout`) and `MosaicLayout` is `memo`ised. Same rule as `LibraryList`'s `NO_ROWS` (P11.3).
- **`emission_changed` is keyed on a digest, not a stored copy.** It serialises into a `Digest` sink — hash and byte count, no allocation — instead of deep-cloning the projection ten times a second, and hands `emit` the payload size the perf log wants in the same pass. A 64-bit collision can only swallow one frame of a countdown: every command emits with `force`.
- **The user-timing sweep clears on every tick and *folds* one in `USER_TIMING_INSPECT_EVERY`.** Clearing is cheap; folding twenty thousand entries into a component table is not, and it showed up in its own log as 60 ms tasks. The count stays exact — it is the leak signal — and the table is a ranking, which samples fine.
