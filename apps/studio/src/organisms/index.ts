/**
 * Studio organisms — self-contained regions, the first level allowed to
 * read `play-state` and dispatch commands (docs/v1/05_STUDIO_DESIGN.md §4.3).
 */

export { SidebarNav, SIDEBAR_WIDTH } from './SidebarNav'
export { TopBar } from './TopBar'
export { StatusBar } from './StatusBar'
export { NoticeCollector } from './NoticeCollector'
export { LibraryList, type LibraryListProps, type RecordView } from './LibraryList'
export { TeamEditor, TEAM_PALETTE } from './TeamEditor'
export { TeamDetail } from './TeamDetail'
export { OperatorEditor } from './OperatorEditor'
export { OperatorDetail } from './OperatorDetail'
export { QuestionEditor } from './QuestionEditor'
export { QuestionDetail } from './QuestionDetail'
export { DomainPane } from './DomainPane'
export { RosterSection } from './RosterSection'
export { BoardSection } from './BoardSection'
export { RulesSection } from './RulesSection'
export { PlaysSection } from './PlaysSection'
export { DevHarness } from './DevHarness'
export { useDraft, useDirtyGuard, type Draft } from './useDraft'
export { useArchive, type ArchiveController } from './useArchive'
