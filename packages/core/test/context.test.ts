/**
 * Context construction and extension.
 *
 * The laziness assertions matter for throughput: at volume, decoding fields
 * nobody reads is most of the per-update cost. The conflict assertions matter
 * for diagnosis: a silently shadowed plugin member fails in ways that point at
 * the wrong plugin.
 */

import { describe, expect, it, vi } from 'vitest'
import { ContextExtender, ContextKeyConflictError, defineLazy } from '../src/context/extend.js'

describe('defineLazy', () => {
  it('does not call the factory until the property is read', () => {
    const factory = vi.fn(() => 42)
    const target: Record<string, unknown> = {}

    defineLazy(target, 'value', factory)

    expect(factory).not.toHaveBeenCalled()
    expect(target['value']).toBe(42)
    expect(factory).toHaveBeenCalledOnce()
  })

  it('calls the factory at most once', () => {
    const factory = vi.fn(() => ({ n: 1 }))
    const target: Record<string, unknown> = {}

    defineLazy(target, 'value', factory)

    const first = target['value']
    const second = target['value']

    expect(factory).toHaveBeenCalledOnce()
    expect(first).toBe(second)
  })

  it('caches undefined without recomputing', () => {
    // A field that legitimately decodes to undefined must not re-run its
    // factory on every access.
    const factory = vi.fn(() => undefined)
    const target: Record<string, unknown> = {}

    defineLazy(target, 'value', factory)

    void target['value']
    void target['value']

    expect(factory).toHaveBeenCalledOnce()
  })

  it('is enumerable by default', () => {
    const target: Record<string, unknown> = {}
    defineLazy(target, 'value', () => 1)

    expect(Object.keys(target)).toEqual(['value'])
    expect(JSON.parse(JSON.stringify(target))).toEqual({ value: 1 })
  })

  it('can be made non-enumerable so it cannot escape through serialization', () => {
    // Credential-bearing members must not appear in JSON.stringify output.
    const target: Record<string, unknown> = {}
    defineLazy(target, 'secret', () => 'value', { enumerable: false })

    expect(Object.keys(target)).toEqual([])
    expect(JSON.stringify(target)).toBe('{}')
    expect(target['secret']).toBe('value')
  })

  it('stays non-enumerable after being cached', () => {
    const target: Record<string, unknown> = {}
    defineLazy(target, 'secret', () => 'value', { enumerable: false })

    void target['secret']

    expect(Object.keys(target)).toEqual([])
    expect(JSON.stringify(target)).toBe('{}')
  })

  it('propagates a throwing factory and retries on the next access', () => {
    let attempts = 0
    const target: Record<string, unknown> = {}

    defineLazy(target, 'value', () => {
      attempts++
      if (attempts === 1) throw new Error('first attempt failed')
      return 'recovered'
    })

    expect(() => target['value']).toThrow('first attempt failed')
    expect(target['value']).toBe('recovered')
  })
})

describe('ContextExtender', () => {
  it('applies a contribution to a context', () => {
    const extender = new ContextExtender()
    extender.add({ owner: 'session', key: 'session', value: () => ({ count: 0 }) })

    const context = extender.apply<Record<string, unknown>>({ kind: 'message' })

    expect(context['session']).toEqual({ count: 0 })
  })

  it('applies contributions lazily', () => {
    const value = vi.fn(() => 'computed')
    const extender = new ContextExtender()
    extender.add({ owner: 'p', key: 'thing', value })

    const context = extender.apply<Record<string, unknown>>({})

    expect(value).not.toHaveBeenCalled()
    void context['thing']
    expect(value).toHaveBeenCalledOnce()
  })

  it('passes the context to the factory', () => {
    const extender = new ContextExtender()
    extender.add({
      owner: 'p',
      key: 'derived',
      value: (context) => `kind is ${(context as { kind: string }).kind}`,
    })

    const context = extender.apply<Record<string, unknown>>({ kind: 'message' })

    expect(context['derived']).toBe('kind is message')
  })

  it('applies several contributions', () => {
    const extender = new ContextExtender()
    extender.add({ owner: 'a', key: 'one', value: () => 1 })
    extender.add({ owner: 'b', key: 'two', value: () => 2 })

    const context = extender.apply<Record<string, unknown>>({})

    expect(context['one']).toBe(1)
    expect(context['two']).toBe(2)
  })

  it('gives each context its own cached values', () => {
    // A cached value leaking between updates would be a cross-request data leak.
    let counter = 0
    const extender = new ContextExtender()
    extender.add({ owner: 'p', key: 'id', value: () => ++counter })

    const first = extender.apply<Record<string, unknown>>({})
    const second = extender.apply<Record<string, unknown>>({})

    expect(first['id']).toBe(1)
    expect(second['id']).toBe(2)
    expect(first['id']).toBe(1)
  })

  describe('conflicts', () => {
    it('rejects a duplicate key', () => {
      const extender = new ContextExtender()
      extender.add({ owner: 'first', key: 'session', value: () => 1 })

      expect(() => extender.add({ owner: 'second', key: 'session', value: () => 2 })).toThrow(
        ContextKeyConflictError,
      )
    })

    it('names the plugin already holding the key', () => {
      const extender = new ContextExtender()
      extender.add({ owner: 'session-plugin', key: 'session', value: () => 1 })

      expect(() => extender.add({ owner: 'other', key: 'session', value: () => 2 })).toThrow(
        /session-plugin/,
      )
    })

    it('leaves the original contribution in place after a rejected duplicate', () => {
      const extender = new ContextExtender()
      extender.add({ owner: 'first', key: 'k', value: () => 'original' })

      expect(() =>
        extender.add({ owner: 'second', key: 'k', value: () => 'replacement' }),
      ).toThrow()

      expect(extender.apply<Record<string, unknown>>({})['k']).toBe('original')
    })
  })

  describe('introspection', () => {
    it('reports claimed keys in registration order', () => {
      const extender = new ContextExtender()
      extender.add({ owner: 'a', key: 'first', value: () => 1 })
      extender.add({ owner: 'b', key: 'second', value: () => 2 })

      expect(extender.keys).toEqual(['first', 'second'])
    })

    it('reports whether a key is claimed', () => {
      const extender = new ContextExtender()
      extender.add({ owner: 'a', key: 'session', value: () => 1 })

      expect(extender.has('session')).toBe(true)
      expect(extender.has('other')).toBe(false)
    })
  })

  it('honours a non-enumerable contribution', () => {
    const extender = new ContextExtender()
    extender.add({ owner: 'p', key: 'credentials', value: () => 'secret', enumerable: false })

    const context = extender.apply<Record<string, unknown>>({ kind: 'message' })

    expect(JSON.stringify(context)).toBe('{"kind":"message"}')
    expect(context['credentials']).toBe('secret')
  })

  it('returns the same object it was given', () => {
    const extender = new ContextExtender()
    const original = { kind: 'message' }

    expect(extender.apply(original)).toBe(original)
  })
})
