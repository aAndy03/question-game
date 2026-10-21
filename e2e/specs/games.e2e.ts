import { $, $$, browser } from '@wdio/globals'
import { closeWhatsNew, named, onStudio, openGame, press, sees } from '../support/app'

/**
 * beta.4 on the real app: the Roster and Board pickers, the difficulty
 * dialog, the Game page's menu, the Games bulk bar, and an archived team
 * refused at Load. Screenshots land in `e2e/.artifacts/` for a look at the
 * layout, as the copies dialog's did (beta.3).
 */
const body = async () => $('body').getText()
/** After the dialog's entrance has settled, so the frame is drawn as it rests. */
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

/** A checkbox inside the open dialog, by its accessible name. */
async function tick(name: string): Promise<void> {
  const box = await $(`[role="dialog"] [aria-label="${name}"]`)
  await box.waitForExist({ timeout: 15_000 })
  await browser.execute((el: HTMLElement) => el.click(), box as unknown as HTMLElement)
}

/** Every button of the open dialog sits inside its frame. */
async function insideFrame(): Promise<string[]> {
  return browser.execute(() => {
    const dialog = document.querySelector('[role="dialog"]')
    if (!dialog) return ['no dialog']
    const frame = dialog.getBoundingClientRect()
    return [...dialog.querySelectorAll('button')]
      .filter((b) => {
        const r = b.getBoundingClientRect()
        return r.width > 0 && (r.left < frame.left - 1 || r.right > frame.right + 1)
      })
      .map((b) => b.textContent ?? '')
  })
}

describe('games parity', () => {
  it('builds a roster and a board through the pickers, edits a difficulty, and refuses an archived team', async () => {
    await onStudio()
    await closeWhatsNew()

    // A third team, to add.
    await press('Teams')
    await press('New team')
    await (await named('Name')).setValue('Green')
    await press('Save')
    await sees('Team saved')

    // Roster: Add teams…, searched, ticked, applied.
    await press('Games')
    await openGame('Demo')
    await sees('Roster')
    await press('Add teams…')
    await sees('Teams on this game')
    await shot('roster-picker')
    expect(await insideFrame()).toEqual([])
    await tick('Green')
    await sees('3 chosen')
    await press('Apply')
    await browser.waitUntil(async () => !(await body()).includes('Teams on this game'), { timeoutMsg: 'the picker did not close' })
    await sees('Green')

    // Board: Choose questions… in Geography; one comes off.
    await press('Board')
    await sees('Allow repeated difficulties')
    const choosers = await $$('button*=Choose questions…')
    await choosers[0]?.click()
    await sees('Questions from Geography')
    await shot('board-picker')
    expect(await insideFrame()).toEqual([])
    await tick('Which river flows through Baghdad?')
    await press('Apply')
    await sees('2 of 3 questions')

    // The difficulty is a dialog, not a prompt.
    await press('Difficulty of What is the capital of Australia?: Easy · 20')
    const field = await $('[role="dialog"] input')
    await field.waitForExist()
    await field.click()
    await browser.keys(['Control', 'a'])
    await browser.keys('55')
    await shot('difficulty-dialog')
    expect(await insideFrame()).toEqual([])
    await press('This game only')
    await sees('Overridden')

    // The Game page's menu: Duplicate opens the copy.
    await press('More actions')
    await pick('Duplicate')
    await sees('Demo (copy)')

    // The Games list has a bulk bar.
    await press('Games')
    await (await named('Select Demo (copy)')).waitForExist({ timeout: 15_000 })
    await browser.execute((el: HTMLElement) => el.click(), (await named('Select Demo (copy)')) as unknown as HTMLElement)
    await sees('Copy or move…')
    await shot('games-bulk')
    await press('Clear')

    // Green archived: the roster says so, and Load refuses it by its place.
    await press('Teams')
    const card = await $('//div[@role="button"][.//*[normalize-space(text())="Green"]]')
    await card.waitForExist({ timeout: 15_000 })
    await card.moveTo()
    const menu = await card.$('.//button[@aria-label="Open"]')
    await menu.waitForClickable()
    await menu.click()
    await pick('Archive')
    // Green is on a game: the confirm arms, then confirms.
    await press('Archive')
    await press('Confirm archive')
    await press('Games')
    await openGame('Demo')
    await sees('Archived')
    await press('Load into Control')
    await sees('This game cannot start yet.')
    await sees('the roster has the archived team Green')
    expect(await body()).not.toContain('roster.team.')
    expect(await body()).not.toContain('needs attention elsewhere')
    await shot('archived-refused')
  })
})
