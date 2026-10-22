import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { compile } from '@tailwindcss/node'
import { describe, expect, it } from 'vitest'
import { TEXT_VARIANTS, variantTokens } from '@questiongame/text'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')

/**
 * P20: Studio's type roles were declared `@theme inline`, which Tailwind v4
 * emits only for a utility that uses them. `Text` reads them from an inline
 * style Tailwind never sees, so every role but one resolved to nothing and
 * fell back to the inherited 16px — titles, captions and body all one size
 * since P7. jsdom applies no CSS, so only the compiled stylesheet can say.
 */
describe('the Studio type scale', () => {
  it('emits every variable a studio-* text variant reads, with no candidates at all', async () => {
    // studio.css's order: HeroUI's exported theme, then this package's tokens.
    const css = ['@import "tailwindcss/theme.css" layer(theme);', ...['globals.css', 'tokens/theme.css'].map((f) => readFileSync(path.join(root, f), 'utf8'))].join('\n')
    const compiler = await compile(css, { base: root, onDependency: () => {} })
    const out = compiler.build([])
    const declared = (name: string) => new RegExp(`${name.replace(/[-]/g, '\\-')}:\\s*[^;]+;`).test(out)

    const read = new Set<string>()
    for (const variant of TEXT_VARIANTS.filter((v) => v.startsWith('studio-'))) {
      const tokens = variantTokens(variant)
      for (const value of [tokens.size, tokens.weight, tokens.family, tokens.tracking, tokens.leading]) {
        for (const match of value.matchAll(/var\((--[a-z0-9-]+)\)/g)) read.add(match[1] as string)
      }
    }
    expect(read.size).toBeGreaterThan(10)
    const missing = [...read].filter((name) => !declared(name))
    expect(missing).toEqual([])
  })
})
