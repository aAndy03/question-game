import { $, browser } from '@wdio/globals'
import { closeWhatsNew, onStage, onStudio, openGame, press, sees, stageScreen } from '../support/app'

/**
 * A show, through the real wire: Load into Control opens the Stage window, and
 * what the operator does in Studio is what Stage puts on air — a Play started,
 * a domain chosen, the question on screen. Seeded with the Demo and an active
 * operator, so the app opens on the shell.
 */
describe('a show', () => {
  it('loads a game, opens Stage, and puts the first question on air', async () => {
    await onStudio()
    await closeWhatsNew()
    await press('Games')
    await openGame('Demo')
    await press('Load into Control')

    // Stage is a second window, created by the first Load (§9).
    await browser.waitUntil(async () => (await browser.getWindowHandles()).length >= 2, {
      timeout: 30_000,
      timeoutMsg: 'Load into Control opened no Stage window',
    })
    await onStage()
    await browser.waitUntil(async () => (await stageScreen()) === 'idle', { timeoutMsg: 'Stage did not open on Idle' })

    await onStudio()
    await press('Start Play')
    const geography = await $('button*=Geography')
    await geography.waitForClickable()
    await geography.click()

    // Stage changes screen when the operator picks one, not on its own.
    await press('Question')

    await onStage()
    await browser.waitUntil(async () => (await stageScreen()) === 'question', {
      timeoutMsg: 'choosing Geography did not put the question on Stage',
    })

    await onStudio()
    await sees('Geography')
  })
})
