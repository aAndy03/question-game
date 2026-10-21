import { $, $$, browser } from '@wdio/globals'
import { closeWhatsNew, named, onStudio, press, sees } from '../support/app'

/**
 * Beta 2.0 on the real app: a 1.x library moves into a workspace the operator
 * names; a second workspace is made by name; a team is copied into it, and a
 * question with its domain (beta.2: no shared library); and an edit in the
 * first follows its copy into the second.
 */
const body = async () => $('body').getText()

/** Open the sidebar's workspace switcher. */
async function switcher(current: string): Promise<void> {
  const box = await $('[data-workspace-switcher]')
  await browser.waitUntil(async () => (await box.getText()).includes(current), {
    timeout: 15_000,
    timeoutMsg: `the switcher never said ${current}`,
  })
  const button = await box.$('button')
  await button.waitForClickable()
  await button.click()
}

/** Pick an item of the open menu by what it says. */
async function pick(text: string): Promise<void> {
  // A menu that is closing still lists its items for a moment: wait for this one.
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

/** Tick a row's checkbox: HeroUI draws it, the input itself is visually hidden. */
async function select(title: string): Promise<void> {
  const box = await named(`Select ${title}`)
  await box.waitForExist({ timeout: 15_000 })
  await browser.execute((el: HTMLElement) => el.click(), box as unknown as HTMLElement)
}

/** The `…` menu of the team card titled `title`. */
async function teamMenu(title: string): Promise<void> {
  const card = await $(`//div[@role="button"][.//*[normalize-space(text())="${title}"]]`)
  await card.waitForExist({ timeout: 15_000 })
  await card.moveTo()
  const menu = await card.$('.//button[@aria-label="Open"]')
  await menu.waitForClickable()
  await menu.click()
}

describe('workspaces', () => {
  it('names, creates, copies, and an edit follows its copy', async () => {
    await onStudio()
    // The library moved into one workspace; `closeWhatsNew` names it as the operator would.
    await closeWhatsNew()

    // A second workspace, by name; Studio opens it.
    await switcher('E2E library')
    await pick('New workspace…')
    await (await named('Workspace name')).setValue('Second')
    await press('Create')
    await press('Teams')
    await sees('No teams yet')

    // Back to the first, and copy Red into Second.
    await switcher('Second')
    await pick('E2E library')
    await sees('Red')
    await select('Red')
    await press('Copy or move…')
    await pick('Copy to…')
    await sees('1 picked')
    await press('Copy')
    await browser.waitUntil(async () => !(await body()).includes('1 picked'), { timeoutMsg: 'the copy dialog did not close' })

    // Nothing is shared any more: the menu offers copy and move only (Red is still selected).
    await press('Copy or move…')
    // The menu draws its items a moment after it opens: read them once they are there.
    await browser.waitUntil(async () => JSON.stringify(await $$('[role="menuitem"]').map((i) => i.getText())) === JSON.stringify(['Copy to…', 'Move to…']), {
      timeoutMsg: 'the menu is not exactly Copy to… and Move to…',
    })
    await browser.keys('Escape')
    await press('Clear')

    // A question copied alone brings its domain (beta.2).
    await press('Domains & Questions')
    await select('What is the capital of Australia?')
    await press('Copy or move…')
    await pick('Copy to…')
    await sees('Bring their domains')
    await sees('New there: Geography, with only these questions')
    await press('Copy')
    await browser.waitUntil(async () => !(await body()).includes('Bring their domains'), { timeoutMsg: 'the copy dialog did not close' })
    await press('Clear')

    // Edit Red here, and let the edit follow its copy.
    await press('Teams')
    await teamMenu('Red')
    await pick('Edit')
    const name = await named('Name')
    await name.waitForExist()
    await name.clearValue()
    await name.setValue('Red Lions')
    await press('Save')
    await sees('This row has copies')
    await sees('Copies live in Second.')
    await press('Also update 1 copy')

    // In Second: the copy is renamed, and Geography holds the one question.
    await switcher('E2E library')
    await pick('Second')
    await press('Teams')
    await sees('Red Lions')
    await press('Domains & Questions')
    await sees('Geography')
    await sees('What is the capital of Australia?')
  })
})
