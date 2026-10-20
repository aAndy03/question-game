/**
 * questiongame Beta's own words (P13.1): the first-launch welcome, in every
 * language *What's new* speaks, and the sidebar's Beta chip. Written for the
 * people who run shows — `beta.test.ts` holds the languages together and keeps
 * developer words out, as `whatsNew.test.ts` does.
 */

import type { WhatsNewLanguage } from './whatsNew'

export interface BetaWelcomeCopy {
  readonly title: string
  readonly heading: string
  readonly body: string
  readonly copy: string
  readonly empty: string
  readonly running: string
  readonly tryAgain: string
  readonly failed: (reason: string) => string
  readonly language: string
}

export const BETA_WELCOME: Readonly<Record<WhatsNewLanguage, BetaWelcomeCopy>> = {
  en: {
    title: 'questiongame Beta',
    heading: 'A library of its own',
    body: 'This is questiongame Beta. It keeps its own library, separate from questiongame. Nothing you do here changes your stable library.',
    copy: 'Copy my stable library',
    empty: 'Start empty',
    running: 'Close questiongame first, then copy.',
    tryAgain: 'Try again',
    failed: (reason) => `Your stable library could not be copied: ${reason}. It was not changed.`,
    language: 'Language',
  },
  ro: {
    title: 'questiongame Beta',
    heading: 'O bibliotecă proprie',
    body: 'Aceasta este questiongame Beta. Are propria bibliotecă, separată de questiongame. Nimic din ce faci aici nu îți schimbă biblioteca stabilă.',
    copy: 'Copiază biblioteca mea stabilă',
    empty: 'Începe de la zero',
    running: 'Închide mai întâi questiongame, apoi copiază.',
    tryAgain: 'Încearcă din nou',
    failed: (reason) => `Biblioteca stabilă nu a putut fi copiată: ${reason}. Nu a fost modificată.`,
    language: 'Limba',
  },
}

/** The sidebar's mark: the same in every language, like the product name. */
export const BETA_CHIP = { label: 'Beta', name: 'questiongame Beta' } as const
