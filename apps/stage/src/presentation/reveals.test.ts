import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FIXTURES } from '@questiongame/contract'
import { stageEvents } from '@/host/events'
import { countText, motionConfig, revealTargets, revealedKeys, runReveal, swapText } from './index'

describe('revealed keys', () => {
  it('lists the question reveals in reveal order', () => {
    expect(revealedKeys(FIXTURES['question-issued'])).toEqual([])
    expect(revealedKeys(FIXTURES['question-stem-revealed'])).toEqual(['stem'])
    expect(revealedKeys(FIXTURES['question-options-partial'])).toEqual(['stem', 'option:opt-a', 'option:opt-b'])
    expect(revealedKeys(FIXTURES['question-outcome-correct'])).toEqual(['stem', 'option:opt-a', 'option:opt-b', 'option:opt-c', 'option:opt-d', 'outcome'])
  })

  it('lists the leaderboard ranks lowest first, and nothing on other screens', () => {
    expect(revealedKeys(FIXTURES['final-leaderboard-partial'])).toEqual(['leader:4', 'leader:2'])
    expect(revealedKeys(FIXTURES.scoreboard)).toEqual([])
    expect(revealedKeys(FIXTURES.idle)).toEqual([])
  })
})

describe('runReveal', () => {
  const events: string[] = []
  let off = () => {}
  beforeEach(() => {
    motionConfig.immediate = true
    events.length = 0
    off = stageEvents.on('anim-complete', ({ key }) => events.push(key))
  })
  afterEach(() => {
    off()
    motionConfig.immediate = false
    document.body.innerHTML = ''
  })

  it('reports reveal:<key> once per key, and a tie reveals every row of that rank', () => {
    document.body.innerHTML = `
      <div data-node-id="finalLeaderboard.row.2" data-rank="2"></div>
      <div data-node-id="finalLeaderboard.row.3" data-rank="2"></div>
      <div data-node-id="finalLeaderboard.row.4" data-rank="4"></div>
      <div data-node-id="question.option.opt-a"><span data-label-box>A</span></div>`
    const tied = revealTargets(document.body, 'leader:2')
    expect(tied.length).toBe(2)
    let completed = 0
    runReveal('leader:2', tied, () => completed++)
    runReveal('option:opt-a', revealTargets(document.body, 'option:opt-a'), () => completed++)
    expect(completed).toBe(2)
    expect(events).toEqual(['reveal:leader:2', 'reveal:option:opt-a'])
  })

  it('a key with no node still completes, so the host is never left waiting', () => {
    let completed = 0
    runReveal('stem', [], () => completed++)
    expect(completed).toBe(1)
    expect(events).toEqual(['reveal:stem'])
  })
})

describe('Text transitions', () => {
  beforeEach(() => {
    motionConfig.immediate = true
  })
  afterEach(() => {
    motionConfig.immediate = false
    document.body.innerHTML = ''
  })

  it('count rolls the number and lands on the rendered truth, keeping the template', () => {
    const el = document.createElement('span')
    el.textContent = '2,650 PTS'
    const tween = countText(el, '2,400 PTS')
    expect(tween).not.toBeNull()
    expect(el.textContent).toBe('2,650 PTS')
  })

  it('count keeps zero padding for clocks and does nothing when the number is unchanged', () => {
    const el = document.createElement('span')
    el.textContent = '00:28'
    expect(countText(el, '00:29')).not.toBeNull()
    expect(el.textContent).toBe('00:28')
    expect(countText(el, '00:28')).toBeNull()
  })

  it('swap leaves the node clean', () => {
    const el = document.createElement('span')
    el.textContent = 'TEAM BETA'
    swapText(el)
    expect(el.getAttribute('style') ?? '').not.toMatch(/opacity|transform/)
  })
})
