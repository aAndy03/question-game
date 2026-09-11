/**
 * A domain's code, suggested from its name. Pure, so the Domain form, the
 * fake host's import and anything else can share it; the host applies the
 * same rule to a domain an import creates
 * (`crates/host/src/catalog/import.rs`, `suggest_code`) — change both together.
 */

/** A code from a name: first three consonant-heavy letters + a stable number. */
export function suggestDomainCode(name: string, seed = 0): string {
  const letters = name
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 3)
    .padEnd(3, 'X')
  let hash = seed
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % 1000
  return `${letters}_${String(hash).padStart(3, '0')}`
}
