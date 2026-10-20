import { describe, expect, it } from 'vitest'
import { WHATS_NEW, WHATS_NEW_LANGUAGES, compareVersions, notesAfter, type WhatsNewRelease } from './whatsNew'
// One ascending list, read by this test and by `crates/app/tests/update.rs`.
import VERSIONS from '../../../../crates/app/tests/fixtures/versions.json'

/**
 * P12.10. What's new is for operators, not developers: plain words, the same
 * news in every language the app speaks.
 */
describe("What's new", () => {
  it('says the same things in every language', () => {
    for (const release of WHATS_NEW) {
      const counts = WHATS_NEW_LANGUAGES.map((lang) => release.notes[lang].length)
      expect(new Set(counts).size, `${release.version} has a note missing in one language`).toBe(1)
      for (const lang of WHATS_NEW_LANGUAGES) {
        for (const note of release.notes[lang]) {
          expect(note.title.trim()).not.toBe('')
          expect(note.body.trim()).not.toBe('')
        }
      }
    }
  })

  it('says it differently in each language', () => {
    for (const release of WHATS_NEW) {
      release.notes.en.forEach((note, i) => expect(release.notes.ro[i]!.title).not.toBe(note.title))
    }
  })

  it('writes Romanian with comma-below ș and ț', () => {
    const ro = WHATS_NEW.flatMap((r) => r.notes.ro.flatMap((n) => [n.title, n.body])).join(' ')
    expect(ro).not.toMatch(/[şţŞŢ]/)
  })

  it('keeps developer words out of the notes', () => {
    const all = WHATS_NEW.flatMap((r) => WHATS_NEW_LANGUAGES.flatMap((l) => r.notes[l].flatMap((n) => [n.title, n.body]))).join(' ')
    expect(all).not.toMatch(/\b(API|SQLite|semver|rustls|HeroUI|dependenc|migration|refactor|crate|npm)\w*/i)
  })

  it('has notes for this release', () => {
    expect(WHATS_NEW.some((r) => r.version === '1.0.2')).toBe(true)
  })

  it('picks the releases after the one last seen, newest first', () => {
    expect(notesAfter('1.0.1', '1.0.2').map((r) => r.version)).toEqual(['1.0.2'])
    expect(notesAfter('1.0.2', '1.0.2')).toEqual([])
    expect(notesAfter('0.9.0', '1.0.1').map((r) => r.version)).toEqual([])
  })

  it('orders versions by number, not by text', () => {
    expect(compareVersions('1.0.10', '1.0.9')).toBeGreaterThan(0)
    expect(compareVersions('1.0.2', '1.0.2')).toBe(0)
    expect(compareVersions('1.0.1', '1.0.2')).toBeLessThan(0)
  })
  it('orders prereleases the way semver does (VER02–VER05)', () => {
    expect(compareVersions('2.0.0-beta.2', '2.0.0-beta.10')).toBeLessThan(0)
    expect(compareVersions('2.0.0-beta.10', '2.0.0')).toBeLessThan(0)
    expect(compareVersions('2.0.0', '1.9.9')).toBeGreaterThan(0)
    expect(compareVersions('2.0.0-beta.0', '1.0.2')).toBeGreaterThan(0)
    expect(compareVersions('1.0.2', '1.0.2-beta.9')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0-alpha', '1.0.0-alpha.1')).toBeLessThan(0)
    expect(compareVersions('1.0.0-alpha.1', '1.0.0-alpha.beta')).toBeLessThan(0)
    expect(compareVersions('2.0.0-beta.1', '2.0.0-rc.1')).toBeLessThan(0)
    expect(compareVersions('1.0.0+build.5', '1.0.0')).toBe(0)
    // Unreadable input sorts lowest and never throws.
    for (const bad of ['', 'v1.0.2', '1.0', 'garbage']) {
      expect(compareVersions(bad, '0.0.1')).toBeLessThan(0)
      expect(compareVersions(bad, bad)).toBe(0)
    }
  })

  it('agrees with the old order on plain versions (VER07)', () => {
    const old = (a: string, b: string) => {
      const pa = a.split('.').map(Number)
      const pb = b.split('.').map(Number)
      for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i]! - pb[i]!
      return 0
    }
    const vs = ['0.0.0', '0.0.9', '0.0.10', '1.0.1', '1.0.2', '1.2.0', '1.10.0', '2.0.0', '10.0.0']
    for (const a of vs) for (const b of vs) expect(Math.sign(compareVersions(a, b))).toBe(Math.sign(old(a, b)))
  })

  it('reads beta releases for a beta, and never a stable entry ahead of it (VER08–VER09)', () => {
    const entry = (version: string): WhatsNewRelease => ({ version, notes: { en: [], ro: [] } })
    const list = ['2.0.0', '2.0.0-beta.4', '2.0.0-beta.3', '2.0.0-beta.1', '1.0.2'].map(entry)
    expect(notesAfter('1.0.2', '2.0.0-beta.3', list).map((r) => r.version)).toEqual(['2.0.0-beta.3', '2.0.0-beta.1'])
    expect(notesAfter('2.0.0-beta.3', '2.0.0', list).map((r) => r.version)).toEqual(['2.0.0', '2.0.0-beta.4'])
    expect(notesAfter('1.0.1', '1.1.0', list).map((r) => r.version)).toEqual(['1.0.2'])
    expect(notesAfter('garbage', '1.0.2', list).map((r) => r.version)).toEqual(['1.0.2'])
  })

  it('orders the shared fixture ascending, as the host does (VER06)', () => {
    for (let i = 1; i < VERSIONS.length; i++) expect(compareVersions(VERSIONS[i - 1]!, VERSIONS[i]!)).toBeLessThan(0)
  })

  it('keeps its own list readable and in order (VER10)', () => {
    for (const r of WHATS_NEW) expect(r.version).toMatch(/^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/)
    for (let i = 1; i < WHATS_NEW.length; i++) expect(compareVersions(WHATS_NEW[i - 1]!.version, WHATS_NEW[i]!.version)).toBeGreaterThan(0)
  })
})

describe('a stable update past betas (review)', () => {
  it('shows a stable user the stable notes only, never the betas in between', () => {
    const entry = (version: string): WhatsNewRelease => ({ version, notes: { en: [], ro: [] } })
    const list = ['2.0.0', '2.0.0-beta.2', '2.0.0-beta.1', '1.1.0'].map(entry)
    expect(notesAfter('1.0.2', '2.0.0', list).map((r) => r.version)).toEqual(['2.0.0', '1.1.0'])
    // A beta user moving to the release still reads what came after its beta.
    expect(notesAfter('2.0.0-beta.1', '2.0.0', list).map((r) => r.version)).toEqual(['2.0.0', '2.0.0-beta.2'])
  })
})
