import { useEffect, useState, type ReactNode } from 'react'
import { STAGE_FRAME } from '@questiongame/contract'

/**
 * The canvas is 1920×1080. The **window** is whatever the display gives it.
 * This is the one place the two are reconciled.
 *
 * The design system fixes the canvas (`--stage-width` / `--stage-height`) and
 * every number downstream of it is a Figma number: token widths, decor
 * manifests, `recipe.layout` node offsets, the `ViewerNodeRect` coordinates
 * Control lays hit targets in. None of that may become responsive — so the
 * canvas stays fixed and is **fitted** to the viewport instead, exactly as the
 * Viewer has always fitted it into a mosaic tile.
 *
 * Until P11.6 only the *Viewer* did this; the Stage window rendered the canvas
 * at 1:1 CSS pixels under `body { overflow: hidden }`, so any window that was
 * not exactly 1920×1080 **CSS** pixels showed the top-left corner of the canvas
 * and clipped the rest. A viewport is rarely 1920×1080 CSS pixels:
 *
 * ```text
 * 1080p panel, Windows scaling 150%   1280×720 CSS px   44% of the canvas visible
 * 1080p panel, Windows scaling 125%   1536×864  CSS px   64%
 * 1440p panel at 100%                 2560×1440 CSS px   canvas in the top-left ninth
 * ```
 *
 * A TV is the first case almost every time: Windows ships an external 1080p
 * display at 150%, and CSS pixels are logical pixels.
 *
 * # Aspect ratio
 *
 * The fit is `min(w/1920, h/1080)` — one scalar for both axes, so the canvas
 * never distorts. On any **16:9** viewport that lands exactly on the edges and
 * there are no bars at all, whatever the resolution or the DPI scaling. On a
 * viewport that is not 16:9 the remainder is letterbox (16:10) or pillarbox
 * (21:9) in `--stage-letterbox`, and the canvas is centred in it.
 *
 * Upscaling is allowed and deliberate: a 4K display should show a full-bleed
 * canvas, not a 1920×1080 island in one corner. Everything on Stage is text and
 * vector, so it grows cleanly.
 *
 * # Why `transform`, and what must not touch it
 *
 * `transform: scale()` on an **ancestor** of the frame, never on anything
 * inside it: GSAP owns `transform` on the elements it animates
 * (`presentation/beats.ts`) and the layout applier owns `translate` on
 * `[data-node-id]` elements. Both live inside the frame and neither can see
 * this wrapper. Chromium re-rasterises a statically transformed subtree at the
 * composited device scale, so the canvas is drawn at the panel's real
 * resolution — on a 1080p TV at 150%, `1920 × ⅔ × 1.5` is 1920 device pixels
 * and the text is exactly as crisp as it was designed to be. **Do not add
 * `will-change: transform` here**: that pins the raster at layout resolution
 * and the whole surface goes soft on camera.
 *
 * Anything that measures the DOM must divide by the measured frame width rather
 * than assume 1920 — `DecorField.measureSolids` and `ViewerFed`'s node posting
 * both already do, which is why neither needed a change.
 */

/** The scalar that fits the canvas into `width × height`. Never 0, never NaN. */
export function fitScale(width: number, height: number): number {
  const k = Math.min(width / STAGE_FRAME.width, height / STAGE_FRAME.height)
  return Number.isFinite(k) && k > 0 ? k : 1
}

/**
 * The current fit for this window, re-measured on every resize.
 *
 * A DPI-scaling change on the display Stage stands on resizes the CSS viewport,
 * so `resize` covers it too — there is no separate device-pixel-ratio watch to
 * keep in sync.
 */
export function useFitScale(): number {
  const [scale, setScale] = useState(() =>
    typeof window === 'undefined' ? 1 : fitScale(window.innerWidth, window.innerHeight),
  )
  useEffect(() => {
    const measure = () => setScale(fitScale(window.innerWidth, window.innerHeight))
    // Once on mount: the first render ran before layout, and inside the Viewer
    // iframe the box is still 0×0 at that point.
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])
  return scale
}

export interface StageFitProps {
  children: ReactNode
}

/** The canvas, fitted and centred in the window, on a letterbox ground. */
export function StageFit({ children }: StageFitProps) {
  const scale = useFitScale()
  return (
    <div
      data-stage-fit
      style={{
        position: 'fixed',
        inset: 0,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--stage-letterbox)',
      }}
    >
      <div
        data-stage-fit-box
        style={{ width: STAGE_FRAME.width * scale, height: STAGE_FRAME.height * scale, overflow: 'hidden' }}
      >
        <div
          style={{
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            width: STAGE_FRAME.width,
            height: STAGE_FRAME.height,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
