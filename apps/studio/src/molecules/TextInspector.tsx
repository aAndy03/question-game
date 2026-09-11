import { TEXT_MAX_LENGTH, type StageLanguage, type StageTextOverrides, type TextKey } from '@questiongame/contract'
import { IconButton, Text, TextField } from '@/atoms'
import { SCREENS_TAB } from '@/copy'

export interface TextInspectorProps {
  /** The keys the selected node edits (`textKeysForNode`). */
  keys: readonly TextKey[]
  /** The recipe's Stage language — the block being edited. */
  language: StageLanguage
  /** That language's overrides. */
  values: StageTextOverrides
  onChange: (key: TextKey, value: string | null) => void
}

/**
 * The authored words a node carries, editable per language (P11.16). An
 * empty field means the built-in word in that language — the canvas shows
 * it, so there is no placeholder to keep in sync with Stage's tables. A
 * node that carries only derived or translated-only text renders nothing.
 */
export function TextInspector({ keys, language, values, onChange }: TextInspectorProps) {
  if (keys.length === 0) return null
  const set = (key: TextKey, raw: string) => onChange(key, raw.trim().length === 0 ? null : raw)
  return (
    <div className="flex flex-col gap-3" data-text-inspector>
      <div className="flex flex-col gap-0.5">
        <Text variant="studio-label">{SCREENS_TAB.text}</Text>
        <Text variant="studio-caption" tone="muted">
          {SCREENS_TAB.textHint(SCREENS_TAB.languageName[language])}
        </Text>
      </div>
      {keys.map((key) => (
        <div key={key} className="grid grid-cols-[1fr_auto] items-end gap-2">
          <TextField
            label={SCREENS_TAB.textKeys[key]}
            value={values[key] ?? ''}
            onChange={(v) => set(key, v)}
            placeholder={SCREENS_TAB.builtIn}
            maxLength={TEXT_MAX_LENGTH}
          />
          <IconButton size="sm" variant="ghost" icon="undo" isDisabled={values[key] === undefined} onPress={() => onChange(key, null)} label={SCREENS_TAB.resetText(SCREENS_TAB.textKeys[key])} />
        </div>
      ))}
    </div>
  )
}
