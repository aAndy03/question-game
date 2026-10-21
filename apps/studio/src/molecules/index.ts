/**
 * Studio molecules — two to five atoms bound to one job
 * (docs/v1/05_STUDIO_DESIGN.md §4.2). Local presentational state only; no
 * play-state, no host calls (enforced in eslint.config.js).
 */

export { PageHeader, type PageHeaderProps } from './PageHeader'
export { ViewSwitch, type ViewSwitchProps } from './ViewSwitch'
export { ArchiveToggle, type ArchiveToggleProps, type ArchiveView } from './ArchiveToggle'
export { SearchField, type SearchFieldProps } from './SearchField'
export { EmptyState, type EmptyStateProps, type EmptyKind } from './EmptyState'
export { InlineNotice, type InlineNoticeProps, type ConfirmFrameView } from './InlineNotice'
export { ConfirmDialog, CONFIRM_MAX_DEPTH, type ConfirmDialogProps, type ConfirmFrame } from './ConfirmDialog'
export { NameDialog, type NameDialogProps } from './NameDialog'
export { TagField, type TagFieldProps } from './TagField'
export { DirtyGuard, type DirtyGuardProps } from './DirtyGuard'
export { DifficultyDialog, acceptsDifficulty, type DifficultyDialogProps } from './DifficultyDialog'
export { SidebarItem, type SidebarItemProps } from './SidebarItem'
export { NavCrumbs, type NavCrumbsProps, type Crumb } from './NavCrumbs'
export { MetaList, type MetaListProps, type MetaItem } from './MetaList'
export { StatCard, type StatCardProps } from './StatCard'
export { SettingRow, disabledReasonText, type SettingRowProps } from './SettingRow'
export { TeamMark, type TeamMarkProps } from './TeamMark'
export { OperatorBadge, type OperatorBadgeProps } from './OperatorBadge'
export { PlayStatusPill, type PlayStatusPillProps } from './PlayStatusPill'
export { ActionMenu, type ActionMenuProps, type ActionItem } from './ActionMenu'
export { RecordRow, type RecordRowProps, type RecordLayout } from './RecordRow'
export { BulkBar, type BulkAction, type BulkBarProps } from './BulkBar'
export {
  ActiveFilters,
  FilterMenu,
  GroupHeader,
  GroupMenu,
  PageFooter,
  SortMenu,
  pageLinks,
  type ChangedWindow,
  type FilterControl,
  type FilterControlValue,
  type PageSizeChoice,
} from './ListControls'
export { DifficultyField, type DifficultyFieldProps } from './DifficultyField'
export { IncompleteMark, type IncompleteMarkProps } from './IncompleteMark'
export { GapNotice, type GapNoticeProps } from './GapNotice'
export { OptionRow, type OptionRowProps } from './OptionRow'
export { DomainForm, suggestDomainCode, type DomainFormProps, type DomainFormValue } from './DomainForm'
export { DomainPicker, type DomainPickerProps, type PickableDomain } from './DomainPicker'
export { EditorFooter, type EditorFooterProps } from './EditorFooter'
export { TimerCluster, type TimerClusterProps } from './TimerCluster'
export { RevealControls, type RevealControlsProps } from './RevealControls'
export { RingRow, type RingRowProps, type RingRowVariant } from './RingRow'
export { ScreenStrip, type ScreenStripProps } from './ScreenStrip'
export { OverlayStrip, type OverlayStripProps } from './OverlayStrip'
export { MosaicPanel, type MosaicPanelProps, type PanelBox, type PanelDensity, type PanelDensity as MosaicDensity , type MosaicDensityFloor } from './MosaicPanel'
export { DisplayPicker, type DisplayPickerProps } from './DisplayPicker'
export { EventRow, type EventRowProps } from './EventRow'
export { ScreenTabs, canvasOverlay, canvasScreen, type CanvasView, type ScreenTabsProps } from './ScreenTabs'
export { TextInspector, type TextInspectorProps } from './TextInspector'
export { NodeHandle, type NodeHandleProps } from './NodeHandle'
export { NodeInspector, type NodeInspectorProps } from './NodeInspector'
export { DecorDials, type DecorDialsProps } from './DecorDials'
export { SettingsGroup, type SettingsGroupProps } from './SettingsGroup'
export { DifficultyMapField, type DifficultyMapFieldProps } from './DifficultyMapField'
export { CueMapRow, CUE_MUTED, type CueMapRowProps } from './CueMapRow'
export { MonitorCard, type MonitorCardProps, type MonitorCardState } from './MonitorCard'
export { PathRow, type PathRowProps } from './PathRow'
export { PinPrompt, type PinPromptProps } from './PinPrompt'
export { ShortcutRow, type ShortcutRowProps } from './ShortcutRow'
export { WizardSteps, type WizardStepsProps, type WizardStep } from './WizardSteps'
export { StatsTable, formatMetric, seriesOf, type StatsTableProps } from './StatsTable'
export { StatsCards, type StatsCardsProps } from './StatsCards'
export { StatsChart, type StatsChartProps } from './StatsChart'
export { StatsFilterBar, windowBounds, type StatsFilterBarProps, type TimeWindow } from './StatsFilterBar'
export { AwardMatrix, BandLadder, workingOf, type AwardMatrixProps } from './AwardMatrix'
export { RuleEffects, type RuleEffectsProps } from './RuleEffects'
export { BoardBalance, type BoardBalanceProps } from './BoardBalance'
export { SpeedWindowField, type SpeedWindowFieldProps } from './SpeedWindowField'
