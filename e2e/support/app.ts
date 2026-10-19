/**
 * Moving about the real app (P12.14). Studio and Stage are two windows of one
 * process; WebDriver sees each as a window handle, told apart by the path the
 * webview is served under (`/studio/`, `/stage/`).
 */

import { $, browser } from '@wdio/globals'

async function windowServing(fragment: string, avoid: string | null = null): Promise<void> {
  await browser.waitUntil(
    async () => {
      for (const handle of await browser.getWindowHandles()) {
        await browser.switchToWindow(handle)
        const url = await browser.getUrl()
        if (url.includes(fragment) && (avoid === null || !url.includes(avoid))) return true
      }
      return false
    },
    { timeout: 30_000, timeoutMsg: `no window serving ${fragment}` },
  )
}

/** Studio's main window (not the Statistics window, which is Studio too). */
export const onStudio = () => windowServing('/studio/', 'stats')

/** The Stage pacer (not a mirror). */
export const onStage = () => windowServing('/stage/', 'mirror')

/** An element by its accessible name — what a person reads on the control. */
export const named = (name: string) => $(`aria/${name}`)

/**
 * Wait for a control by name, then press it. A `<button>` with that text wins
 * over any other element of the same accessible name — the sidebar's *Show*
 * section heading and the collector's *Show* button are both "Show".
 */
export async function press(name: string): Promise<void> {
  let control: ChainablePromiseElement | null = null
  await browser.waitUntil(
    async () => {
      for (const candidate of [$(`button=${name}`), named(name)]) {
        if ((await candidate.isExisting()) && (await candidate.isClickable())) {
          control = candidate
          return true
        }
      }
      return false
    },
    { timeoutMsg: `nothing named "${name}" could be pressed` },
  )
  await (control as unknown as ChainablePromiseElement).click()
}

type ChainablePromiseElement = ReturnType<typeof $>

/** Wait until the page shows `text` somewhere. */
export async function sees(text: string, timeout = 15_000): Promise<void> {
  await browser.waitUntil(async () => (await $('body').getText()).includes(text), {
    timeout,
    timeoutMsg: `the page never showed "${text}"`,
  })
}

/** The Stage screen on air, as Stage itself marks it (`data-screen`). */
export async function stageScreen(): Promise<string | null> {
  const frame = await $('[data-screen]')
  return (await frame.isExisting()) ? frame.getAttribute('data-screen') : null
}

/**
 * A seeded library is one 1.0.1 left, so this build opens *What's new* over
 * it first (P12.10). A spec about something else closes it, as an operator
 * would; `upgrade.e2e.ts` is the one that asserts on it.
 */
export async function closeWhatsNew(): Promise<void> {
  await sees('What’s new in questiongame', 30_000)
  await press('Got it')
  await browser.waitUntil(async () => !(await $('body').getText()).includes('What’s new in questiongame'), {
    timeoutMsg: 'What’s new did not close',
  })
}

/** Open a game from the Games tab by its name, as its card shows it. */
export async function openGame(name: string): Promise<void> {
  const card = await $(`span=${name}`)
  await card.waitForClickable()
  await card.click()
}
