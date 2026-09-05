/**
 * The reveal layer: stem → options one by one → outcome on Question;
 * leaderboard rows lowest rank first on FinalLeaderboard.
 *
 * Reveal *state* lives on the Play (`session.reveals`,
 * `leaderboardRevealedRanks`) and React draws it: an unrevealed node is
 * mounted but `visibility: hidden`. This layer only decides how a node
 * *arrives* when its key joins the revealed set, and reports
 * `reveal:<key>` once per key (spec §11.G). Keys already revealed when a
 * screen mounts do not animate: the screen shows the truth as it is.
 *
 * The beats use opacity and position only, never `visibility` (React owns
 * it), so a hidden node cannot be forced visible by a stray tween.
 */

import gsap from 'gsap'
import { useEffect, useRef, type RefObject } from 'react'
import { animKey, revealKey, type PlayStateForStage, type RevealKey } from '@questiongame/contract'
import { stageEvents } from '@/host/events'
import { D, EASE_OUT, clearParts } from './beats'
import { motionConfig } from './presentation'

/** Every key the snapshot says is revealed, in reveal order. */
export function revealedKeys(state: PlayStateForStage): RevealKey[] {
  const keys: RevealKey[] = []
  const s = state.session
  if (state.currentScreen === 'question' && s) {
    if (s.reveals.stem) keys.push(revealKey.stem())
    for (const id of s.reveals.optionIds) keys.push(revealKey.option(id))
    if (s.reveals.outcome && s.outcome) keys.push(revealKey.outcome())
  }
  if (state.currentScreen === 'finalLeaderboard') {
    for (const rank of state.leaderboardRevealedRanks) keys.push(revealKey.leader(rank))
  }
  return keys
}

/** The DOM nodes a key reveals, inside `root`. A tie reveals several rows. */
export function revealTargets(root: ParentNode, key: RevealKey): HTMLElement[] {
  if (key === 'stem') return [...root.querySelectorAll<HTMLElement>('[data-node-id="question.stem"]')]
  if (key === 'outcome') return [...root.querySelectorAll<HTMLElement>('[data-node-id="question.result"]')]
  if (key.startsWith('option:')) return [...root.querySelectorAll<HTMLElement>(`[data-node-id="question.option.${key.slice(7)}"]`)]
  if (key.startsWith('leader:')) return [...root.querySelectorAll<HTMLElement>(`[data-node-id^="finalLeaderboard.row."][data-rank="${key.slice(7)}"]`)]
  return []
}

/** How each kind of node arrives. */
export function buildReveal(key: RevealKey, targets: HTMLElement[]): gsap.core.Timeline {
  const tl = gsap.timeline()
  if (targets.length === 0) return tl
  if (key === 'stem') {
    tl.fromTo(targets, { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: D.in, ease: EASE_OUT }, 0)
  } else if (key === 'outcome') {
    tl.fromTo(targets, { scale: 0.92, opacity: 0 }, { scale: 1, opacity: 1, duration: D.in, ease: 'back.out(1.6)' }, 0)
  } else if (key.startsWith('option:')) {
    tl.fromTo(targets, { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: D.item, ease: EASE_OUT }, 0)
    const letters = targets.flatMap((t) => [...t.querySelectorAll<HTMLElement>('[data-label-box]')])
    if (letters.length) tl.fromTo(letters, { scale: 0.7 }, { scale: 1, duration: 0.35, ease: 'back.out(2)' }, 0.1)
  } else {
    tl.fromTo(targets, { y: 32, opacity: 0 }, { y: 0, opacity: 1, duration: D.item, ease: EASE_OUT, stagger: D.stagger }, 0)
  }
  return tl
}

export interface RunningReveal {
  readonly key: RevealKey
  readonly timeline: gsap.core.Timeline
  finish(): void
}

export function runReveal(key: RevealKey, targets: HTMLElement[], onComplete: () => void): RunningReveal {
  let done = false
  const complete = () => {
    if (done) return
    done = true
    clearParts(...targets, ...targets.flatMap((t) => [...t.querySelectorAll<HTMLElement>('[data-label-box]')]))
    // Report before handing on: the next key may start (and report) synchronously.
    stageEvents.emit('anim-complete', { key: animKey.reveal(key) })
    onComplete()
  }
  const tl = buildReveal(key, targets)
  tl.eventCallback('onComplete', complete)
  if (motionConfig.immediate || targets.length === 0) tl.progress(1, false)
  if (targets.length === 0) complete()
  return {
    key,
    timeline: tl,
    finish() {
      if (done) return
      tl.progress(1, false)
      complete()
      tl.kill()
    },
  }
}

/**
 * Plays each newly revealed key inside `root`, in order, one after another.
 * Keys present at mount are taken as already shown. A new Play or screen
 * resets the baseline.
 */
export function useRevealPlayer(state: PlayStateForStage, root: RefObject<HTMLElement | null>): void {
  const seen = useRef<Set<string> | null>(null)
  const baseline = useRef('')
  const queue = useRef<RevealKey[]>([])
  const running = useRef<RunningReveal | null>(null)

  const keys = revealedKeys(state)
  const identity = `${state.playId}|${state.currentScreen}|${state.session?.questionId ?? ''}`

  useEffect(() => {
    if (baseline.current !== identity || seen.current === null) {
      // A new question, screen or Play: what is revealed now is the starting picture.
      baseline.current = identity
      seen.current = new Set(keys)
      queue.current = []
      return
    }
    // A key that left the revealed set (undo) is forgotten, so it plays again
    // when it comes back.
    for (const k of [...seen.current]) if (!keys.includes(k as RevealKey)) seen.current.delete(k)
    const fresh = keys.filter((k) => !seen.current!.has(k))
    if (fresh.length === 0) return
    for (const k of fresh) seen.current.add(k)
    queue.current.push(...fresh)
    // React has already made every fresh node visible; keep the ones still
    // waiting their turn at opacity 0 so they do not flash before their beat.
    if (root.current) for (const k of fresh) gsap.set(revealTargets(root.current, k), { opacity: 0 })

    const pump = () => {
      if (running.current || !root.current) return
      const key = queue.current.shift()
      if (!key) return
      const targets = revealTargets(root.current, key)
      let finished = false
      const run = runReveal(key, targets, () => {
        finished = true
        running.current = null
        pump()
      })
      // In immediate mode the reveal has already completed (and pumped on).
      if (!finished) running.current = run
    }
    pump()
  }, [identity, keys.join(','), root])
}

