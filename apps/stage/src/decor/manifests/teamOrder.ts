import type { ScreenDecorSpec } from '../types'

/**
 * TeamOrder: the letters R E A D Y from the export, tumbling right of the
 * sequence table, with the outlined `?` among them. Regions are fractions
 * of the canvas box; the table itself is a measured solid.
 */
export const TEAM_ORDER_DECOR: ScreenDecorSpec = {
  screen: 'teamOrder',
  anchor: { x: 0.8, y: 0.5 },
  bodies: [
    { kind: 'svg', asset: 'order-A', height: { min: 260, max: 300 }, color: 'ink', opacity: 1, rotation: { min: -10, max: 10 }, region: { x: { min: 0.62, max: 0.78 }, y: { min: 0.15, max: 0.3 } } },
    { kind: 'svg', asset: 'order-D', height: { min: 260, max: 300 }, color: 'ink', opacity: 1, rotation: { min: -10, max: 10 }, region: { x: { min: 0.8, max: 0.96 }, y: { min: 0.15, max: 0.3 } } },
    { kind: 'svg', asset: 'order-E', height: { min: 260, max: 300 }, color: 'ink', opacity: 1, rotation: { min: -10, max: 10 }, region: { x: { min: 0.62, max: 0.75 }, y: { min: 0.4, max: 0.55 } } },
    { kind: 'svg', asset: 'order-R', height: { min: 260, max: 300 }, color: 'ink', opacity: 1, rotation: { min: -10, max: 10 }, region: { x: { min: 0.82, max: 0.96 }, y: { min: 0.45, max: 0.6 } } },
    { kind: 'svg', asset: 'order-Y', height: { min: 260, max: 300 }, color: 'ink', opacity: 1, rotation: { min: -10, max: 10 }, region: { x: { min: 0.64, max: 0.78 }, y: { min: 0.7, max: 0.88 } } },
    { kind: 'svg', asset: 'order-underscore', height: { min: 260, max: 300 }, color: 'ink', opacity: 1, rotation: { min: -10, max: 10 }, region: { x: { min: 0.74, max: 0.88 }, y: { min: 0.42, max: 0.62 } } },
  ],
}
