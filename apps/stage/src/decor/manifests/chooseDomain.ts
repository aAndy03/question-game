import type { ScreenDecorSpec } from '../types'

/**
 * ChooseDomain: C H O O S E from the export, stacked right of the board,
 * plus a hairline circle and a hairline bar. Regions are fractions of the
 * canvas box; the board is a measured solid.
 */
export const CHOOSE_DOMAIN_DECOR: ScreenDecorSpec = {
  screen: 'chooseDomain',
  anchor: { x: 0.82, y: 0.5 },
  bodies: [
    { kind: 'svg', asset: 'domain-C', height: { min: 280, max: 320 }, color: 'ink', opacity: 1, rotation: { min: -10, max: 10 }, region: { x: { min: 0.66, max: 0.78 }, y: { min: 0.15, max: 0.28 } } },
    { kind: 'svg', asset: 'domain-O', height: { min: 280, max: 320 }, color: 'ink', opacity: 1, rotation: { min: -10, max: 10 }, region: { x: { min: 0.82, max: 0.96 }, y: { min: 0.15, max: 0.28 } } },
    { kind: 'svg', asset: 'domain-E', height: { min: 260, max: 300 }, color: 'ink', opacity: 1, rotation: { min: -10, max: 10 }, region: { x: { min: 0.66, max: 0.78 }, y: { min: 0.42, max: 0.55 } } },
    { kind: 'svg', asset: 'domain-O-1', height: { min: 280, max: 320 }, color: 'ink', opacity: 1, rotation: { min: -10, max: 10 }, region: { x: { min: 0.82, max: 0.96 }, y: { min: 0.42, max: 0.55 } } },
    { kind: 'svg', asset: 'domain-S', height: { min: 260, max: 300 }, color: 'ink', opacity: 1, rotation: { min: -10, max: 10 }, region: { x: { min: 0.66, max: 0.78 }, y: { min: 0.72, max: 0.88 } } },
    { kind: 'svg', asset: 'domain-H', height: { min: 260, max: 300 }, color: 'ink', opacity: 1, rotation: { min: -10, max: 10 }, region: { x: { min: 0.82, max: 0.96 }, y: { min: 0.72, max: 0.88 } } },
    { kind: 'outline', shape: 'circle', height: { min: 70, max: 90 }, color: 'ink', opacity: 1, rotation: { min: 0, max: 0 }, region: { x: { min: 0.7, max: 0.8 }, y: { min: 0.6, max: 0.68 } } },
    { kind: 'outline', shape: 'rect', aspect: 4.2, height: { min: 40, max: 50 }, color: 'ink', opacity: 1, rotation: { min: 5, max: 15 }, region: { x: { min: 0.8, max: 0.94 }, y: { min: 0.6, max: 0.68 } } },
  ],
}
