/**
 * A name already used by another row of the same kind in this workspace —
 * said beside the field, never refused (beta.3: two "Biblie" side by side
 * were the confusion the shared library's removal started from).
 */
export function isTwin(name: string, others: readonly { readonly name: string }[]): boolean {
  const fold = name.trim().replace(/\s+/g, ' ').toLowerCase()
  return fold.length > 0 && others.some((o) => o.name.trim().replace(/\s+/g, ' ').toLowerCase() === fold)
}
