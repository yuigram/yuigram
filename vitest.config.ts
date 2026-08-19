import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'tools/*/test/**/*.test.ts'],
    environment: 'node',
    // Deterministic by default: no implicit time, no shared global state.
    restoreMocks: true,
    unstubEnvs: true,
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts', 'tools/*/src/**/*.ts'],
      reporter: ['text', 'lcov'],
    },
  },
})
