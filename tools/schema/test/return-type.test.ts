/**
 * Return-type inference.
 *
 * Telegram states returns in prose, so this is the one genuinely heuristic
 * part of the parser. Each case here is a sentence shape taken from the real
 * documentation. The whole-schema audit — that no method returns a reference
 * to a type that does not exist — is what catches shapes this suite misses.
 */

import { describe, expect, it } from 'vitest'
import { inferReturnType } from '../src/bot-api/parse.js'

describe('single returns', () => {
  it('reads "the sent Message is returned"', () => {
    expect(
      inferReturnType(
        'Use this method to send text messages. On success, the sent Message is returned.',
      ),
    ).toEqual({ kind: 'reference', name: 'Message' })
  })

  it('reads "Returns True on success"', () => {
    expect(
      inferReturnType('Use this method to delete a message. Returns True on success.'),
    ).toEqual({ kind: 'true' })
  })

  it('reads an array return', () => {
    expect(
      inferReturnType(
        'Use this method to receive incoming updates. Returns an Array of Update objects.',
      ),
    ).toEqual({ kind: 'array', of: { kind: 'reference', name: 'Update' } })
  })

  it('reads a scalar return as a scalar, not a reference', () => {
    // Emitting String as a reference would point at an object that does not
    // exist, which the whole-schema audit catches but the type system would not.
    expect(inferReturnType('Returns the new invite link as String on success.')).toEqual({
      kind: 'string',
    })
    expect(inferReturnType('Returns Int on success.')).toEqual({ kind: 'boolean' })
    expect(inferReturnType('Returns the member count as Integer on success.')).toEqual({
      kind: 'integer',
    })
  })

  it('recognises a single-word type name', () => {
    expect(
      inferReturnType(
        'A simple method for testing. Returns basic information about the bot in form of a User object.',
      ),
    ).toEqual({ kind: 'reference', name: 'User' })
  })
})

describe('union returns', () => {
  it('reads the edited-message shape', () => {
    const result = inferReturnType(
      'On success, if the edited message is not an inline message, the edited Message is returned, otherwise True is returned.',
    )

    expect(result.kind).toBe('union')
    expect(result).toEqual({
      kind: 'union',
      of: [{ kind: 'reference', name: 'Message' }, { kind: 'true' }],
    })
  })

  it('puts the substantive type before the boolean', () => {
    // `Message | true` reads better than `true | Message`, and the object is
    // what callers actually care about.
    const result = inferReturnType('The edited Message is returned, otherwise True is returned.')
    if (result.kind !== 'union') throw new Error(`expected a union, got ${result.kind}`)
    expect(result.of[0]?.kind).toBe('reference')
  })

  it('does not repeat a type mentioned twice', () => {
    const result = inferReturnType(
      'Returns the Message on success. The Message is returned in all cases.',
    )
    expect(result).toEqual({ kind: 'reference', name: 'Message' })
  })
})

describe('fallbacks', () => {
  it('assumes boolean when nothing is stated', () => {
    expect(inferReturnType('Use this method to do something undocumented.')).toEqual({
      kind: 'boolean',
    })
  })

  it('ignores sentences that do not mention a return', () => {
    const result = inferReturnType(
      'This method requires ChatAdministratorRights to be granted. Returns True on success.',
    )
    expect(result).toEqual({ kind: 'true' })
  })
})
