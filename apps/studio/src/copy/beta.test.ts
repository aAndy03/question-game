import { describe, expect, it } from 'vitest'
import { BETA_WELCOME } from './beta'
import { WHATS_NEW_LANGUAGES } from './whatsNew'

describe('Beta welcome copy (WEL08)', () => {
  it('says what the design says, in English', () => {
    expect(BETA_WELCOME.en.body).toBe(
      'This is questiongame Beta. It keeps its own library, separate from questiongame. Nothing you do here changes your stable library.',
    )
    expect(BETA_WELCOME.en.copy).toBe('Copy my stable library')
    expect(BETA_WELCOME.en.empty).toBe('Start empty')
    expect(BETA_WELCOME.en.running).toBe('Close questiongame first, then copy.')
  })

  it('speaks every language What’s new speaks, each word actually translated', () => {
    for (const language of WHATS_NEW_LANGUAGES) {
      expect(Object.keys(BETA_WELCOME[language]).sort()).toEqual(Object.keys(BETA_WELCOME.en).sort())
    }
    for (const key of ['heading', 'body', 'copy', 'empty', 'running', 'tryAgain', 'language'] as const) {
      expect(BETA_WELCOME.ro[key], key).not.toBe(BETA_WELCOME.en[key])
    }
  })

  it('writes Romanian with comma-below letters and no developer words', () => {
    const all = WHATS_NEW_LANGUAGES.flatMap((l) => Object.values(BETA_WELCOME[l]).map((v) => (typeof v === 'function' ? v('x') : v))).join(' ')
    expect(all).not.toMatch(/[şţŞŢ]/)
    expect(all).not.toMatch(/\b(API|SQLite|database|WAL|lock file|identifier|channel)\b/i)
  })
})
