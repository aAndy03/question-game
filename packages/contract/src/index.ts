/**
 * The contract shared by both webviews and the Rust host schema.
 *
 * Import discipline (enforced in eslint.config.js):
 *   - anything may import screens, node ids, reveal keys and command names;
 *   - only organisms and pages may import `PlayStateForStage`.
 *
 * Nothing here holds a design value, a pixel, or a copy string. It describes
 * shape and identity only.
 */

export * from './screens'
export * from './nodes'
export * from './reveal'
export * from './play-state'
export * from './commands'
export { FIXTURES, FIXTURE_NAMES } from './fixtures'
export type { FixtureName } from './fixtures'
