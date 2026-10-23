import { useCallback, useEffect, type ReactNode } from 'react'
import { Button } from '@/atoms'
import { EmptyState, MosaicPanel, type MosaicDensityFloor } from '@/molecules'
import { ActionPanel, ControlTopBar, GamePanel, StripsPanel, TimelinePanel, Viewer, useControlHotkeys } from '@/organisms'
import { MosaicLayout } from '@/templates'
import { useControlLayout, useControlLayoutStore, type PanelId } from '@/chrome/control'
import { useNavStore } from '@/chrome/nav'
import { CONTROL } from '@/copy'
import { usePlayState } from '@/host/playState'
import { useSettings } from '@/host/queries'

/**
 * Control (spec §11.H, §12): the mosaic of six panels over the Play, plus
 * the display pickers and the settings float. Hotkeys live here and nowhere
 * else. Nothing on this page is remembered except the layout.
 */
export function ControlPage() {
  // Only *whether* a Play is loaded — this page renders no field of one.
  // Reading the whole object here is what rebuilt the mosaic ten times a
  // second before P11.6 (`host/playState.ts` has the measurement).
  const hasPlay = usePlayState((s) => s !== null)
  const settings = useSettings()
  const layout = useControlLayout()
  const setLayout = useControlLayoutStore((s) => s.setLayout)
  const setOperator = useControlLayoutStore((s) => s.setOperator)
  const go = useNavStore((s) => s.go)
  useControlHotkeys(hasPlay)

  useEffect(() => {
    setOperator(settings.data?.globals.active_operator_id ?? null)
  }, [settings.data?.globals.active_operator_id, setOperator])

  const floor = settings.data?.control.mosaic_density ?? 'comfortable'
  const renderTile = useRenderTile(floor)

  if (!hasPlay) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            kind="empty"
            what={CONTROL.title.toLowerCase()}
            detail={CONTROL.noRecipeBody}
            action={
              <Button variant="primary" icon="games" onPress={() => void go({ tab: 'games' })}>
                {CONTROL.goToGames}
              </Button>
            }
          />
        </div>
      </div>
    )
  }

  return (
    <MosaicLayout<PanelId>
      value={layout}
      onChange={setLayout}
      titles={CONTROL.panels}
      top={<ControlTopBar />}
      renderTile={renderTile}
    />
  )
}

/**
 * The tile bodies, hoisted out of the render.
 *
 * An inline arrow is a new `renderTile` prop on every render of this page, and
 * `react-mosaic` rebuilds its whole tree when it changes — the dnd provider,
 * six `MosaicWindow`s, and every `Tooltip` under them. The density floor is the
 * only thing it closes over, so that is the only key it needs.
 */
function useRenderTile(floor: MosaicDensityFloor) {
  return useCallback(
    (id: PanelId): ReactNode => {
      switch (id) {
        case 'viewer':
          return (
            <MosaicPanel floor={floor} padded={false}>
              {(density) => <Viewer density={density} />}
            </MosaicPanel>
          )
        case 'game':
          return (
            <MosaicPanel floor={floor} fills>
              {(density, box) => <GamePanel density={density} box={box} />}
            </MosaicPanel>
          )
        case 'action':
          return <MosaicPanel floor={floor}>{(density) => <ActionPanel density={density} />}</MosaicPanel>
        case 'strips':
          return <MosaicPanel floor={floor}>{(density) => <StripsPanel density={density} />}</MosaicPanel>
        case 'timeline':
          return <MosaicPanel floor={floor}>{(density) => <TimelinePanel density={density} />}</MosaicPanel>
      }
    },
    [floor],
  )
}
