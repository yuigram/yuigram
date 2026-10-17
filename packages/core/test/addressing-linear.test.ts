// SPDX-License-Identifier: MIT

/**
 * Reading a link takes time in proportion to the link.
 *
 * Two parts of a link were cut with patterns anchored at the end: a `tg:`
 * link's fragment, and the line breaks that close a share's text. Such a
 * pattern is tried from every `#` or line break, and a long run of them
 * followed by anything else is read again from each. They are cut in one pass
 * now, and must cut exactly where the patterns did.
 */

import { describe, expect, it } from 'vitest'
import { cutLastLineAt, readLink, withoutTrailingNewlines } from '../src/addressing/addressing.js'

/** A repeatable sequence, so a failure names a link that can be read again. */
function sequence(seed: number): () => number {
  let state = seed

  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648

    return state / 2_147_483_648
  }
}

const LONG = 100_000

describe('a tg: link’s fragment', () => {
  it('is cut where the pattern cut it, line breaks and all', () => {
    const pieces = ['#', '?', '\n', '\r', '\u2028', '\u2029', 'a', '=', '&', 'domain=durov', ' ']
    const next = sequence(3)
    const disagreements: string[] = []

    for (let round = 0; round < 20_000; round += 1) {
      let text = ''
      const length = Math.floor(next() * 12)
      for (let piece = 0; piece < length; piece += 1) {
        text += pieces[Math.floor(next() * pieces.length)]
      }
      if (cutLastLineAt(text, '#') !== text.replace(/#.*$/, ''))
        disagreements.push(JSON.stringify(text))
      if (cutLastLineAt(text, '?#') !== text.replace(/[?#].*$/, ''))
        disagreements.push(JSON.stringify(text))
      if (withoutTrailingNewlines(text) !== text.replace(/\n+$/, '')) {
        disagreements.push(JSON.stringify(text))
      }
    }

    expect(disagreements).toEqual([])
    expect(readLink('tg://resolve?domain=durov#comments')).toEqual(
      readLink('tg://resolve?domain=durov'),
    )
  })

  it('is cut in one pass, however many marks come before a line break', () => {
    const started = performance.now()

    readLink(`tg://resolve?domain=durov${'#'.repeat(LONG)}\nx`)

    expect(performance.now() - started).toBeLessThan(1_000)
  })
})

describe('a share’s text', () => {
  it('loses the line breaks that end it, and only those', () => {
    const shared = readLink(
      `https://t.me/share/url?url=https%3A%2F%2Fexample.com&text=${encodeURIComponent('look\n\nhere\n\n')}`,
    )

    expect(shared).toMatchObject({ kind: 'share', text: 'look\n\nhere' })
  })

  it('is trimmed in one pass, however many line breaks it holds', () => {
    const text = encodeURIComponent(`${'\n'.repeat(LONG)}x`)
    const started = performance.now()

    const shared = readLink(`https://t.me/share/url?url=https%3A%2F%2Fexample.com&text=${text}`)

    expect(performance.now() - started).toBeLessThan(1_000)
    expect(shared).toMatchObject({ kind: 'share', text: `${'\n'.repeat(LONG)}x` })
  })
})
