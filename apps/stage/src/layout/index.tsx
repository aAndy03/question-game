/**
 * The recipe's Screens-tab overrides, applied on Stage (spec §12, §17;
 * 05_STUDIO_DESIGN.md §11.2).
 *
 * `play-state.layout` arrives as `{ nodes, screens }`, already shaped by
 * `packages/contract`. A `LayoutProvider` at the root hands it down and
 * `applyLayout` (`apply.ts`) writes each node's entry onto the element that
 * carries its `data-node-id`, so an override wins over the built-in look and
 * no component knows a layout exists. `useScreenBox` is the one hook: the
 * decor field reads its boundary and anchor through it. A recipe with no
 * overrides writes nothing and leaves the tree byte-identical.
 */

import { createContext, useContext, type ReactNode } from 'react'
import {
  EMPTY_LAYOUT_NODES,
  parseLayout,
  type ScreenBox,
  type StageLayoutNodes,
  type StageScreen,
} from '@questiongame/contract'

const LayoutContext = createContext<StageLayoutNodes>(EMPTY_LAYOUT_NODES)

export function LayoutProvider({ layout, children }: { layout: StageLayoutNodes | undefined; children: ReactNode }) {
  // Validate on receipt: the host passes the document through untouched.
  const safe = layout ? parseLayout({ nodes: layout.nodes, screens: layout.screens, text: layout.text }) : null
  return <LayoutContext.Provider value={safe ? { nodes: safe.nodes, screens: safe.screens, text: safe.text } : EMPTY_LAYOUT_NODES}>{children}</LayoutContext.Provider>
}

/** The decor field's box for a screen, when the recipe overrides it. */
export function useScreenBox(screen: StageScreen): ScreenBox | undefined {
  return useContext(LayoutContext).screens[screen]
}

export { applyLayout, overrideProps } from './apply'
