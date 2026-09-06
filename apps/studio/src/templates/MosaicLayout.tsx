import { useEffect, useRef, type ReactNode } from 'react'
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
  const root = useRef<HTMLDivElement | null>(null)

  // A divider drag is a document-level mousemove; an iframe under the pointer
  // would swallow it. Flag the root for the life of the drag so the
  // stylesheet can turn the iframe's pointer events off.
  useEffect(() => {
    const el = root.current
    if (!el) return
    const mosaic = () => el.querySelector<HTMLElement>('.questiongame-mosaic')
    const start = (event: Event) => {
      if ((event.target as HTMLElement | null)?.closest('.mosaic-split')) mosaic()?.setAttribute('data-resizing', '')
    }
    const end = () => mosaic()?.removeAttribute('data-resizing')
    el.addEventListener('mousedown', start, true)
    el.addEventListener('touchstart', start, true)
    document.addEventListener('mouseup', end, true)
    document.addEventListener('touchend', end, true)
    window.addEventListener('blur', end)
    return () => {
      el.removeEventListener('mousedown', start, true)
      el.removeEventListener('touchstart', start, true)
      document.removeEventListener('mouseup', end, true)
      document.removeEventListener('touchend', end, true)
      window.removeEventListener('blur', end)
    }
  }, [])

  return (
    <div ref={root} className="flex h-full min-h-0 flex-col">
      {top ? <div className="shrink-0 border-b border-[var(--border)] px-4 py-2">{top}</div> : null}
      <div className="min-h-0 flex-1 p-1">
        <Mosaic<T>
          className="questiongame-mosaic"
          value={value}
          onChange={onChange}
          renderTile={(id, path) => (
            <MosaicWindow<T>
              path={path}
              title={titles[id]}
              toolbarControls={renderControls ? renderControls(id) : <span />}
              onDragStart={() => root.current?.querySelector('.questiongame-mosaic')?.setAttribute('data-dragging', '')}
              onDragEnd={() => root.current?.querySelector('.questiongame-mosaic')?.removeAttribute('data-dragging')}
            >
              {renderTile(id)}
            </MosaicWindow>
          )}
        />
      </div>
    </div>
  )
}
