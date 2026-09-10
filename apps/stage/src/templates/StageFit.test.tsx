import { describe, expect, it, afterEach } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { STAGE_FRAME } from '@questiongame/contract'
import { StageFit, fitScale } from './StageFit'

afterEach(cleanup)

function viewport(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true })
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true, writable: true })
}

/** The scaled box the canvas is drawn into, as numbers. */
function box() {
  const el = document.querySelector<HTMLElement>('[data-stage-fit-box]')
  if (!el) throw new Error('no fit box')
  return { width: Number.parseFloat(el.style.width), height: Number.parseFloat(el.style.height) }
}

describe('fitScale', () => {
  it('fills a 16:9 viewport exactly at any resolution or DPI scaling', () => {
    // The three a 1080p panel actually reports: 100%, 125%, 150% Windows scaling.
    for (const [w, h] of [
      [1920, 1080],
      [1536, 864],
      [1280, 720],
    ] as const) {
      expect(fitScale(w, h) * STAGE_FRAME.width).toBeCloseTo(w, 6)
      expect(fitScale(w, h) * STAGE_FRAME.height).toBeCloseTo(h, 6)
    }
  })

  it('upscales rather than pinning the canvas to a corner', () => {
    expect(fitScale(3840, 2160)).toBe(2)
    expect(fitScale(2560, 1440)).toBeCloseTo(1.3333333, 6)
  })

  it('never distorts: one scalar bounded by the tighter axis', () => {
    // 16:10 — the height runs out first.
    expect(fitScale(1920, 1200)).toBe(1)
    // 21:9 — the width is the loose axis.
    expect(fitScale(2560, 1080)).toBe(1)
  })

  it('answers 1 for a viewport that has not been laid out yet', () => {
    expect(fitScale(0, 0)).toBe(1)
    expect(fitScale(Number.NaN, 720)).toBe(1)
  })
})

describe('StageFit', () => {
  it('scales the canvas to a 1080p panel at 150% Windows scaling', () => {
    viewport(1280, 720)
    render(
      <StageFit>
        <div data-stage-frame>canvas</div>
      </StageFit>,
    )
    // The whole canvas is on screen, not the top-left 44% of it.
    expect(box()).toEqual({ width: 1280, height: 720 })
    const scaled = document.querySelector<HTMLElement>('[data-stage-fit-box] > div')
    expect(scaled?.style.transform).toBe('scale(0.6666666666666666)')
    expect(scaled?.style.transformOrigin).toBe('top left')
    // The canvas itself is still the fixed design canvas underneath.
    expect(scaled?.style.width).toBe('1920px')
    expect(scaled?.style.height).toBe('1080px')
    expect(screen.getByText('canvas')).toBeTruthy()
  })

  it('leaves no bars on a 16:9 viewport', () => {
    viewport(2560, 1440)
    render(
      <StageFit>
        <div data-stage-frame />
      </StageFit>,
    )
    expect(box()).toEqual({ width: 2560, height: 1440 })
  })

  it('pillarboxes a 21:9 viewport instead of stretching', () => {
    viewport(2560, 1080)
    render(
      <StageFit>
        <div data-stage-frame />
      </StageFit>,
    )
    expect(box()).toEqual({ width: 1920, height: 1080 })
    const fit = document.querySelector<HTMLElement>('[data-stage-fit]')
    expect(fit?.style.background).toBe('var(--stage-letterbox)')
  })

  it('re-fits when the window resizes — a display change, a DPI change', () => {
    viewport(1280, 720)
    render(
      <StageFit>
        <div data-stage-frame />
      </StageFit>,
    )
    expect(box()).toEqual({ width: 1280, height: 720 })
    viewport(1920, 1080)
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })
    expect(box()).toEqual({ width: 1920, height: 1080 })
  })
})
