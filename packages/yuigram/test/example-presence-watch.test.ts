// SPDX-License-Identifier: MPL-2.0

/**
 * The presence-watch example, rehearsed.
 *
 * `examples/20-presence-watch` is written against the published entry points,
 * as an application is, and its rehearsal runs the whole of it — the bot's
 * commands, the account's reads and updates, the timer, the store — on the
 * testing harnesses, with a clock of its own. The rehearsal throws at the
 * first thing that is not what the example promises, so running it to the end
 * is the assertion.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

describe('the presence-watch example', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('runs its offline rehearsal to the end', async () => {
    const lines: string[] = []
    vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
      lines.push(String(line))
    })

    await import('../../../examples/20-presence-watch/rehearse.js')

    expect(lines.at(-1)).toMatch(/^the presence watch behaves as it says: \d+ checks$/)
    expect(lines.filter((line) => line.startsWith('  ok  ')).length).toBeGreaterThan(50)
    // Most of the time is the runner loading the framework for the example, not the rehearsal.
  }, 60_000)
})
