import type { ScreenDecorSpec } from '../types'

/**
 * TeamOrder: the letters R E A D Y from the export, tumbling on the right
 * third, with the outlined `?` (the `_` asset) among them.
 */
export const TEAM_ORDER_DECOR: ScreenDecorSpec = {
  screen: 'teamOrder',
  boundary: { x: 1220, y: 100, width: 760, height: 1040 },
  anchor: { x: 0.5, y: 0.5 },
  bodies: [
    { kind: 'svg', asset: 'order-A', height: { min: 270, max: 320 }, color: 'ink', opacity: 1, rotation: { min: -10, max: 10 }, region: { x: { min: 0.1, max: 0.4 }, y: { min: 0, max: 0.2 } } },
    { kind: 'svg', asset: 'order-D', height: { min: 270, max: 320 }, color: 'ink', opacity: 1, rotation: { min: -10, max: 10 }, region: { x: { min: 0.55, max: 1 }, y: { min: 0, max: 0.2 } } },
    { kind: 'svg', asset: 'order-E', height: { min: 270, max: 320 }, color: 'ink', opacity: 1, rotation: { min: -10, max: 10 }, region: { x: { min: 0, max: 0.3 }, y: { min: 0.3, max: 0.5 } } },
    { kind: 'svg', asset: 'order-R', height: { min: 270, max: 320 }, color: 'ink', opacity: 1, rotation: { min: -10, max: 10 }, region: { x: { min: 0.6, max: 1 }, y: { min: 0.4, max: 0.6 } } },
    { kind: 'svg', asset: 'order-Y', height: { min: 270, max: 320 }, color: 'ink', opacity: 1, rotation: { min: -10, max: 10 }, region: { x: { min: 0.1, max: 0.4 }, y: { min: 0.7, max: 1 } } },
    { kind: 'svg', asset: 'order-_', height: { min: 270, max: 310 }, color: 'ink', opacity: 1, rotation: { min: -10, max: 10 }, region: { x: { min: 0.3, max: 0.6 }, y: { min: 0.35, max: 0.6 } } },
  ],
}
