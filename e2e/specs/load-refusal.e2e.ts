import { browser } from '@wdio/globals'
import { closeWhatsNew, named, onStudio, openGame, press, sees } from '../support/app'

/**
 * P12.8, on the real app. The Demo's board was broken from outside the recipe
 * — a Geography question re-graded in the library to its neighbour's
 * difficulty — so Load must refuse, and say why from the Roster, where the
 * operator pressed it.
 */
describe('a refused Load', () => {
  it('says why from the Roster and leads to the Board', async () => {
    await onStudio()
    await closeWhatsNew()
    await press('Games')
    await openGame('Demo')
    await sees('Roster')
    await press('Load into Control')

    // The collector opens where the click was, naming the place.
    await sees('1 item needs attention elsewhere')
    await sees('Game ▸ Board')
    expect((await browser.getWindowHandles()).length).toBe(1)

    await press('Show')
    await sees('Allow repeated difficulties')
    expect(await (await named('Board — needs attention')).isExisting()).toBe(true)
  })
})
