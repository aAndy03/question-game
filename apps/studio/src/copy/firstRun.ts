/**
 * First-run wizard copy (P10, 05_STUDIO_DESIGN.md §12.1). Four steps: where
 * things live, the first Operator, the sample game, the defaults.
 */

export type FirstRunStepId = 'paths' | 'operator' | 'sample' | 'defaults'

export const FIRST_RUN = {
  brand: 'questiongame Studio',
  steps: [
    { id: 'paths', label: 'Where things live' },
    { id: 'operator', label: 'Operator' },
    { id: 'sample', label: 'Sample game' },
    { id: 'defaults', label: 'Defaults' },
  ] as const satisfies readonly { id: FirstRunStepId; label: string }[],
  stepsLabel: 'Setup steps',

  paths: {
    title: 'Where things live',
    body: 'Studio keeps everything on this computer. Nothing leaves it.',
  },
  operator: {
    title: 'Who runs the studio?',
    body: 'An Operator is required before a Play can start. The name shows in the top bar; the pin is optional.',
    displayName: 'Display name',
    displayNameHint: 'Shown in the top bar and on every Play this operator runs.',
    create: 'Create operator',
    created: 'Operator created.',
  },
  sample: {
    title: 'Load the sample game?',
    body: 'The Demo game: Red and Blue, Geography and Science, six questions. A quick way to see Control and Stage working.',
    load: 'Load Demo',
    loaded: 'Demo loaded.',
    skipHint: 'Skip leaves the library empty. Load Demo stays available from Games and Settings.',
  },
  defaults: {
    title: 'Defaults for new games',
    body: 'Award, timer and reveal, as shipped. Every game may set its own.',
    skipHint: 'Skip keeps the shipped defaults.',
  },

  back: 'Back',
  next: 'Next',
  skip: 'Skip',
  finish: 'Finish',
  required: 'This step cannot be skipped.',
} as const
