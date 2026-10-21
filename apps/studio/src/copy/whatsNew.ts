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
    version: '2.0.0-beta.1',
    notes: {
      en: [
        {
          title: 'Workspaces',
          body: 'One questiongame can now hold several libraries — a season, a school, a club — each with its own teams, domains, questions and games. Pick one at the top of the sidebar. Everything you had is in your first workspace: give it a name and carry on.',
        },
        {
          title: 'A shared library',
          body: 'Make a team, domain or question shared and every workspace sees it. Where on Teams and on Domains & Questions shows this workspace’s rows or the shared ones, and a shared row says Shared.',
        },
        {
          title: 'Copy and move between workspaces',
          body: 'Copy to… and Move to… take a row, or a whole game, to another workspace with what it needs — a domain brings its questions, a game its teams and board. Before anything happens Studio says what comes along and, if something still uses a row, who.',
        },
        {
          title: 'Edit once, update the copies',
          body: 'When you save a team, domain or question that has copies in other workspaces, choose Save here only or Also update the copies. A copy the change would break on one of its boards is left alone, and Studio says why.',
        },
        {
          title: 'Groups, duplicates and a clean-up',
          body: 'Manage workspaces puts them in groups, renames, duplicates (without the Plays) and archives them. An archived workspace can be deleted for good; questiongame takes a backup first, and the one taken before workspaces is always kept.',
        },
        {
          title: 'Groups inside a domain',
          body: 'Open a domain and choose Groups… to make groups of your own — Romans, Medieval, Warm-ups — and put questions in them. A domain with groups opens grouped by them. Groups only organise: games and Plays ignore them.',
        },
        {
          title: 'Tags on questions',
          body: 'Give a question tags as you write it, in any domain. Find them with the Tag filter or by searching, see a list grouped by tag, and rename, merge or delete a tag everywhere from Manage tags….',
        },
        {
          title: 'Change many questions at once',
          body: 'Select questions and choose Edit… to tag or untag them, put them in a group, add them to a domain or take them out of one, or set their difficulty — Studio says how many will change before anything does.',
        },
      ],
      ro: [
        {
          title: 'Spații de lucru',
          body: 'Un singur questiongame poate ține acum mai multe biblioteci — un sezon, o școală, un club — fiecare cu echipele, domeniile, întrebările și jocurile ei. Alegi una sus, în bara laterală. Tot ce aveai e în primul tău spațiu de lucru: dă-i un nume și continuă.',
        },
        {
          title: 'O bibliotecă comună',
          body: 'Fă o echipă, un domeniu sau o întrebare comună și o vede fiecare spațiu de lucru. Where, în Teams și în Domains & Questions, arată rândurile acestui spațiu sau pe cele comune, iar un rând comun poartă eticheta Shared.',
        },
        {
          title: 'Copiezi și muți între spații de lucru',
          body: 'Copy to… și Move to… duc un rând, sau un joc întreg, în alt spațiu de lucru, cu tot ce îi trebuie — un domeniu își ia întrebările, un joc echipele și tabla. Înainte să se întâmple ceva, Studio îți spune ce vine odată cu el și, dacă un rând e încă folosit, de cine.',
        },
        {
          title: 'Modifici o dată, se actualizează și copiile',
          body: 'Când salvezi o echipă, un domeniu sau o întrebare care are copii în alte spații de lucru, alegi Save here only sau actualizezi și copiile. O copie pe care schimbarea ar strica-o pe una dintre tablele ei rămâne neatinsă, iar Studio îți spune de ce.',
        },
        {
          title: 'Grupuri, duplicate și curățenie',
          body: 'Manage workspaces le pune în grupuri, le redenumește, le duplică (fără partidele jucate) și le arhivează. Un spațiu arhivat poate fi șters definitiv; questiongame face mai întâi o copie de siguranță, iar cea făcută înainte de spațiile de lucru se păstrează mereu.',
        },
        {
          title: 'Grupuri într-un domeniu',
          body: 'Deschizi un domeniu și alegi Groups… ca să-ți faci grupurile tale — Romani, Ev Mediu, Încălzire — și pui întrebări în ele. Un domeniu cu grupuri se deschide grupat după ele. Grupurile doar organizează: jocurile și partidele nu țin cont de ele.',
        },
        {
          title: 'Etichete pe întrebări',
          body: 'Pui etichete unei întrebări când o scrii, în orice domeniu. Le găsești cu filtrul Tag sau căutând, vezi lista grupată pe etichete și redenumești, unești sau ștergi o etichetă peste tot din Manage tags….',
        },
        {
          title: 'Schimbi mai multe întrebări deodată',
          body: 'Selectezi întrebări și alegi Edit… ca să le pui sau să le scoți o etichetă, să le pui într-un grup, să le adaugi într-un domeniu sau să le scoți din el, ori să le stabilești dificultatea — Studio îți spune câte se vor schimba înainte să se schimbe ceva.',
        },
      ],
    },
  },
  {
    version: '1.1.0',
    notes: {
      en: [
        {
          title: 'Find questions faster',
          body: 'Every list now has Filters. On Domains & Questions, show only the hard ones, only multiple answers, only the incomplete ones, or only some domains — the filters in force sit under the toolbar, and each can be removed with one click.',
        },
        {
          title: 'Choose the order',
          body: 'Sort any list by name, difficulty, plays, when it changed and more. In table view, click a column’s title to sort by it, and click again to turn the order around.',
        },
        {
          title: 'See them by domain or by difficulty',
          body: 'Group breaks a list into sections with a title and a count — questions by domain, difficulty or completeness, games by folder or status, teams by whether they have played.',
        },
        {
          title: 'A page at a time',
          body: 'Long lists show 100 rows a page, or 50, 250 or all of them. Open a question and come back: you are on the same page, with the same filters.',
        },
        {
          title: 'Archive or restore many at once',
          body: 'Show Active, Archived or All. Select a page, or every matching row on every page, and archive or restore them together — Studio says how many are on this page and how many in all. Search now finds every match, however many there are.',
        },
      ],
      ro: [
        {
          title: 'Găsești întrebările mai repede',
          body: 'Fiecare listă are acum Filters. În Domains & Questions poți afișa doar întrebările grele, doar cele cu mai multe răspunsuri, doar cele neterminate sau doar câteva domenii — filtrele active stau sub bara de unelte și fiecare se scoate cu un clic.',
        },
        {
          title: 'Alegi ordinea',
          body: 'Poți ordona orice listă după nume, dificultate, partide jucate, data modificării și altele. În vizualizarea tabel, apasă pe titlul unei coloane ca să ordonezi după ea, și încă o dată ca să inversezi ordinea.',
        },
        {
          title: 'Le vezi pe domenii sau pe dificultate',
          body: 'Group împarte o listă în secțiuni cu titlu și număr — întrebările pe domenii, dificultate sau completitudine, jocurile pe dosare sau stare, echipele după dacă au jucat.',
        },
        {
          title: 'O pagină odată',
          body: 'Listele lungi arată 100 de rânduri pe pagină — sau 50, 250 sau toate. Deschizi o întrebare și te întorci: ești pe aceeași pagină, cu aceleași filtre.',
        },
        {
          title: 'Arhivezi sau restaurezi mai multe deodată',
          body: 'Alege Active, Archived sau All. Selectează o pagină sau toate rândurile potrivite din toate paginile și arhivează-le ori restaurează-le împreună — Studio îți spune câte sunt pe pagina aceasta și câte în total. Căutarea găsește acum toate potrivirile, oricâte ar fi.',
        },
      ],
    },
  },
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

/**
 * The releases newer than `since` and no newer than `current`, newest first.
 * Someone on a stable version is never shown a beta's notes: the stable
 * release that follows them summarises them (review, P13.1).
 */
export function notesAfter(since: string, current: string, releases: readonly WhatsNewRelease[] = WHATS_NEW): WhatsNewRelease[] {
  const onStable = !since.includes('-') && !current.includes('-')
  return releases
    .filter((r) => !(onStable && r.version.includes('-')))
    .filter((r) => compareVersions(r.version, since) > 0 && compareVersions(r.version, current) <= 0)
    .sort((a, b) => compareVersions(b.version, a.version))
}
