import { $, browser } from '@wdio/globals'
import { closeWhatsNew, onStudio, openGame, press, sees, shot } from '../support/app'

/**
 * Stable 1.1.1 on the real app: Studio at 1100 px wide. An opened team is
 * drawn over the list with a Close (it was hidden below 1280 px), and the
 * board's difficulty edit is a dialog, not a `window.prompt` (which would
 * hang this driver). Screenshots in `e2e/.artifacts/look-*.png`.
 */
describe('a narrow window', () => {
  it('shows an opened row, and edits a difficulty in a dialog', async () => {
    await onStudio()
    await browser.setWindowSize(1100, 800)
    await closeWhatsNew()

    await press('Teams')
    const red = await $('//div[@role="button"][.//*[normalize-space(text())="Red"]]')
    await red.waitForClickable({ timeout: 15_000 })
    await red.click()
    const aside = await $('[data-detail-aside]')
    await aside.waitForDisplayed({ timeout: 15_000 })
    await sees('Short code')
    await shot('narrow-detail')
    await (await aside.$('button[aria-label="Close details"]')).click()
    await browser.waitUntil(async () => !(await $('[data-detail-aside]').isExisting()), { timeoutMsg: 'the detail did not close' })

    await press('Games')
    await openGame('Demo')
    await press('Board')
    await press('Difficulty of What is the capital of Australia?: Easy · 20')
    const field = await $('[role="dialog"] input')
    await field.waitForExist()
    await field.click()
    await browser.keys(['Control', 'a'])
    await browser.keys('35')
    await shot('narrow-difficulty')
    await press('This game only')
    await sees('Overridden')
  })
})
