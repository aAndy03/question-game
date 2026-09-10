import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { FIXTURES, type PlayStateForStage } from '@questiongame/contract'
import { clockOf, type StageHost, type StateListener } from '@/host/host'
import type { AudioPort } from './port'
import { useAudio } from './useAudio'

/**
 * The hook is the projection's ear: one `play` per cue the diff names, and
 * `set` / `load` only when the audio settings actually changed — the 100 ms
 * tick carries the same `audio` every time and must cost nothing.
 */
function stubHost(initial: PlayStateForStage) {
  const listeners = new Set<StateListener>()
  const clockListeners = new Set<() => void>()
  let state = initial
  const host: StageHost = {
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    snapshot: () => state,
    subscribeClock(listener: () => void) {
      clockListeners.add(listener)
      return () => {
        clockListeners.delete(listener)
      }
    },
    clock: () => clockOf(state),
    animComplete: () => {},
    report: () => {},
  }
  return {
    host,
    emit(next: PlayStateForStage) {
      state = next
      for (const listener of listeners) listener(next)
    },
  }
}

function spyPort(): AudioPort {
  return { play: vi.fn(), set: vi.fn(), load: vi.fn(), dispose: vi.fn() }
}

describe('useAudio', () => {
  it('loads the cue map and sets volume once on mount, then plays what the diff says', () => {
    const stub = stubHost(FIXTURES['question-issued'])
    const port = spyPort()
    renderHook(() => useAudio(stub.host, port))

    expect(port.load).toHaveBeenCalledTimes(1)
    expect(port.load).toHaveBeenCalledWith(FIXTURES['question-issued'].audio.cues)
    expect(port.set).toHaveBeenCalledTimes(1)
    expect(port.set).toHaveBeenCalledWith(80, false)
    expect(port.play).not.toHaveBeenCalled()

    act(() => stub.emit(FIXTURES['question-locked']))
    expect(port.play).toHaveBeenCalledTimes(1)
    expect(port.play).toHaveBeenCalledWith('lock')

    act(() => stub.emit(FIXTURES['question-outcome-correct']))
    expect(port.play).toHaveBeenCalledTimes(2)
    expect(port.play).toHaveBeenLastCalledWith('correct')

    // Same audio settings all along: nothing pushed again.
    expect(port.set).toHaveBeenCalledTimes(1)
    expect(port.load).toHaveBeenCalledTimes(1)
  })

  it('pushes volume, mute and the cue map only when they changed', () => {
    const base = FIXTURES['choose-domain']
    const stub = stubHost(base)
    const port = spyPort()
    renderHook(() => useAudio(stub.host, port))

    // A tick with a fresh object but equal values.
    act(() => stub.emit({ ...base, audio: { ...base.audio, cues: { ...base.audio.cues } } }))
    expect(port.set).toHaveBeenCalledTimes(1)
    expect(port.load).toHaveBeenCalledTimes(1)

    act(() => stub.emit({ ...base, audio: { ...base.audio, muted: true } }))
    expect(port.set).toHaveBeenCalledTimes(2)
    expect(port.set).toHaveBeenLastCalledWith(80, true)

    act(() => stub.emit({ ...base, audio: { ...base.audio, volume: 30 } }))
    expect(port.set).toHaveBeenLastCalledWith(30, false)

    const cues = { ...base.audio.cues, lock: null }
    act(() => stub.emit({ ...base, audio: { ...base.audio, cues } }))
    expect(port.load).toHaveBeenCalledTimes(2)
    expect(port.load).toHaveBeenLastCalledWith(cues)
    expect(port.play).not.toHaveBeenCalled()
  })

  it('disposes the port and stops listening on unmount', () => {
    const stub = stubHost(FIXTURES['question-issued'])
    const port = spyPort()
    const { unmount } = renderHook(() => useAudio(stub.host, port))
    unmount()
    expect(port.dispose).toHaveBeenCalledTimes(1)
    act(() => stub.emit(FIXTURES['question-locked']))
    expect(port.play).not.toHaveBeenCalled()
  })
})
