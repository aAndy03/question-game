import { useEffect } from 'react'
import { Button } from '@/atoms'
import { EmptyState, MosaicPanel } from '@/molecules'
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
  const play = usePlayState()
  const settings = useSettings()
  const layout = useControlLayout()
  const setLayout = useControlLayoutStore((s) => s.setLayout)
  const setOperator = useControlLayoutStore((s) => s.setOperator)
  const go = useNavStore((s) => s.go)
  useControlHotkeys(play !== null)

  useEffect(() => {
    setOperator(settings.data?.globals.active_operator_id ?? null)
  }, [settings.data?.globals.active_operator_id, setOperator])

  const floor = settings.data?.control.mosaic_density ?? 'comfortable'

  if (!play) {
    return (
      <div className="flex h-full flex-col">
        <div className="shrink-0 border-b border-[var(--border)] px-4 py-2">
          <ControlTopBar />
        </div>
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
      renderTile={(id) => {
        switch (id) {
          case 'viewer':
            return (
              <MosaicPanel floor={floor} padded={false}>
                {(density) => <Viewer density={density} />}
              </MosaicPanel>
            )
          case 'game':
            return <MosaicPanel floor={floor}>{(density) => <GamePanel density={density} />}</MosaicPanel>
          case 'action':
            return <MosaicPanel floor={floor}>{(density) => <ActionPanel density={density} />}</MosaicPanel>
          case 'strips':
            return <MosaicPanel floor={floor}>{(density) => <StripsPanel density={density} />}</MosaicPanel>
          case 'timeline':
            return <MosaicPanel floor={floor}>{(density) => <TimelinePanel density={density} />}</MosaicPanel>
        }
      }}
    />
  )
}
