import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'packages',
          environment: 'node',
          include: ['packages/*/src/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'scripts',
          environment: 'node',
          include: ['scripts/**/*.test.ts', 'e2e/support/**/*.test.ts'],
        },
      },
      {
        resolve: {
          alias: {
            '@': fileURLToPath(new URL('./apps/stage/src', import.meta.url)),
          },
        },
        test: {
          name: 'stage',
          environment: 'jsdom',
          include: ['apps/stage/src/**/*.test.{ts,tsx}'],
        },
      },
      {
        resolve: {
          alias: {
            '@': fileURLToPath(new URL('./apps/studio/src', import.meta.url)),
          },
        },
        test: {
          name: 'studio',
          environment: 'jsdom',
          // Many Studio tests render the whole App against the fake host. Alone
          // each takes ~1 s; with every jsdom worker busy one can take 5 s, and
          // the default timeout then fails a test that is merely slow (P12.9).
          testTimeout: 20_000,
          setupFiles: ['./apps/studio/src/test/setup.ts'],
          include: ['apps/studio/src/**/*.test.{ts,tsx}'],
        },
      },
    ],
  },
})
