// SPDX-License-Identifier: MPL-2.0

/**
 * An MTProxy, as a route an account's connections take.
 *
 * Every connection an account makes — to its own datacenter, to another for a
 * file, to the test environment's — goes to the proxy instead, obfuscated with
 * the proxy's secret and carrying the datacenter it is meant for. The proxy
 * forwards it. Nothing falls back to a direct connection: a proxy that cannot
 * be reached, or that answers like something other than this proxy, is a
 * connection that fails, and the account retries it the way it retries any
 * other.
 *
 * Three kinds, by secret: plain obfuscation, the same with padded frames, and
 * the padded frames inside a TLS-looking session (`tls.ts`). See `secret.ts`
 * for how a secret says which.
 *
 * The secret is a credential for the proxy, and nothing here writes it down:
 * not in a description, not in an error, and not when the object is logged.
 */

import { CancelledError, NetworkError, ValidationError } from '@yuigram/core'
import { randomBytes } from '../crypto/random.js'
import type { StreamRequest } from '../network/channel.js'
import type { ConnectionRoute, RoutedConnection, RoutedDatacenter } from '../network/route.js'
import type { ByteStream } from '../network/stream.js'
import { type MtProxyMode, readProxySecret } from './secret.js'
import { clientHello, RecordReader, ServerHelloReader, wrapRecords } from './tls.js'

/** Where a proxy is, and its secret. */
export interface MtProxyOptions {
  /** Its host name or address. */
  readonly host: string
  readonly port: number
  /** As shared: hexadecimal or base64 text, or the bytes themselves. */
  readonly secret: string | Uint8Array
  /**
   * Milliseconds the TLS greeting may take once the socket is open, for a
   * fake-TLS proxy. Defaults to the account's connect timeout, else ten seconds.
   */
  readonly greetingTimeout?: number
}

/** A `tg://proxy` link as `readLink` describes it. */
export interface MtProxyLink {
  readonly kind: 'proxy'
  readonly server: string
  readonly port: number
  readonly secret: string
}

/** An MTProxy an account can be given as its `proxy`. */
export interface MtProxy extends ConnectionRoute {
  readonly host: string
  readonly port: number
  readonly mode: MtProxyMode
  /** The host a fake-TLS proxy's session claims to be with. */
  readonly domain: string | undefined
}

const DEFAULT_GREETING_TIMEOUT = 10_000

/** What the test environment adds to a datacenter's number when it is written for a proxy. */
const TEST_OFFSET = 10_000

/**
 * The datacenter as a proxy reads it: the number, ten thousand more in the
 * test environment, negative for a connection that carries files only.
 */
export function proxyDcId(datacenter: RoutedDatacenter): number {
  const id = datacenter.id + (datacenter.testMode ? TEST_OFFSET : 0)
  const written = datacenter.mediaOnly ? -id : id
  if (!Number.isInteger(written) || written < -0x8000 || written > 0x7fff) {
    throw new ValidationError(`datacenter ${datacenter.id} cannot be named to a proxy`)
  }

  return written
}

/** Join two chunks. */
function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length)
  out.set(a)
  out.set(b, a.length)
  return out
}

/**
 * Open a fake-TLS session and hand back the stream inside it.
 *
 * Resolves only once the proxy has answered the greeting with a ServerHello made
 * with the secret. Until then everything — a refused greeting, a closed socket,
 * the timeout, the request's signal — closes the socket and rejects.
 */
async function openFakeTls(
  request: StreamRequest,
  connector: (request: StreamRequest) => Promise<ByteStream>,
  proxy: { readonly host: string; readonly port: number },
  key: Uint8Array,
  domain: string,
  greetingTimeout: number,
): Promise<ByteStream> {
  const hello = clientHello({
    key,
    domain,
    time: Math.floor(Date.now() / 1000),
    random: randomBytes,
  })
  const greeting = new ServerHelloReader(key, hello.random)
  const records = new RecordReader()

  let greeted = false
  let settle: { resolve(): void; reject(error: Error): void } | undefined
  const answered = new Promise<void>((resolve, reject) => {
    settle = { resolve, reject }
  })
  let socket: ByteStream | undefined
  let ended = false

  /** Say the session ended, once, whichever of the ways it ended came first. */
  const end = (error?: Error): void => {
    if (ended) return
    ended = true
    request.onClose(error)
  }

  /** End the session for a reason found in what arrived. */
  const fail = (error: Error): void => {
    if (!greeted) {
      settle?.reject(error)
      return
    }
    end(error)
    if (socket?.open === true) socket.close()
  }

  const deliver = (bytes: Uint8Array): void => {
    for (const payload of records.push(bytes)) request.onData(payload)
  }

  socket = await connector({
    ...request,
    host: proxy.host,
    port: proxy.port,
    onData: (bytes) => {
      try {
        if (greeted) {
          deliver(bytes)
          return
        }
        const rest = greeting.push(bytes)
        if (rest === undefined) return
        greeted = true
        settle?.resolve()
        if (rest.length > 0) deliver(rest)
      } catch (error) {
        fail(error instanceof Error ? error : new NetworkError(String(error)))
      }
    },
    onClose: (error) => {
      if (!greeted) {
        settle?.reject(
          error ??
            new NetworkError('the proxy closed the connection before answering the greeting'),
        )
        return
      }
      end(error)
    },
  })

  const opened = socket
  const timer = setTimeout(
    () =>
      settle?.reject(
        new NetworkError(`the proxy did not answer the greeting in ${greetingTimeout} ms`),
      ),
    greetingTimeout,
  )
  const abandon = (): void => settle?.reject(new CancelledError('the connection was abandoned'))
  request.signal?.addEventListener('abort', abandon, { once: true })
  if (request.signal?.aborted === true) abandon()

  try {
    opened.write(hello.bytes)
    await answered
  } catch (error) {
    if (opened.open) opened.close()
    throw error
  } finally {
    clearTimeout(timer)
    request.signal?.removeEventListener('abort', abandon)
  }

  // The first write is the obfuscation's opening packet. It goes out in the
  // same record as the frame after it, as the proxy expects to find it.
  let held: Uint8Array | undefined
  let first = true

  return {
    write(bytes) {
      if (first && held === undefined) {
        held = bytes.slice()
        return
      }
      const data = held === undefined ? bytes : concat(held, bytes)
      held = undefined
      opened.write(wrapRecords(data, first))
      first = false
    },
    close() {
      held = undefined
      opened.close()
    },
    get open() {
      return opened.open
    },
    get pending() {
      return opened.pending + (held?.length ?? 0)
    },
  }
}

/**
 * An MTProxy, for an account's `proxy` option.
 *
 * ```ts
 * import { mtproxy } from 'yuigram/mtproxy'
 *
 * const account = Account.fromSession('./me', { ...options, proxy: mtproxy({ host, port, secret }) })
 * ```
 *
 * Takes a `tg://proxy` link as `readLink` describes it, too. Refuses a secret it
 * cannot read, or one of a kind it does not support, here rather than when a
 * connection fails.
 */
export function mtproxy(options: MtProxyOptions | MtProxyLink): MtProxy {
  const host = 'kind' in options ? options.server : options.host
  const port = options.port
  const greetingTimeout = 'greetingTimeout' in options ? options.greetingTimeout : undefined

  if (typeof host !== 'string' || host.trim() === '' || /\s/.test(host)) {
    throw new ValidationError('a proxy is named by a host without spaces')
  }
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new ValidationError(`a proxy port is from 1 to 65535, not ${String(port)}`)
  }
  if (
    greetingTimeout !== undefined &&
    (!Number.isInteger(greetingTimeout) || greetingTimeout <= 0)
  ) {
    throw new ValidationError('a greeting timeout is a positive number of milliseconds')
  }

  const secret = readProxySecret(options.secret)
  const description =
    secret.mode === 'fake-tls'
      ? `MTProxy ${host}:${port} (fake TLS as ${secret.domain ?? ''})`
      : `MTProxy ${host}:${port} (${secret.mode === 'padded' ? 'padded' : 'obfuscated'})`

  const proxy: MtProxy = {
    host,
    port,
    mode: secret.mode,
    domain: secret.domain,
    description,

    connection(datacenter): RoutedConnection {
      const dcId = proxyDcId(datacenter)
      const framing = secret.mode === 'obfuscated' ? 'intermediate' : 'padded-intermediate'

      return {
        framing,
        secret: secret.key.slice(),
        dcId,
        proxy: { address: host, port },
        open(request, connector) {
          if (secret.mode !== 'fake-tls') return connector({ ...request, host, port })

          return openFakeTls(
            request,
            connector,
            { host, port },
            secret.key,
            secret.domain ?? '',
            greetingTimeout ?? request.connectTimeout ?? DEFAULT_GREETING_TIMEOUT,
          )
        },
      }
    },
  }

  // What a log line or a debugger shows: never the secret.
  const shown = { host, port, mode: secret.mode, domain: secret.domain }
  Object.defineProperties(proxy, {
    toJSON: { value: () => shown, enumerable: false },
    [Symbol.for('nodejs.util.inspect.custom')]: {
      value: () => `MtProxy ${JSON.stringify(shown)}`,
      enumerable: false,
    },
  })

  return Object.freeze(proxy)
}
