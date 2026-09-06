import type { ScreenBox, StageDecorSettings, StageScreen } from '@questiongame/contract'
import { NumberField, SelectField, SliderField, SwitchField, Text } from '@/atoms'
import { SCREENS, SCREENS_TAB } from '@/copy'

export interface DecorDialsProps {
  decor: StageDecorSettings
  onDecorChange: (decor: StageDecorSettings) => void
  screen: StageScreen
  box: ScreenBox | undefined
  onBoxChange: (box: ScreenBox | undefined) => void
}

const D = SCREENS_TAB.dials

/**
 * The decor physics dials (roadmap P9), bound to `layout.decor` plus this
 * screen's boundary box and anchor point. Every change is live on the canvas
 * and saved with the recipe. The sliders are the design system's own
 * (`SliderField`), so the dials read like every other Studio form.
 */
export function DecorDials({ decor, onDecorChange, screen, box, onBoxChange }: DecorDialsProps) {
  const set = (patch: Partial<StageDecorSettings>) => onDecorChange({ ...decor, ...patch })
  const setAnchor = (patch: Partial<StageDecorSettings['anchor']>) => set({ anchor: { ...decor.anchor, ...patch } })
  const boundary = box?.boundary
  const anchorPoint = box?.anchor
  const setBox = (patch: { boundary?: ScreenBox['boundary'] | undefined; anchor?: ScreenBox['anchor'] | undefined }) => {
    const next: Record<string, unknown> = { ...box }
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete next[k]
      else next[k] = v
    }
    onBoxChange(Object.keys(next).length === 0 ? undefined : (next as ScreenBox))
  }

  return (
    <div className="flex flex-col gap-4" data-decor-dials>
      <SelectField
        label={D.mode}
        value={decor.mode}
        onChange={(mode) => set({ mode })}
        options={[
          { value: 'collide', label: D.modes.collide },
          { value: 'collide-attract', label: D.modes['collide-attract'] },
        ]}
      />
      <SliderField label={D.drift} value={decor.drift} onChange={(drift) => set({ drift })} minValue={0} maxValue={120} step={1} />
      <SliderField label={D.attraction} value={decor.attraction} onChange={(attraction) => set({ attraction })} minValue={0} maxValue={1} step={0.05} isDisabled={decor.mode !== 'collide-attract'} disabledReason={decor.mode !== 'collide-attract' ? D.modes['collide-attract'] : null} />
      <SliderField label={D.bounce} value={decor.bounce} onChange={(bounce) => set({ bounce })} minValue={0} maxValue={1} step={0.05} />
      <SliderField label={D.spin} value={decor.spin} onChange={(spin) => set({ spin })} minValue={0} maxValue={90} step={1} />
      <SliderField label={D.maxSpeed} value={decor.maxSpeed} onChange={(maxSpeed) => set({ maxSpeed })} minValue={0} maxValue={400} step={5} />

      <div className="flex flex-col gap-3 border-t border-[var(--separator)] pt-3">
        <Text variant="studio-label">{D.anchor}</Text>
        <SwitchField label={D.anchorEnabled} isSelected={decor.anchor.enabled} onChange={(enabled) => setAnchor({ enabled })} />
        <SliderField label={D.attractSeconds} value={decor.anchor.attractSeconds} onChange={(attractSeconds) => setAnchor({ attractSeconds })} minValue={0} maxValue={60} step={1} isDisabled={!decor.anchor.enabled} />
        <SliderField label={D.repelSeconds} value={decor.anchor.repelSeconds} onChange={(repelSeconds) => setAnchor({ repelSeconds })} minValue={0} maxValue={60} step={1} isDisabled={!decor.anchor.enabled} />
        <SliderField label={D.strength} value={decor.anchor.strength} onChange={(strength) => setAnchor({ strength })} minValue={0} maxValue={1} step={0.05} isDisabled={!decor.anchor.enabled} />
      </div>

      <div className="flex flex-col gap-3 border-t border-[var(--separator)] pt-3">
        <Text variant="studio-label">{`${D.box} · ${SCREENS[screen]}`}</Text>
        <SwitchField
          label={D.boundaryOverride}
          isSelected={boundary !== undefined}
          onChange={(on) => setBox({ boundary: on ? { x: 64, y: 64, width: 1792, height: 952 } : undefined })}
        />
        {boundary ? (
          <div className="grid grid-cols-4 gap-2">
            <NumberField label={D.x} value={boundary.x} onChange={(v) => setBox({ boundary: { ...boundary, x: v ?? 0 } })} minValue={-400} maxValue={1920} step={8} />
            <NumberField label={D.y} value={boundary.y} onChange={(v) => setBox({ boundary: { ...boundary, y: v ?? 0 } })} minValue={-400} maxValue={1080} step={8} />
            <NumberField label={D.w} value={boundary.width} onChange={(v) => setBox({ boundary: { ...boundary, width: v ?? 1 } })} minValue={1} maxValue={2800} step={8} />
            <NumberField label={D.h} value={boundary.height} onChange={(v) => setBox({ boundary: { ...boundary, height: v ?? 1 } })} minValue={1} maxValue={1900} step={8} />
          </div>
        ) : null}
        <SwitchField label={D.anchorOverride} isSelected={anchorPoint !== undefined} onChange={(on) => setBox({ anchor: on ? { x: 0.5, y: 0.5 } : undefined })} />
        {anchorPoint ? (
          <div className="grid grid-cols-2 gap-3">
            <SliderField label={D.x} value={anchorPoint.x} onChange={(x) => setBox({ anchor: { ...anchorPoint, x } })} minValue={0} maxValue={1} step={0.01} />
            <SliderField label={D.y} value={anchorPoint.y} onChange={(y) => setBox({ anchor: { ...anchorPoint, y } })} minValue={0} maxValue={1} step={0.01} />
          </div>
        ) : null}
      </div>
    </div>
  )
}
