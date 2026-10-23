/**
 * Workspaces (Beta 2.0). A workspace is a name the operator typed and nothing
 * else: no field here carries a placeholder that reads as a name, and nothing
 * suggests one.
 */

export const WORKSPACE = {
  /** The switcher's accessible name. */
  switcher: 'Workspace',
  unnamed: 'Unnamed workspace',
  ungrouped: 'No workspace group',
  current: 'Current',
  archived: 'Archived',
  newWorkspace: 'New workspace…',
  manage: 'Manage workspaces…',
  /** Why the switcher is disabled. */
  loaded: 'Unload the game in Control to change workspace',
  /** The disabled switcher, read aloud: where you are and why it will not open. */
  disabledName: (name: string, why: string) => `Workspace: ${name}. ${why}`,

  nameLabel: 'Workspace name',
  groupNameLabel: 'Workspace group name',
  create: 'Create',
  rename: 'Rename',
  save: 'Save',

  // The first screen of a library without a named workspace.
  nameTitle: 'Name your workspace',
  nameBody:
    'This library now lives in a workspace. A workspace is one library of teams, domains, questions and games; you can make more later, and copy or move rows between them. Give this one a name.',
  createTitle: 'Create your first workspace',
  createBody:
    'A workspace is one library of teams, domains, questions and games. You can make more later, and copy or move rows between them. Give the first one a name.',
  continue: 'Continue',

  // Manage workspaces
  pageTitle: 'Workspaces',
  many: 'workspaces',
  counts: (c: { teams: number; domains: number; questions: number; games: number }) =>
    [`${c.teams} ${c.teams === 1 ? 'team' : 'teams'}`, `${c.domains} ${c.domains === 1 ? 'domain' : 'domains'}`, `${c.questions} ${c.questions === 1 ? 'question' : 'questions'}`, `${c.games} ${c.games === 1 ? 'game' : 'games'}`].join(' · '),
  emptyGroup: (name: string) => `${name} — no workspaces yet`,
  pageDescription: 'Libraries in this file, and the workspace groups they sit in',
  newGroup: 'New workspace group',
  open: 'Open',
  actions: 'Actions',
  moveToGroup: 'Move to workspace group…',
  duplicate: 'Duplicate…',
  archive: 'Archive',
  restore: 'Restore',
  deletePermanently: 'Delete permanently…',
  renameGroup: 'Rename workspace group',
  deleteGroup: 'Delete workspace group',
  moveUp: 'Move up',
  moveDown: 'Move down',
  groupLabel: 'Workspace group',
  noGroup: 'No workspace group',
  duplicateTitle: 'Duplicate workspace',
  duplicateBody: 'Copies every row and game of this workspace into a new one. Plays are not copied.',
  newTitle: 'New workspace',
  renameTitle: 'Rename workspace',
  newGroupTitle: 'New workspace group',
  renameGroupTitle: 'Rename workspace group',
  moveTitle: 'Move to workspace group',
  /** P21.6: the selection strip, as every other library list has. */
  moveManyTitle: (n: number) => `Move ${n} ${n === 1 ? 'workspace' : 'workspaces'} to a workspace group`,
  archivedMany: (n: number) => `Archived ${n} ${n === 1 ? 'workspace' : 'workspaces'}`,
  restoredMany: (n: number) => `Restored ${n} ${n === 1 ? 'workspace' : 'workspaces'}`,
  deleteGroupTitle: 'Delete this workspace group?',
  deleteGroupBody: 'Its workspaces stay, ungrouped.',
  deleteTitle: 'Delete this workspace permanently?',
  deleteBody: (name: string, rows: number, games: number, plays: number) =>
    `${name}: ${rows} ${rows === 1 ? 'row' : 'rows'}, ${games} ${games === 1 ? 'game' : 'games'} and ${plays} ${plays === 1 ? 'Play' : 'Plays'} go for good. The library is backed up first.`,
  deleteConfirm: 'Delete permanently',
  deleteArmed: 'Press again to delete',
  onlyArchived: 'Archive it first',
  isCurrent: 'Open another workspace first',
  deleted: (name: string) => `${name} deleted. A backup was taken first.`,
  createdNotOpened: (name: string) => `${name} created. Open it once the game in Control is unloaded.`,
} as const

/** Copy and move (Beta 2.0, 05_STUDIO_DESIGN.md §21; no shared library since beta.2). */
export const TRANSFER = {
  /** The bulk bar's menu of the two. */
  menu: 'Copy or move…',
  copyTo: 'Copy to…',
  moveTo: 'Move to…',
  copyTitle: 'Copy to another workspace',
  moveTitle: 'Move to another workspace',
  target: 'Workspace',
  noOther: 'There is no other workspace yet. Create one from the switcher.',
  picked: (n: number) => `${n} picked`,
  comesAlong: (n: number) => `${n} more ${n === 1 ? 'row comes' : 'rows come'} along, so nothing points at a row the workspace cannot see`,
  reused: (n: number) => `${n} already ${n === 1 ? 'has a copy' : 'have copies'} there and ${n === 1 ? 'is' : 'are'} reused`,
  refused: 'Cannot go — still used by:',
  copyInstead: 'Copy instead',
  withDomains: 'Bring their domains',
  withDomainsHint: 'Each question arrives in its domain there: the copy that is already there, or a new one holding only these questions.',
  joins: (names: string) => `Added to ${names} there`,
  creates: (names: string) => `New there: ${names}, with only these questions`,
  twins: (where: string, what: string) => `${where} already has a ${what}. Both will be there.`,
  noDomain: 'Questions arrive in no domain, unless a domain you picked holds them.',
  confirmCopy: 'Copy',
  confirmMove: 'Move',
  done: (n: number) => `Done: ${n} picked, with what ${n === 1 ? 'it needs' : 'they need'}`,
  unfollow: 'Stop following its copies',
  copiesTitle: (n: number) => (n === 1 ? 'A copy elsewhere' : `${n} copies elsewhere`),
  copiesHint: 'Saving this row can update its copies. Stop following, and it is a row of its own.',
  unnamedWorkspace: 'An unnamed workspace',
} as const

/** The editor's confirm when a saved row has copies (Beta 2.0). */
export const PROPAGATE = {
  title: 'This row has copies',
  body: (names: string) => `Copies live in ${names}.`,
  hereOnly: 'Save here only',
  alsoCopies: (n: number, skipped: number) =>
    skipped > 0 ? `Also update ${n} ${n === 1 ? 'copy' : 'copies'} (${skipped} skipped)` : `Also update ${n} ${n === 1 ? 'copy' : 'copies'}`,
  skipped: (where: string, why: string) => `Skipped in ${where}: ${why}`,
} as const
