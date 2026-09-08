import { describe, expect, it, vi } from 'vitest'

/**
 * The mirror of Studio's `host.test.ts`, and the more serious half: a bare
 * `listen()` registers `EventTarget::Any`, which Tauri lets past the `emit_to`
 * filter — so Stage would receive the `main` emission too, operator half and
 * all. Stripping the shape in `emit.rs` is only one side of §5.7; listening as
 * `stage` is the other. A leak here is a leak on camera.
 */

const tauri = vi.hoisted(() => ({
  listen: vi.fn(async () => () => {}),
  invoke: vi.fn(async () => undefined),
}))

vi.mock('@tauri-apps/api/event', () => ({ listen: tauri.listen }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: tauri.invoke }))
vi.mock('@tauri-apps/api/webviewWindow', () => ({
  getCurrentWebviewWindow: () => ({ label: 'stage' }),
}))

const { tauriHost } = await import('./host')

describe('the Stage host', () => {
  it('listens as `stage`, never as Any', async () => {
    tauriHost()
    // The subscription is set up in a floating promise; let it settle.
    await vi.waitFor(() => expect(tauri.listen).toHaveBeenCalled())
    expect(tauri.listen).toHaveBeenCalledWith('play-state', expect.any(Function), {
      target: { kind: 'AnyLabel', label: 'stage' },
    })
  })
})
