import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDebouncedCallback } from '@tanstack/react-pacer'
import {
  applyToAllScreens,
  layoutNodes,
  parseLayout,
  type NodeStyle,
  type ScreenBox,
  type StageDecorSettings,
  type StageLayout,
  type StageScreen,
} from '@questiongame/contract'
import { Button, Panel, StatusDot, Text } from '@/atoms'
import { DecorDials, NodeInspector, ScreenTabs } from '@/molecules'
import { SCREENS_TAB } from '@/copy'
import { useHostCommand } from '@/host/commands'
import { previewPlay } from '@/host/previewPlay'
import { useCatalogList, useRecipe } from '@/host/queries'
import { ScreensCanvas } from './ScreensCanvas'

export interface LayoutEditorProps {
  recipeId: string
  /** Slots the page composes around the editor. */
  render: (parts: { toolbar: React.ReactNode; canvas: React.ReactNode; inspector: React.ReactNode }) => React.ReactNode
}

/**
 * The Screens workshop's state: the recipe's layout as a draft, one node
 * selected, every change debounced 400ms into one `recipe_set_layout` and
 * one `rev` (spec §2.10). Leaving mid-debounce flushes.
 */
export function LayoutEditor({ recipeId, render }: LayoutEditorProps) {
  const recipe = useRecipe(recipeId)
  const teams = useCatalogList('team', 'all')
  const domains = useCatalogList('domain', 'all')
  const questions = useCatalogList('question', 'all')
  const run = useHostCommand()

  const [screen, setScreen] = useState<StageScreen>('idle')
  const [selected, setSelected] = useState<string | null>(null)
  const [draft, setDraft] = useState<StageLayout | null>(null)
  const [saving, setSaving] = useState(false)
  const dirty = useRef(false)

  // Adopt the recipe's document once per recipe (and after our own save lands
  // as a new rev, which parses to the same draft).
  useEffect(() => {
    if (recipe.data && !dirty.current) setDraft(parseLayout(recipe.data.layout))
  }, [recipe.data])

  const save = useCallback(
    async (layout: StageLayout) => {
      setSaving(true)
      const ok = await run('recipe_set_layout', { id: recipeId, layout })
      if (ok !== null) dirty.current = false
      setSaving(false)
    },
    [recipeId, run],
  )
  const debouncedSave = useDebouncedCallback((layout: StageLayout) => void save(layout), { wait: 400 })
  const latest = useRef<StageLayout | null>(null)
  useEffect(
    () => () => {
      if (dirty.current && latest.current) void save(latest.current)
    },
    [save],
  )

  const update = (next: StageLayout) => {
    dirty.current = true
    latest.current = next
    setDraft(next)
    debouncedSave(next)
  }

  const layout = draft ?? parseLayout(recipe.data?.layout)
  const setNode = (id: string, style: NodeStyle | null) => {
    const nodes = { ...layout.nodes }
    if (style === null) delete nodes[id]
    else nodes[id] = style
    update({ ...layout, nodes })
  }
  const nudge = (id: string, dx: number, dy: number) => {
    const s = layout.nodes[id] ?? {}
    setNode(id, { ...s, dx: (s.dx ?? 0) + dx, dy: (s.dy ?? 0) + dy })
  }
  const setDecor = (decor: StageDecorSettings) => update({ ...layout, decor })
  const setBox = (box: ScreenBox | undefined) => {
    const screens = { ...layout.screens }
    if (box === undefined) delete screens[screen]
    else screens[screen] = box
    update({ ...layout, screens })
  }

  const preview = useMemo(
    () =>
      recipe.data
        ? previewPlay({ recipe: recipe.data, teams: teams.data ?? [], domains: domains.data ?? [], questions: questions.data ?? [] }, screen, layoutNodes(layout))
        : null,
    [recipe.data, teams.data, domains.data, questions.data, screen, layout],
  )
  const overridden = useMemo(() => new Set(Object.keys(layout.nodes)), [layout.nodes])
  const counts = useMemo(() => {
    const out: Partial<Record<StageScreen, number>> = {}
    for (const id of Object.keys(layout.nodes)) {
      const s = id.split('.')[0] as StageScreen
      out[s] = (out[s] ?? 0) + 1
    }
    return out
  }, [layout.nodes])

  const toolbar = (
    <>
      <ScreenTabs value={screen} onChange={(s) => { setScreen(s); setSelected(null) }} counts={counts} />
      <div className="flex-1" />
      <span className="flex items-center gap-2">
        <StatusDot tone={saving ? 'warning' : 'success'} pulse={saving} />
        <Text variant="studio-caption" tone="muted">
          {saving ? SCREENS_TAB.saving : SCREENS_TAB.saved(recipe.data?.rev ?? 0)}
        </Text>
      </span>
    </>
  )

  const canvas = preview ? (
    <ScreensCanvas preview={preview} selectedId={selected} overriddenIds={overridden} onSelect={setSelected} onNudge={nudge} />
  ) : null

  const inspector = (
    <div className="flex flex-col gap-4">
      <Panel variant="secondary" className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Text variant="studio-heading">{SCREENS_TAB.inspector}</Text>
          <Text variant="studio-caption" tone="muted">
            {SCREENS_TAB.overridden(Object.keys(layout.nodes).length)}
          </Text>
        </div>
        <NodeInspector
          nodeId={selected}
          style={selected ? layout.nodes[selected] : undefined}
          onChange={(style) => selected && setNode(selected, style)}
          onApplyAll={() => {
            if (!selected) return
            update(applyToAllScreens(layout, selected, layout.nodes[selected] ?? null).layout)
          }}
          onReset={() => selected && setNode(selected, null)}
        />
      </Panel>
      <Panel variant="secondary" className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <Text variant="studio-heading">{SCREENS_TAB.decor}</Text>
          <Text variant="studio-caption" tone="muted">
            {SCREENS_TAB.decorHint}
          </Text>
        </div>
        <DecorDials decor={layout.decor} onDecorChange={setDecor} screen={screen} box={layout.screens[screen]} onBoxChange={setBox} />
      </Panel>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="ghost"
          icon="undo"
          onPress={() => {
            const nodes = Object.fromEntries(Object.entries(layout.nodes).filter(([id]) => !id.startsWith(`${screen}.`)))
            const screens = { ...layout.screens }
            delete screens[screen]
            update({ ...layout, nodes, screens })
          }}
        >
          {SCREENS_TAB.resetScreen}
        </Button>
        <Button size="sm" variant="ghost" icon="undo" onPress={() => update({ ...layout, nodes: {}, screens: {} })}>
          {SCREENS_TAB.resetAll}
        </Button>
      </div>
    </div>
  )

  return <>{render({ toolbar, canvas, inspector })}</>
}
