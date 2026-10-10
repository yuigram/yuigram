// SPDX-License-Identifier: MIT

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
    /**
     * Half the machine, rather than all of it.
     *
     * A handful of the MTProto suites do real 2048-bit Diffie-Hellman and RSA:
     * they are bound by processor rather than by waiting, which is the opposite
     * of what a test runner assumes when it sizes its pool. Given a worker per
     * core it oversubscribes — every worker gets a fraction of a core, the slow
     * suites take several times as long as they need, and tests that are only
     * ever slow start passing their deadlines. The failures that produces are
     * timeouts rather than wrong answers, and they move around with whatever
     * else the machine is doing.
     *
     * Halving the pool leaves the work that is genuinely waiting running in
     * parallel — most of the suite — while giving anything that is computing a
     * whole core. Measured on this suite it costs nothing: the same wall time
     * as an unbounded pool, and a quarter less processor time overall, because
     * none of it is spent competing.
     */
    maxWorkers: '50%',
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
