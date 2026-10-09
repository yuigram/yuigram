// SPDX-License-Identifier: MPL-2.0

/**
 * The manifest each published package carries in `dist/`.
 *
 * It exists for Node's benefit — the nearest manifest says the files are ES
 * modules, one directory up — and bundlers read the nearest manifest too, so it
 * has to say what the package's own says about `browser` substitutions and
 * `sideEffects`, relative to where it sits. These hold the derivation and the
 * built result against each other.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { distManifest } from '../../../scripts/write-dist-manifests.mjs'

const ROOT = join(import.meta.dirname, '..', '..', '..')

describe('deriving the dist manifest', () => {
  it('says ES module, and rewrites the browser map and side effects to be relative to dist', () => {
    expect(
      distManifest({
        name: 'x',
        type: 'module',
        sideEffects: ['./dist/polyfill.js'],
        browser: { './dist/a.js': './dist/a.browser.js', './dist/b.js': false },
        exports: { '.': './dist/index.js' },
        main: './dist/index.js',
      }),
    ).toEqual({
      type: 'module',
      sideEffects: ['./polyfill.js'],
      browser: { './a.js': './a.browser.js', './b.js': false },
    })
  })

  it('names no package and exports nothing, so resolution by name is untouched', () => {
    const derived = distManifest({ name: 'x', type: 'module', exports: {}, sideEffects: false })

    expect(Object.keys(derived).sort()).toEqual(['sideEffects', 'type'])
  })

  it('refuses a mapping it cannot express from inside dist', () => {
    expect(() => distManifest({ name: 'x', browser: { './lib/a.js': './lib/b.js' } })).toThrow(
      /outside dist/,
    )
    expect(() => distManifest({ name: 'x', browser: './browser.js' })).toThrow(/not a map/)
    expect(() => distManifest({ name: 'x', sideEffects: ['./src/x.js'] })).toThrow(/outside dist/)
  })
})

describe('the built packages', () => {
  const published = readdirSync(join(ROOT, 'packages'))
    .map((directory) => join(ROOT, 'packages', directory))
    .filter((directory) => existsSync(join(directory, 'package.json')))
    .map((directory) => ({
      directory,
      manifest: JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as Record<
        string,
        unknown
      >,
    }))
    .filter(({ manifest }) => manifest['private'] !== true)

  it('each carry the manifest derived from their own', () => {
    expect(published.length).toBeGreaterThanOrEqual(6)
    for (const { directory, manifest } of published) {
      const built = JSON.parse(readFileSync(join(directory, 'dist', 'package.json'), 'utf8'))
      expect(built, String(manifest['name'])).toEqual(distManifest(manifest))
    }
  })

  it('substitute files that exist, for files that exist', () => {
    for (const { directory, manifest } of published) {
      const browser = (distManifest(manifest)['browser'] ?? {}) as Record<string, string | false>
      for (const [from, to] of Object.entries(browser)) {
        expect(existsSync(join(directory, 'dist', from)), from).toBe(true)
        if (to !== false) expect(existsSync(join(directory, 'dist', to)), to).toBe(true)
      }
    }
  })
})
