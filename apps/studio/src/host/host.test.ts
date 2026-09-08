import { describe, expect, it, vi } from 'vitest'

/**
 * The event seam's one rule: **listen as this webview's label.**
 *
 * `listen()` without a target registers `EventTarget::Any`, and Tauri lets an
 * `Any` listener past the `emit_to` filter entirely — so Studio would also
 * receive the stripped `play-state` addressed to `stage`. That shape has no
 * `operator` half, and the last emission wins, so the whole window would throw
 * on `play.operator` the moment a Play loaded. The target is the fix, and this
 * is the test that keeps it.
 */

type Envelope = { payload: unknown }
type Listen = (
  event: string,
  handler: (envelope: Envelope) => void,
  options?: unknown,
) => Promise<() => void>

const tauri = vi.hoisted(() => ({
  listen: vi.fn<Listen>(async () => () => {}),
  label: 'main',
}))

vi.mock('@tauri-apps/api/event', () => ({ listen: tauri.listen }))
vi.mock('@tauri-apps/api/webviewWindow', () => ({
  getCurrentWebviewWindow: () => ({ label: tauri.label }),
}))

const { on, setHostTransport, tauriTransport } = await import('./host')

describe('the Tauri transport', () => {
  it('listens as this webview label, never as Any', async () => {
    tauri.label = 'main'
    await tauriTransport.listen('play-state', () => {})
    expect(tauri.listen).toHaveBeenCalledWith('play-state', expect.any(Function), {
      target: { kind: 'AnyLabel', label: 'main' },
    })
  })

  it('carries whatever label the window has — the Statistics window included', async () => {
    tauri.label = 'stats'
    await tauriTransport.listen('catalog-changed', () => {})
    expect(tauri.listen).toHaveBeenLastCalledWith('catalog-changed', expect.any(Function), {
      target: { kind: 'AnyLabel', label: 'stats' },
    })
  })

  it('hands the handler the payload, not the envelope', async () => {
    const seen: unknown[] = []
    await tauriTransport.listen('notice', (p) => seen.push(p))
    tauri.listen.mock.lastCall?.[1]({ payload: { code: 'x' } })
    expect(seen).toEqual([{ code: 'x' }])
  })
})

/**
 * The other half of the seam's bookkeeping. Tauri keeps a JS listener
 * registered on the Rust side until `unlisten` — a page reload does not clear
 * it, while the callback ids live in `window`, which a reload does clear — so a
 * subscription left behind becomes `[TAURI] Couldn't find callback id …` on
 * every emission, ten a second under the 100ms show loop.
 */
describe('a subscription', () => {
  /**
   * A transport whose `listen` can be held open, so a test can release a
   * subscription that has not finished registering.
   */
  function stubTransport() {
    const open = new Set<string>()
    const pending: Array<() => void> = []
    let seq = 0
    let hold = false
    return {
      open,
      holdNext: () => {
        hold = true
      },
      /** Let every held `listen` finish. */
      settle: async () => {
        pending.splice(0).forEach((go) => go())
        await Promise.resolve()
      },
      transport: {
        invoke: async () => undefined as never,
        async listen() {
          const id = `sub-${seq++}`
          if (hold) {
            hold = false
            await new Promise<void>((r) => pending.push(r))
          }
          open.add(id)
          return () => open.delete(id)
        },
      },
    }
  }

  it('is released exactly once', async () => {
    const stub = stubTransport()
    setHostTransport(stub.transport)
    const release = await on('play-state', () => {})
    expect(stub.open.size).toBe(1)
    release()
    release()
    expect(stub.open.size).toBe(0)
    setHostTransport(null)
  })

  it('does not outlive the page: pagehide unlistens every live one', async () => {
    const stub = stubTransport()
    setHostTransport(stub.transport)
    await on('play-state', () => {})
    await on('notice', () => {})
    expect(stub.open.size).toBe(2)

    window.dispatchEvent(new Event('pagehide'))
    expect(stub.open.size).toBe(0)
    setHostTransport(null)
  })

  it('is released even when the page goes while it is still registering', async () => {
    const stub = stubTransport()
    setHostTransport(stub.transport)
    stub.holdNext()
    const subscribing = on('play-state', () => {})

    window.dispatchEvent(new Event('pagehide'))
    await stub.settle()
    await subscribing
    expect(stub.open.size).toBe(0)
    setHostTransport(null)
  })
})
