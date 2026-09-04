import type { ScreenDecorSpec } from '../types'

/**
 * ChooseDomain: C H O O S E from the export, stacked on the right, plus a
 * hairline circle and a hairline bar.
 */
export const CHOOSE_DOMAIN_DECOR: ScreenDecorSpec = {
  screen: 'chooseDomain',
  boundary: { x: 1280, y: 120, width: 680, height: 1000 },
  anchor: { x: 0.5, y: 0.5 },
  bodies: [
    { kind: 'svg', asset: 'domain-C', height: { min: 300, max: 340 }, color: 'ink', opacity: 1, rotation: { min: -10, max: 10 }, region: { x: { min: 0, max: 0.3 }, y: { min: 0, max: 0.15 } } },
    { kind: 'svg', asset: 'domain-O', height: { min: 300, max: 340 }, color: 'ink', opacity: 1, rotation: { min: -10, max: 10 }, region: { x: { min: 0.6, max: 1 }, y: { min: 0, max: 0.15 } } },
    { kind: 'svg', asset: 'domain-E', height: { min: 280, max: 320 }, color: 'ink', opacity: 1, rotation: { min: -10, max: 10 }, region: { x: { min: 0, max: 0.3 }, y: { min: 0.35, max: 0.5 } } },
    { kind: 'svg', asset: 'domain-O-1', height: { min: 300, max: 340 }, color: 'ink', opacity: 1, rotation: { min: -10, max: 10 }, region: { x: { min: 0.6, max: 1 }, y: { min: 0.35, max: 0.5 } } },
    { kind: 'svg', asset: 'domain-S', height: { min: 280, max: 320 }, color: 'ink', opacity: 1, rotation: { min: -10, max: 10 }, region: { x: { min: 0, max: 0.3 }, y: { min: 0.75, max: 1 } } },
    { kind: 'svg', asset: 'domain-H', height: { min: 280, max: 320 }, color: 'ink', opacity: 1, rotation: { min: -10, max: 10 }, region: { x: { min: 0.5, max: 0.9 }, y: { min: 0.75, max: 1 } } },
    { kind: 'outline', shape: 'circle', height: { min: 70, max: 90 }, color: 'ink', opacity: 1, rotation: { min: 0, max: 0 }, region: { x: { min: 0.3, max: 0.5 }, y: { min: 0.55, max: 0.7 } } },
    { kind: 'outline', shape: 'rect', aspect: 4.2, height: { min: 40, max: 50 }, color: 'ink', opacity: 1, rotation: { min: 5, max: 15 }, region: { x: { min: 0.5, max: 0.9 }, y: { min: 0.55, max: 0.7 } } },
  ],
}
