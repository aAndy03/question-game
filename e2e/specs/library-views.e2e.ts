import { $, $$, browser } from '@wdio/globals'
import { closeWhatsNew, onStudio, press, sees } from '../support/app'

/**
 * Stable 1.1 on the real app (E-01, E-02): the Demo plus 120 more questions,
 * so the list is longer than a page. Filter, group, page, and come back to
 * where you were.
 */
const body = async () => $('body').getText()

/** Pick an item of the open menu by what it says. */
async function pick(text: string): Promise<void> {
  await browser.waitUntil(async () => (await $$('[role="menuitemradio"]').length) > 0, { timeoutMsg: 'no menu open' })
  for (const item of await $$('[role="menuitemradio"]')) {
    if ((await item.getText()).trim() === text) return item.click()
  }
  throw new Error(`no menu item "${text}"`)
}

describe('library views', () => {
  it('pages, filters, groups and keeps the operator in place', async () => {
    await onStudio()
    await closeWhatsNew()
    await press('Domains & Questions')

    // A page at a time. The Demo's own count is whatever it is; 120 more make it a few pages.
    await browser.waitUntil(async () => /1–100 of [\d,]+ questions/.test(await body()), { timeout: 30_000, timeoutMsg: 'no first page' })
    const total = Number(/1–100 of ([\d,]+) questions/.exec(await body())![1]!.replace(/,/g, ''))
    expect(total).toBeGreaterThan(120)
    await press('Next page')
    await sees(`101–${Math.min(200, total)} of ${total} questions`)

    // Filters: hard questions only; the chip says so, the count drops, page 1 again.
    await press('Filters')
    // Inside the popover: a row's *Hard* chip has the same name.
    await (await $('[role="dialog"]').$('.//*[text()="Hard"]')).click()
    await browser.keys('Escape')
    await sees('Difficulty band: Hard')
    await browser.waitUntil(async () => /1–\d+ of \d+ questions/.test(await body()) && !(await body()).includes(`of ${total} questions`), {
      timeoutMsg: 'the hard filter did not narrow the list',
    })

    // Headers: grouped by domain, the 120 extras under No domain, counted across pages.
    await press('Clear all')
    await sees(`of ${total} questions`)
    await press('Group: None')
    await pick('Domain')
    await browser.waitUntil(async () => /No domain · 12\d/.test(await body()), { timeoutMsg: 'no "No domain" header with its count' })

    // Page size 50, page 2, open a question, come back: still page 2.
    await press('Group: Domain')
    await pick('None')
    // The page-size switch: a row's index can also read 50.
    await (await $('[aria-label="Rows per page"]').$('.//*[text()="50"]')).click()
    await sees(`1–50 of ${total} questions`)
    await press('Next page')
    await sees(`51–100 of ${total} questions`)
    // Open a question, then its editor: a full page, so the list really goes
    // away — beside an open aside it would still be standing (review).
    await (await $('[role="table"]').$('.//*[starts-with(text(),"Extra question")]')).click()
    await press('Edit')
    await browser.waitUntil(async () => !(await body()).includes(`of ${total} questions`), { timeoutMsg: 'the list did not leave the screen' })
    await press('Back')
    await sees(`51–100 of ${total} questions`)
  })
})
