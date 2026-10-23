import { useLayoutEffect, type RefObject } from 'react'

/** Fired on the row after each measure, so what folds inside it (the toolbar's filter chips) fits itself to the buttons as they now are. */
export const SQUEEZE_EVENT = 'squeeze'

/**
 * A row of buttons that does not fit **becomes its icons** (beta.8): the
 * selection strip's actions, the list toolbar's Filters · Sort · Group. Each
 * render and each resize, the row is measured at full size — so words come
 * back the moment they fit — and \`data-squeezed\` is set when it scrolls or
 * wraps, or when something in it that folds (\`data-fold\`: the filter chips)
 * would have to; \`studio.css\` then draws every \`.button\` with an icon as the
 * icon alone, and this names each by a \`title\` it adds and takes away again.
 * Buttons go to icons before a chip folds: the chips are what is in force.
 * The attribute flips before paint, so nothing flickers.
 */
export function useSqueeze(ref: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => {
      delete el.dataset['squeezed']
      // What folds is measured whole: every item shown.
      for (const item of el.querySelectorAll<HTMLElement>('[data-fold-item]')) item.style.display = ''
      const kids = [...el.children] as HTMLElement[]
      const top = kids[0]?.offsetTop ?? 0
      const wraps = kids.some((k) => k.offsetTop > top + 2)
      const folds = [...el.querySelectorAll<HTMLElement>('[data-fold]')].some((f) => f.scrollWidth > f.clientWidth + 1)
      const squeezed = wraps || folds || el.scrollWidth > el.clientWidth + 1
      if (squeezed) el.dataset['squeezed'] = ''
      for (const button of el.querySelectorAll<HTMLElement>('.button')) {
        if (squeezed && !button.title) {
          button.title = button.textContent?.trim() ?? ''
          button.dataset['squeezeTitle'] = ''
        } else if (!squeezed && button.dataset['squeezeTitle'] !== undefined) {
          button.removeAttribute('title')
          delete button.dataset['squeezeTitle']
        }
      }
      el.dispatchEvent(new Event(SQUEEZE_EVENT))
    }
    fit()
    if (typeof ResizeObserver === 'undefined') return
    const watch = new ResizeObserver(fit)
    watch.observe(el)
    return () => watch.disconnect()
  })
}
