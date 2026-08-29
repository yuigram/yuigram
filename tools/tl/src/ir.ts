/**
 * The intermediate representation a TL schema is parsed into.
 *
 * The IR is committed alongside the raw `.tl` text, and the emitters read only
 * this. Keeping the two artifacts separate is what lets a schema update be
 * reviewed as two independent questions: what Telegram changed, and how the
 * parser read it.
 *
 * Every shape here is deliberately explicit — a field's optionality, a vector's
 * boxing, a type's bareness. TL encodes those distinctions in punctuation, and
 * a representation that loses one produces a codec that is wrong in a way no
 * round-trip test can see.
 */

/** Which schema a definition belongs to. */
export type TlTable = 'core' | 'mtproto' | 'api'

/** A type expression as it appears in a parameter or a result. */
export type TlType =
  /** `int`, `long`, `bytes`, … — a type the codec handles directly. */
  | { readonly kind: 'primitive'; readonly name: TlPrimitive }
  /**
   * A reference to another type.
   *
   * `bare` distinguishes `%Message` and a lowercase constructor reference from
   * a boxed `Message`: a bare value omits its leading constructor id, so the
   * reader must be told which constructor to expect rather than reading one.
   */
  | { readonly kind: 'named'; readonly name: string; readonly bare: boolean }
  /**
   * `Vector<T>` or `vector<T>`.
   *
   * The lowercase form is bare — it omits the `0x1cb5c415` header that the
   * boxed form carries. Both occur in the schemas.
   */
  | { readonly kind: 'vector'; readonly item: TlType; readonly bare: boolean }
  /** `!X` — the wrapped call of a generic function such as `invokeWithLayer`. */
  | { readonly kind: 'generic'; readonly name: string }
  /** `[ t ]` or `4*[ int ]` — a repetition, used only by the TL builtins. */
  | { readonly kind: 'repeat'; readonly count: number | null; readonly item: TlType }
  /** `?` — a builtin whose body the language does not describe. */
  | { readonly kind: 'opaque' }

/** Types the codec encodes without consulting a table. */
export type TlPrimitive =
  | 'int'
  | 'long'
  | 'double'
  | 'string'
  | 'bytes'
  | 'int128'
  | 'int256'
  | 'bool'
  | 'true'
  | 'nat'
  | 'object'

/** One parameter of a combinator. */
export type TlParam =
  /**
   * `flags:#` — a bitfield other parameters test against.
   *
   * Named rather than assumed: `api.tl` declares both `flags` and `flags2`, and
   * a parser that hardcodes the first name misreads five constructors.
   */
  | { readonly kind: 'bitfield'; readonly name: string }
  /** An ordinary parameter, optionally conditional on a bitfield bit. */
  | {
      readonly kind: 'field'
      readonly name: string
      readonly type: TlType
      /** Set when the parameter is written `name:flags.N?Type`. */
      readonly conditional: { readonly field: string; readonly bit: number } | null
    }

/** Why a combinator's identifier could not be computed from its signature. */
export type TlIdOrigin =
  /** Computed by CRC32 and confirmed against the declared id. */
  | 'verified'
  /** Computed by CRC32; the schema declared no id to confirm it against. */
  | 'computed'
  /**
   * Taken from the schema because the signature uses a construct the
   * canonicalization does not cover — a generic parameter, a bare marker, or a
   * builtin body. Twenty combinators across both schemas are in this class.
   */
  | 'declared'
  /**
   * A declaration of one of the language's own primitives — `int ? = Int;`,
   * `int128 4*[ int ] = Int128;`. These describe types the codec handles
   * directly rather than constructors that appear on the wire, so they carry no
   * identifier and no table lists them.
   */
  | 'builtin'

/** A constructor or a method. */
export interface TlCombinator {
  /** Full name as written, including any namespace: `messages.sendMessage`. */
  readonly name: string
  /** The dotted prefix, or `null` at the root. */
  readonly namespace: string | null
  /** The name without its namespace. */
  readonly shortName: string
  /** The 32-bit identifier that precedes a boxed value on the wire. */
  readonly id: number
  /** How that identifier was established. */
  readonly idOrigin: TlIdOrigin
  /** Generic parameters declared as `{X:Type}`. */
  readonly generics: readonly string[]
  readonly params: readonly TlParam[]
  /** The type this combinator constructs. */
  readonly result: TlType
  /** Line number in the source document, for diagnostics. */
  readonly line: number
}

/** A parsed schema document. */
export interface TlSchema {
  readonly table: TlTable
  /** Layer number for `api.tl`; `null` for the unversioned service schema. */
  readonly layer: number | null
  readonly constructors: readonly TlCombinator[]
  readonly methods: readonly TlCombinator[]
}

/** The primitives the TL language defines rather than a schema declaring. */
export const TL_PRIMITIVE_NAMES: ReadonlyMap<string, TlPrimitive> = new Map([
  ['int', 'int'],
  ['long', 'long'],
  ['double', 'double'],
  ['string', 'string'],
  ['bytes', 'bytes'],
  ['int128', 'int128'],
  ['int256', 'int256'],
  ['Bool', 'bool'],
  ['true', 'true'],
  ['#', 'nat'],
  ['Object', 'object'],
])

/** Every combinator in a schema, constructors before methods. */
export function allCombinators(schema: TlSchema): readonly TlCombinator[] {
  return [...schema.constructors, ...schema.methods]
}
