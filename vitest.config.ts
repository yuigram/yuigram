import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'tools/*/test/**/*.test.ts'],
    // Type-level assertions are run by tsc. Inference quality is a feature, so
    // it is asserted rather than hoped for.
    typecheck: {
      enabled: true,
      include: ['packages/*/test/**/*.test-d.ts'],
      tsconfig: './tsconfig.test.json',
    },
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
