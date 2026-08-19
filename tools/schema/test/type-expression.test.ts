/**
 * Type expression grammar.
 *
 * Every case here corresponds to a form that appears in the Bot API
 * documentation. The rejection cases matter as much as the accepting ones: an
 * unrecognised form must throw rather than degrade to `unknown`, because a
 * silently wrong type propagates into generated code and is discovered by a
 * user rather than by CI.
 */

import { describe, expect, it } from 'vitest'
import {
  containsFile,
  parseTypeExpression,
  referencedNames,
  TypeExpressionError,
} from '../src/bot-api/type-expression.js'

describe('scalars', () => {
  it('parses the documented spellings', () => {
    expect(parseTypeExpression('String')).toEqual({ kind: 'string' })
    expect(parseTypeExpression('Integer')).toEqual({ kind: 'integer' })
    expect(parseTypeExpression('Float')).toEqual({ kind: 'float' })
    expect(parseTypeExpression('Float number')).toEqual({ kind: 'float' })
    expect(parseTypeExpression('Boolean')).toEqual({ kind: 'boolean' })
  })

  it('distinguishes True from Boolean', () => {
    // `True` means the field is present only when true, never false. Collapsing
    // it into Boolean would make an absent field indistinguishable from false.
    expect(parseTypeExpression('True')).toEqual({ kind: 'true' })
    expect(parseTypeExpression('Boolean')).toEqual({ kind: 'boolean' })
  })

  it('treats InputFile as the multipart marker', () => {
    expect(parseTypeExpression('InputFile')).toEqual({ kind: 'file' })
  })
})

describe('references', () => {
  it('parses a plain type name', () => {
    expect(parseTypeExpression('Message')).toEqual({ kind: 'reference', name: 'Message' })
  })

  it('parses a name with digits', () => {
    expect(parseTypeExpression('PassportElementErrorFile2')).toEqual({
      kind: 'reference',
      name: 'PassportElementErrorFile2',
    })
  })
})

describe('arrays', () => {
  it('parses a single level', () => {
    expect(parseTypeExpression('Array of MessageEntity')).toEqual({
      kind: 'array',
      of: { kind: 'reference', name: 'MessageEntity' },
    })
  })

  it('parses nesting', () => {
    expect(parseTypeExpression('Array of Array of InlineKeyboardButton')).toEqual({
      kind: 'array',
      of: { kind: 'array', of: { kind: 'reference', name: 'InlineKeyboardButton' } },
    })
  })

  it('parses an array of scalars', () => {
    expect(parseTypeExpression('Array of String')).toEqual({
      kind: 'array',
      of: { kind: 'string' },
    })
  })
})

describe('unions', () => {
  it('parses the "or" spelling', () => {
    expect(parseTypeExpression('Integer or String')).toEqual({
      kind: 'union',
      of: [{ kind: 'integer' }, { kind: 'string' }],
    })
  })

  it('parses a long "or" chain', () => {
    const result = parseTypeExpression(
      'InlineKeyboardMarkup or ReplyKeyboardMarkup or ReplyKeyboardRemove or ForceReply',
    )
    expect(result).toEqual({
      kind: 'union',
      of: [
        { kind: 'reference', name: 'InlineKeyboardMarkup' },
        { kind: 'reference', name: 'ReplyKeyboardMarkup' },
        { kind: 'reference', name: 'ReplyKeyboardRemove' },
        { kind: 'reference', name: 'ForceReply' },
      ],
    })
  })

  it('parses the comma-and spelling', () => {
    // The second union spelling, which a first survey missed entirely.
    expect(parseTypeExpression('InputMediaAudio, InputMediaPhoto and InputMediaVideo')).toEqual({
      kind: 'union',
      of: [
        { kind: 'reference', name: 'InputMediaAudio' },
        { kind: 'reference', name: 'InputMediaPhoto' },
        { kind: 'reference', name: 'InputMediaVideo' },
      ],
    })
  })

  it('parses a union nested inside an array', () => {
    // `sendMediaGroup`'s media parameter, the form that broke the first parser.
    const result = parseTypeExpression(
      'Array of InputMediaAudio, InputMediaDocument, InputMediaPhoto and InputMediaVideo',
    )

    // Narrowed rather than cast: an unsound cast would let the test keep
    // passing if the shape changed underneath it.
    if (result.kind !== 'array') throw new Error(`expected an array, got ${result.kind}`)
    const element = result.of
    if (element.kind !== 'union') throw new Error(`expected a union, got ${element.kind}`)
    expect(element.of).toHaveLength(4)
  })

  it('parses the multipart union', () => {
    expect(parseTypeExpression('InputFile or String')).toEqual({
      kind: 'union',
      of: [{ kind: 'file' }, { kind: 'string' }],
    })
  })
})

describe('rejection', () => {
  it('rejects an empty expression', () => {
    expect(() => parseTypeExpression('')).toThrow(TypeExpressionError)
    expect(() => parseTypeExpression('   ')).toThrow(TypeExpressionError)
  })

  it('rejects prose that is not a type', () => {
    // Degrading to `unknown` here would put a silently wrong type into
    // generated code, to be discovered by a user rather than by CI.
    expect(() => parseTypeExpression('a colour code')).toThrow(TypeExpressionError)
    expect(() => parseTypeExpression('0C9AB3 FFAD95')).toThrow(TypeExpressionError)
  })

  it('rejects a lowercase name', () => {
    expect(() => parseTypeExpression('message')).toThrow(TypeExpressionError)
  })

  it('names the offending expression', () => {
    expect(() => parseTypeExpression('Array of nonsense here')).toThrow(/nonsense here/)
  })
})

describe('normalization', () => {
  it('collapses whitespace', () => {
    expect(parseTypeExpression('  Integer   or    String ')).toEqual({
      kind: 'union',
      of: [{ kind: 'integer' }, { kind: 'string' }],
    })
  })
})

describe('containsFile', () => {
  it('detects a file at any depth', () => {
    expect(containsFile(parseTypeExpression('InputFile'))).toBe(true)
    expect(containsFile(parseTypeExpression('InputFile or String'))).toBe(true)
    expect(containsFile(parseTypeExpression('Array of InputFile'))).toBe(true)
  })

  it('reports false when absent', () => {
    expect(containsFile(parseTypeExpression('String'))).toBe(false)
    expect(containsFile(parseTypeExpression('Array of MessageEntity'))).toBe(false)
  })
})

describe('referencedNames', () => {
  it('collects names from a union inside an array', () => {
    const names = referencedNames(
      parseTypeExpression('Array of InputMediaAudio, InputMediaPhoto and InputMediaVideo'),
    )
    expect([...names].sort()).toEqual(['InputMediaAudio', 'InputMediaPhoto', 'InputMediaVideo'])
  })

  it('ignores scalars', () => {
    expect([...referencedNames(parseTypeExpression('Integer or String'))]).toEqual([])
  })
})
