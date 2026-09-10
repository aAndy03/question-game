import { describe, expect, it } from 'vitest'
import { MAX_ACTIONS } from '@/chrome/notices'
import { NOTICE_COPY, noticeTitle } from './index'

/**
 * P10 exit criterion 2, the copy side: no notice names more than three solve
 * actions (spec §14). `dismiss` always exists and is not one of them.
 */
describe('NOTICE_COPY', () => {
  it('names at most three solve actions per code', () => {
    for (const [code, entry] of Object.entries(NOTICE_COPY)) {
      const solve = Object.keys(entry.actions).filter((a) => a !== 'dismiss')
      expect(solve.length, `${code} names ${solve.length} solve actions`).toBeLessThanOrEqual(MAX_ACTIONS)
    }
  })

  it('covers every §12.4 code', () => {
    for (const code of [
      'play.roster_empty',
      'play.board_empty',
      'shortcuts.conflict',
      'operator.pin_required',
      'operator.pin_wrong',
      'data.play_open',
      'seed.edited_rows',
      'health.disk_low',
      'health.persist_failed',
      'health.search_degraded',
      'health.stage_not_ready',
      'health.contract_mismatch',
      'health.audio_missing_cue',
      'health.audio_cue_failed',
    ]) {
      expect(NOTICE_COPY[code], code).toBeDefined()
    }
  })

  it('pairs every health item with at least one suggestion (§12.6)', () => {
    for (const [code, entry] of Object.entries(NOTICE_COPY)) {
      if (!code.startsWith('health.')) continue
      expect(Object.keys(entry.actions).filter((a) => a !== 'dismiss').length, code).toBeGreaterThanOrEqual(1)
    }
  })
})

describe('noticeTitle', () => {
  it('fills {key} placeholders from detail', () => {
    expect(noticeTitle('health.disk_low', { freeMb: '312' })).toBe('312 MB free on the data volume. Make room or move the data folder.')
  })
  it('leaves a placeholder detail does not carry visible', () => {
    expect(noticeTitle('health.contract_mismatch', { stage: '3' })).toBe('Stage speaks contract 3; the host speaks host.')
  })
  it('falls back to the message, then the code', () => {
    expect(noticeTitle('unknown.code', { message: 'why' })).toBe('why')
    expect(noticeTitle('unknown.code', {})).toBe('unknown.code')
  })
})
