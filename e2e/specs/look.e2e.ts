import { $, browser } from '@wdio/globals'
import { onStudio, openGame, press, sees, shot } from '../support/app'

/**
 * P20, the interface pass, photographed over a real library: a snapshot of the
 * one `E2E_LOOK_LIBRARY` names (the maintainer's Beta test library — 1,050
 * questions, 15 domains, a 569-question game), with Plays simulated on the
 * copy so Statistics has numbers (`e2e/support/folders.ts`, `lookSeed`).
 *
 * It asserts little on purpose: it walks every surface the pass changed, at
 * 1440 and at 1100 px, and saves `e2e/.artifacts/look-p20-<width>-<name>.png`
 * to be looked at. A surface it cannot reach is collected and reported at the
 * end rather than stopping the walk, so one run photographs everything else.
 *
 * Skipped unless `E2E_LOOK_LIBRARY` is set:
 *
 *     E2E_LOOK_LIBRARY=%APPDATA%\org.questiongame.beta\questiongame.sqlite3 npm run e2e -- --spec e2e/specs/look.e2e.ts
 */
const WIDTHS = [1440, 1100] as const
const missed: string[] = []

/** One surface: reach it, photograph it, and note it instead of failing when it cannot be reached. */
async function surface(width: number, name: string, reach: () => Promise<void>): Promise<void> {
  try {
    await reach()
    await shot(`p20-${width}-${name}`)
  } catch (error) {
    missed.push(`${width} ${name}: ${(error as Error).message.split('\n')[0]}`)
    await browser.keys('Escape')
  }
}

/** Past whatever a first boot of this build asks (a workspace name, *What's new*). */
async function settle(): Promise<void> {
  await browser.waitUntil(
    async () => {
      const text = await $('body').getText()
      if (text.includes('Name your workspace') || text.includes('Create your first workspace')) {
        await (await $('aria/Workspace name')).setValue('Beta copy')
        await press('Continue')
        return false
      }
      if (text.includes('What’s new in questiongame')) {
        await press('Got it')
        return false
      }
      return text.includes('Domains & Questions')
    },
    { timeout: 60_000, timeoutMsg: 'Studio never reached its shell' },
  )
}

/** A list's rows, as `library-views.e2e.ts` picks them. */
const ROW = '[data-list-body] [role="button"]'

/** The first row's menu on a list, by its kebab. */
async function firstRowMenu(): Promise<void> {
  const kebab = await $(`${ROW} button[aria-haspopup]`)
  await kebab.waitForClickable({ timeout: 15_000 })
  await kebab.click()
  await $('[role="menu"]').waitForDisplayed({ timeout: 5_000 })
}

describe('P20 over a real library', () => {
  before(function () {
    if (!process.env.E2E_LOOK_LIBRARY) this.skip()
  })

  for (const width of WIDTHS) {
    it(`photographs every changed surface at ${width} px`, async function () {
      this.timeout(20 * 60_000)
      await onStudio()
      await browser.setWindowSize(width, 900)
      await settle()

      await surface(width, 'teams', async () => {
        await press('Teams')
        await sees('Teams')
      })
      await surface(width, 'team-new', async () => {
        await press('New team')
        await sees('Preview')
      })
      await surface(width, 'questions', async () => {
        await press('Domains & Questions')
        await $(ROW).waitForDisplayed({ timeout: 20_000 })
      })
      await surface(width, 'question-open', async () => {
        await (await $(ROW)).click()
        await $('[data-detail-aside]').waitForDisplayed({ timeout: 15_000 })
      })
      await surface(width, 'questions-selected', async () => {
        await (await $(`${ROW} [role="checkbox"], ${ROW} input[type="checkbox"]`)).click()
        await $('[data-bulk-strip]:not([data-bulk-idle])').waitForDisplayed({ timeout: 5_000 })
      })
      await surface(width, 'questions-menu', async () => {
        await browser.keys('Escape')
        await firstRowMenu()
      })
      await surface(width, 'question-tags', async () => {
        await browser.keys('Escape')
        await press('Question tags…')
        await $('[role="dialog"]').waitForDisplayed({ timeout: 10_000 })
      })
      await surface(width, 'domain-groups', async () => {
        await browser.keys('Escape')
        await (await $('[role="listbox"] [role="option"]:nth-child(2)')).click()
        await press('Domain groups…')
        await $('[role="dialog"]').waitForDisplayed({ timeout: 10_000 })
      })
      await surface(width, 'import', async () => {
        await browser.keys('Escape')
        await press('Import')
        await $('[role="dialog"]').waitForDisplayed({ timeout: 10_000 })
      })
      await surface(width, 'question-new', async () => {
        await browser.keys('Escape')
        await press('New question')
        await sees('Where it is filed')
      })

      await surface(width, 'games', async () => {
        await press('Games')
        await sees('Demo (Română)')
      })
      await surface(width, 'game-roster', async () => {
        await openGame('Demo (Română)')
        await sees('Roster')
      })
      await surface(width, 'game-board', async () => {
        await press('Board')
        await $('[data-board-domain]').waitForDisplayed({ timeout: 15_000 })
      })
      await surface(width, 'game-board-open', async () => {
        await press('Open all')
        await $('[data-board-question]').waitForDisplayed({ timeout: 10_000 })
      })
      await surface(width, 'game-picker', async () => {
        await press('Choose questions…')
        await $('[data-pick-list]').waitForDisplayed({ timeout: 15_000 })
      })
      await surface(width, 'game-rules', async () => {
        await browser.keys('Escape')
        await press('Rules')
        await $('[data-rules-preview]').waitForDisplayed({ timeout: 15_000 })
      })
      await surface(width, 'game-plays', async () => {
        await press('Plays')
        await sees('Play')
      })

      await surface(width, 'settings', async () => {
        await press('Settings')
        await (await $('//*[@role="tab"][normalize-space()="Settings"]')).click()
        await sees('On this page')
      })
      await surface(width, 'stats-all', async () => {
        await press('Statistics')
        await press('All data')
        await $('[data-all-data-stats]').waitForDisplayed({ timeout: 15_000 })
        await browser.pause(800)
      })
      await surface(width, 'control', async () => {
        await press('Games')
        await openGame('Demo (Română)')
        await press('Load into Control')
        await sees('Action Panel', 30_000)
      })
      await surface(width, 'stats-live', async () => {
        await press('Statistics')
        await press('Live')
        await $('[data-live-stats]').waitForDisplayed({ timeout: 15_000 })
        await browser.pause(800)
      })
      await surface(width, 'screens', async () => {
        await press('Screens')
        await browser.pause(800)
      })
      await surface(width, 'control-unloaded', async () => {
        await press('Control')
        await press('Unload game')
        await browser.pause(500)
      })
    })
  }

  after(() => {
    if (missed.length > 0) throw new Error(`surfaces not reached:\n${missed.join('\n')}`)
  })
})
