import { $, $$, browser } from '@wdio/globals'
import { closeWhatsNew, named, onStudio, press, sees } from '../support/app'

/**
 * beta.5 on the real app: *Duplicate* a team here ("(copy)", then numbered),
 * Manage workspaces as a list with search, and whose group each word says.
 * Screenshots in `e2e/.artifacts/look-*.png`.
 */
const shot = async (name: string) => {
  await browser.pause(400)
  await browser.saveScreenshot(`e2e/.artifacts/look-${name}.png`)
}

async function pick(text: string): Promise<void> {
  let found: WebdriverIO.Element | undefined
  await browser.waitUntil(
    async () => {
      for (const item of await $$('[role="menuitem"]')) {
        if ((await item.getText()).trim() === text && (await item.isClickable())) {
          found = item
          return true
        }
      }
      return false
    },
    { timeoutMsg: `no menu item "${text}"` },
  )
  await (found as WebdriverIO.Element).click()
}

async function rowMenu(title: string): Promise<void> {
  const card = await $(`//div[@role="button"][.//*[normalize-space(text())="${title}"]]`)
  await card.waitForExist({ timeout: 15_000 })
  await card.moveTo()
  const menu = await card.$('.//button[@aria-label="Open"]')
  await menu.waitForClickable()
  await menu.click()
}

describe('beta.5', () => {
  it('duplicates a team here, and lists workspaces with search', async () => {
    await onStudio()
    await closeWhatsNew()

    await press('Teams')
    await rowMenu('Red')
    await pick('Duplicate')
    await sees('Red (copy)')
    await rowMenu('Red')
    await pick('Duplicate')
    await sees('Red (copy 2)')
    await shot('duplicate-team')

    await press('E2E library')
    await pick('Manage workspaces…')
    await sees('Workspaces')
    await sees('New workspace group')
    const search = await $('[data-workspaces-page] input[type="search"], [data-workspaces-page] input')
    await search.waitForExist()
    await search.setValue('E2E')
    await sees('E2E library')
    await shot('workspaces-list')
    expect(await (await named('Workspace group')).isExisting()).toBe(false)
  })
})
