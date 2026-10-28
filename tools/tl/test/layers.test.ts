// SPDX-License-Identifier: MIT

/**
 * Noticing a newer layer, offline.
 *
 * Reading the sources is a network call the scheduled job makes; what it
 * concludes from the numbers is checked here.
 */

import { describe, expect, it } from 'vitest'
import { TlFetchError } from '../src/fetch.js'
import { assess, describeLayers, layerIssue, type Sighting } from '../src/layers.js'
import { layerFromVersionHeader, statedLayer } from '../src/tdlib.js'

const at = (documentation: number, tdlib: number): Sighting[] => [
  { source: 'Documentation', where: 'https://core.telegram.org/schema', layer: documentation },
  { source: 'TDLib', where: '`td/telegram/Version.h` at `0000`', layer: tdlib },
]

describe('the pin against the sources', () => {
  it('is the newest when no source is ahead of it', () => {
    const report = assess(229, at(223, 229))

    expect(report.newest).toBe(229)
    expect(layerIssue(report)).toBeUndefined()
    expect(describeLayers(report)).toBe(
      'The pin is TL layer 229. Documentation states 223; TDLib states 229. ' +
        'Nothing is ahead of the pin.\n',
    )
  })

  it('asks for the pin to move when a source is ahead', () => {
    const report = assess(229, at(223, 231))

    expect(report.newest).toBe(231)
    expect(describeLayers(report)).toContain('Layer 231 is ahead of the pin.')
    const issue = layerIssue(report)
    expect(issue).toContain('A source states TL layer 231; the pin is layer 229.')
    expect(issue).toContain('| TDLib | 231 |')
    expect(issue).toContain('| Documentation | 223 |')
    expect(issue).toContain('this job does not make it')
  })

  it('takes the documentation being ahead as seriously as TDLib', () => {
    expect(assess(229, at(230, 229)).newest).toBe(230)
  })
})

describe('the layer Version.h states', () => {
  const header = (...lines: string[]): string => ['#pragma once', ...lines, ''].join('\n')

  it('is read whatever it is', () => {
    expect(statedLayer(header('constexpr int32 MTPROTO_LAYER = 231;'))).toBe(231)
  })

  it('is refused when it is not stated exactly once', () => {
    expect(() => statedLayer(header())).toThrow(TlFetchError)
    expect(() =>
      statedLayer(
        header('constexpr int32 MTPROTO_LAYER = 229;', 'constexpr int32 MTPROTO_LAYER = 230;'),
      ),
    ).toThrow(TlFetchError)
  })

  it('must still be the pinned one when a schema is read at the pin', () => {
    expect(() =>
      layerFromVersionHeader(header('constexpr int32 MTPROTO_LAYER = 231;'), 229),
    ).toThrow(/the pin is for layer 229/)
  })
})
