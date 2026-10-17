// SPDX-License-Identifier: MIT

/** The manifest for a package's `dist/`, from the package's own manifest. */
export function distManifest(manifest: Record<string, unknown>): Record<string, unknown>

/** Write the manifest for every published package with a built `dist/`; the names written. */
export function writeDistManifests(root: string): string[]
