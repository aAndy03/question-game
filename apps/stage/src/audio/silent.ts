import type { AudioPort } from './port'

/**
 * The adapter that plays nothing: the Viewer iframe (the Stage *window* is
 * what the audience hears; a second copy inside Control would double every
 * cue), the fixture strip, and every test. Same interface, so the projection
 * code above it does not know which one it has.
 */
export function silentAudio(): AudioPort {
  return {
    play() {},
    set() {},
    load() {},
    dispose() {},
  }
}
