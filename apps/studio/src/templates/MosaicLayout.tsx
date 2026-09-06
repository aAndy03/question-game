import type { ReactNode } from 'react'
import { Mosaic, MosaicWindow, type MosaicNode } from 'react-mosaic-component'

export interface MosaicLayoutProps<T extends string> {
  /** The tree, persisted by the caller. */
  value: MosaicNode<T> | null
  onChange: (next: MosaicNode<T> | null) => void
  /** Title per tile. */
  titles: Readonly<Record<T, string>>
  /** The tile body. */
  renderTile: (id: T) => ReactNode
  /** Extra controls in a tile's title bar. */
  renderControls?: ((id: T) => ReactNode) | undefined
  /** Above the mosaic: display pickers, settings float. */
  top?: ReactNode
}

/**
 * The Control mosaic: `react-mosaic` restyled onto the Studio tokens
 * (`packages/design-studio/mosaic.css`). Drag a title bar to re-split, drop
 * on a tile to stack as tabs, drag a divider to resize. The template holds
 * no knowledge of what a tile is.
 */
export function MosaicLayout<T extends string>({ value, onChange, titles, renderTile, renderControls, top }: MosaicLayoutProps<T>) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {top ? <div className="shrink-0 border-b border-[var(--border)] px-4 py-2">{top}</div> : null}
      <div className="min-h-0 flex-1 p-1">
        <Mosaic<T>
          className="questiongame-mosaic"
          value={value}
          onChange={onChange}
          renderTile={(id, path) => (
            <MosaicWindow<T> path={path} title={titles[id]} toolbarControls={renderControls ? renderControls(id) : <span />}>
              {renderTile(id)}
            </MosaicWindow>
          )}
        />
      </div>
    </div>
  )
}
