import { useEffect, useRef, useState } from 'react'
import {
  STAGE_FRAME,
  VIEWER_SOURCE,
  isViewerMessage,
  parseNodeId,
  type PlayStateForStage,
  type StageToViewer,
  type ViewerNodeRect,
  type ViewerToStage,
} from '@questiongame/contract'
import { Text } from '@/atoms'
import { NodeHandle } from '@/molecules'
import { CONTROL } from '@/copy'

export interface ScreensCanvasProps {
  /** The preview Play to draw (never a `play-state`). */
  preview: PlayStateForStage
  selectedId: string | null
  overriddenIds: ReadonlySet<string>
  /** False while an overlay stands over the screen: nothing under it is addressable. */
  handles?: boolean | undefined
  onSelect: (id: string | null) => void
  onNudge: (id: string, dx: number, dy: number) => void
}

/**
 * The Screens canvas: the same Stage iframe as Control's Viewer, fed the
 * preview over the Viewer protocol, with `NodeHandle`s over the node rects
 * Stage reports. Handles are Studio DOM and never enter the saved layout.
 */
export function ScreensCanvas({ preview, selectedId, overriddenIds, handles: withHandles = true, onSelect, onNudge }: ScreensCanvasProps) {
  const frame = useRef<HTMLIFrameElement | null>(null)
  const box = useRef<HTMLDivElement | null>(null)
  const latest = useRef(preview)
  latest.current = preview
  const [ready, setReady] = useState(false)
  const [nodes, setNodes] = useState<readonly ViewerNodeRect[]>([])
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const el = box.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      const scale = Math.min(entry.contentRect.width / STAGE_FRAME.width, entry.contentRect.height / STAGE_FRAME.height)
      setSize({ width: Math.floor(STAGE_FRAME.width * scale), height: Math.floor(STAGE_FRAME.height * scale) })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== frame.current?.contentWindow || !isViewerMessage(event.data)) return
      const message = event.data as StageToViewer
      if (message.type === 'ready') {
        setReady(true)
        const reply: ViewerToStage = { source: VIEWER_SOURCE, type: 'play-state', state: latest.current }
        frame.current?.contentWindow?.postMessage(reply, '*')
      }
      if (message.type === 'nodes') setNodes(message.nodes)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  useEffect(() => {
    const target = frame.current?.contentWindow
    if (!target || !ready) return
    const message: ViewerToStage = { source: VIEWER_SOURCE, type: 'play-state', state: preview }
    target.postMessage(message, '*')
  }, [preview, ready])

  useEffect(() => {
    const target = frame.current?.contentWindow
    if (!target || !ready) return
    target.postMessage({ source: VIEWER_SOURCE, type: 'measure' } satisfies ViewerToStage, '*')
  }, [size, ready])

  const scale = size.width / STAGE_FRAME.width
  // Decor bodies move and are tuned by the dials, not by node styles; they get no handle.
  const handles = withHandles
    ? nodes.filter((n) => {
        const parsed = parseNodeId(n.id)
        return parsed !== null && parsed.screen === preview.currentScreen && parsed.slot !== 'decor'
      })
    : []

  return (
    <div
      ref={box}
      className="flex h-full w-full items-center justify-center rounded-[var(--radius)]"
      style={{ background: 'var(--surface-tertiary)' }}
      data-screens-canvas
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onSelect(null)
      }}
    >
      <div className="relative" style={{ width: size.width || undefined, height: size.height || undefined }}>
        {/* `hold`: an overlay on the canvas stands still instead of playing out (P11.16). */}
        <iframe ref={frame} title="Canvas" src="/stage/?viewer&hold" className="block border-0" style={{ width: size.width, height: size.height, background: 'white' }} tabIndex={-1} aria-hidden />
        {!ready ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Text variant="studio-caption" tone="muted">
              {CONTROL.viewerLoading}
            </Text>
          </div>
        ) : null}
        {handles.map((n) => (
          <NodeHandle
            key={n.id}
            id={n.id}
            x={n.x * scale}
            y={n.y * scale}
            width={n.width * scale}
            height={n.height * scale}
            isSelected={selectedId === n.id}
            isOverridden={overriddenIds.has(n.id)}
            scale={scale}
            onSelect={() => onSelect(n.id)}
            onNudge={(dx, dy) => onNudge(n.id, dx, dy)}
          />
        ))}
      </div>
    </div>
  )
}
