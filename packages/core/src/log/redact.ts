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

  const binary = redactBinary(value)
  if (binary !== undefined) return binary

  if (seen.has(value)) return '[circular]'
  seen.add(value)

  return redactObject(value, depth, seen)
}

/**
 * Summarise binary payloads by length.
 *
 * Auth keys and salts are byte arrays, and printing one would defeat the whole
 * exercise. Returns `undefined` when the value is not binary.
 */
function redactBinary(value: object): string | undefined {
  if (ArrayBuffer.isView(value)) return `[binary ${value.byteLength} bytes]`
  if (value instanceof ArrayBuffer) return `[binary ${value.byteLength} bytes]`
  return undefined
}

/** Walk a container, redacting by key name and by value shape. */
function redactObject(value: object, depth: number, seen: WeakSet<object>): unknown {
  const child = (item: unknown): unknown => redact(item, depth + 1, seen)

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      ...(value.cause === undefined ? {} : { cause: child(value.cause) }),
    }
  }

  if (Array.isArray(value)) return value.map(child)
  if (value instanceof Set) return [...value].map(child)
  if (value instanceof Date) return value.toISOString()

  const entries =
    value instanceof Map
      ? [...value].map(([key, item]): [string, unknown] => [String(key), item])
      : Object.entries(value as Record<string, unknown>)

  const out: Record<string, unknown> = {}
  for (const [key, item] of entries) {
    out[key] = isSensitiveKey(key) ? REDACTED : child(item)
  }
  return out
}
