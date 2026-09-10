import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CueKey } from '@questiongame/contract'
import { CUE_KEYS } from '@questiongame/contract'
import type { CueMap } from './port'

/**
 * P11.8. `unload()` on a `Howl` that is still preloading aborts its decode,
 * and Howler delivers that as `onloaderror` — "Decoding audio data failed",
 * indistinguishable from a file that is not there. Two things retire a Howl
 * deliberately, and neither is a finding: `dispose()`, and `load()` replacing
 * a cue whose file changed.
 *
 * React's StrictMode does the first on every Stage open, and the eight reports
 * it produced latched a health warning for the life of the process — the
 * status-bar dot amber on Control Load, over a notices panel that was empty,
 * while the audio itself played perfectly from the second mount onwards.
 */

/** A `Howl` whose load can be resolved, failed, or aborted by `unload`. */
class FakeHowl {
  static live: FakeHowl[] = []
  loaded = false
  unloaded = false
  private readonly on: Record<string, ((id?: number, err?: unknown) => void) | undefined>

  constructor(readonly options: Record<string, unknown>) {
    this.on = {
      load: options['onload'] as never,
      loaderror: options['onloaderror'] as never,
      playerror: options['onplayerror'] as never,
    }
    FakeHowl.live.push(this)
  }

  /** The load succeeds. */
  succeed(): void {
    this.loaded = true
    this.on.load?.()
  }

  /** The load fails on its own — a file that really is not there. */
  fail(message = 'No codec support'): void {
    this.on.loaderror?.(1, message)
  }

  state(): string {
    return this.loaded ? 'loaded' : 'loading'
  }

  play(): void {}

  /**
   * What the real Howler does: aborts the in-flight decode, and the abort
   * surfaces through the *same* callback a genuine failure uses.
   */
  unload(): void {
    this.unloaded = true
    if (!this.loaded) this.on.loaderror?.(1, 'Decoding audio data failed.')
  }
}

const volume = vi.fn()
const mute = vi.fn()

vi.mock('howler', () => ({
  Howl: FakeHowl,
  Howler: {
    volume: (...a: unknown[]) => volume(...a),
    mute: (...a: unknown[]) => mute(...a),
  },
}))

const { howlerAudio } = await import('./howler')

const cues = (): CueMap => Object.fromEntries(CUE_KEYS.map((k) => [k, `${k}.wav`])) as CueMap

afterEach(() => {
  FakeHowl.live = []
  vi.clearAllMocks()
})

describe('howlerAudio', () => {
  it('reports a cue that genuinely fails to load', () => {
    const reports: Array<[string, Record<string, string>]> = []
    howlerAudio(cues(), '/stage/audio/', (code, detail) => reports.push([code, detail]))
    FakeHowl.live[0]!.fail()
    expect(reports).toEqual([['audio_missing_cue', expect.objectContaining({ cue: 'lock', file: 'lock.wav' })]])
  })

  it('says nothing when a StrictMode teardown aborts every preload', () => {
    const reports: Array<[string, Record<string, string>]> = []
    const port = howlerAudio(cues(), '/stage/audio/', (code, detail) => reports.push([code, detail]))
    expect(FakeHowl.live).toHaveLength(CUE_KEYS.length)

    // The cleanup React runs immediately after the first mount, before any of
    // the eight preloads has finished.
    port.dispose()

    expect(FakeHowl.live.every((h) => h.unloaded)).toBe(true)
    expect(reports, 'eight aborted decodes are not eight missing files').toEqual([])
  })

  it('says nothing when a changed cue map retires the old file', () => {
    const reports: Array<[string, Record<string, string>]> = []
    const port = howlerAudio(cues(), '/stage/audio/', (code, detail) => reports.push([code, detail]))
    const first = FakeHowl.live[0]!
    first.succeed()

    port.load({ ...cues(), lock: 'other.wav' })
    expect(first.unloaded).toBe(true)
    expect(reports).toEqual([])
  })

  it('tells the host when a reported cue loads after all', () => {
    const reports: Array<[string, Record<string, string>]> = []
    const port = howlerAudio(cues(), '/stage/audio/', (code, detail) => reports.push([code, detail]))
    FakeHowl.live[0]!.fail()
    expect(reports.map(([c]) => c)).toEqual(['audio_missing_cue'])

    // The operator drops the file in and the map is re-established.
    port.load({ ...cues(), lock: 'lock2.wav' })
    port.load(cues())
    FakeHowl.live[FakeHowl.live.length - 1]!.succeed()

    expect(reports.map(([c]) => c)).toEqual(['audio_missing_cue', 'audio_ok'])
    expect(reports[1]![1]).toMatchObject({ cue: 'lock', file: 'lock.wav' })
  })

  it('does not announce a cue that never failed', () => {
    const reports: string[] = []
    howlerAudio(cues(), '/stage/audio/', (code) => reports.push(code))
    for (const howl of FakeHowl.live) howl.succeed()
    expect(reports, 'a healthy open is silent').toEqual([])
  })

  it('drops a cue that is still loading rather than queueing it', () => {
    const port = howlerAudio(cues(), '/stage/audio/')
    const lock = FakeHowl.live[0]!
    const play = vi.spyOn(lock, 'play')
    port.play('lock' as CueKey)
    expect(play).not.toHaveBeenCalled()
    lock.succeed()
    port.play('lock' as CueKey)
    expect(play).toHaveBeenCalledOnce()
  })
})
