import { afterEach, describe, expect, it } from 'vitest'
import { Profiler } from 'react'
import { cleanup, render } from '@testing-library/react'
import { LibraryList } from './LibraryList'

afterEach(cleanup)

/** Let every microtask and every zero-delay timer that is queued run. */
const settle = async () => {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('LibraryList', () => {
  it('is quiet while rows are still undefined (2026-09-08: the Archived freeze)', async () => {
    // The list before its query has answered: `rows` is `undefined`, the
    // skeleton is up, and nothing else is going to change until the host
    // replies. Every render in that state must leave the table alone.
    //
    // It did not. `data: rows ?? []` handed TanStack Table a *new* array each
    // render, the core row model saw its input change, and the pagination
    // feature queued a `resetPageIndex` on a microtask — a `setState`, a
    // re-render, another new array, another reset. Nothing in the loop is a
    // nested update React would refuse, and the reply that would have made
    // `rows` an array never got a turn. Studio froze on every Archived
    // toggle whose list was empty, at ~120 commits a second.
    let commits = 0
    const ui = (n: number) => (
      <Profiler id="list" onRender={() => void (commits += 1)}>
        <LibraryList rows={undefined} isLoading layout="table" what="teams" emptyKind="archivedEmpty" bulk={{ mode: 'restore' }} data-n={n} />
      </Profiler>
    )
    const view = render(ui(0))
    // The table's auto-reset only *registers* on its first sight of the data
    // and resets from the second on — the boot render registered, and the
    // toggle's render, seconds later, was the second. So the renders here are
    // spaced out the same way.
    await settle()
    // A parent re-rendering with the same `undefined` rows — in the app, the
    // archive scope changing.
    view.rerender(ui(1))
    await settle()
    view.rerender(ui(2))
    await settle()
    const after = commits
    await settle()
    // Three renders were asked for. A loop shows up as commits nobody asked
    // for arriving while the test only waits.
    expect(after).toBeLessThanOrEqual(3)
    expect(commits).toBe(after)
  })
})
