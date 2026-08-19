/**
 * The logger abstraction.
 *
 * Core must not be coupled to a logging library, so this is a small interface
 * with a console implementation. Structured loggers (pino, winston, bunyan)
 * are adapted by implementing `LogSink`.
 *
 * Every record passes through redaction before it reaches a sink, including
 * records produced by a custom sink's own caller. See `redact.ts`.
 */

import { redact } from './redact.js'

/** Severity levels, ordered. */
export const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'silent'] as const

/** A severity level. `silent` suppresses everything. */
export type LogLevel = (typeof LOG_LEVELS)[number]

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
}

/** Structured data attached to a log record. */
export type LogFields = Record<string, unknown>

/** A single log record, already redacted when it reaches a sink. */
export interface LogRecord {
  readonly level: Exclude<LogLevel, 'silent'>
  readonly message: string
  readonly fields: LogFields
  readonly name: string | undefined
  readonly time: Date
}

/** Where records go. Implement this to bridge to another logging library. */
export interface LogSink {
  write(record: LogRecord): void
}

/** The logging interface used throughout the framework. */
export interface Logger {
  debug(message: string, fields?: LogFields): void
  info(message: string, fields?: LogFields): void
  warn(message: string, fields?: LogFields): void
  error(message: string, fields?: LogFields): void
  /** Derive a logger that tags every record with a name and inherited fields. */
  child(name: string, fields?: LogFields): Logger
  /** True when a record at this level would be emitted. Guards expensive field construction. */
  isEnabled(level: Exclude<LogLevel, 'silent'>): boolean
}

/** Options for {@link createLogger}. */
export interface LoggerOptions {
  /** Minimum level to emit. Defaults to `info`; `debug` may carry sensitive structure. */
  readonly level?: LogLevel
  /** Where records go. Defaults to the console sink. */
  readonly sink?: LogSink
  /** Name for this logger, prefixed onto records. */
  readonly name?: string
  /** Fields merged into every record. */
  readonly fields?: LogFields
}

/**
 * Human-readable console sink, used when no sink is supplied.
 *
 * Diagnostics go to stderr and ordinary records to stdout, so piping a bot's
 * output somewhere does not interleave the two.
 */
export function consoleSink(): LogSink {
  return {
    write(record) {
      const time = record.time.toISOString()
      const label = record.name === undefined ? '' : ` [${record.name}]`
      const head = `${time} ${record.level.toUpperCase()}${label} ${record.message}`

      const isDiagnostic = record.level === 'error' || record.level === 'warn'
      // This is the one module where writing to the console is the intent
      // rather than a leftover debug statement.
      // biome-ignore lint/suspicious/noConsole: this sink exists to write to the console
      const target = isDiagnostic ? console.error : console.log

      if (Object.keys(record.fields).length > 0) {
        target(head, record.fields)
      } else {
        target(head)
      }
    },
  }
}

/** A sink that discards everything. Useful in tests. */
export function silentSink(): LogSink {
  return { write() {} }
}

/** Create a logger. */
export function createLogger(options: LoggerOptions = {}): Logger {
  const level = options.level ?? 'info'
  const sink = options.sink ?? consoleSink()
  const threshold = LEVEL_RANK[level]
  const baseFields = options.fields ?? {}
  const name = options.name

  const emit = (
    recordLevel: Exclude<LogLevel, 'silent'>,
    message: string,
    fields: LogFields | undefined,
  ): void => {
    if (LEVEL_RANK[recordLevel] < threshold) return

    const merged = fields === undefined ? baseFields : { ...baseFields, ...fields }

    sink.write({
      level: recordLevel,
      // Redaction is applied here, at the single point every record passes
      // through, rather than trusting each call site.
      message: typeof message === 'string' ? (redact(message) as string) : String(message),
      fields: redact(merged) as LogFields,
      name,
      time: new Date(),
    })
  }

  return {
    debug: (message, fields) => emit('debug', message, fields),
    info: (message, fields) => emit('info', message, fields),
    warn: (message, fields) => emit('warn', message, fields),
    error: (message, fields) => emit('error', message, fields),
    isEnabled: (recordLevel) => LEVEL_RANK[recordLevel] >= threshold,
    child: (childName, childFields) =>
      createLogger({
        level,
        sink,
        name: name === undefined ? childName : `${name}:${childName}`,
        fields: childFields === undefined ? baseFields : { ...baseFields, ...childFields },
      }),
  }
}
