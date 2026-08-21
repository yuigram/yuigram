/**
 * Inline result builders.
 *
 * Telegram rejects a whole answer for one malformed result, naming a field
 * rather than a position, so the failures worth preventing are the two that a
 * loop makes easy: a wrong `type`, and two results sharing an `id`.
 */

import { describe, expect, it } from 'vitest'
import { inline, resultId } from '../src/inline.js'

describe('identity', () => {
  it('fills in the type, which can only be got wrong', () => {
    expect(inline.article('t', 'm').type).toBe('article')
    expect(inline.photo('https://e.com/a.jpg').type).toBe('photo')
    expect(inline.sticker('file-id').type).toBe('sticker')
    expect(inline.venue(1, 2, 't', 'a').type).toBe('venue')
  })

  it('gives every result a different id', () => {
    // Telegram rejects the whole answer when two results share one.
    const ids = Array.from({ length: 100 }, () => inline.article('t', 'm').id)

    expect(new Set(ids).size).toBe(100)
  })

  it('lets a bot choose its own id, to recognise the result later', () => {
    // `chosen_inline_result` carries the id back, which is only useful if the
    // bot put something meaningful in it.
    expect(inline.article('t', 'm', { id: 'product:42' }).id).toBe('product:42')
  })

  it('exposes the id generator, for results built by hand', () => {
    expect(resultId()).not.toBe(resultId())
  })
})

describe('articles', () => {
  it('wraps a string as the message it sends', () => {
    const result = inline.article('Yuigram', 'A Telegram framework')

    expect(result.title).toBe('Yuigram')
    expect(result.input_message_content).toEqual({ message_text: 'A Telegram framework' })
  })

  it('takes full content when the message needs its own settings', () => {
    const result = inline.article('t', {
      message_text: '<b>hi</b>',
      parse_mode: 'HTML',
    })

    expect(result.input_message_content).toMatchObject({ parse_mode: 'HTML' })
  })

  it('carries the rest of the options through', () => {
    const result = inline.article('t', 'm', { description: 'a description', url: 'https://e.com' })

    expect(result).toMatchObject({ description: 'a description', url: 'https://e.com' })
  })
})

describe('media', () => {
  it('defaults a thumbnail to the media itself', () => {
    // Required by Telegram, and for a photo it is nearly always the same URL.
    const result = inline.photo('https://e.com/cat.jpg')

    expect(result.photo_url).toBe('https://e.com/cat.jpg')
    expect(result.thumbnail_url).toBe('https://e.com/cat.jpg')
  })

  it('lets the thumbnail be set where it differs', () => {
    const result = inline.gif('https://e.com/a.gif', { thumbnail_url: 'https://e.com/t.jpg' })

    expect(result.thumbnail_url).toBe('https://e.com/t.jpg')
  })

  it('keeps what Telegram requires and cannot be guessed in the options', () => {
    const result = inline.video('https://e.com/v.mp4', {
      mime_type: 'video/mp4',
      title: 'A video',
    })

    expect(result).toMatchObject({ mime_type: 'video/mp4', title: 'A video' })
  })

  it('builds the audio, voice and document shapes', () => {
    expect(inline.audio('https://e.com/a.mp3', 'Track')).toMatchObject({
      type: 'audio',
      audio_url: 'https://e.com/a.mp3',
      title: 'Track',
    })

    expect(inline.voice('https://e.com/v.ogg', 'Note')).toMatchObject({ type: 'voice' })

    expect(
      inline.document('https://e.com/d.pdf', 'Report', { mime_type: 'application/pdf' }),
    ).toMatchObject({ type: 'document', mime_type: 'application/pdf' })
  })
})

describe('places and people', () => {
  it('builds a location, a venue and a contact', () => {
    expect(inline.location(51.5, -0.1, 'London')).toMatchObject({
      type: 'location',
      latitude: 51.5,
      longitude: -0.1,
    })

    expect(inline.venue(51.5, -0.1, 'A place', '1 Street')).toMatchObject({
      type: 'venue',
      address: '1 Street',
    })

    expect(inline.contact('+100', 'Alice')).toMatchObject({
      type: 'contact',
      phone_number: '+100',
      first_name: 'Alice',
    })
  })
})

describe('shape', () => {
  it('produces plain objects, so a result can be built any other way too', () => {
    const result = inline.photo('https://e.com/a.jpg')

    expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
    expect(JSON.parse(JSON.stringify(result))).toEqual(result)
  })

  it('is frozen, so a plugin cannot redefine a builder', () => {
    expect(Object.isFrozen(inline)).toBe(true)
  })
})
