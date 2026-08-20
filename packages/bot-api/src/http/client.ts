/**
 * The HTTP seam.
 *
 * Everything the Bot API subsystem sends goes through this interface, so the
 * real `fetch`-based client and the test transport are interchangeable. Tests
 * then exercise the actual request construction, retry handling and response
 * decoding rather than a simplified stand-in.
 *
 * Defining the seam before the runtime is deliberate: a client written first
 * and made testable afterwards ends up testable only where it happened to be
 * convenient.
 */

/** A Bot API response envelope, as Telegram sends it. */
export interface ApiResponse<T = unknown> {
  readonly ok: boolean
  readonly result?: T
  readonly error_code?: number
  readonly description?: string
  readonly parameters?: ResponseParameters
}

/** Extra guidance Telegram attaches to a failure. */
export interface ResponseParameters {
  /** Seconds to wait before retrying, on a 429. */
  readonly retry_after?: number
  /** The supergroup a migrated chat moved to. */
  readonly migrate_to_chat_id?: number
}

/** One outgoing API call, before encoding. */
export interface ApiRequest {
  /** The Bot API method name, such as `sendMessage`. */
  readonly method: string
  /** Call parameters, unencoded. */
  readonly params: Record<string, unknown>
  /** Cancels the request when aborted. */
  readonly signal?: AbortSignal | undefined
  /** Overrides the client's default timeout, in milliseconds. */
  readonly timeout?: number | undefined
}

/** What a transport returns for a call. */
export interface ApiResult<T = unknown> {
  /** HTTP status, so callers can distinguish 429 from 400. */
  readonly status: number
  /** The decoded envelope. */
  readonly body: ApiResponse<T>
}

/**
 * Sends Bot API calls.
 *
 * Implementations are responsible for encoding, transport and decoding the
 * envelope. They must **not** interpret `ok: false` as an error: mapping a
 * refusal onto the error hierarchy is the caller's job, and a transport that
 * throws would hide the `error_code` and `parameters` a caller needs.
 */
export interface HttpClient {
  /** Perform one call. */
  call<T = unknown>(request: ApiRequest): Promise<ApiResult<T>>

  /**
   * Build the download URL for a `file_path`.
   *
   * The transport owns the token, so it builds the URL rather than handing the
   * token out. The result **contains the token** — Telegram's file endpoint
   * requires it — so it must be treated as a credential and never logged.
   *
   * Returns an on-disk path when pointed at a local Bot API server, which
   * reports absolute paths in `file_path` rather than serving over HTTP.
   */
  fileUrl?(filePath: string): string

  /** Fetch bytes from a URL produced by {@link fileUrl}. */
  fetchFile?(url: string): Promise<{ status: number; body: ReadableStream<Uint8Array> | null }>

  /** Release any held resources. */
  close?(): Promise<void>
}
