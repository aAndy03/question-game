import { OVERLAY_KINDS, type OverlayKind, type OverlayRequest } from '@questiongame/contract'
import { Button, Text } from '@/atoms'
import { OVERLAYS, STRIPS } from '@/copy'

export interface OverlayStripProps {
  active: OverlayRequest | null
  pending: OverlayRequest | null
  enabled: boolean
  density?: 'comfortable' | 'compact' | 'dense'
  onShow: (kind: OverlayKind) => void
}

/** The five overlay kinds, callable by hand over any screen (spec §5.6). */
export function OverlayStrip({ active, pending, enabled, density = 'comfortable', onShow }: OverlayStripProps) {
  return (
    <div className="flex flex-col gap-2" data-overlay-strip>
      <div className="flex items-center justify-between">
        <Text variant="studio-caption" tone="muted">
          {STRIPS.overlays}
        </Text>
        {!enabled ? (
          <Text variant="studio-caption" tone="warning">
            {STRIPS.overlaysOff}
          </Text>
        ) : pending ? (
          <Text variant="studio-caption" tone="muted">{`${STRIPS.overlayPending}: ${OVERLAYS[pending.kind]}`}</Text>
        ) : null}
      </div>
      <div className={density === 'comfortable' ? 'grid grid-cols-2 gap-1.5' : 'flex flex-wrap gap-1.5'}>
        {OVERLAY_KINDS.map((kind) => {
          const isActive = active?.kind === kind
          return (
            <Button
              key={kind}
              size="sm"
              variant={isActive ? 'primary' : 'outline'}
              icon="overlay"
              onPress={() => onShow(kind)}
              isDisabled={!enabled}
              disabledReason={!enabled ? STRIPS.overlaysOff : null}
              className={density === 'dense' ? 'px-2' : 'justify-start'}
            >
              {density === 'dense' ? OVERLAYS[kind].slice(0, 2) : OVERLAYS[kind]}
            </Button>
          )
        })}
      </div>
    </div>
  )
}
