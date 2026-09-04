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
          include: ['apps/studio/src/**/*.test.{ts,tsx}'],
        },
      },
    ],
  },
})
