/**
 * Groups inside a domain, tags on questions, bulk edits (Beta, P15). Nothing
 * here suggests a group or tag name: a field starts empty, and the tag picker
 * lists only tags already used.
 */

export const GROUPS_TAGS = {
  group: 'Domain group',
  groups: 'Domain groups',
  noGroup: 'No domain group',
  /** A question's tag — not a game's (beta.5: *Game tag* on the Games tab). */
  tag: 'Question tag',
  tags: 'Tags',
  noTag: 'No tag',

  // the Groups dialog
  groupsButton: 'Domain groups…',
  groupsTitle: (domain: string) => `Domain groups in ${domain}`,
  groupsBody: 'Domain groups organise this domain’s questions. Boards and Plays do not use them.',
  noGroupsYet: 'No domain groups yet.',
  newGroup: 'New domain group',
  groupName: 'Domain group name',
  rename: 'Rename',
  moveUp: 'Move up',
  moveDown: 'Move down',
  deleteGroup: 'Delete domain group',
  deleteGroupTitle: (name: string) => `Delete the domain group ${name}?`,
  deleteGroupBody: (n: number) => (n === 0 ? 'It has no questions.' : `Its ${n} ${n === 1 ? 'question stays' : 'questions stay'} in the domain, in no domain group.`),
  memberCount: (n: number) => `${n} ${n === 1 ? 'question' : 'questions'}`,
  create: 'Create',
  save: 'Save',
  close: 'Close',

  // the editor
  tagsLabel: 'Tags',
  tagsHint: 'Type a tag and press Enter. Tags you have used are offered as you type.',
  tagRemove: (tag: string) => `Remove the tag ${tag}`,
  tagRemoved: (tag: string) => `Removed the tag ${tag}.`,
  tagsOnQuestion: 'Tags on this question',
  tagsOffered: 'Tags already used',
  offeredCount: (n: number) => `${n} ${n === 1 ? 'tag' : 'tags'} already used match.`,
  tagsFull: 'A question has at most 20 tags.',
  tagTooLong: 'A tag is at most 40 characters.',
  groupIn: (domain: string) => `Group in ${domain}`,

  // Manage tags
  manageButton: 'Manage tags…',
  manageTitle: 'Manage tags',
  manageBody: 'Every tag on this workspace’s questions.',
  noTagsYet: 'No tags yet. Add them on a question, or to many at once from the selection’s Edit menu.',
  carried: (n: number) => `${n} ${n === 1 ? 'question' : 'questions'}`,
  renameTitle: (tag: string) => `Rename ${tag}`,
  renameTo: 'New name',
  mergeNote: (into: string, n: number) => `Merged into ${into}. ${n} ${n === 1 ? 'question' : 'questions'} changed.`,
  deleteTagTitle: (tag: string) => `Delete the tag ${tag}?`,
  deleteTagBody: (n: number) => `It comes off ${n} ${n === 1 ? 'question' : 'questions'}.`,
  deleteTag: 'Delete tag',

  // bulk Edit…
  edit: 'Edit…',
  bulkTag: 'Tag…',
  bulkUntag: 'Untag…',
  bulkGroup: 'Group…',
  bulkAdd: 'Add to domain…',
  bulkRemove: 'Remove from domain',
  bulkDifficulty: 'Set difficulty…',
  pickTag: 'Tag',
  pickTagHint: 'A tag already used, or a new one.',
  pickGroup: 'Domain group',
  pickDomain: 'Domain',
  difficulty: 'Difficulty',
  notSet: 'Not set',
  applyTo: (n: number) => `Applies to ${n} ${n === 1 ? 'question' : 'questions'}.`,
  already: (n: number, what: string) => `${n} already ${what}.`,
  alreadyTagged: (tag: string) => `tagged ${tag}`,
  alreadyUntagged: (tag: string) => `without ${tag}`,
  alreadyGrouped: 'in that group',
  notInDomain: (n: number) => `${n} not in this domain.`,
  alreadyInDomain: 'in that domain',
  alreadyOut: 'not in this domain',
  alreadyDifficulty: 'at that difficulty',
  removeBody: 'They stay in the library and in their other domains.',
  difficultyNote: 'A board holding two at one difficulty says so when the game loads.',
  apply: 'Apply',
  done: (n: number) => `${n} ${n === 1 ? 'question' : 'questions'} changed`,
} as const
