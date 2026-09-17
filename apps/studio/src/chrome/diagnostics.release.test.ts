import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * P12.1: a release build of Studio forwards errors and does nothing else —
 * no per-second report, no user-timing sweep, no breadcrumbs. The gate is
 * `import.meta.env.DEV`, which Vite folds to a constant; here it is stubbed,
 * and the module is re-imported so its install-once flag starts fresh.
 */
describe('Studio diagnostics in a release build', () => {
  const original = { error: console.error, warn: console.warn }
  type WithTauri = Window & { __TAURI_INTERNALS__?: unknown }

  afterEach(() => {
    console.error = original.error
    console.warn = original.warn
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    delete (window as WithTauri).__TAURI_INTERNALS__
  })

  async function install(dev: boolean) {
    vi.stubEnv('DEV', dev)
    vi.resetModules()
    const invoke = vi.fn<(name: string, args?: Record<string, unknown>) => Promise<null>>(() => Promise.resolve(null))
    ;(window as WithTauri).__TAURI_INTERNALS__ = { invoke }
    const host = await import('@/host/host')
    host.setHostTransport({ invoke: () => Promise.resolve(null as never), listen: () => Promise.resolve(() => {}) })
    const interval = vi.spyOn(globalThis, 'setInterval')
    const diagnostics = await import('./diagnostics')
    diagnostics.installDiagnostics()
    return { invoke, interval, diagnostics, host }
  }

  it('forwards an error and starts no timer, report or breadcrumb', async () => {
    const { invoke, interval, diagnostics, host } = await install(false)
    expect(interval).not.toHaveBeenCalled()
    diagnostics.crumb('list:enter', 'teams')
    console.error('boom')
    expect(invoke.mock.calls.map((c) => c[0])).toEqual(['client_log'])
    expect(invoke.mock.calls[0]?.[1]).toMatchObject({ level: 'error', message: 'boom' })
    host.setHostTransport(null)
  })

  it('a dev build still sweeps and reports', async () => {
    const { interval, invoke, host } = await install(true)
    expect(interval).toHaveBeenCalled()
    expect(invoke.mock.calls.some((c) => c[1] && (c[1] as { message?: string }).message === 'studio ready')).toBe(true)
    host.setHostTransport(null)
  })
})
