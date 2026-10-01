/**
 * What the protocol needs from a runtime, stated as one contract.
 *
 * MTProto reaches for cryptography constantly and in only a handful of shapes:
 * three digests, random bytes, AES in two modes, and one constant-time
 * comparison. Every one of those is either provided by the runtime or has to be
 * supplied, and which is which is not a property of the protocol — it is a
 * property of where the program happens to be running.
 *
 * So the protocol code names this contract and never names a runtime. Two
 * implementations satisfy it: one over `node:crypto`, which is what Node, Bun
 * and Deno all provide, and one over nothing at all, which is what is left in a
 * browser or an edge worker. `docs/runtimes.md` §4 records how the choice
 * between them is made and why it is made at build time rather than at run
 * time.
 *
 * **Everything here is synchronous but one.** A message key is derived in the
 * middle of building a message and a transport stream is advanced in the middle
 * of writing a packet: making those await would turn every send and every
 * receive into a promise chain, on every runtime, to accommodate the one that
 * has no synchronous digest. Stretching a password is the exception and is
 * asynchronous everywhere, because it is a hundred thousand iterations reached
 * once during a sign-in — the one place where a runtime's own implementation is
 * worth waiting for, and the one place where doing it synchronously would stop
 * a browser tab from drawing for several seconds.
 */

import { ValidationError } from '../core.js'

/**
 * The one precondition both backends owe their callers.
 *
 * Stated here rather than in each of them because a contract whose two
 * implementations disagree about what they reject is a trap: the disagreement
 * would show up only on the runtime that was tested least. What is at stake is
 * not politeness — a byte count that is negative or fractional produces a
 * shorter array than asked for on at least one platform, and a key that is
 * quietly short is a break.
 */
export function checkByteCount(length: number): void {
  if (!Number.isInteger(length) || length < 0) {
    throw new ValidationError(`a byte count must be a non-negative integer, received ${length}`)
  }
}

/**
 * Reject a byte string that is not the width the caller named.
 *
 * Here, with the other shared precondition, because the modules that check
 * lengths are the ones underneath the backend rather than beside it: putting it
 * in `bytes.ts` — where a reader would look for it — would make every one of
 * them depend on the module that depends on the backend, which in a browser
 * build is a cycle. `bytes.ts` re-exports it, so nothing that already imports
 * it from there has to change.
 */
export function assertLength(value: Uint8Array, length: number, name: string): void {
  if (value.length !== length) {
    throw new ValidationError(`${name} must be ${length} bytes, received ${value.length}`)
  }
}

/** AES block size, in bytes. */
const BLOCK = 16

/** AES-256 key size, in bytes. */
const KEY_SIZE = 32

/** IGE carries two chaining blocks, so the IV is twice a block. */
const IV_SIZE = 32

/** Reject inputs the mode cannot express before touching any key material. */
export function checkIge(key: Uint8Array, iv: Uint8Array, data: Uint8Array): void {
  if (key.length !== KEY_SIZE) {
    throw new ValidationError(`an AES-IGE key must be ${KEY_SIZE} bytes, received ${key.length}`)
  }
  if (iv.length !== IV_SIZE) {
    throw new ValidationError(`an AES-IGE iv must be ${IV_SIZE} bytes, received ${iv.length}`)
  }
  if (data.length === 0) throw new ValidationError('AES-IGE data must not be empty')
  if (data.length % BLOCK !== 0) {
    throw new ValidationError(
      `AES-IGE data must be a multiple of ${BLOCK} bytes, received ${data.length}`,
    )
  }
}

/**
 * A counter-mode stream that keeps its place.
 *
 * The transport obfuscation layer runs one of these per direction per
 * connection, for the life of the connection. It is a stateful object rather
 * than a function because the keystream has to continue across calls: what
 * arrives from a socket has nothing to do with block boundaries, so a stream
 * that restarted per call would decrypt the first packet correctly and produce
 * rubbish after it.
 */
export interface CtrCipher {
  /** Combine the next bytes with the keystream, advancing it. */
  process(data: Uint8Array): Uint8Array
}

/** The cryptography the protocol needs, wherever it is running. */
export interface CryptoBackend {
  /**
   * Which implementation this is, for diagnostics.
   *
   * Reported rather than inferred: a program that is unexpectedly slow on a
   * server is usually one that resolved to the portable backend, and that is
   * not visible from anything else.
   */
  readonly name: string

  /** SHA-1, over the parts as one input. */
  sha1(...parts: readonly Uint8Array[]): Uint8Array

  /** SHA-256, over the parts as one input. */
  sha256(...parts: readonly Uint8Array[]): Uint8Array

  /** MD5, over the parts as one input. An upload checksum, never a security primitive. */
  md5(...parts: readonly Uint8Array[]): Uint8Array

  /**
   * Bytes from the runtime's cryptographic generator.
   *
   * Never `Math.random`. Nonces, session identifiers, message identifiers and
   * the client half of every key exchange come from here, and a predictable
   * one of any of those is a break.
   */
  randomBytes(length: number): Uint8Array

  /** AES-256 in IGE, encrypting. */
  igeEncrypt(data: Uint8Array, key: Uint8Array, iv: Uint8Array): Uint8Array

  /** AES-256 in IGE, decrypting. */
  igeDecrypt(data: Uint8Array, key: Uint8Array, iv: Uint8Array): Uint8Array

  /** A counter-mode stream starting at this counter block. */
  ctr(key: Uint8Array, counter: Uint8Array): CtrCipher

  /**
   * Compare two byte strings without revealing where they first differ.
   *
   * Used on message keys and authentication tags, where an attacker choosing
   * the value being compared could otherwise recover it a byte at a time from
   * how long the comparison took.
   */
  constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean

  /**
   * Stretch a password into a key, with PBKDF2 over SHA-512.
   *
   * Asynchronous on both backends. The platform has a callback form that keeps
   * the work off the thread that called it, and a browser has only
   * `crypto.subtle`, which is asynchronous and native — and is worth reaching
   * for here, since a hundred thousand iterations of SHA-512 in JavaScript
   * would take seconds during which the page could not draw.
   */
  pbkdf2(
    password: Uint8Array,
    salt: Uint8Array,
    iterations: number,
    length: number,
  ): Promise<Uint8Array>
}
