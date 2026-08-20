/**
 * Logger and redaction behaviour.
 *
 * The redaction suite is the security-relevant half. A token reaching a log
 * aggregator is the most common credential leak in practice, so these cases
 * are written against the shapes secrets actually arrive in.
 */

import { describe, expect, it, vi } from 'vitest'
import { createLogger, type LogRecord, type LogSink, silentSink } from '../src/log/logger.js'
import { isSensitiveKey, REDACTED, redact, redactString } from '../src/log/redact.js'

function recordingSink(): LogSink & { records: LogRecord[] } {
  const records: LogRecord[] = []
  return { records, write: (record) => void records.push(record) }
}

// Deliberately shaped to match the redaction pattern - a fixture that does not
// match would let these tests pass while redaction was broken. Seven digits
// keeps it outside the range credential scanners treat as a real bot token.
const TOKEN = '1234567:REDACTION_TEST_VALUE_NOT_A_CREDENTIAL_00'

describe('redactString', () => {
  it('redacts a bare bot token', () => {
    expect(redactString(TOKEN)).toBe(REDACTED)
  })

  it('redacts a token inside an API URL', () => {
    const url = `https://api.telegram.org/bot${TOKEN}/sendMessage`
    const out = redactString(url)
    expect(out).not.toContain('TEST_TOKEN')
    expect(out).toContain('api.telegram.org')
  })

  it('redacts a token embedded in prose', () => {
    const out = redactString(`failed to call with token ${TOKEN} after 3 tries`)
    expect(out).not.toContain('TEST_TOKEN')
    expect(out).toContain('after 3 tries')
  })

  it('leaves innocent text alone', () => {
    // A pattern that mangles ordinary logs pushes people to disable redaction.
    const text = 'chat 123456789 received 42 messages at 12:30:45'
    expect(redactString(text)).toBe(text)
  })
})

describe('isSensitiveKey', () => {
  it('matches regardless of separators or case', () => {
    for (const key of ['apiHash', 'api_hash', 'API_HASH', 'api-hash']) {
      expect(isSensitiveKey(key)).toBe(true)
    }
  })

  it('covers the credentials that matter', () => {
    for (const key of ['token', 'session', 'authKey', 'password', 'accessHash', 'serverSalt']) {
      expect(isSensitiveKey(key)).toBe(true)
    }
  })

  it('does not match ordinary fields', () => {
    for (const key of ['chatId', 'text', 'messageId', 'kind', 'date']) {
      expect(isSensitiveKey(key)).toBe(false)
    }
  })
})

describe('redact', () => {
  it('redacts sensitive fields by name', () => {
    expect(redact({ token: TOKEN, chatId: 1 })).toEqual({ token: REDACTED, chatId: 1 })
  })

  it('redacts nested structures', () => {
    const input = { client: { credentials: { apiHash: 'abc' }, name: 'main' } }
    expect(redact(input)).toEqual({ client: { credentials: REDACTED, name: 'main' } })
  })

  it('replaces binary data with a length summary', () => {
    // Auth keys are Uint8Arrays. Printing one would defeat the exercise.
    const out = redact({ authKeyBytes: new Uint8Array(256) }) as Record<string, unknown>
    expect(out['authKeyBytes']).toBe('[binary 256 bytes]')
  })

  it('redacts tokens found in values of non-sensitive fields', () => {
    const out = redact({ url: `https://api.telegram.org/bot${TOKEN}/getMe` }) as Record<
      string,
      unknown
    >
    expect(out['url']).not.toContain('TEST_TOKEN')
  })

  it('handles circular references', () => {
    const input: Record<string, unknown> = { name: 'a' }
    input['self'] = input
    expect(() => redact(input)).not.toThrow()
    expect((redact(input) as Record<string, unknown>)['self']).toBe('[circular]')
  })

  it('truncates beyond the depth limit rather than recursing forever', () => {
    let deep: Record<string, unknown> = { value: 1 }
    for (let i = 0; i < 20; i++) deep = { nested: deep }
    expect(() => redact(deep)).not.toThrow()
    expect(JSON.stringify(redact(deep))).toContain('[truncated]')
  })

  it('preserves errors while redacting their message and cause', () => {
    const cause = new Error(`inner ${TOKEN}`)
    const error = new Error('outer', { cause })
    const out = redact(error) as Record<string, unknown>

    expect(out['name']).toBe('Error')
    expect(out['message']).toBe('outer')
    expect(JSON.stringify(out['cause'])).not.toContain('TEST_TOKEN')
  })

  it('walks maps and sets', () => {
    expect(redact(new Map([['token', TOKEN]]))).toEqual({ token: REDACTED })
    expect(redact(new Set([1, 2]))).toEqual([1, 2])
  })
})

describe('createLogger', () => {
  it('emits at or above the configured level', () => {
    const sink = recordingSink()
    const log = createLogger({ level: 'warn', sink })

    log.debug('d')
    log.info('i')
    log.warn('w')
    log.error('e')

    expect(sink.records.map((r) => r.level)).toEqual(['warn', 'error'])
  })

  it('suppresses everything at silent', () => {
    const sink = recordingSink()
    createLogger({ level: 'silent', sink }).error('boom')
    expect(sink.records).toHaveLength(0)
  })

  it('reports whether a level is enabled', () => {
    const log = createLogger({ level: 'info', sink: silentSink() })
    expect(log.isEnabled('debug')).toBe(false)
    expect(log.isEnabled('info')).toBe(true)
    expect(log.isEnabled('error')).toBe(true)
  })

  it('redacts message and fields on the way to the sink', () => {
    const sink = recordingSink()
    createLogger({ level: 'debug', sink }).info(`calling with ${TOKEN}`, { token: TOKEN, id: 7 })

    const record = sink.records[0]
    expect(record?.message).not.toContain('TEST_TOKEN')
    expect(record?.fields).toEqual({ token: REDACTED, id: 7 })
  })

  it('merges base fields into every record', () => {
    const sink = recordingSink()
    createLogger({ sink, fields: { client: 'main' } }).info('hello', { id: 1 })
    expect(sink.records[0]?.fields).toEqual({ client: 'main', id: 1 })
  })

  it('lets a call-site field override a base field', () => {
    const sink = recordingSink()
    createLogger({ sink, fields: { client: 'main' } }).info('hello', { client: 'other' })
    expect(sink.records[0]?.fields).toEqual({ client: 'other' })
  })

  describe('child', () => {
    it('composes names', () => {
      const sink = recordingSink()
      createLogger({ sink, name: 'app' }).child('bot').child('polling').info('x')
      expect(sink.records[0]?.name).toBe('app:bot:polling')
    })

    it('inherits and extends fields', () => {
      const sink = recordingSink()
      createLogger({ sink, fields: { a: 1 } })
        .child('c', { b: 2 })
        .info('x')
      expect(sink.records[0]?.fields).toEqual({ a: 1, b: 2 })
    })

    it('inherits the level and sink', () => {
      const sink = recordingSink()
      createLogger({ level: 'error', sink }).child('c').info('ignored')
      expect(sink.records).toHaveLength(0)
    })
  })

  describe('default console sink', () => {
    it('sends ordinary records to stdout', () => {
      const out = vi.spyOn(console, 'log').mockImplementation(() => {})
      const err = vi.spyOn(console, 'error').mockImplementation(() => {})

      createLogger({ level: 'debug' }).info('hello')

      expect(out).toHaveBeenCalled()
      expect(err).not.toHaveBeenCalled()
    })

    it('sends diagnostics to stderr', () => {
      // Keeping the two apart means piping a bot's output somewhere does not
      // interleave warnings with ordinary records.
      const out = vi.spyOn(console, 'log').mockImplementation(() => {})
      const err = vi.spyOn(console, 'error').mockImplementation(() => {})

      const log = createLogger({ level: 'debug' })
      log.warn('careful')
      log.error('broken')

      expect(err).toHaveBeenCalledTimes(2)
      expect(out).not.toHaveBeenCalled()
    })

    it('passes fields through as a second argument', () => {
      const out = vi.spyOn(console, 'log').mockImplementation(() => {})
      createLogger({ level: 'debug' }).info('hello', { id: 1 })
      expect(out).toHaveBeenCalledWith(expect.stringContaining('hello'), { id: 1 })
    })
  })
})

describe('logging an error', () => {
  class ApiFailure extends Error {
    override readonly name = 'ApiFailure'
    constructor(
      message: string,
      readonly code: number,
      readonly method: string,
      readonly retryAfter: number,
    ) {
      super(message)
    }
  }

  it('keeps the fields that say what went wrong', () => {
    // The error taxonomy exists to preserve the status, the method and the
    // retry delay. Reducing an error to name and message at the log boundary
    // discarded exactly that, leaving a record saying only that something
    // failed - the one thing the reader already knows.
    const out = redact(new ApiFailure('Too Many Requests', 429, 'sendMessage', 30)) as Record<
      string,
      unknown
    >

    expect(out['name']).toBe('ApiFailure')
    expect(out['message']).toBe('Too Many Requests')
    expect(out['code']).toBe(429)
    expect(out['method']).toBe('sendMessage')
    expect(out['retryAfter']).toBe(30)
  })

  it('keeps a stack to locate the failure', () => {
    expect((redact(new Error('boom')) as Record<string, unknown>)['stack']).toBeDefined()
  })

  it('redacts a token quoted in a stack', () => {
    // A stack can quote a request URL, so it is trusted no more than any other
    // string.
    const error = new Error('failed')
    error.stack = `at fetch (https://api.telegram.org/bot${TOKEN}/sendMessage)`

    expect(JSON.stringify(redact(error))).not.toContain('TEST_TOKEN')
  })

  it('redacts a secret carried on an error field', () => {
    const error = Object.assign(new Error('failed'), { token: 'abc-secret-value' })

    expect((redact(error) as Record<string, unknown>)['token']).toBe(REDACTED)
  })

  it('keeps the cause chain', () => {
    const out = redact(new Error('outer', { cause: new Error('inner') })) as Record<string, unknown>

    expect((out['cause'] as Record<string, unknown>)['message']).toBe('inner')
  })
})

describe('what counts as a sensitive key', () => {
  it('does not redact an HTTP status under the name code', () => {
    // A bare `code` matches both an authentication code and a status. The
    // specific names are listed instead, because over-broad redaction is what
    // gets redaction disabled.
    expect(isSensitiveKey('code')).toBe(false)
  })

  it('still redacts the codes that are secret', () => {
    for (const key of ['phone_code', 'loginCode', 'auth_code', 'smsCode', 'otp'] as const) {
      expect(isSensitiveKey(key), key).toBe(true)
    }
  })

  it('redacts a phone number', () => {
    // The account identity for an MTProto sign-in.
    expect(isSensitiveKey('phone_number')).toBe(true)
  })
})
