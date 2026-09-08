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

/**
 * Every Screen, in show order; the operator may jump anywhere (spec §5.5).
 *
 * The group is **detached and wrapping**, never `fullWidth`: seven labelled
 * pills do not fit one row at any panel width the mosaic offers, and an
 * attached full-width group answers that by clipping — the operator was left
 * with half a word and no target. Wrapping is the only layout that is right at
 * every width, so the density decides one thing only: whether the label is
 * printed beside the icon or hung on a tooltip.
 */
export function ScreenStrip({ current, overlayBusy, density = 'comfortable', onShow }: ScreenStripProps) {
  const labelled = density === 'comfortable'
  return (
    <div className="flex flex-col gap-2" data-screen-strip>
      <div className="flex items-center justify-between gap-2">
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
        isDetached
        selectionMode="single"
        selectedKeys={[current]}
        disallowEmptySelection
        size="sm"
        aria-label={STRIPS.screens}
        className="flex w-full flex-wrap justify-start gap-1.5"
        onSelectionChange={(keys) => {
          const next = [...keys][0]
          if (typeof next === 'string' && (STAGE_SCREENS as readonly string[]).includes(next)) onShow(next as StageScreen)
        }}
      >
        {STAGE_SCREENS.map((screen) => (
          <Tooltip key={screen} content={SCREENS[screen]} isDisabled={labelled}>
            <ToggleButton id={screen} aria-label={SCREENS[screen]} isIconOnly={!labelled}>
              <Icon name={ICON[screen]} size="sm" />
              {labelled ? <span className="truncate">{SCREENS[screen]}</span> : null}
            </ToggleButton>
          </Tooltip>
        ))}
      </ToggleButtonGroup>
    </div>
  )
}
