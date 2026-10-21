import { $, $$, browser } from '@wdio/globals'
import { onStudio, press, sees } from '../support/app'

/**
 * beta.2 on the real app: a library beta.1 left, with the Red team and the
 * Geography domain in the shared library, opens with both workspaces still
 * seeing them — each now its own linked copy (migration 6) — and nothing says
 * "shared" any more.
 */
const body = async () => $('body').getText()

async function switchTo(from: string, to: string): Promise<void> {
  const box = await $('[data-workspace-switcher]')
  await browser.waitUntil(async () => (await box.getText()).includes(from), { timeout: 30_000, timeoutMsg: `the switcher never said ${from}` })
  const button = await box.$('button')
  await button.waitForClickable()
  await button.click()
  let found: WebdriverIO.Element | undefined
  await browser.waitUntil(
    async () => {
      for (const item of await $$('[role="menuitem"]')) {
        if ((await item.getText()).trim() === to && (await item.isClickable())) {
          found = item
          return true
        }
      }
      return false
    },
    { timeoutMsg: `no workspace "${to}" in the switcher` },
  )
  await (found as WebdriverIO.Element).click()
}

describe('an update from beta.1', () => {
  it('keeps what both workspaces saw, as their own rows', async () => {
    await onStudio()
    // The seed was last seen by beta.1, so every later build opens What's new over it.
    await sees('What’s new in questiongame', 30_000)
    await sees('No more shared library')
    await press('Got it')
    await browser.waitUntil(async () => !(await body()).includes('What’s new in questiongame'), { timeoutMsg: 'What’s new did not close' })

    await press('Teams')
    await sees('Red')
    await switchTo('Quiz club', 'Second')
    await press('Teams')
    await sees('Red')
    await press('Domains & Questions')
    await sees('Geography')
    const text = await body()
    expect(text).not.toContain('Shared')
    expect(text).not.toContain('Make shared')
  })
})
