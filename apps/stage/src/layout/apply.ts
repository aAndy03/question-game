/**
 * Apply the recipe's node overrides to the DOM (05_STUDIO_DESIGN.md §11.2).
 *
 * One applier at the Stage root, instead of a hook in fourteen components:
 * every element carrying `data-node-id` gets its override as inline style,
 * and a `MutationObserver` re-applies after React re-renders a node or a
 * page mounts. Offsets use the `translate` property, not `transform`, so a
 * GSAP timeline animating `transform` on the same element is never fought.
 *
 * Nothing is written when there is no override, so a recipe without a
 * layout leaves the tree byte-identical.
 */

import type { NodeStyle, StageLayoutNodes } from '@questiongame/contract'

const COLOR_TOKENS: Readonly<Record<string, string>> = {
  ink: 'var(--ink)',
  paper: 'var(--paper)',
  muted: 'var(--text-muted)',
  correct: 'var(--state-correct)',
  incorrect: 'var(--state-incorrect)',
  info: 'var(--state-info)',
  leader: 'var(--state-leader)',
  accent: 'var(--state-accent)',
}

type Prop = 'fontSize' | 'color' | 'fontFamily' | 'translate' | 'width' | 'height' | 'visibility'
const PROPS: readonly Prop[] = ['fontSize', 'color', 'fontFamily', 'translate', 'width', 'height', 'visibility']

export function overrideProps(style: NodeStyle | undefined): Partial<Record<Prop, string>> {
  if (!style) return {}
  const out: Partial<Record<Prop, string>> = {}
  if (style.fontSize !== undefined) out.fontSize = `${style.fontSize}px`
  if (style.color !== undefined) out.color = COLOR_TOKENS[style.color] ?? style.color
  if (style.fontFamily !== undefined) out.fontFamily = style.fontFamily === 'mono' ? 'var(--font-mono)' : 'var(--font-display)'
  if (style.dx !== undefined || style.dy !== undefined) out.translate = `${style.dx ?? 0}px ${style.dy ?? 0}px`
  if (style.width !== undefined) out.width = `${style.width}px`
  if (style.height !== undefined) out.height = `${style.height}px`
  if (style.hidden) out.visibility = 'hidden'
  return out
}

/** What this applier last wrote on an element, so a removed key is cleared. */
const applied = new WeakMap<HTMLElement, Set<Prop>>()

function applyTo(el: HTMLElement, style: NodeStyle | undefined): void {
  const next = overrideProps(style)
  const before = applied.get(el) ?? new Set<Prop>()
  const after = new Set<Prop>()
  for (const prop of PROPS) {
    const value = next[prop]
    if (value !== undefined) {
      if (el.style[prop] !== value) el.style[prop] = value
      after.add(prop)
    } else if (before.has(prop)) {
      el.style[prop] = ''
    }
  }
  if (after.size > 0) applied.set(el, after)
  else applied.delete(el)
}

/** Start applying `layout.nodes` under `root`; returns a stop function. */
export function applyLayout(root: HTMLElement, layout: StageLayoutNodes): () => void {
  const current = layout
  const run = () => {
    for (const el of root.querySelectorAll<HTMLElement>('[data-node-id]')) {
      const id = el.dataset['nodeId']
      if (!id) continue
      applyTo(el, current.nodes[id])
    }
  }
  run()
  const observer = new MutationObserver((records) => {
    // A style write of our own produces an attribute record; only re-run when
    // something else changed, which is what a React re-render looks like.
    if (records.some((r) => r.type === 'childList' || (r.type === 'attributes' && r.attributeName !== 'style'))) run()
    else if (records.some((r) => r.type === 'attributes')) {
      for (const r of records) {
        const el = r.target as HTMLElement
        const id = el.dataset?.['nodeId']
        if (id && current.nodes[id]) applyTo(el, current.nodes[id])
      }
    }
  })
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'data-node-id'] })
  return () => observer.disconnect()
}
