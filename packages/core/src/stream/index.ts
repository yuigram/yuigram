/**
 * Streaming text into a chat as it is produced.
 *
 * A separate entry point, `@yuigram/core/stream`, holding what both transports
 * share: the sources a stream accepts, the windows it cuts text into, and the
 * loop that turns them into drafts and messages. Each transport supplies where
 * drafts and messages go, and how the reader's stop button reaches the stream.
 */

export {
  type EarlyEnd,
  type RunStreamOptions,
  runStream,
  STREAM_DEFAULTS,
  StopController,
  type StreamClock,
  type StreamResult,
  StreamSendError,
  StreamSourceError,
  type StreamTransport,
} from './engine.js'
export {
  type EmitterLike,
  fromAnthropic,
  fromBytes,
  fromEventEmitter,
  fromLangChain,
  fromOllama,
  fromOpenAI,
  fromTextStream,
  fromVercelAI,
  normalizeSource,
  type StreamSource,
  textOf,
} from './sources.js'
export {
  createWindow,
  cutPoint,
  DEFAULT_LIMITS,
  type Finished,
  type StreamFormat,
  type StreamPayload,
  type Window,
  type WindowLimits,
} from './windows.js'
