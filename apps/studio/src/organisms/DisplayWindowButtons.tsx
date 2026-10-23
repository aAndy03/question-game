import { Button } from '@/atoms'
import { CONTROL } from '@/copy'
import { STATS } from '@/copy/stats'
import { useDisplays } from './useDisplays'

/**
 * *Open Stage* and *Show / Close Statistics*, on whatever display each window
 * is set for — above the display cards in Settings ▸ Monitors and in the
 * status bar's displays popover (P21.4; Control's top strip until then).
 */
export function DisplayWindowButtons() {
  const { openStage, statsOpen, setStatsOpen } = useDisplays()
  return (
    <div className="flex items-center gap-1.5">
      <Button size="sm" variant="ghost" icon="displays" onPress={openStage}>
        {CONTROL.openStage}
      </Button>
      <Button size="sm" variant={statsOpen ? 'ghost' : 'secondary'} icon="statistics" onPress={() => setStatsOpen(!statsOpen)}>
        {statsOpen ? STATS.window.close : STATS.window.show}
      </Button>
    </div>
  )
}
