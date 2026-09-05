/**
 * HeroUI's prop types do not admit an explicit `undefined` under
 * `exactOptionalPropertyTypes`, so optional props are spread through this
 * instead of passed one by one: `{...defined({ className, onPress })}`.
 */
export function defined<T extends object>(props: T): { [K in keyof T]: Exclude<T[K], undefined> } {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(props)) if (v !== undefined) out[k] = v
  return out as { [K in keyof T]: Exclude<T[K], undefined> }
}
