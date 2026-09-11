/**
 * Stage copy: the language tables (`tables.ts`), the provider that hands the
 * resolved one down (`context.tsx`), and the formatters (`format.ts`).
 * Components import `useCopy` from here; the tables are for tests and for
 * `resolveCopy`.
 */
export * from './tables'
export { CopyProvider, useCopy } from './context'
