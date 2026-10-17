// SPDX-License-Identifier: MIT

/**
 * Bytes as text, and back.
 *
 * Hexadecimal for identifiers that end up in a message or a map key, and base64
 * for the two places bytes have to survive as a string: a session handed to a
 * person, and a value written to a store that keeps text.
 *
 * Here rather than at each site because the obvious way to write them reaches
 * for `Buffer`, which exists on a server and does not exist in a browser. Every
 * one of these paths runs in both — a session string is portable by design, and
 * a datacenter list is read on whichever runtime opened the connection — so a
 * `Buffer` on any of them is a program that loads and then fails the moment it
 * is used.
 *
 * `btoa` and `atob` are what both have. They are defined over characters rather
 * than bytes, so each direction converts explicitly instead of relying on a
 * string of bytes and a string of characters happening to coincide.
 */

import { ValidationError } from '../core.js'

/** Bytes as lowercase hexadecimal. */
export function toHex(bytes: Uint8Array): string {
  let out = ''
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0')

  return out
}

/** Bytes as base64. */
export function toBase64(bytes: Uint8Array): string {
  // Built a chunk at a time: `String.fromCharCode(...bytes)` spreads every byte
  // as an argument, and a large enough input overflows the call stack rather
  // than returning a long string.
  const CHUNK = 8192
  let characters = ''

  for (let at = 0; at < bytes.length; at += CHUNK) {
    characters += String.fromCharCode(...bytes.subarray(at, at + CHUNK))
  }

  return btoa(characters)
}

/** Base64 back to bytes. */
export function fromBase64(text: string): Uint8Array {
  let characters: string

  try {
    characters = atob(text)
  } catch {
    // What reaches here is a stored value or something a person pasted, so it
    // is reported as malformed rather than allowed to become a shorter key than
    // it should be.
    throw new ValidationError('a value that should be base64 could not be read')
  }

  const out = new Uint8Array(characters.length)
  for (let at = 0; at < characters.length; at += 1) out[at] = characters.charCodeAt(at)

  return out
}
