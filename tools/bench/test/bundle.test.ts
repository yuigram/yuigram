// SPDX-License-Identifier: MPL-2.0

/**
 * Deciding which of a bundle's inputs belong to the MTProto subsystem.
 *
 * `docs/performance.md` §7 says the bot-only budget "requires that importing
 * `yuigram` does not pull the MTProto subsystem into the graph", and the figure
 * alone cannot hold that — the whole framework compresses to less than the
 * bot-only allowance, so a bundle carrying all of MTProto would still be inside
 * its budget. The exclusion is a separate verdict, and this is the arithmetic
 * it rests on.
 *
 * Bundling is slow and varies with the build; attributing its output is exact.
 * Only the exact half is tested, for the same reason only the judging half of a
 * measurement is.
 */

import { describe, expect, it } from 'vitest'
import { mtprotoShare } from '../src/cases/bundle.js'

/** Inputs in the shape the bundler reports them. */
const inputs = (entries: Record<string, number>) =>
  Object.fromEntries(
    Object.entries(entries).map(([path, bytes]) => [path, { bytesInOutput: bytes }]),
  )

describe('what a bundle carries of the MTProto subsystem', () => {
  it('finds nothing in a bundle that reached none of it', () => {
    const share = mtprotoShare(
      inputs({
        'packages/core/dist/index.js': 4000,
        'packages/bot-api/dist/bot.js': 9000,
        'packages/yuigram/dist/index.js': 200,
      }),
    )

    expect(share.bytes).toBe(0)
    expect(share.modules).toEqual([])
  })

  it('adds up every module that came from it', () => {
    const share = mtprotoShare(
      inputs({
        'packages/core/dist/index.js': 4000,
        'packages/mtproto/dist/account.js': 1500,
        'packages/mtproto/dist/generated/api/tables/root.js': 230_000,
      }),
    )

    expect(share.bytes).toBe(231_500)
    expect(share.modules).toEqual([
      'packages/mtproto/dist/account.js',
      'packages/mtproto/dist/generated/api/tables/root.js',
    ])
  })

  it('recognises the subsystem whichever separator the platform used', () => {
    // The bundler reports what the operating system gave it, and a check that
    // only understood one of the two would report a clean bundle on Windows
    // whatever was in it.
    const share = mtprotoShare(inputs({ 'packages\\mtproto\\dist\\account.js': 1500 }))

    expect(share.bytes).toBe(1500)
  })

  it('does not mistake a path that merely mentions it', () => {
    // The marker is a directory, not a word. A file named after the subsystem
    // inside another package is not part of it.
    const share = mtprotoShare(
      inputs({
        'packages/bot-api/dist/mtproto-notes.js': 900,
        'packages/core/dist/mtproto.js': 700,
      }),
    )

    expect(share.bytes).toBe(0)
  })

  it('finds it wherever the bundler rooted its paths', () => {
    // Paths are relative to wherever the build ran, which is not necessarily
    // the repository root, so the marker is matched anywhere in the path.
    const share = mtprotoShare(inputs({ '../../packages/mtproto/dist/session.js': 800 }))

    expect(share.bytes).toBe(800)
  })

  it('reports nothing for a bundle with no inputs at all', () => {
    expect(mtprotoShare({})).toEqual({ bytes: 0, modules: [] })
  })
})
