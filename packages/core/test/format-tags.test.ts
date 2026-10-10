// SPDX-License-Identifier: MIT

/**
 * Reading a tag, and how long it takes.
 *
 * Tags used to be read with one regular expression, tried at every `<`. The
 * reader that replaced it must read the same tag, with the same parts, wherever
 * the pattern did — and nowhere it did not — while reading each part of the
 * text a bounded number of times, however the text is arranged.
 */

import { describe, expect, it } from 'vitest'
import { matchTag, scanHtml } from '../src/format/html.js'

/** The pattern tags were read with before, kept as the reference to agree with. */
const REFERENCE =
  /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>/y

function byReference(source: string, at: number): readonly string[] | undefined {
  REFERENCE.lastIndex = at
  const match = REFERENCE.exec(source)

  return match === null ? undefined : [...match].map((part) => part ?? '')
}

/** What a source is made of: markup's own characters, names, and whitespace of every kind. */
const PIECES = [
  '<',
  '>',
  '/',
  '=',
  '"',
  "'",
  'a',
  'B',
  '7',
  '-',
  ' ',
  '\t',
  '\n',
  ' ',
  ' ',
  '﻿',
  'x',
  '<a',
  '</b',
  '&',
  'href',
  '=x',
  '"y"',
]

/** A repeatable sequence, so a failure names a source that can be read again. */
function sequence(seed: number): () => number {
  let state = seed

  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648

    return state / 2_147_483_648
  }
}

describe('reading a tag', () => {
  it('reads the tag the pattern read, part for part, at every position', () => {
    const next = sequence(7)
    const disagreements: string[] = []

    for (let round = 0; round < 20_000 && disagreements.length < 5; round += 1) {
      let source = ''
      const length = 1 + Math.floor(next() * 16)
      for (let piece = 0; piece < length; piece += 1) {
        source += PIECES[Math.floor(next() * PIECES.length)]
      }

      // Shared across positions in the order a scan visits them, as a parse
      // shares it, and fresh, so a remembered dead end cannot hide a mistake.
      const shared = new Set<number>()
      for (let at = 0; at < source.length; at += 1) {
        const expected = JSON.stringify(byReference(source, at))
        const fresh = JSON.stringify(matchTag(source, at, new Set()))
        const remembered = JSON.stringify(matchTag(source, at, shared))
        if (fresh !== expected || remembered !== expected) {
          disagreements.push(
            `${JSON.stringify(source)} at ${at}: ${expected} / ${fresh} / ${remembered}`,
          )
        }
      }
    }

    expect(disagreements).toEqual([])
  })

  it('reads the tags a well-formed text holds, whatever they carry', () => {
    const source = `<a href="https://example.com/?a=1&b=2">x</a> <tg-emoji emoji-id='5'>y</tg-emoji> <br/>`

    expect(matchTag(source, 0, new Set())).toEqual([
      '<a href="https://example.com/?a=1&b=2">',
      '',
      'a',
      ' href="https://example.com/?a=1&b=2"',
      '',
    ])
    expect(matchTag(source, source.indexOf('</a>'), new Set())).toEqual(['</a>', '/', 'a', '', ''])
    expect(matchTag(source, source.indexOf('<br/>'), new Set())).toEqual([
      '<br/>',
      '',
      'br',
      '',
      '/',
    ])
  })
})

describe('how long reading takes', () => {
  // Each of these took time growing with the square of its length: every `<`
  // started an attempt that read on to the end before failing.
  const LONG = 40_000

  it('reads a long run of attribute-like text once, not once for every `<` in it', () => {
    const source = '<A\t'.repeat(LONG)
    const started = performance.now()

    const lenient = scanHtml(source, { mode: 'lenient' })

    expect(performance.now() - started).toBeLessThan(2_000)
    expect(lenient.formatted.text).toBe(source)
  })

  it('reads a run that ends in a dangling `=` before a closing `>` once', () => {
    const source = `${'<A '.repeat(LONG)}= >`
    const started = performance.now()

    const lenient = scanHtml(source, { mode: 'lenient' })

    expect(performance.now() - started).toBeLessThan(2_000)
    expect(lenient.formatted.text).toBe(source)
  })

  it('holds back nothing it has already read, in partial mode, quickly', () => {
    const source = `<b>${'<A\t'.repeat(LONG)}`
    const started = performance.now()

    const partial = scanHtml(source, { mode: 'partial' })

    expect(performance.now() - started).toBeLessThan(2_000)
    // Only the last `<A\t` could still become a tag, so only it waits.
    expect(partial.heldBack).toBe(true)
    expect(partial.consumed).toBe(source.length - '<A\t'.length)
  })
})
