// SPDX-License-Identifier: MPL-2.0

/**
 * The type a generated declaration uses where TL does not name a shape.
 *
 * Three positions produce it: the `Object` pseudo-type, the `!X` parameter of a
 * generic method, and a bare value whose constructor the schema leaves to the
 * caller. In all three the wire carries a constructor identifier, so the value
 * is known at runtime and only unknown to the type system.
 */

/** A TL value identified by the constructor that produced it. */
export interface TlObject {
  readonly _: string
}
