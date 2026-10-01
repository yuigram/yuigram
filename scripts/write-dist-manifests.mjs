/**
 * Write a manifest into each published package's `dist/`.
 *
 * Node decides whether a `.js` file is an ES module from the nearest
 * `package.json`, and finds it by probing each directory from the file upward.
 * Every module an import loads pays that walk, and with the package's own
 * manifest two or three directories above most of them it was about a sixth of
 * a cold `import 'yuigram'` (`docs/performance.md` §2). A manifest in `dist/`
 * ends the walk there.
 *
 * Bundlers read the nearest manifest too — for `browser` substitutions and for
 * `sideEffects` — so this one carries both, rewritten to be relative to
 * `dist/`, and a bundle is the same with it as without it. It carries nothing
 * else: no name and no exports, so resolving a package by name still reads the
 * package's own manifest, and nothing in a package imports itself by name (the
 * `no-self-import` invariant). A mapping this cannot express from inside
 * `dist/` is refused rather than written wrongly.
 *
 * Run by the root `build` and `typecheck`, which produce the published layout.
 *
 * ```sh
 * node scripts/write-dist-manifests.mjs
 * ```
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** A path relative to the package root, re-expressed relative to `dist/`. */
function underDist(path, what) {
  const match = /^\.?\/?dist\/(.+)$/.exec(path)
  if (match === null) {
    throw new Error(`${what} names '${path}', which is outside dist/ and cannot be mapped from there`)
  }
  return `./${match[1]}`
}

/**
 * The manifest for a package's `dist/`, from the package's own manifest.
 *
 * @param {Record<string, unknown>} manifest
 * @returns {Record<string, unknown>}
 */
export function distManifest(manifest) {
  const name = String(manifest.name)
  const out = { type: manifest.type ?? 'commonjs' }

  if (manifest.sideEffects !== undefined) {
    out.sideEffects = Array.isArray(manifest.sideEffects)
      ? manifest.sideEffects.map((path) => underDist(path, `${name} sideEffects`))
      : manifest.sideEffects
  }

  if (manifest.browser !== undefined) {
    if (typeof manifest.browser !== 'object' || manifest.browser === null) {
      throw new Error(`${name} has a browser field that is not a map; it cannot be mapped from dist/`)
    }
    out.browser = Object.fromEntries(
      Object.entries(manifest.browser).map(([from, to]) => [
        underDist(from, `${name} browser`),
        to === false ? false : underDist(String(to), `${name} browser`),
      ]),
    )
  }

  return out
}

/** Write the manifest for every published package with a built `dist/`. */
export function writeDistManifests(root) {
  const written = []
  for (const directory of readdirSync(join(root, 'packages'))) {
    const packageDir = join(root, 'packages', directory)
    const manifestPath = join(packageDir, 'package.json')
    if (!existsSync(manifestPath) || !existsSync(join(packageDir, 'dist'))) continue

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    if (manifest.private === true) continue

    writeFileSync(
      join(packageDir, 'dist', 'package.json'),
      `${JSON.stringify(distManifest(manifest), null, 2)}\n`,
    )
    written.push(manifest.name)
  }
  return written
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = fileURLToPath(new URL('..', import.meta.url))
  writeDistManifests(root)
}
