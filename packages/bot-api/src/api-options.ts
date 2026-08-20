/**
 * Per-call controls.
 *
 * Kept separate from the generated method surface so regenerating the schema
 * never touches them, and so a caller can cancel or re-time any of the 185
 * methods without the generator knowing that cancellation exists.
 */

/** Controls applying to a single API call. */
export interface CallOptions {
  /**
   * Cancels the request.
   *
   * The reason this is not merely a convenience: a long poll holds a request
   * open for up to a minute, so a shutdown that cannot cancel it waits out the
   * full timeout. Under a process manager that is the difference between a
   * graceful stop and a kill.
   */
  readonly signal?: AbortSignal | undefined

  /** Overrides the transport's default timeout, in milliseconds. */
  readonly timeout?: number | undefined
}
