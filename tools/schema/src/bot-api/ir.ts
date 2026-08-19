/**
 * The Bot API intermediate representation.
 *
 * Telegram publishes no machine-readable Bot API schema; the HTML
 * documentation *is* the specification, and types are expressed in prose. This
 * IR is the contract between the parser, which understands that prose, and the
 * emitters, which understand TypeScript. Neither knows about the other.
 *
 * The IR is committed to the repository, so builds are reproducible offline,
 * schema changes appear as reviewable diffs, and a documentation restructure
 * breaks a scheduled job rather than everyone's build.
 */

/** A type expression, after prose has been normalized away. */
export type TypeRef =
  | { readonly kind: 'string' }
  | { readonly kind: 'integer' }
  | { readonly kind: 'float' }
  | { readonly kind: 'boolean' }
  /** Telegram's `True`: the field is present only when true, and is never false. */
  | { readonly kind: 'true' }
  /** An uploadable file. Marks the multipart boundary. */
  | { readonly kind: 'file' }
  | { readonly kind: 'array'; readonly of: TypeRef }
  | { readonly kind: 'union'; readonly of: readonly TypeRef[] }
  | { readonly kind: 'reference'; readonly name: string }
  /** A literal string value, used by discriminator fields such as `type`. */
  | { readonly kind: 'literal'; readonly value: string }

/** A field on an object, or a parameter of a method. */
export interface Field {
  readonly name: string
  readonly type: TypeRef
  readonly required: boolean
  readonly description: string
}

/** An object type. */
export interface ObjectType {
  readonly name: string
  /** Documentation section this belongs to, used to group generated output. */
  readonly group: string
  readonly description: string
  readonly documentationLink: string
  readonly fields: readonly Field[]
  /**
   * Subtypes, for abstract types documented as "It should be one of".
   * Present instead of `fields` for those.
   */
  readonly subtypes?: readonly string[]
}

/** A callable method. */
export interface Method {
  readonly name: string
  /** Documentation section this belongs to, used to group generated output. */
  readonly group: string
  readonly description: string
  readonly documentationLink: string
  readonly parameters: readonly Field[]
  readonly returns: TypeRef
  /**
   * Whether any parameter is declared `InputFile`.
   *
   * A hint only, and deliberately not the encoding decision. Telegram types
   * `InputMedia.media` as `String` and describes `attach://` uploads in prose,
   * so `sendMediaGroup` can carry an upload while declaring no `InputFile`
   * anywhere in its parameter graph — a transitive analysis over the schema
   * finds nothing extra, because the mechanism is not expressed in types.
   *
   * The runtime therefore chooses multipart by inspecting the argument values
   * it was actually given, which is correct for both cases.
   */
  readonly hasFileParameter: boolean
}

/** Where a schema came from, so provenance is machine-readable. */
export interface SchemaSource {
  readonly url: string
  readonly fetchedAt: string
}

/** A complete parsed Bot API schema. */
export interface BotApiSchema {
  readonly version: string
  readonly releasedAt: string | null
  readonly source: SchemaSource
  readonly methods: readonly Method[]
  readonly objects: readonly ObjectType[]
}
