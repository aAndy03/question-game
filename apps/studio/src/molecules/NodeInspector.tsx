import type { NodeStyle } from '@questiongame/contract'
import { Button, NumberField, SelectField, SwitchField, Text, TextField } from '@/atoms'
import { SCREENS_TAB } from '@/copy'

export interface NodeInspectorProps {
  nodeId: string | null
  style: NodeStyle | undefined
  onChange: (style: NodeStyle | null) => void
  onApplyAll: () => void
  onReset: () => void
}

const TOKENS = ['ink', 'paper', 'muted', 'correct', 'incorrect', 'info', 'leader', 'accent'] as const
const BUILT_IN = '__builtin'
const CUSTOM = '__custom'

/** The style form for one node (05_STUDIO_DESIGN.md §11.3). Every field has a built-in state. */
export function NodeInspector({ nodeId, style, onChange, onApplyAll, onReset }: NodeInspectorProps) {
  if (!nodeId) {
    return (
      <Text variant="studio-body" tone="muted">
        {SCREENS_TAB.noSelection}
      </Text>
    )
  }
  const s = style ?? {}
  const set = (patch: { [K in keyof NodeStyle]?: NodeStyle[K] | undefined }) => {
    const next: Record<string, unknown> = { ...s, ...patch }
    for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k]
    onChange(Object.keys(next).length === 0 ? null : (next as NodeStyle))
  }
  const colorMode = s.color === undefined ? BUILT_IN : (TOKENS as readonly string[]).includes(s.color) ? s.color : CUSTOM

  return (
    <div className="flex flex-col gap-4" data-node-inspector={nodeId}>
      <div className="flex flex-col gap-0.5">
        <Text variant="studio-caption" tone="muted">
          {SCREENS_TAB.node}
        </Text>
        <Text variant="studio-mono">{nodeId}</Text>
      </div>
      <NumberField label={SCREENS_TAB.fontSize} value={s.fontSize ?? null} onChange={(v) => set({ fontSize: v ?? undefined })} minValue={8} maxValue={400} step={2} description={s.fontSize === undefined ? SCREENS_TAB.builtIn : undefined} />
      <div className="grid grid-cols-[1fr_auto] items-end gap-2">
        <SelectField
          label={SCREENS_TAB.color}
          value={colorMode}
          onChange={(v) => set({ color: v === BUILT_IN ? undefined : v === CUSTOM ? '#000000' : v })}
          options={[
            { value: BUILT_IN, label: SCREENS_TAB.builtIn },
            ...TOKENS.map((t) => ({ value: t, label: SCREENS_TAB.colorTokens[t] })),
            { value: CUSTOM, label: SCREENS_TAB.colorCustom },
          ]}
        />
        {colorMode === CUSTOM ? <TextField label={SCREENS_TAB.color} hideLabel value={s.color ?? ''} onChange={(color) => set({ color })} font="mono" className="w-28" /> : null}
      </div>
      <SelectField
        label={SCREENS_TAB.fontFamily}
        value={s.fontFamily ?? BUILT_IN}
        onChange={(v) => set({ fontFamily: v === BUILT_IN ? undefined : (v as 'display' | 'mono') })}
        options={[
          { value: BUILT_IN, label: SCREENS_TAB.builtIn },
          { value: 'display', label: SCREENS_TAB.families.display },
          { value: 'mono', label: SCREENS_TAB.families.mono },
        ]}
      />
      <div className="flex flex-col gap-1">
        <Text variant="studio-label">{SCREENS_TAB.offset}</Text>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label={SCREENS_TAB.dials.x} value={s.dx ?? null} onChange={(v) => set({ dx: v ?? undefined })} minValue={-1920} maxValue={1920} step={4} />
          <NumberField label={SCREENS_TAB.dials.y} value={s.dy ?? null} onChange={(v) => set({ dy: v ?? undefined })} minValue={-1080} maxValue={1080} step={4} />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Text variant="studio-label">{SCREENS_TAB.size}</Text>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label={SCREENS_TAB.width} value={s.width ?? null} onChange={(v) => set({ width: v ?? undefined })} minValue={1} maxValue={1920} step={4} />
          <NumberField label={SCREENS_TAB.height} value={s.height ?? null} onChange={(v) => set({ height: v ?? undefined })} minValue={1} maxValue={1080} step={4} />
        </div>
      </div>
      <SwitchField label={SCREENS_TAB.hidden} isSelected={Boolean(s.hidden)} onChange={(hidden) => set({ hidden: hidden ? true : undefined })} />
      <div className="flex flex-wrap gap-2 border-t border-[var(--separator)] pt-3">
        <Button size="sm" variant="secondary" icon="duplicate" onPress={onApplyAll} isDisabled={!style}>
          {SCREENS_TAB.applyAll}
        </Button>
        <Button size="sm" variant="ghost" icon="undo" onPress={onReset} isDisabled={!style}>
          {SCREENS_TAB.resetNode}
        </Button>
      </div>
      <Text variant="studio-caption" tone="muted">
        {SCREENS_TAB.applyAllHint}
      </Text>
    </div>
  )
}
