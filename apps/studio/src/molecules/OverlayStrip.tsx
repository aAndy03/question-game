import { OVERLAY_KINDS, type OverlayKind, type OverlayRequest } from '@questiongame/contract'
import { Button, Text, Tooltip } from '@/atoms'
import { OVERLAYS, STRIPS } from '@/copy'

export interface OverlayStripProps {
  active: OverlayRequest | null
  pending: OverlayRequest | null
  enabled: boolean
  density?: 'comfortable' | 'compact' | 'dense'
  onShow: (kind: OverlayKind) => void
}

/**
 * The five overlay kinds, callable by hand over any screen (spec §5.6).
 *
 * Wrapping pills at every density. The dense layout used to print the first
 * two letters of the kind — "To", "Ro", "Mu" — which is not a control anyone
 * can aim at; the label is the target, so it stays whole and the row wraps
 * instead.
 */
export function OverlayStrip({ active, pending, enabled, density = 'comfortable', onShow }: OverlayStripProps) {
  return (
    <div className="flex flex-col gap-2" data-overlay-strip>
      <div className="flex items-center justify-between gap-2">
        <Text variant="studio-caption" tone="muted">
          {STRIPS.overlays}
        </Text>
        {!enabled ? (
          <Text variant="studio-caption" tone="warning">
            {STRIPS.overlaysOff}
          </Text>
        ) : pending ? (
          <Text variant="studio-caption" tone="muted" truncate>{`${STRIPS.overlayPending}: ${OVERLAYS[pending.kind]}`}</Text>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {OVERLAY_KINDS.map((kind) => {
          const isActive = active?.kind === kind
          return (
            <Tooltip key={kind} content={OVERLAYS[kind]} isDisabled={density !== 'dense'}>
              <Button
                size="sm"
                variant={isActive ? 'primary' : 'outline'}
                icon="overlay"
                onPress={() => onShow(kind)}
                isDisabled={!enabled}
                disabledReason={!enabled ? STRIPS.overlaysOff : null}
                className="min-w-0 max-w-full justify-start"
              >
                <span className="truncate">{OVERLAYS[kind]}</span>
              </Button>
            </Tooltip>
          )
        })}
      </div>
    </div>
  )
}
