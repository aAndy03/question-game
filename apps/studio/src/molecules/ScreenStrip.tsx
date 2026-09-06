import { ToggleButton, ToggleButtonGroup } from '@heroui/react'
import { STAGE_SCREENS, type StageScreen } from '@questiongame/contract'
import { Icon, Text, Tooltip, type IconName } from '@/atoms'
import { SCREENS, STRIPS } from '@/copy'

export interface ScreenStripProps {
  current: StageScreen
  /** A base transition may not start under a running overlay (spec §2.6). */
  overlayBusy: boolean
  density?: 'comfortable' | 'compact' | 'dense'
  onShow: (screen: StageScreen) => void
}

const ICON: Record<StageScreen, IconName> = {
  idle: 'circleDashed',
  teamOrder: 'listCheck',
  chooseDomain: 'domain',
  question: 'question',
  scoreboard: 'statistics',
  finalLeaderboard: 'flag',
  currentTeam: 'token',
}

/** Every Screen, in show order; the operator may jump anywhere (spec §5.5). */
export function ScreenStrip({ current, overlayBusy, density = 'comfortable', onShow }: ScreenStripProps) {
  return (
    <div className="flex flex-col gap-2" data-screen-strip>
      <div className="flex items-center justify-between">
        <Text variant="studio-caption" tone="muted">
          {STRIPS.screens}
        </Text>
        {overlayBusy ? (
          <Text variant="studio-caption" tone="warning">
            {STRIPS.overlayBusy}
          </Text>
        ) : null}
      </div>
      <ToggleButtonGroup
        selectionMode="single"
        selectedKeys={[current]}
        disallowEmptySelection
        size="sm"
        fullWidth
        aria-label={STRIPS.screens}
        onSelectionChange={(keys) => {
          const next = [...keys][0]
          if (typeof next === 'string' && (STAGE_SCREENS as readonly string[]).includes(next)) onShow(next as StageScreen)
        }}
      >
        {STAGE_SCREENS.map((screen) => (
          <Tooltip key={screen} content={SCREENS[screen]} isDisabled={density === 'comfortable'}>
            <ToggleButton id={screen} aria-label={SCREENS[screen]}>
              <Icon name={ICON[screen]} size="sm" />
              {density === 'comfortable' ? <span className="truncate">{SCREENS[screen]}</span> : null}
            </ToggleButton>
          </Tooltip>
        ))}
      </ToggleButtonGroup>
    </div>
  )
}
