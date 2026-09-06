import type { CueKey } from '@questiongame/contract'
import { IconButton, SelectField, Text } from '@/atoms'
import { SETTINGS } from '@/copy/settings'

/** The Select's value for "this cue plays nothing". Never reaches the host: it becomes `null`. */
export const CUE_MUTED = '__muted'

export interface CueMapRowProps {
  cue: CueKey
  /** The file inside the bundled pack, or `null` for a muted cue. */
  file: string | null
  /** The bundled pack's files. */
  files: readonly string[]
  onChange: (file: string | null) => void
  /** Audition the file in Studio — the one place Studio makes a sound (§12.5). */
  onPreview: () => void
  isPreviewing?: boolean | undefined
  isDisabled?: boolean | undefined
  disabledReason?: string | null | undefined
}

/** One cue of the Cue map: label · file select (with *Muted*) · preview. */
export function CueMapRow({ cue, file, files, onChange, onPreview, isPreviewing, isDisabled, disabledReason }: CueMapRowProps) {
  const options = [
    { value: CUE_MUTED, label: SETTINGS.cueMuted },
    ...files.map((f) => ({ value: f, label: f })),
  ]
  const label = SETTINGS.cue[cue]
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,14rem)_2.5rem] items-center gap-3 py-2" data-cue-row={cue}>
      <Text variant="studio-label" truncate>
        {label}
      </Text>
      <SelectField
        label={SETTINGS.cueFile(label)}
        hideLabel
        value={file ?? CUE_MUTED}
        onChange={(next) => onChange(next === CUE_MUTED ? null : next)}
        options={options}
        isDisabled={isDisabled}
        disabledReason={disabledReason}
      />
      <IconButton
        icon={isPreviewing ? 'pause' : 'play'}
        label={isPreviewing ? SETTINGS.cueStopPreview : SETTINGS.cuePreview}
        size="sm"
        onPress={onPreview}
        isDisabled={isDisabled || file === null}
        disabledReason={disabledReason ?? (file === null ? SETTINGS.cueMuted : null)}
      />
    </div>
  )
}
