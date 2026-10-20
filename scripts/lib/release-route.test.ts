import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { route, type Route } from './release-route'

const BETA_CONFIG = '--config crates/app/tauri.beta.conf.json'
const tag = (refName: string, version: string) => route({ ref: `refs/tags/${refName}`, refName, version })
const dispatch = (version: string, dispatchChannel?: string) =>
  route({ ref: 'refs/heads/main', refName: 'main', version, ...(dispatchChannel === undefined ? {} : { dispatchChannel }) })

describe('which build a tag publishes (WF02–WF06)', () => {
  it('publishes a plain version as stable', () => {
    expect(tag('v1.1.0', '1.1.0')).toEqual<Route>({
      channel: 'stable',
      publish: true,
      prerelease: false,
      configArgs: '',
      releaseName: 'questiongame v1.1.0',
    })
    for (const [t, v] of [['v1.0.2', '1.0.2'], ['v1.2.10', '1.2.10'], ['v2.0.0', '2.0.0']] as const) {
      expect(tag(t, v)).toMatchObject({ channel: 'stable', prerelease: false })
    }
  })

  it('publishes a beta version as a prerelease of questiongame Beta', () => {
    expect(tag('v2.0.0-beta.3', '2.0.0-beta.3')).toEqual<Route>({
      channel: 'beta',
      publish: true,
      prerelease: true,
      configArgs: BETA_CONFIG,
      releaseName: 'questiongame Beta v2.0.0-beta.3',
    })
    expect(tag('v2.0.0-beta.10', '2.0.0-beta.10')).toMatchObject({ channel: 'beta' })
  })

  it('refuses a tag that is neither, or does not name the version being built', () => {
    const refused: [string, string][] = [
      ['v1.1.0', '1.1.1'],
      ['v2.0.0-beta.3', '2.0.0-beta.4'],
      ['v2.0.0-beta.1', '1.0.2'],
      ['v1.0.3', '2.0.0-beta.1'],
      ['v1.0.2', '1.0.2-beta.1'],
      ['v1.0.0-rc.1', '1.0.0-rc.1'],
      ['v1.1', '1.1'],
      ['V1.0.2', '1.0.2'],
      ['v1.0.2-beta', '1.0.2-beta'],
      ['v01.0.2', '01.0.2'],
      ['v1.0.2+meta', '1.0.2+meta'],
      ['vbeta', 'beta'],
      ['release-1.1.0', '1.1.0'],
    ]
    for (const [t, v] of refused) expect(tag(t, v), `${t} on ${v}`).toHaveProperty('refused')
  })
})

describe('a manual run builds without publishing (WF07)', () => {
  it('builds Beta from any version when asked', () => {
    expect(dispatch('1.0.2', 'beta')).toEqual<Route>({
      channel: 'beta',
      publish: false,
      prerelease: false,
      configArgs: BETA_CONFIG,
      releaseName: null,
    })
  })

  it('builds stable by default', () => {
    expect(dispatch('2.0.0-beta.1')).toMatchObject({ channel: 'stable', publish: false, configArgs: '' })
    expect(dispatch('1.0.2', 'stable')).toMatchObject({ channel: 'stable', publish: false })
  })

  it('refuses a channel it does not know', () => {
    expect(dispatch('1.0.2', 'nightly')).toHaveProperty('refused')
  })
})

describe('the workflow asks the route (WF01, WF04, WF05, WF08, WF09)', () => {
  const yml = readFileSync(path.resolve(__dirname, '../../.github/workflows/release.yml'), 'utf8')

  it('lets a manual run pick the channel', () => {
    expect(yml).toMatch(/workflow_dispatch:\s+inputs:\s+channel:[\s\S]*?type: choice[\s\S]*?- stable\s+- beta/)
    expect(yml).toMatch(/default: stable/)
  })

  it('routes in the test job and builds from its outputs', () => {
    expect(yml).toContain('npm run release:route')
    expect(yml).toContain('needs.test.outputs.config_args')
    expect(yml).toContain("prerelease: ${{ needs.test.outputs.prerelease == 'true' }}")
    expect(yml).not.toContain('does not match version')
    expect(yml).toContain('needs: [test, e2e]')
  })

  it('keeps the macOS target beside the Beta config', () => {
    expect(yml).toContain('args: ${{ matrix.args }} ${{ needs.test.outputs.config_args }}')
    expect(yml).toContain('--target universal-apple-darwin')
  })

  it('tells Beta testers what they are installing', () => {
    expect(yml).toContain('This is a beta.')
    expect(yml).toContain('keeps its own library')
    expect(yml).toContain('questiongame Beta_…_x64-setup.exe')
  })

  it('names the installers per channel so uploads cannot collide', () => {
    expect(yml).toContain('name: questiongame-${{ needs.test.outputs.channel }}-${{ matrix.name }}')
  })

  it('runs the whole e2e suite once, both channels inside it', () => {
    expect(yml.match(/run: npm run e2e$/gm)).toHaveLength(1)
  })
})
