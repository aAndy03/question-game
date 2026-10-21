import { $, $$, browser } from '@wdio/globals'
import { closeWhatsNew, named, onStudio, press, sees } from '../support/app'

/**
 * Beta P15 on the real app (X1, X2, X4): a group in Geography by name, two
 * questions put in it at once, the list grouped by it; a tag on questions in
 * two domains, found by search; a difficulty set on a selection.
 */
const body = async () => $('body').getText()

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

async function select(stem: string): Promise<void> {
  const box = await named(`Select ${stem}`)
  await box.waitForExist({ timeout: 15_000 })
  await browser.execute((el: HTMLElement) => el.click(), box as unknown as HTMLElement)
}

/** A HeroUI select's own native element, which React Aria keeps in step. */
async function choose(container: string, label: string): Promise<void> {
  await browser.waitUntil(async () => (await $(`${container} select`).isExisting()), { timeoutMsg: `no select in ${container}` })
  await browser.execute(
    (sel: string, text: string) => {
      const el = document.querySelector(`${sel} select`) as HTMLSelectElement
      const option = [...el.options].find((o) => o.textContent?.trim() === text)
      if (!option) throw new Error(`no option ${text}`)
      el.value = option.value
      el.dispatchEvent(new Event('change', { bubbles: true }))
    },
    container,
    label,
  )
}

async function domain(name: string): Promise<void> {
  const row = await $(`//*[@role="option"][.//*[normalize-space(text())="${name}"]]`)
  await row.waitForClickable({ timeout: 15_000 })
  await row.click()
}

describe('groups, tags and bulk edits', () => {
  it('groups a domain, tags across domains, and sets a difficulty at once', async () => {
    await onStudio()
    await closeWhatsNew()
    await press('Domains & Questions')

    // A group in Geography, by name.
    await domain('Geography')
    await press('Domain groups…')
    await press('New domain group')
    await (await named('Domain group name')).setValue('Capitals')
    await press('Create')
    await sees('Capitals')
    await press('Close')

    // Two questions into it at once; Geography now opens grouped by its groups.
    await select('What is the capital of Australia?')
    await select('Which is the largest ocean on Earth?')
    await press('Edit…')
    await pick('Group…')
    await choose('[data-bulk-edit="group"]', 'Capitals')
    await sees('Applies to 2 questions.')
    await press('Apply')
    await sees('Capitals · 2')
    await sees('No domain group · 1')
    await press('Clear')

    // A tag on questions in two domains, found by search under All questions.
    await domain('All questions')
    await select('Which is the largest ocean on Earth?')
    await select('What is the chemical symbol for gold?')
    await press('Edit…')
    await pick('Tag…')
    await (await named('Tag')).setValue('Quiz night')
    await sees('Applies to 2 questions.')
    await press('Apply')
    await press('Clear')
    const search = await named('Search questions…')
    await search.setValue('quiz night')
    await browser.waitUntil(async () => /1–2 of 2 questions/.test(await body()), { timeoutMsg: 'the tag search did not find both' })
    await search.clearValue()

    // One difficulty for a selection.
    await select('What is the chemical symbol for gold?')
    await press('Edit…')
    await pick('Set difficulty…')
    const field = await named('Difficulty')
    await field.clearValue()
    await field.setValue('40')
    await sees('Applies to 1 question.')
    await press('Apply')
    await browser.waitUntil(async () => !(await $('[data-bulk-edit]').isExisting()), { timeoutMsg: 'the difficulty did not apply' })
    await sees('40')
  })
})
