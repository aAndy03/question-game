/**
 * Where Stage gets its truth.
 *
 * P6: `play-state` arrives from the Rust host over Tauri's event bus, and Stage
 * renders it. **Nothing above this file synthesises a state** — a visual
 * changes because the backend changed it (spec §5.7) — and the only thing Stage
 * ever sends back is about itself: `anim-complete` as `overlay_ack_complete`,
 * its version as `stage_ready`, and a fault of its own as `stage_report` — the
 * three commands the host accepts from this webview.
 *
 * Outside the desktop app there is no host, and [`stageHost`] says so by
 * returning `null`. That is what keeps `npm run dev:stage` useful for screen
 * work: the P2/P3 fixture strip stays as the **fallback**, never as a mode, and
 * is unreachable the moment a real host is present.
 *
 * `@tauri-apps/api` is imported dynamically. The module reaches for IPC globals
 * that a plain browser does not have, and a static import would make the dev
 * server's first paint depend on them.
 */

import {
  CONTRACT_VERSION,
  EMPTY_PLAY_STATE,
  isViewerMessage,
  VIEWER_SOURCE,
  type AnimKey,
  type PlayStateForStage,
  type PlayTick,
  type ViewerToStage,
} from '@questiongame/contract'

export type StateListener = (state: PlayStateForStage) => void
export type ClockListener = () => void

/**
 * The two numbers the 100 ms show loop moves, kept apart from the Play
 * (P11.10).
 *
 * Stage's whole tree used to re-render ten times a second — `LayoutProvider`,
 * `StageFrame`, `StageRoot`, the current page — because merging a tick made a
 * new `PlayStateForStage` and the tree reads it whole. Only two components
 * draw a clock: the header's `[ hh:mm:ss ]` and the Question screen's timer
 * panel. Everything else was rebuilding for numbers it does not show.
 *
 * Unlike Studio's, this one is **not rounded**. Stage may interpolate between
 * ticks, and its clock is the one on camera.
 */
export interface StageClock {
  /** `session.timer.remainingMs`, or null at operator pace / no session. */
  readonly remainingMs: number | null
  readonly elapsedMs: number
  readonly running: boolean
}

export const EMPTY_CLOCK: StageClock = { remainingMs: null, elapsedMs: 0, running: false }

/** The clock a Play is carrying, for a host with no tick channel of its own. */
export function clockOf(state: PlayStateForStage): StageClock {
  return {
    remainingMs: state.session?.timer?.remainingMs ?? null,
    elapsedMs: state.clock.elapsedMs,
    running: state.clock.running,
  }
}

/** The clock a tick carries, dropped when it is not this Play's. */
export function clockFromTick(state: PlayStateForStage, tick: PlayTick): StageClock | null {
  if (state.playId !== tick.playId) return null
  return { remainingMs: tick.remainingMs, elapsedMs: tick.elapsedMs, running: tick.running }
}

/**
 * An external store, in React's sense: `subscribe` notifies on change and
 * `snapshot` is the current value. That shape is deliberate — Stage reads the
 * Play through `useSyncExternalStore`, so a render cannot tear halfway through
 * a score on a surface someone is filming.
 */
export interface StageHost {
  /**
   * Notify when the **Play** changed. Does **not** replay: that is
   * `snapshot`'s job, and it does **not** fire for a tick — the countdown has
   * its own channel so the tree is not rebuilt for it.
   */
  subscribe(listener: StateListener): () => void
  /** The current `play-state`; `EMPTY_PLAY_STATE` until the first one lands. */
  snapshot(): PlayStateForStage
  /** Notify when the countdown moved. Ten times a second while a timer runs. */
  subscribeClock(listener: ClockListener): () => void
  /** The current clock. A stable object while the numbers stand still. */
  clock(): StageClock
  /** Report a finished timeline (spec §11.G). */
  animComplete(key: AnimKey): void
  /**
   * Report a fault on Stage itself — a cue file that would not load. Stage
   * never shows a notice (spec §5.7); the host folds this into the health
   * report and the operator sees it in Studio (`health.audio_missing_cue`).
   */
  report(code: string, detail?: Record<string, string>): void
}

/**
 * Tauri v2 injects this before any app script runs, so its presence answers
 * "am I inside the desktop app?" without a build flag — which matters, because
 * the same bundle is what `vite dev` serves to a plain browser.
 */
export function hasTauriHost(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/**
 * The Stage window's host: Tauri's IPC. Exported so `tauriHost.test.ts` can
 * assert the label it listens as — that is a contract with `emit.rs`, not an
 * implementation detail.
 */
export function tauriHost(): StageHost {
  const listeners = new Set<StateListener>()
  const clockListeners = new Set<ClockListener>()
  let last: PlayStateForStage = EMPTY_PLAY_STATE
  let lastClock: StageClock = EMPTY_CLOCK
  let versionWarned = false

  const call = async (command: string, args?: Record<string, unknown>) => {
    const { invoke } = await import('@tauri-apps/api/core')
    return invoke(command, args)
  }

  void (async () => {
    const [{ listen }, { getCurrentWebviewWindow }] = await Promise.all([
      import('@tauri-apps/api/event'),
      import('@tauri-apps/api/webviewWindow'),
    ])
    // Listen **as this label**. A bare `listen()` registers
    // `EventTarget::Any`, which Tauri lets past the `emit_to` filter — Stage
    // would then also receive the `main` emission, operator half and all. The
    // stripping in `emit.rs` is only half the boundary; this is the other.
    const label = getCurrentWebviewWindow().label
    const unlisten = await listen<PlayStateForStage>('play-state', ({ payload }) => {
      // A contract mismatch is a notice, not a blank screen (P1 exit
      // criterion). Stage keeps drawing what it was sent; the operator-facing
      // notice comes from the host, which `stage_ready` told the version to.
      if (payload.contractVersion !== CONTRACT_VERSION && !versionWarned) {
        versionWarned = true
        console.error(
          `[stage] play-state is contract v${payload.contractVersion}, this build is v${CONTRACT_VERSION}`,
        )
      }
      last = payload
      // A full emission carries the clock, so it is also the newest tick.
      lastClock = clockOf(payload)
      for (const listener of listeners) listener(payload)
      for (const listener of clockListeners) listener()
    }, { target: { kind: 'AnyLabel', label } })

    // The countdown, on its own channel (P11.9) and its own subscribers
    // (P11.10). Nothing in the Stage tree is rebuilt for it but the two
    // components that draw a clock.
    const unlistenTick = await listen<PlayTick>('play-tick', ({ payload }) => {
      const next = clockFromTick(last, payload)
      if (next === null) return
      if (
        next.remainingMs === lastClock.remainingMs &&
        next.elapsedMs === lastClock.elapsedMs &&
        next.running === lastClock.running
      ) {
        return
      }
      lastClock = next
      for (const listener of clockListeners) listener()
    }, { target: { kind: 'AnyLabel', label } })

    // **A reload must unlisten first.** Tauri keeps the JS listener registered
    // on the Rust side until `unlisten` — a navigation does not clear it —
    // while the callback id lives in `window`, which a reload wipes. The host
    // would go on emitting `play-state` to a callback that no longer exists,
    // and the 100ms show loop makes that ten `[TAURI] Couldn't find callback
    // id …` a second for the life of the app. `pagehide` is the last event a
    // reload and a close both fire.
    window.addEventListener('pagehide', () => {
      void unlisten()
      void unlistenTick()
    }, { once: true })

    // Announce the version and ask for the current state. Without this, a Stage
    // window that mounts after the host's last emission waits for the next
    // change — and on an idle Play there may not be one.
    await call('stage_ready', { contractVersion: CONTRACT_VERSION })
  })()

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    snapshot: () => last,
    subscribeClock(listener) {
      clockListeners.add(listener)
      return () => {
        clockListeners.delete(listener)
      }
    },
    clock: () => lastClock,
    animComplete(key) {
      void call('overlay_ack_complete', { key })
    },
    report(code, detail = {}) {
      void call('stage_report', { code, detail })
    },
  }
}

/**
 * The Viewer (spec §5.7): this Stage is the iframe inside Control. Truth
 * arrives from the parent window over `postMessage` — the same stripped
 * `PlayStateForStage` the host emits — and nothing goes back but node
 * geometry (`App.tsx`). `animComplete` is dropped on purpose: the Stage
 * *window* acks the host's queue; a second ack from the Viewer would advance
 * it twice.
 */
export function isViewerMode(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.parent !== window &&
    new URLSearchParams(window.location.search).has('viewer')
  )
}

function viewerHost(): StageHost {
  const listeners = new Set<StateListener>()
  const clockListeners = new Set<ClockListener>()
  let last: PlayStateForStage = EMPTY_PLAY_STATE
  let lastClock: StageClock = EMPTY_CLOCK

  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (event.source !== window.parent || !isViewerMessage(event.data)) return
    const message = event.data as ViewerToStage
    if (message.type === 'tick') {
      // The Viewer's countdown, for the same reason the Stage window has one:
      // Control posts the whole state only when it changed (P11.9).
      const next = clockFromTick(last, message.tick)
      if (next === null) return
      lastClock = next
      for (const listener of clockListeners) listener()
      return
    }
    if (message.type !== 'play-state') return
    last = message.state
    lastClock = clockOf(last)
    for (const listener of listeners) listener(last)
    for (const listener of clockListeners) listener()
  })
  window.parent.postMessage({ source: VIEWER_SOURCE, type: 'ready' }, '*')

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    snapshot: () => last,
    subscribeClock(listener) {
      clockListeners.add(listener)
      return () => {
        clockListeners.delete(listener)
      }
    },
    clock: () => lastClock,
    animComplete() {
      // The Viewer never writes (spec §5.7).
    },
    report() {
      // Nor does it play a cue, so it has nothing to report.
    },
  }
}

let current: StageHost | null | undefined

/**
 * The host for this window, or `null` when there is none. Decided once.
 * The Viewer wins over Tauri: inside the desktop app the iframe has no IPC
 * of its own, and even if it had, the parent is the truth it must draw.
 */
export function stageHost(): StageHost | null {
  if (current === undefined) current = isViewerMode() ? viewerHost() : hasTauriHost() ? tauriHost() : null
  return current
}

/** Test seam: install a stub host, or `null` for none. */
export function setStageHost(host: StageHost | null): void {
  current = host
}
