// SPDX-License-Identifier: MPL-2.0

/**
 * The salts a connection will need before it needs them.
 *
 * A server salt rotates every thirty minutes, and the server's way of telling a
 * client the salt has changed is to refuse the message that used the old one.
 * That refusal costs a round trip and delays whatever the message carried, on a
 * schedule, forever — so the salts are asked for in advance instead. The server
 * hands back a run of them with the window each is valid in, and the connection
 * draws from that rather than waiting to be corrected.
 *
 * A salt belongs to the authorization key rather than to a session, so the
 * reservoir survives a session being replaced. It does not survive the process:
 * what is persisted is the salt in force, and a restarted client refills from
 * the server the same way it filled the first time.
 *
 * Nothing here sends the request or decides when to. It reads an answer, holds
 * what the answer contained, and answers two questions about a moment in time:
 * which salt applies, and whether the supply is running low.
 */

import { ValidationError } from '@yuigram/core'
import type { TlScope, TlValue } from '../tl/index.js'
import { writeObject } from '../tl/index.js'

/**
 * Salts one request may ask for.
 *
 * The protocol's range. Asking for none is a request with no answer, and asking
 * for more than the server will return misreports how much was actually
 * obtained.
 */
const MIN_REQUESTED = 1
const MAX_REQUESTED = 64

/**
 * Salts the reservoir will hold.
 *
 * A well-behaved server returns at most what was asked for, which cannot exceed
 * the protocol's ceiling. The bound is applied to what arrives rather than to
 * what was asked, because the size of the answer is not the client's to decide.
 */
const CAPACITY = MAX_REQUESTED

/**
 * How many salts must still lie ahead before the supply counts as sufficient.
 *
 * A policy rather than a protocol rule: the protocol says when a salt expires,
 * not when to ask for the next. One salt in reserve means a single lost or
 * delayed answer leaves the connection with nothing but the one currently in
 * force, so the default keeps two, which is the smallest number that tolerates
 * one failure without falling back on being corrected by the server.
 */
const DEFAULT_RESERVE = 2

/** A salt and the window it may be used in. */
export interface FutureSalt {
  /** The first second it is valid. */
  readonly validSince: number
  /** The second it stops being valid. */
  readonly validUntil: number
  readonly salt: bigint
}

/** How the reservoir is built. */
export interface SaltReservoirOptions {
  /**
   * How many salts must still lie ahead before {@link SaltReservoir.lowOnSalts}
   * stops reporting the supply as low. Defaults to 2.
   */
  readonly reserve?: number
}

/**
 * Build a `get_future_salts` query.
 *
 * The count is checked here rather than left to the server, whose answer to a
 * count it will not honour is not specified.
 */
export function getFutureSalts(scope: TlScope, count: number): Uint8Array {
  if (!Number.isInteger(count) || count < MIN_REQUESTED || count > MAX_REQUESTED) {
    throw new ValidationError(
      `a request asks for between ${MIN_REQUESTED} and ${MAX_REQUESTED} salts, received ${count}`,
    )
  }

  return writeObject({ _: 'get_future_salts', num: count }, scope)
}

/**
 * Read a `future_salts` answer.
 *
 * The identifier it names is compared against the query it claims to answer,
 * which the protocol requires: salts govern which messages the server will
 * accept, and an answer accepted without that check is one that did not have to
 * be asked for.
 */
export function readFutureSalts(value: TlValue, reqMsgId: bigint): FutureSalt[] {
  if (value._ !== 'future_salts') {
    throw new ValidationError(`'${value._}' is not an answer carrying salts`)
  }

  const answered = value['req_msg_id']
  if (typeof answered !== 'bigint') {
    throw new ValidationError("'future_salts.req_msg_id' must be a 64-bit integer")
  }
  if (answered !== reqMsgId) {
    throw new ValidationError(`salts answer ${answered}, which is not the query ${reqMsgId}`)
  }

  const salts = value['salts']
  if (!Array.isArray(salts)) {
    throw new ValidationError("'future_salts.salts' must be a vector")
  }

  return salts.map((entry, index) => readSalt(entry, index))
}

function readSalt(entry: unknown, index: number): FutureSalt {
  if (typeof entry !== 'object' || entry === null) {
    throw new ValidationError(`salt ${index} is not a stated salt`)
  }

  const value = entry as TlValue
  if (value._ !== 'future_salt') {
    throw new ValidationError(`salt ${index} is a '${value._}'`)
  }

  const validSince = value['valid_since']
  const validUntil = value['valid_until']
  const salt = value['salt']

  if (typeof validSince !== 'number' || typeof validUntil !== 'number') {
    throw new ValidationError(`salt ${index} does not state the window it is valid in`)
  }
  if (typeof salt !== 'bigint') {
    throw new ValidationError(`salt ${index} is not a 64-bit value`)
  }

  return { validSince, validUntil, salt }
}

/**
 * The salts a connection has been given and has not used up.
 *
 * Ordered by the second each becomes valid, so the one that applies to a moment
 * and the one that applies after it are both found by looking along a line.
 */
export class SaltReservoir {
  #salts: FutureSalt[] = []
  readonly #reserve: number

  constructor(options: SaltReservoirOptions = {}) {
    const reserve = options.reserve ?? DEFAULT_RESERVE
    if (!Number.isInteger(reserve) || reserve < 1) {
      throw new ValidationError(`reserve must be a positive integer, received ${reserve}`)
    }

    this.#reserve = reserve
  }

  /** How many salts are held. */
  get size(): number {
    return this.#salts.length
  }

  /**
   * Take the salts an answer offered, and report how many were kept.
   *
   * A salt whose window has already closed is discarded rather than stored: it
   * can never be selected, and keeping it would let a server fill the reservoir
   * with values that look like supply and are not. One whose window is
   * inverted is discarded for the same reason.
   *
   * Salts already held are not replaced. The server may repeat one across two
   * answers, and a duplicate would be counted twice by the check that decides
   * whether more are needed.
   */
  offer(salts: readonly FutureSalt[], now: number): number {
    let kept = 0

    for (const salt of salts) {
      if (salt.validUntil <= salt.validSince) continue
      if (salt.validUntil <= now) continue
      if (this.#salts.some((held) => held.salt === salt.salt)) continue
      if (this.#salts.length >= CAPACITY) break

      this.#salts.push(salt)
      kept += 1
    }

    this.#salts.sort((a, b) => a.validSince - b.validSince)

    return kept
  }

  /**
   * The salt to use at `now`.
   *
   * The newest of those whose window covers the moment. Windows overlap while
   * one salt is being replaced by the next, and the protocol's rule for that
   * period is that messages carry the new salt — the old one is merely still
   * accepted.
   */
  inForce(now: number): bigint | undefined {
    let chosen: FutureSalt | undefined

    for (const salt of this.#salts) {
      if (salt.validSince > now) break
      if (salt.validUntil <= now) continue

      chosen = salt
    }

    return chosen?.salt
  }

  /**
   * Whether more salts should be asked for at `now`.
   *
   * Counted over the salts that are still usable after this moment, which is
   * what the connection will actually be able to draw on. A reservoir full of
   * expired salts is empty.
   */
  lowOnSalts(now: number): boolean {
    return this.usable(now) < this.#reserve
  }

  /** How many held salts are still usable at or after `now`. */
  usable(now: number): number {
    return this.#salts.filter((salt) => salt.validUntil > now).length
  }

  /**
   * Discard salts whose window has closed.
   *
   * Selection already steps over them, so this reclaims space rather than
   * changing an answer — without it a long-lived connection accumulates every
   * salt it was ever given and stops accepting new ones once it is full.
   */
  forgetExpired(now: number): number {
    const before = this.#salts.length
    this.#salts = this.#salts.filter((salt) => salt.validUntil > now)

    return before - this.#salts.length
  }

  /** Everything held, oldest window first. */
  held(): readonly FutureSalt[] {
    return [...this.#salts]
  }

  /** Forget everything, as a connection to a different datacenter must. */
  clear(): void {
    this.#salts = []
  }
}
