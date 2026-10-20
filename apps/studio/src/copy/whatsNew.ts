/**
 * *What's new* — what changed for the people running a show (P12.10).
 *
 * Written for operators, not developers: what they can now do, what works
 * better, in plain words. Every release says the same things in every
 * language the app speaks; `whatsNew.test.ts` holds the languages together
 * and keeps developer words out. Settings and buttons are named the way
 * Studio shows them, which is in English.
 *
 * Newest release first. Add a release at the top when it ships.
 */

export const WHATS_NEW_LANGUAGES = ['en', 'ro'] as const
export type WhatsNewLanguage = (typeof WHATS_NEW_LANGUAGES)[number]

export const WHATS_NEW_LANGUAGE_NAME: Readonly<Record<WhatsNewLanguage, string>> = {
  en: 'English',
  ro: 'Română',
}

export interface WhatsNewNote {
  readonly title: string
  readonly body: string
}

export interface WhatsNewRelease {
  readonly version: string
  readonly notes: Readonly<Record<WhatsNewLanguage, readonly WhatsNewNote[]>>
}

export const WHATS_NEW: readonly WhatsNewRelease[] = [
  {
    version: '1.0.2',
    notes: {
      en: [
        {
          title: 'More than one question at the same difficulty',
          body: 'In a game’s Board, turn on “Allow repeated difficulties”. A domain can then hold several questions at the same level. They are asked one after another and are worth the same points.',
        },
        {
          title: 'Clearer when a game can’t be loaded',
          body: 'If something on the Board stops a game from loading, questiongame now tells you straight away, wherever you are, and “Show” takes you to the problem. The Board is marked in red until it is fixed.',
        },
        {
          title: 'Know when a new version is out',
          body: 'When it starts, questiongame checks once whether a newer version is available and lets you know. You can also check yourself, or turn this off, in Settings ▸ About.',
        },
        {
          title: 'Your library is kept safe when you update',
          body: 'Before a new version changes anything, your teams, questions and games are copied to a backup. To update, simply install the new version over this one — there is no need to uninstall first.',
        },
        {
          title: 'Smoother and up to date',
          body: 'Everything questiongame is built on has been brought up to date, so it runs smoothly and safely.',
        },
      ],
      ro: [
        {
          title: 'Mai multe întrebări de aceeași dificultate',
          body: 'În Board-ul unui joc, activează „Allow repeated difficulties”. Un domeniu poate avea atunci mai multe întrebări de același nivel. Sunt puse una după alta și valorează la fel de multe puncte.',
        },
        {
          title: 'Mai clar când un joc nu se poate încărca',
          body: 'Dacă ceva din Board împiedică încărcarea unui joc, questiongame îți spune imediat, oriunde te-ai afla, iar „Show” te duce direct la problemă. Board rămâne marcat cu roșu până când e rezolvat.',
        },
        {
          title: 'Afli când apare o versiune nouă',
          body: 'La pornire, questiongame verifică o dată dacă există o versiune mai nouă și te anunță. Poți verifica și singur, sau poți opri verificarea, din Settings ▸ About.',
        },
        {
          title: 'Biblioteca ta e în siguranță la actualizare',
          body: 'Înainte ca o versiune nouă să schimbe ceva, echipele, întrebările și jocurile tale sunt copiate într-o copie de siguranță. Ca să actualizezi, instalează pur și simplu versiunea nouă peste aceasta — nu e nevoie să o dezinstalezi.',
        },
        {
          title: 'Mai fluid și la zi',
          body: 'Tot ce stă la baza questiongame a fost adus la zi, ca aplicația să meargă fluid și sigur.',
        },
      ],
    },
  },
]

export const WHATS_NEW_COPY: Readonly<
  Record<WhatsNewLanguage, { title: (version: string) => string; close: string; language: string }>
> = {
  en: { title: (version) => `What’s new in questiongame ${version}`, close: 'Got it', language: 'Language' },
  ro: { title: (version) => `Ce e nou în questiongame ${version}`, close: 'Am înțeles', language: 'Limba' },
}

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/

/**
 * SemVer 2.0 precedence: `1.0.10` after `1.0.9`, `2.0.0-beta.2` before
 * `2.0.0-beta.10`, and a prerelease before its release. Build metadata is
 * ignored. Something that is not a version sorts below every version and
 * never throws — a bad entry must not take the window down.
 */
export function compareVersions(a: string, b: string): number {
  const pa = SEMVER.exec(a)
  const pb = SEMVER.exec(b)
  if (pa === null || pb === null) return (pa === null ? 0 : 1) - (pb === null ? 0 : 1)
  for (let i = 1; i <= 3; i++) {
    const d = Number(pa[i]) - Number(pb[i])
    if (d !== 0) return d
  }
  const preA = pa[4]
  const preB = pb[4]
  if (preA === undefined || preB === undefined) return (preA === undefined ? 1 : 0) - (preB === undefined ? 1 : 0)
  const ia = preA.split('.')
  const ib = preB.split('.')
  for (let i = 0; i < Math.max(ia.length, ib.length); i++) {
    const x = ia[i]
    const y = ib[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const nx = /^\d+$/.test(x)
    const ny = /^\d+$/.test(y)
    if (nx && ny) {
      const d = Number(x) - Number(y)
      if (d !== 0) return d
    } else if (nx !== ny) {
      return nx ? -1 : 1
    } else if (x !== y) {
      return x < y ? -1 : 1
    }
  }
  return 0
}

/** The releases newer than `since` and no newer than `current`, newest first. */
export function notesAfter(since: string, current: string, releases: readonly WhatsNewRelease[] = WHATS_NEW): WhatsNewRelease[] {
  return releases
    .filter((r) => compareVersions(r.version, since) > 0 && compareVersions(r.version, current) <= 0)
    .sort((a, b) => compareVersions(b.version, a.version))
}
