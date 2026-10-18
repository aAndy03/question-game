import { describe, expect, it } from 'vitest'
import { WHATS_NEW, WHATS_NEW_LANGUAGES, compareVersions, notesAfter } from './whatsNew'

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
})
