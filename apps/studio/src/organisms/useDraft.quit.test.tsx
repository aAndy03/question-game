import { afterEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { HOME, useNavStore } from '@/chrome/nav'
import { useDirtyGuard } from './useDraft'

/** P12.2: closing the app goes through the same dirty guard as navigating. */
const dirty = { isDirty: true, isDirtyNow: () => true }

afterEach(() => {
  useNavStore.setState({ route: HOME, back: [], forward: [], guard: null })
})

describe('askLeave', () => {
  it('allows a close when nothing guards it', async () => {
    await expect(useNavStore.getState().askLeave()).resolves.toBe(true)
  })

  it('a successful Save lets the app close', async () => {
    const { result } = renderHook(() => useDirtyGuard(dirty))
    let answer!: Promise<boolean>
    act(() => {
      answer = useNavStore.getState().askLeave()
    })
    expect(result.current.isOpen).toBe(true)
    await act(async () => {
      await result.current.saveAndGo(async () => true)
    })
    await expect(answer).resolves.toBe(true)
    expect(useNavStore.getState().route).toEqual(HOME)
  })

  it('Discard lets the app close', async () => {
    const { result } = renderHook(() => useDirtyGuard(dirty))
    let answer!: Promise<boolean>
    act(() => {
      answer = useNavStore.getState().askLeave()
    })
    act(() => result.current.discardAndGo())
    await expect(answer).resolves.toBe(true)
  })

  it('Keep editing keeps the app open', async () => {
    const { result } = renderHook(() => useDirtyGuard(dirty))
    let answer!: Promise<boolean>
    act(() => {
      answer = useNavStore.getState().askLeave()
    })
    act(() => result.current.keepEditing())
    await expect(answer).resolves.toBe(false)
  })

  it('a failed save keeps the app open', async () => {
    const { result } = renderHook(() => useDirtyGuard(dirty))
    let answer!: Promise<boolean>
    act(() => {
      answer = useNavStore.getState().askLeave()
    })
    await act(async () => {
      await result.current.saveAndGo(async () => false)
    })
    await expect(answer).resolves.toBe(false)
  })
})
