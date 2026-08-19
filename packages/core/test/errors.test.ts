/**
 * Error hierarchy behaviour.
 *
 * The contract these assert is that wrapping never destroys information. An
 * error a user cannot diagnose from the object is a framework bug, so the
 * preservation cases matter more than the shape ones.
 */

import { describe, expect, it } from 'vitest'
import {
  AuthError,
  CancelledError,
  ConfigError,
  causeChain,
  FloodError,
  findCause,
  NetworkError,
  PeerError,
  PluginConflictError,
  PluginCycleError,
  PluginDependencyError,
  PluginError,
  SessionError,
  TelegramError,
  ValidationError,
  YuigramError,
} from '../src/errors/index.js'

describe('hierarchy', () => {
  it('roots every framework error at YuigramError', () => {
    const errors = [
      new ConfigError('a'),
      new ValidationError('a'),
      new NetworkError('a'),
      new AuthError('a'),
      new SessionError('a'),
      new PeerError('a'),
      new TelegramError('a'),
      new CancelledError('a'),
      new PluginError('a'),
    ]

    for (const error of errors) {
      expect(error).toBeInstanceOf(YuigramError)
      expect(error).toBeInstanceOf(Error)
    }
  })

  it('sets a distinct name on each type', () => {
    expect(new ConfigError('a').name).toBe('ConfigError')
    expect(new NetworkError('a').name).toBe('NetworkError')
    expect(new PeerError('a').name).toBe('PeerError')
  })

  it('keeps the message intact', () => {
    expect(new ConfigError('missing apiId').message).toBe('missing apiId')
  })

  it('places FloodError under TelegramError', () => {
    // Callers commonly catch TelegramError broadly; a flood wait must be
    // reachable that way rather than sitting outside the branch.
    const error = new FloodError('too many requests', { retryAfter: 30 })
    expect(error).toBeInstanceOf(TelegramError)
    expect(error).toBeInstanceOf(YuigramError)
  })

  it('nests plugin errors under PluginError', () => {
    expect(new PluginConflictError('session')).toBeInstanceOf(PluginError)
    expect(new PluginDependencyError('scenes', 'session')).toBeInstanceOf(PluginError)
    expect(new PluginCycleError(['a', 'b', 'a'])).toBeInstanceOf(PluginError)
  })
})

describe('detail preservation', () => {
  it('preserves the cause', () => {
    const cause = new Error('socket hang up')
    expect(new NetworkError('request failed', { cause }).cause).toBe(cause)
  })

  it('preserves a non-Error cause', () => {
    // Telegram payloads arrive as plain objects, and discarding them would
    // remove the only diagnosable detail.
    const payload = { ok: false, error_code: 400, description: 'BAD_REQUEST' }
    expect(new TelegramError('rejected', { cause: payload }).cause).toBe(payload)
  })

  it('carries the method on TelegramError', () => {
    expect(new TelegramError('nope', { method: 'sendMessage' }).method).toBe('sendMessage')
  })

  it('carries retryAfter on FloodError', () => {
    expect(new FloodError('wait', { retryAfter: 42 }).retryAfter).toBe(42)
  })

  it('leaves cause undefined when none was given', () => {
    expect(new ConfigError('a').cause).toBeUndefined()
  })
})

describe('plugin error messages', () => {
  it('names the conflicting plugin', () => {
    expect(new PluginConflictError('session').message).toContain('session')
  })

  it('names both plugin and missing dependency', () => {
    const error = new PluginDependencyError('scenes', 'session')
    expect(error.message).toContain('scenes')
    expect(error.message).toContain('session')
  })

  it('renders the cycle path', () => {
    expect(new PluginCycleError(['a', 'b', 'a']).message).toContain('a -> b -> a')
  })
})

describe('causeChain', () => {
  it('walks outermost first', () => {
    const inner = new Error('inner')
    const middle = new NetworkError('middle', { cause: inner })
    const outer = new TelegramError('outer', { cause: middle })

    expect([...causeChain(outer)]).toEqual([outer, middle, inner])
  })

  it('stops at a plain value', () => {
    const outer = new TelegramError('outer', { cause: { code: 400 } })
    expect([...causeChain(outer)]).toHaveLength(2)
  })

  it('terminates on a cyclic cause chain', () => {
    const a = new Error('a')
    const b = new Error('b', { cause: a })
    Object.defineProperty(a, 'cause', { value: b })

    expect([...causeChain(a)]).toHaveLength(2)
  })

  it('handles a null or undefined input', () => {
    expect([...causeChain(undefined)]).toEqual([])
    expect([...causeChain(null)]).toEqual([])
  })
})

describe('findCause', () => {
  it('finds a wrapped error by type', () => {
    const flood = new FloodError('wait', { retryAfter: 5 })
    const wrapped = new TelegramError('outer', { cause: new NetworkError('mid', { cause: flood }) })

    expect(findCause(wrapped, FloodError)).toBe(flood)
    expect(findCause(wrapped, FloodError)?.retryAfter).toBe(5)
  })

  it('returns undefined when absent', () => {
    expect(findCause(new ConfigError('a'), FloodError)).toBeUndefined()
  })

  it('matches the outermost error itself', () => {
    const error = new FloodError('wait', { retryAfter: 1 })
    expect(findCause(error, FloodError)).toBe(error)
  })
})
