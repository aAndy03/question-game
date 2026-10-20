/**
 * Workspaces (Beta 2.0). A workspace is a name the operator typed and nothing
 * else: no field here carries a placeholder that reads as a name, and nothing
 * suggests one.
 */

export const WORKSPACE = {
  /** The switcher's accessible name. */
  switcher: 'Workspace',
  unnamed: 'Unnamed workspace',
  ungrouped: 'Ungrouped',
  current: 'Current',
  archived: 'Archived',
  shared: 'Shared',
  newWorkspace: 'New workspace…',
  manage: 'Manage workspaces…',
  /** Why the switcher is disabled. */
  loaded: 'Unload the game in Control to change workspace',

  nameLabel: 'Workspace name',
  groupNameLabel: 'Group name',
  create: 'Create',
  rename: 'Rename',
  save: 'Save',

  // The first screen of a library without a named workspace.
  nameTitle: 'Name your workspace',
  nameBody:
    'This library now lives in a workspace. A workspace is one library of teams, domains, questions and games; you can make more later, and share rows between them. Give this one a name.',
  createTitle: 'Create your first workspace',
  createBody:
    'A workspace is one library of teams, domains, questions and games. You can make more later, and share rows between them. Give the first one a name.',
  continue: 'Continue',

  // Manage workspaces
  pageTitle: 'Workspaces',
  pageDescription: 'Libraries in this file, and the groups they sit in',
  newGroup: 'New group',
  open: 'Open',
  actions: 'Actions',
  moveToGroup: 'Move to group…',
  duplicate: 'Duplicate…',
  archive: 'Archive',
  restore: 'Restore',
  deletePermanently: 'Delete permanently…',
  renameGroup: 'Rename group',
  deleteGroup: 'Delete group',
  moveUp: 'Move up',
  moveDown: 'Move down',
  groupLabel: 'Group',
  noGroup: 'No group',
  duplicateTitle: 'Duplicate workspace',
  duplicateBody: 'Copies every row and game of this workspace into a new one. Plays are not copied; shared rows stay shared.',
  newTitle: 'New workspace',
  renameTitle: 'Rename workspace',
  newGroupTitle: 'New group',
  renameGroupTitle: 'Rename group',
  moveTitle: 'Move to group',
  deleteGroupTitle: 'Delete this group?',
  deleteGroupBody: 'Its workspaces stay, ungrouped.',
  deleteTitle: 'Delete this workspace permanently?',
  deleteBody: (name: string, rows: number, games: number, plays: number) =>
    `${name}: ${rows} ${rows === 1 ? 'row' : 'rows'}, ${games} ${games === 1 ? 'game' : 'games'} and ${plays} ${plays === 1 ? 'Play' : 'Plays'} go for good. Shared rows stay. The library is backed up first.`,
  deleteConfirm: 'Delete permanently',
  deleteArmed: 'Press again to delete',
  onlyArchived: 'Archive it first',
  isCurrent: 'Open another workspace first',
  deleted: (name: string) => `${name} deleted. A backup was taken first.`,
  createdNotOpened: (name: string) => `${name} created. Open it once the game in Control is unloaded.`,
} as const

/** Copy, move and share (Beta 2.0, 05_STUDIO_DESIGN.md §21). */
export const TRANSFER = {
  /** The bulk bar's menu of the four. */
  menu: 'Copy, move or share…',
  copyTo: 'Copy to…',
  moveTo: 'Move to…',
  makeShared: 'Make shared',
  makeLocal: 'Make local',
  copyTitle: 'Copy to another workspace',
  moveTitle: 'Move to another workspace',
  sharedTitle: 'Make shared',
  localTitle: 'Make local',
  target: 'Workspace',
  noOther: 'There is no other workspace yet. Create one from the switcher.',
  picked: (n: number) => `${n} picked`,
  comesAlong: (n: number) => `${n} more ${n === 1 ? 'row comes' : 'rows come'} along, so nothing points at a row the workspace cannot see`,
  reused: (n: number) => `${n} already ${n === 1 ? 'has a copy' : 'have copies'} there and ${n === 1 ? 'is' : 'are'} reused`,
  refused: 'Cannot go — still used by:',
  copyInstead: 'Copy instead',
  sharedBody: 'Every workspace will see these rows. A domain brings its questions; a team or question brings its asset.',
  localBody: 'Only this workspace will see these rows.',
  confirmCopy: 'Copy',
  confirmMove: 'Move',
  confirmShared: 'Make shared',
  confirmLocal: 'Make local',
  done: (n: number) => `Done: ${n} picked, with what ${n === 1 ? 'it needs' : 'they need'}`,
  where: 'Where',
  whereAll: 'This workspace and shared',
  whereLocal: 'This workspace',
  whereShared: 'Shared',
  unfollow: 'Stop following its copies',
} as const

/** The editor's confirm when a saved row has copies (Beta 2.0). */
export const PROPAGATE = {
  title: 'This row has copies',
  body: (names: string) => `Copies live in ${names}.`,
  hereOnly: 'Save here only',
  alsoCopies: (n: number, skipped: number) =>
    skipped > 0 ? `Also update ${n} ${n === 1 ? 'copy' : 'copies'} (${skipped} skipped)` : `Also update ${n} ${n === 1 ? 'copy' : 'copies'}`,
  skipped: (where: string, why: string) => `Skipped in ${where}: ${why}`,
  sharedName: 'the shared library',
} as const
