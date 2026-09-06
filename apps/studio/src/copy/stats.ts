/**
 * Statistics copy (P11, 05_STUDIO_DESIGN.md §13). Vocabulary from
 * docs/v1/03_CONTEXT.md — Play, Game, Team, Domain, Question, Operator.
 *
 * No imports, like every copy module: an atom may read it.
 */

export const STATS = {
  views: {
    live: 'Live',
    all: 'All data',
    liveHint: 'The Play on the desk right now.',
    allHint: 'Every Play that has been run.',
  },

  /** Column and axis labels, keyed by the host's metric name. */
  metrics: {
    turns: 'Turns',
    correct: 'Correct',
    incorrect: 'Wrong',
    partial: 'Partial',
    accuracy: 'Accuracy',
    points: 'Points',
    bonus: 'Bonus',
    avg_points: 'Points / turn',
    avg_lock_ms: 'Avg lock',
    fastest_lock_ms: 'Fastest lock',
    plays: 'Plays',
  } as Readonly<Record<string, string>>,

  /** What a row stands for, keyed by the host's dimension name. */
  dimensions: {
    team: 'Team',
    domain: 'Domain',
    question: 'Question',
    difficulty: 'Difficulty',
    operator: 'Operator',
    recipe: 'Game',
    play: 'Play',
    day: 'Day',
  } as Readonly<Record<string, string>>,

  filters: {
    title: 'Filters',
    time: 'Time',
    allTime: 'All time',
    last7: 'Last 7 days',
    last30: 'Last 30 days',
    thisYear: 'This year',
    game: 'Game',
    team: 'Team',
    domain: 'Domain',
    verdict: 'Verdict',
    anyGame: 'Any game',
    anyTeam: 'Any team',
    anyDomain: 'Any domain',
    anyVerdict: 'Any verdict',
    rehearsals: 'Include rehearsals',
    rehearsalsHint: 'A Play with one team. Legal, and it skews an average.',
    clear: 'Clear filters',
    groupBy: 'Group by',
    columns: 'Columns',
  },

  verdicts: {
    correct: 'Correct',
    incorrect: 'Wrong',
    partial: 'Partial',
  } as Readonly<Record<string, string>>,

  table: {
    label: 'Statistics results',
    row: 'Row',
    total: 'Total',
    turns: (n: number) => `${n} ${n === 1 ? 'turn' : 'turns'}`,
    plays: (n: number) => `${n} ${n === 1 ? 'Play' : 'Plays'}`,
    /** A metric with nothing to average — never rendered as a zero. */
    none: '—',
  },

  live: {
    noPlay: 'No Play is open.',
    noPlayHint: 'Load a game into Control to watch it here.',
    goToControl: 'Go to Control',
    score: 'Score',
    turnsTaken: 'Turns',
    accuracy: 'Accuracy',
    questionsLeft: 'Questions left',
    round: 'Round',
    leaderboard: 'By team',
    byDomain: 'By domain',
    rehearsal: 'Rehearsal: one team',
  },

  chart: {
    label: 'Statistics chart',
    none: 'Nothing to chart yet.',
  },

  empty: {
    what: 'statistics',
    body: 'No resolved turn matches these filters yet.',
  },

  window: {
    title: 'Statistics',
    /** The Monitors row (§13.3). */
    display: 'Statistics display',
    displayHint: 'A second window with these numbers, on a display of its own. Never a second Stage.',
    none: 'Not shown',
    sameAsStage: 'That display is showing Stage.',
  },
} as const
