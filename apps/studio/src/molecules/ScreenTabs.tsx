import { Tabs } from '@heroui/react'
import { OVERLAY_KINDS, STAGE_SCREENS, type OverlayKind, type StageScreen } from '@questiongame/contract'
import { OVERLAYS, SCREENS, SCREENS_TAB } from '@/copy'

/** What the Screens canvas can show: one of the seven screens, or one overlay standing over the last screen. */
export type CanvasView = StageScreen | `overlay:${OverlayKind}`

export function canvasScreen(view: CanvasView): StageScreen | null {
  return view.startsWith('overlay:') ? null : (view as StageScreen)
}

export function canvasOverlay(view: CanvasView): OverlayKind | null {
  return view.startsWith('overlay:') ? (view.slice('overlay:'.length) as OverlayKind) : null
}

const VIEWS: readonly CanvasView[] = [...STAGE_SCREENS, ...OVERLAY_KINDS.map((k) => `overlay:${k}` as const)]

export interface ScreenTabsProps {
  value: CanvasView
  onChange: (view: CanvasView) => void
  /** How many overrides each screen carries, shown after its name. */
  counts?: Partial<Record<StageScreen, number>> | undefined
}

/** The seven screens and the five overlays as secondary tabs (the Screens canvas). */
export function ScreenTabs({ value, onChange, counts }: ScreenTabsProps) {
  // Twelve tabs outgrow the toolbar's line: the list scrolls in its own box
  // rather than pushing the page sideways (the toolbar wraps, the list cannot).
  return (
    <div className="min-w-0 max-w-full overflow-x-auto">
    <Tabs
      variant="secondary"
      selectedKey={value}
      onSelectionChange={(key) => {
        if (typeof key === 'string' && (VIEWS as readonly string[]).includes(key)) onChange(key as CanvasView)
      }}
    >
      <Tabs.ListContainer>
        <Tabs.List aria-label="Screens">
          {VIEWS.map((view) => {
            const screen = canvasScreen(view)
            const overlay = canvasOverlay(view)
            return (
              <Tabs.Tab key={view} id={view}>
                {screen ? SCREENS[screen] : SCREENS_TAB.overlayTab(OVERLAYS[overlay!])}
                {screen && counts?.[screen] ? <span className="ml-1.5 text-[var(--accent)]">{counts[screen]}</span> : null}
                <Tabs.Indicator />
              </Tabs.Tab>
            )
          })}
        </Tabs.List>
      </Tabs.ListContainer>
    </Tabs>
    </div>
  )
}
