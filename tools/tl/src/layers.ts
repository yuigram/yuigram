// SPDX-License-Identifier: MIT

/**
 * Noticing a newer layer.
 *
 * The pin moves by hand (docs/codegen.md §3.3): the revision, the three digests
 * and the definitions TDLib's file opens with are each read before they are
 * recorded. So nothing here fetches a schema or writes one. It reads the layer
 * each of Telegram's sources states — the documentation page, and TDLib's
 * `Version.h` at the head of its default branch — and says when either is
 * ahead of the pin.
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { download, extractLayer, SOURCES, TlFetchError } from './fetch.js'
import { statedLayer, TDLIB } from './tdlib.js'

/** The layer one source states, and where it was read. */
export interface Sighting {
  readonly source: string
  readonly where: string
  readonly layer: number
}

/** The pin against what the sources state. */
export interface LayerReport {
  readonly pinned: number
  readonly sightings: readonly Sighting[]
  /** The highest layer stated anywhere, the pin included. */
  readonly newest: number
}

/** Compare the pin with what the sources state. */
export function assess(pinned: number, sightings: readonly Sighting[]): LayerReport {
  return {
    pinned,
    sightings,
    newest: Math.max(pinned, ...sightings.map((sighting) => sighting.layer)),
  }
}

/** One paragraph for the run's summary. */
export function describeLayers(report: LayerReport): string {
  const stated = report.sightings
    .map((sighting) => `${sighting.source} states ${sighting.layer}`)
    .join('; ')
  const verdict =
    report.newest > report.pinned
      ? `Layer ${report.newest} is ahead of the pin.`
      : 'Nothing is ahead of the pin.'
  return `The pin is TL layer ${report.pinned}. ${stated}. ${verdict}\n`
}

/** The issue a newer layer becomes, or `undefined` when the pin is the newest. */
export function layerIssue(report: LayerReport): string | undefined {
  if (report.newest <= report.pinned) return undefined

  const lines = [
    `A source states TL layer ${report.newest}; the pin is layer ${report.pinned}.`,
    '',
    '| Source | Layer | Read from |',
    '|---|---|---|',
    `| Pin | ${report.pinned} | \`schemas/tl/layer.json\`; TDLib revision \`${TDLIB.revision}\` |`,
    ...report.sightings.map(
      (sighting) => `| ${sighting.source} | ${sighting.layer} | ${sighting.where} |`,
    ),
    '',
    'Moving the pin is a reviewed change, and this job does not make it (`docs/codegen.md` §3.3, ' +
      '"The update procedure"): the revision, the three digests and the layer in `TDLIB` ' +
      '(`tools/tl/src/tdlib.ts`), and `TDLIB_PREFIX` if what precedes the schema proper changed; ' +
      'then `fetch --from-tdlib` and `emit`, and a review of the three diffs.',
    '',
    `A release pinned to ${report.pinned} keeps working meanwhile. It does not see what newer ` +
      'layers introduced, and a constructor it does not know fails only the message that ' +
      'carries it.',
    '',
    'This issue is kept up to date by the drift job, and closes when the pin reaches the newest ' +
      'layer a source states.',
  ]

  return `${lines.join('\n')}\n`
}

/** The commit TDLib's default branch points at. */
export async function tdlibHead(): Promise<string> {
  const { stdout } = await promisify(execFile)('git', ['ls-remote', TDLIB.repository, 'HEAD'])
  const revision = /^([0-9a-f]{40})\tHEAD$/m.exec(stdout)?.[1]
  if (revision === undefined) {
    throw new TlFetchError(`could not read the head of ${TDLIB.repository}`)
  }
  return revision
}

/**
 * Read the layer each source states.
 *
 * TDLib is read at the commit its head names when asked, so the revision
 * reported is the one the layer was read at.
 */
export async function readSightings(): Promise<Sighting[]> {
  const page = await download(SOURCES.api.url)
  const revision = await tdlibHead()
  const header = await download(
    `https://raw.githubusercontent.com/tdlib/td/${revision}/${TDLIB.version.path}`,
  )

  return [
    { source: 'Documentation', where: SOURCES.api.url, layer: extractLayer(page) },
    {
      source: 'TDLib',
      where: `\`${TDLIB.version.path}\` at \`${revision}\``,
      layer: statedLayer(header),
    },
  ]
}
