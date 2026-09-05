// @ts-check
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'

/**
 * Atomic-design boundaries (docs/v1/04_ROADMAP.md) and the two-design-system
 * split (optimized_first_spec.md §2.30), enforced rather than documented.
 *
 *   1. dependencies point one way: pages → templates → organisms → molecules → atoms
 *   2. only organisms and pages may read play-state or call the host
 *   3. apps/stage never imports design-studio (and no Motion); apps/studio never
 *      imports design-stage
 *   4. nothing imports `calligraph` directly — it lives behind @questiongame/text
 *
 * Flat config REPLACES rule options rather than merging them, so every file
 * group gets one fully-composed `no-restricted-imports` instead of several
 * partial ones that would silently cancel each other out.
 */

const LEVELS = ['atoms', 'molecules', 'organisms', 'templates', 'pages']
const PRESENTATIONAL = ['atoms', 'molecules']

const CALLIGRAPH = {
  name: 'calligraph',
  message:
    'Import @questiongame/text instead. Calligraph is one implementation behind the Text module (spec §2.29).',
}

const PLAY_STATE = {
  name: '@questiongame/contract',
  importNames: ['PlayStateForStage', 'PlayState'],
  message:
    'Only organisms and pages may read play-state. Atoms and molecules take props (roadmap, atomic rule 2).',
}

const HOST_BRIDGE = {
  group: ['@tauri-apps/api', '@tauri-apps/api/*'],
  message:
    'Only organisms and pages may call the host. Atoms and molecules take props (roadmap, atomic rule 2).',
}

const FOREIGN_DESIGN = {
  stage: {
    group: ['@questiongame/design-studio', '@questiongame/design-studio/*'],
    message: 'Stage renders under the questiongame token scope only (spec §2.30).',
  },
  studio: {
    group: ['@questiongame/design-stage', '@questiongame/design-stage/*'],
    message: 'Studio renders under the HeroUI token scope only (spec §2.30).',
  },
}

const NO_MOTION_ON_STAGE = {
  group: ['motion', 'motion/*', 'framer-motion'],
  message:
    'Motion is Studio chrome only. Stage animation is GSAP, inside a PresentationService timeline (spec §2.29, §2.11).',
}

/** Levels a given level may not import from. */
function upward(level) {
  return LEVELS.slice(LEVELS.indexOf(level) + 1).flatMap((l) => [
    `@/${l}`,
    `@/${l}/*`,
    `**/${l}`,
    `**/${l}/*`,
  ])
}

function restricted({ app, level }) {
  const patterns = []
  const paths = [CALLIGRAPH]

  if (app === 'stage') patterns.push(FOREIGN_DESIGN.stage, NO_MOTION_ON_STAGE)
  if (app === 'studio') patterns.push(FOREIGN_DESIGN.studio)

  if (level) {
    const above = upward(level)
    // `pages` is the top level, so it has nothing above it and the rule schema
    // rejects an empty `group`.
    if (above.length > 0) {
      patterns.push({
        group: above,
        message: `${level} may not import a higher atomic level. Dependencies point one way: ${LEVELS.join(' ← ')}.`,
      })
    }
    if (PRESENTATIONAL.includes(level)) {
      patterns.push(HOST_BRIDGE)
      paths.push(PLAY_STATE)
    }
  }

  // The schema requires each key to be non-empty when present.
  const options = {}
  if (paths.length > 0) options.paths = paths
  if (patterns.length > 0) options.patterns = patterns
  return ['error', options]
}

/** One block per app, and one per app × atomic level. */
const boundaryBlocks = ['stage', 'studio'].flatMap((app) => [
  {
    files: [`apps/${app}/**/*.{ts,tsx}`],
    rules: { 'no-restricted-imports': restricted({ app }) },
  },
  ...LEVELS.map((level) => ({
    files: [`apps/${app}/src/${level}/**/*.{ts,tsx}`],
    rules: { 'no-restricted-imports': restricted({ app, level }) },
  })),
])

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/target/**', '.agents/**'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.es2023 },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },

  // Packages: Calligraph stays behind the Text module everywhere but inside it.
  {
    files: ['packages/**/*.{ts,tsx}'],
    ignores: ['packages/text/**'],
    rules: { 'no-restricted-imports': ['error', { paths: [CALLIGRAPH] }] },
  },

  ...boundaryBlocks,

  // Build and dev tooling runs in Node, not the browser.
  {
    files: ['**/*.config.{ts,js}', 'eslint.config.js', 'scripts/**/*.{ts,js,mjs}'],
    languageOptions: { globals: { ...globals.node } },
  },
)
