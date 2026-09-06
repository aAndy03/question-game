/**
 * Studio atoms — thin, variant-pinned wrappers over HeroUI v3
 * (docs/v1/05_STUDIO_DESIGN.md §4.1). One element each, props in, markup
 * out; no play-state, no host calls (enforced in eslint.config.js).
 */

export { Icon, type IconProps, type IconSize } from './Icon'
export { ICONS, type IconName } from './icons'
export { Button, IconButton, type ButtonProps, type ButtonVariant, type ButtonSize, type IconButtonProps } from './Button'
export { Text, type TextProps, type TextTone, type StudioTextVariant } from './Text'
export { Chip, MeaningChip, CHIP_TONES, type ChipProps, type ChipTone, type ChipMeaning } from './Chip'
export { StatusDot, type StatusDotProps, type DotTone } from './StatusDot'
export { Kbd, type KbdProps } from './Kbd'
export { Avatar, InitialsAvatar, type AvatarProps, type TeamMarkData } from './Avatar'
export { Swatch, type SwatchProps } from './Swatch'
export { Panel, type PanelProps, type PanelVariant, type PanelDensity } from './Panel'
export { Separator } from './Separator'
export { Skeleton, type SkeletonShape } from './Skeleton'
export { Spinner } from './Spinner'
export { Tooltip, DisabledReason, type TooltipProps } from './Tooltip'
export { TextField, type TextFieldProps, type FieldFrameProps } from './TextField'
export { TextAreaField, type TextAreaFieldProps } from './TextAreaField'
export { NumberField, type NumberFieldProps } from './NumberField'
export { SelectField, type SelectFieldProps, type SelectOption } from './SelectField'
export { SwitchField, type SwitchFieldProps } from './SwitchField'
export { CheckboxField, type CheckboxFieldProps } from './CheckboxField'
export { SliderField, type SliderFieldProps } from './SliderField'
export { TransportButton, type TransportButtonProps, type TransportState } from './TransportButton'
export { HitTarget, type HitTargetProps } from './HitTarget'
export { PinField, PIN_SHAPE, type PinFieldProps } from './PinField'
export { ChordField, chordFromKeyboardEvent, type ChordFieldProps } from './ChordField'
export { SegmentedField, type SegmentedFieldProps, type SegmentedOption } from './SegmentedField'
export { DurationField, type DurationFieldProps } from './DurationField'
export { OptionalNumberField, type OptionalNumberFieldProps } from './OptionalNumberField'
