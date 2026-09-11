import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { StageLanguage } from '@questiongame/contract'
import { resolveCopy, type StageCopy } from './tables'

/**
 * The resolved copy table, provided once by `StageRoot` from
 * `play-state.language` and read by every component that prints an authored
 * string. No provider above means English — so a molecule rendered alone
 * (a test, a fixture strip) still has something to print — but the Stage
 * tree always mounts one, and that is the only place the language is read.
 */
const CopyContext = createContext<StageCopy>(resolveCopy())

export function CopyProvider({ language, children }: { language: StageLanguage; children: ReactNode }) {
  const copy = useMemo(() => resolveCopy(language), [language])
  return <CopyContext.Provider value={copy}>{children}</CopyContext.Provider>
}

export function useCopy(): StageCopy {
  return useContext(CopyContext)
}
