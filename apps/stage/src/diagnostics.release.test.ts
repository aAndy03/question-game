import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * P12.1: a release Stage runs no diagnostic at all. Only the diagnostics'
 * own cadences are counted: importing the module graph also starts GSAP's
 * 60 Hz ticker, which is not a diagnostic.
 */
const diagnosticTimers = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls.filter((c) => typeof c[1] === 'number' && c[1] >= 1000)

describe('Stage diagnostics in a release build', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('starts nothing', async () => {
    vi.stubEnv('DEV', false)
    vi.resetModules()
    const interval = vi.spyOn(globalThis, 'setInterval')
    const { installStageDiagnostics } = await import('./diagnostics')
    installStageDiagnostics()
    expect(diagnosticTimers(interval)).toEqual([])
  })

  it('a dev Stage still sweeps', async () => {
    vi.stubEnv('DEV', true)
    vi.resetModules()
    const interval = vi.spyOn(globalThis, 'setInterval')
    const { installStageDiagnostics } = await import('./diagnostics')
    installStageDiagnostics()
    expect(diagnosticTimers(interval).length).toBeGreaterThan(0)
  })
})
