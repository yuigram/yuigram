/**
 * Structural redaction of secrets.
 *
 * The most common credential leak in practice is not a cryptographic failure —
 * it is a token reaching a log aggregator. Redaction is therefore applied to
 * every record structurally, rather than relying on each call site to remember.
 *
 * There is deliberately no way to turn this off. An option to disable
 * redaction is an option that ends up disabled in production.
 */

/** Replacement written in place of a redacted value. */
export const REDACTED = '[redacted]'

/**
 * Field names whose values are never logged, matched case-insensitively and
 * ignoring separators, so `api_hash`, `apiHash` and `APIHASH` all match.
 */
const SENSITIVE_KEYS: readonly string[] = [
  'token',
  'bottoken',
  'apihash',
  'apiid',
  'authkey',
  'authkeys',
  'tempauthkey',
  'session',
  'sessionstring',
  'password',
  'passwordhash',
  'twofa',
  'code',
  'logincode',
  'phonecode',
  'secret',
  'secrettoken',
  'salt',
  'serversalt',
  'accesshash',
  'filereference',
  'credentials',
  'authorization',
  'cookie',
]

/** Normalise a key for comparison: lowercase, separators removed. */
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[-_\s.]/g, '')
}

/** True when a field name should never have its value logged. */
export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.includes(normalizeKey(key))
}

/**
 * Value patterns that are unmistakably secret regardless of the field they
 * arrived in.
 *
 * Kept deliberately narrow. A pattern that also matches innocent data produces
 * unreadable logs, which pushes people towards disabling redaction — the exact
 * outcome this module exists to prevent.
 */
const VALUE_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  // Bot token, including inside an API URL: 123456789:AA...
  [/\b\d{6,}:[A-Za-z0-9_-]{30,}\b/g, REDACTED],
  // Bot token embedded in a path segment, e.g. /bot<token>/sendMessage
  [/\/bot\d{6,}:[A-Za-z0-9_-]{30,}/g, `/bot${REDACTED}`],
]

/** Redact secret-shaped substrings inside a string. */
export function redactString(value: string): string {
  let out = value
  for (const [pattern, replacement] of VALUE_PATTERNS) {
    out = out.replace(pattern, replacement)
  }
  return out
}

/** Maximum depth walked when redacting a structure. */
const MAX_DEPTH = 8

/**
 * Redact a value of any shape.
 *
 * Walks plain objects, arrays, maps and sets. Binary data is replaced with a
 * length summary rather than logged — an auth key is a `Uint8Array`, and
 * printing it would defeat the whole exercise.
 */
export function redact(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (depth > MAX_DEPTH) return '[truncated]'

  if (typeof value === 'string') return redactString(value)
  if (value === null || typeof value !== 'object') return value

  // Binary payloads are never useful in a log and are frequently key material.
  if (ArrayBuffer.isView(value)) return `[binary ${value.byteLength} bytes]`
  if (value instanceof ArrayBuffer) return `[binary ${value.byteLength} bytes]`

  if (seen.has(value)) return '[circular]'
  seen.add(value)

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      ...(value.cause === undefined ? {} : { cause: redact(value.cause, depth + 1, seen) }),
    }
  }

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1, seen))
  }

  if (value instanceof Map) {
    const out: Record<string, unknown> = {}
    for (const [key, item] of value) {
      const name = String(key)
      out[name] = isSensitiveKey(name) ? REDACTED : redact(item, depth + 1, seen)
    }
    return out
  }

  if (value instanceof Set) {
    return [...value].map((item) => redact(item, depth + 1, seen))
  }

  if (value instanceof Date) return value.toISOString()

  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = isSensitiveKey(key) ? REDACTED : redact(item, depth + 1, seen)
  }
  return out
}
