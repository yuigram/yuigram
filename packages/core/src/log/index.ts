export {
  consoleSink,
  createLogger,
  LOG_LEVELS,
  type LogFields,
  type Logger,
  type LoggerOptions,
  type LogLevel,
  type LogRecord,
  type LogSink,
  silentSink,
} from './logger.js'
export { isSensitiveKey, REDACTED, redact, redactString } from './redact.js'
