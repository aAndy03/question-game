/**
 * Every icon Studio uses, by meaning. One set — Gravity UI, through the
 * Iconify JSON — so two screens can never pick two icons for one job
 * (05_STUDIO_DESIGN.md §2.5).
 *
 * The bodies are generated into `icons.generated.ts` by
 * `scripts/studio-icons.ts` from `@iconify-json/gravity-ui`, so the app ships
 * exactly these and fetches nothing. Add a key here, run
 * `npm run studio:icons`, and the icon exists.
 */

export const ICONS = {
  // tabs
  teams: 'persons',
  library: 'book-open',
  games: 'folders',
  operators: 'person',
  control: 'play',
  screens: 'layout-cells',
  statistics: 'chart-column',
  settings: 'gear',

  // chrome
  sidebarExpanded: 'layout-side-content-left',
  sidebarRail: 'layout-side-content',
  sidebarHidden: 'square-dashed',
  back: 'arrow-left',
  forward: 'arrow-right',
  themeLight: 'sun',
  themeDark: 'moon',
  themeSystem: 'display',
  bell: 'bell',
  health: 'heart',
  displays: 'tv',
  clock: 'clock',
  chevronDown: 'chevron-down',
  chevronRight: 'chevron-right',
  chevronLeft: 'chevron-left',
  chevronUp: 'chevron-up',
  close: 'xmark',
  more: 'ellipsis',
  moreVertical: 'ellipsis-vertical',
  external: 'arrow-up-right-from-square',

  // lists
  search: 'magnifier',
  grid: 'layout-header-cells',
  table: 'list-ul',
  archive: 'archive',
  restore: 'arrow-rotate-left',
  add: 'plus',
  edit: 'pencil',
  duplicate: 'copy',
  open: 'arrow-right',
  sort: 'bars-unaligned',
  filter: 'funnel',
  check: 'check',
  selected: 'circle-check',
  drag: 'grip',
  up: 'arrow-up',
  down: 'arrow-down',
  remove: 'circle-minus',
  tag: 'tag',
  folder: 'folder',
  question: 'circle-question',
  domain: 'layers',
  picture: 'picture',
  save: 'floppy-disk',
  undo: 'arrow-uturn-ccw-left',
  redo: 'arrow-uturn-cw-right',

  // states
  info: 'circle-info',
  warn: 'triangle-exclamation',
  error: 'circle-exclamation',
  correct: 'circle-check',
  incorrect: 'circle-xmark',
  lock: 'lock',
  unlock: 'lock-open',
  pin: 'pin',
  eye: 'eye',
  eyeOff: 'eye-slash',
  play: 'play-fill',
  pause: 'pause-fill',
  stop: 'square-fill',
  rocket: 'rocket',
  keyboard: 'keyboard',
  sliders: 'sliders',
  shuffle: 'shuffle',
  flag: 'flag',
} as const

export type IconName = keyof typeof ICONS
