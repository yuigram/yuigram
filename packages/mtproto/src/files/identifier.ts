/**
 * The opaque string that names a file across Telegram clients.
 *
 * Bot API clients hand files around as a single string: a bot receives a photo,
 * writes the string down, and sends the same photo back next week without ever
 * holding the bytes. That string is not a Bot API invention — it is TDLib's
 * encoding of exactly the fields MTProto needs to build a download location, so
 * an account speaking MTProto can read one, write one, and interoperate with
 * every client that uses them.
 *
 * ```
 *   "AgACAgIAAxkBA…"  ──> read ──> dc, kind, id, access hash, file reference
 *                                        │
 *                                        └──> an input location ──> download
 * ```
 *
 * **There are two identifiers and they are not the same thing.** A *file* id
 * encodes everything needed to fetch the file, including the file reference,
 * and therefore goes stale. A *unique* id encodes only what makes the file that
 * file — no access hash, no reference, no datacenter — and never goes stale,
 * but nothing can be downloaded from it. Both are here, and they are named for
 * what they are: {@link writeFileId} and {@link uniqueFileId}.
 *
 * **A file id containing a file reference does not make that reference valid.**
 * References expire; the identifier is a record of one, not a licence for it. A
 * download built from an old identifier is refused by Telegram exactly as a
 * download built from an old reference held any other way, and is refreshed the
 * same way. Nothing here extends the life of anything.
 *
 * **The layout.** The fields are written with TL's own primitives, runs of zero
 * bytes are collapsed, and the result is base64 with the URL alphabet and no
 * padding. Two bytes at the end say which version wrote it — a subversion and a
 * format version — and they are at the *end* because that is where a reader
 * must look before it knows how to read the rest.
 *
 * ```
 *   ┌──────────────────────────────────────────┬────────────┬─────────┐
 *   │ flags │ dc │ [reference] │ location …    │ subversion │ version │
 *   └──────────────────────────────────────────┴────────────┴─────────┘
 *     └── zero-run compressed ──┘                 └── plain, at the end ──┘
 * ```
 *
 * Version 4 is what is written. Version 2 is read, because identifiers that old
 * are still in circulation and refusing them would strand files nobody can
 * re-obtain. Anything else is refused by name rather than guessed at.
 */

import { ValidationError, YuigramError } from '@yuigram/core'
import { fromBase64, toBase64 } from '../crypto/encoding.js'
import type {
  TypeInputFileLocation,
  TypeInputWebFileLocation,
} from '../generated/api/types/index.js'

/** An identifier that could not be read, or a value that cannot be written. */
export class FileIdError extends YuigramError {
  override readonly name = 'FileIdError'
}

/** The format version this writes. */
const VERSION = 4

/** The oldest format version this reads. */
const VERSION_OLD = 2

/** The subversion this writes, which tracks TDLib's own. */
const SUBVERSION = 58

/** Set in the flags when the file lives on somebody else's web server. */
const IS_WEB = 1 << 24

/** Set in the flags when a file reference travels with the identifier. */
const HAS_REFERENCE = 1 << 25

/**
 * What kind of file an identifier names.
 *
 * Telegram's own numbering, which is part of the format rather than a choice —
 * an identifier written with a different number for a photo is an identifier
 * every other client reads as something else.
 */
export const FILE_KINDS = [
  'thumbnail',
  'profilePhoto',
  'photo',
  'voice',
  'video',
  'document',
  'encrypted',
  'temp',
  'sticker',
  'audio',
  'animation',
  'encryptedThumbnail',
  'wallpaper',
  'videoNote',
  'secureRaw',
  'secure',
  'background',
  'documentAsFile',
] as const

/** What kind of file an identifier names. */
export type FileKind = (typeof FILE_KINDS)[number]

/** How many kinds there are, which is also the first number that is not one. */
const KIND_COUNT = FILE_KINDS.length

/** The kinds stored as a photo rather than as a document. */
const PHOTO_KINDS: ReadonlySet<FileKind> = new Set<FileKind>([
  'photo',
  'profilePhoto',
  'thumbnail',
  'encryptedThumbnail',
  'wallpaper',
])

/**
 * Which picture of a photo an identifier names.
 *
 * A photo on Telegram is several images, and an identifier has to say which —
 * so this is not a detail of the photo but part of naming it. The variants are
 * the protocol's, and several are only produced by clients old enough that
 * writing them again would be wrong; those are read and never written.
 */
export type PhotoSource =
  /** A thumbnail of a particular size, named by the letter Telegram gives it. */
  | { readonly of: 'thumbnail'; readonly kind: FileKind; readonly size: string }
  /** Somebody's profile photo, in one of the two sizes. */
  | {
      readonly of: 'profilePhoto'
      readonly big: boolean
      readonly peerId: number
      readonly accessHash: bigint
    }
  /** The picture shown for a sticker set. */
  | { readonly of: 'stickerSet'; readonly setId: bigint; readonly accessHash: bigint }
  /** A sticker set's picture, named by which version of the set it belongs to. */
  | {
      readonly of: 'stickerSetVersion'
      readonly setId: bigint
      readonly accessHash: bigint
      readonly version: number
    }
  /** Written by clients that named a picture by a secret alone. Read, never written. */
  | { readonly of: 'legacy'; readonly secret: bigint }
  /** Written by clients that named one by volume, position and secret. Read, never written. */
  | {
      readonly of: 'fullLegacy'
      readonly volumeId: bigint
      readonly localId: number
      readonly secret: bigint
    }
  /** A profile photo from before the current layout. Read, never written. */
  | {
      readonly of: 'profilePhotoLegacy'
      readonly big: boolean
      readonly peerId: number
      readonly accessHash: bigint
      readonly volumeId: bigint
      readonly localId: number
    }
  /** A sticker-set picture from before the current layout. Read, never written. */
  | {
      readonly of: 'stickerSetLegacy'
      readonly setId: bigint
      readonly accessHash: bigint
      readonly volumeId: bigint
      readonly localId: number
    }

/** Where the file is, as the identifier describes it. */
export type FileWhere =
  /** Not Telegram's at all: a file on somebody else's server that Telegram proxies. */
  | { readonly at: 'web'; readonly url: string; readonly accessHash: bigint }
  /** A photo, which also says which of its pictures this is. */
  | {
      readonly at: 'photo'
      readonly id: bigint
      readonly accessHash: bigint
      readonly source: PhotoSource
    }
  /** Everything else, which is an identifier and a hash. */
  | { readonly at: 'document'; readonly id: bigint; readonly accessHash: bigint }

/** Everything an identifier says about a file. */
export interface FileIdentity {
  /** The datacenter the file lives on. */
  readonly dc: number
  /** What kind of file it is. */
  readonly kind: FileKind
  /**
   * The reference this identifier was written with, where it had one.
   *
   * Present because the format carries it, not because it is still good. A
   * reference expires and is refreshed by finding the file again; an identifier
   * that has one is a record of the reference at the time it was written.
   */
  readonly reference: Uint8Array | undefined
  /** Where the file is. */
  readonly where: FileWhere
}

/* -------------------------------------------------------------------------- */
/* The little binary layer the format is written in                            */
/* -------------------------------------------------------------------------- */

/** Accumulates the fields of an identifier. */
class Bytes {
  #out: number[] = []

  /** A 32-bit whole number, least significant byte first. */
  int(value: number): void {
    this.#out.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff)
  }

  /** A 64-bit whole number, least significant byte first. */
  long(value: bigint): void {
    let rest = BigInt.asUintN(64, value)
    for (let at = 0; at < 8; at += 1) {
      this.#out.push(Number(rest & 0xffn))
      rest >>= 8n
    }
  }

  /** One byte. */
  byte(value: number): void {
    this.#out.push(value & 0xff)
  }

  /**
   * A length-prefixed run of bytes, padded to a multiple of four.
   *
   * TL's own encoding: one length byte below 254, or a marker and three length
   * bytes above it, then the content, then zeros up to the next multiple of
   * four. Getting the padding wrong shifts every field after it.
   */
  bytes(value: Uint8Array): void {
    let written = 0

    if (value.length <= 253) {
      this.#out.push(value.length)
      written = 1
    } else {
      this.#out.push(
        254,
        value.length & 0xff,
        (value.length >>> 8) & 0xff,
        (value.length >>> 16) & 0xff,
      )
      written = 4
    }

    for (const byte of value) this.#out.push(byte)
    written += value.length

    while (written % 4 !== 0) {
      this.#out.push(0)
      written += 1
    }
  }

  /** Text, as its bytes. */
  text(value: string): void {
    this.bytes(new TextEncoder().encode(value))
  }

  /** Everything written so far. */
  done(): Uint8Array {
    return new Uint8Array(this.#out)
  }
}

/** Reads the fields of an identifier, refusing to run off the end. */
class Reading {
  #at = 0
  readonly #bytes: Uint8Array

  constructor(bytes: Uint8Array) {
    this.#bytes = bytes
  }

  /** Whether anything is left. */
  get spent(): boolean {
    return this.#at >= this.#bytes.length
  }

  #take(count: number): Uint8Array {
    if (this.#at + count > this.#bytes.length) {
      throw new FileIdError('this file identifier ends in the middle of a field')
    }

    const taken = this.#bytes.subarray(this.#at, this.#at + count)
    this.#at += count

    return taken
  }

  int(): number {
    const [a, b, c, d] = this.#take(4) as unknown as [number, number, number, number]

    return a | (b << 8) | (c << 16) | (d << 24) | 0
  }

  long(): bigint {
    const taken = this.#take(8)
    let value = 0n
    for (let at = 7; at >= 0; at -= 1) value = (value << 8n) | BigInt(taken[at] as number)

    return BigInt.asIntN(64, value)
  }

  byte(): number {
    return this.#take(1)[0] as number
  }

  bytes(): Uint8Array {
    const first = this.byte()
    let length: number
    let written: number

    if (first === 254) {
      const [a, b, c] = this.#take(3) as unknown as [number, number, number]
      length = a | (b << 8) | (c << 16)
      written = 4 + length
    } else {
      length = first
      written = 1 + length
    }

    const taken = this.#take(length)
    while (written % 4 !== 0) {
      this.#take(1)
      written += 1
    }

    return taken
  }

  text(): string {
    return new TextDecoder().decode(this.bytes())
  }
}

/**
 * Collapse runs of zero bytes, which is most of an identifier.
 *
 * A run becomes a zero and a count. Telegram does this before encoding because
 * the fields are mostly zero — a 64-bit number holding a small value is seven
 * zero bytes — and the strings would otherwise be half again as long.
 */
function squeeze(bytes: Uint8Array): Uint8Array {
  const out: number[] = []
  let zeros = 0

  for (const byte of bytes) {
    if (byte === 0) {
      zeros += 1
      continue
    }

    if (zeros > 0) {
      out.push(0, zeros)
      zeros = 0
    }
    out.push(byte)
  }

  if (zeros > 0) out.push(0, zeros)

  return new Uint8Array(out)
}

/** Put the zero runs back. */
function unsqueeze(bytes: Uint8Array): Uint8Array {
  const out: number[] = []
  let held = -1

  for (const byte of bytes) {
    if (held === 0) {
      for (let count = 0; count < byte; count += 1) out.push(0)
      held = -1
      continue
    }

    if (held !== -1) out.push(held)
    held = byte
  }

  if (held !== -1) out.push(held)

  return new Uint8Array(out)
}

/** Base64 with the URL alphabet and no padding, which is what Telegram uses. */
function toUrlBase64(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** The same, back. */
function fromUrlBase64(text: string): Uint8Array {
  const standard = text.replace(/-/g, '+').replace(/_/g, '/')
  const padded = standard + '='.repeat((4 - (standard.length % 4)) % 4)

  try {
    return fromBase64(padded)
  } catch {
    throw new FileIdError('this file identifier is not base64')
  }
}

/* -------------------------------------------------------------------------- */
/* Writing                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Write a file identifier a Bot API client will accept.
 *
 * ```ts
 * const text = writeFileId(identity)
 * ```
 *
 * Written in version 4, which is what every current client reads. An identity
 * describing one of the layouts only older clients produced is refused rather
 * than written in a form that would be read back as something else.
 */
export function writeFileId(identity: FileIdentity): string {
  const kind = FILE_KINDS.indexOf(identity.kind)
  if (kind < 0) throw new FileIdError(`'${identity.kind}' is not a kind of file`)

  const out = new Bytes()
  const web = identity.where.at === 'web'
  out.int(kind | (web ? IS_WEB : 0) | (identity.reference === undefined ? 0 : HAS_REFERENCE))
  out.int(identity.dc)

  if (identity.reference !== undefined) out.bytes(identity.reference)

  switch (identity.where.at) {
    case 'web':
      out.text(identity.where.url)
      out.long(identity.where.accessHash)
      break

    case 'photo':
      out.long(identity.where.id)
      out.long(identity.where.accessHash)
      writeSource(out, identity.where.source)
      break

    default:
      out.long(identity.where.id)
      out.long(identity.where.accessHash)
  }

  const squeezed = squeeze(out.done())
  const whole = new Uint8Array(squeezed.length + 2)
  whole.set(squeezed)
  // The version bytes are outside the compression, at the end, because a reader
  // has to know the version before it can make sense of anything else.
  whole[squeezed.length] = SUBVERSION
  whole[squeezed.length + 1] = VERSION

  return toUrlBase64(whole)
}

/** Write which picture of a photo this is. */
function writeSource(out: Bytes, source: PhotoSource): void {
  switch (source.of) {
    case 'legacy':
      out.int(0)
      out.long(source.secret)
      break

    case 'thumbnail': {
      const kind = FILE_KINDS.indexOf(source.kind)
      if (kind < 0) throw new FileIdError(`'${source.kind}' is not a kind of file`)
      if (source.size.length !== 1) {
        throw new FileIdError('a thumbnail size is one letter, as Telegram names them')
      }

      out.int(1)
      out.int(kind)
      out.int(source.size.charCodeAt(0))
      break
    }

    case 'profilePhoto':
      out.int(source.big ? 3 : 2)
      out.long(BigInt(source.peerId))
      out.long(source.accessHash)
      break

    case 'stickerSet':
      out.int(4)
      out.long(source.setId)
      out.long(source.accessHash)
      break

    case 'fullLegacy':
      out.int(5)
      out.long(source.volumeId)
      out.long(source.secret)
      out.int(source.localId)
      break

    case 'profilePhotoLegacy':
      out.int(source.big ? 7 : 6)
      out.long(BigInt(source.peerId))
      out.long(source.accessHash)
      out.long(source.volumeId)
      out.int(source.localId)
      break

    case 'stickerSetLegacy':
      out.int(8)
      out.long(source.setId)
      out.long(source.accessHash)
      out.long(source.volumeId)
      out.int(source.localId)
      break

    default:
      out.int(9)
      out.long(source.setId)
      out.long(source.accessHash)
      out.int(source.version)
  }
}

/* -------------------------------------------------------------------------- */
/* Reading                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Read a file identifier written by any Telegram client.
 *
 * ```ts
 * const identity = readFileId('AgACAgIAAxkBA…')
 * console.log(identity.dc, identity.kind)
 * ```
 *
 * Refused by name for a version this does not know, for an identifier that ends
 * in the middle of a field, and for one whose fields do not agree with each
 * other — a thumbnail claiming to be a video, a picture position below zero.
 * Every one of those is an identifier that would otherwise produce a download
 * request for the wrong thing.
 */
export function readFileId(text: string): FileIdentity {
  const whole = fromUrlBase64(text)
  if (whole.length < 2) throw new FileIdError('this file identifier is too short to be one')

  const version = whole[whole.length - 1] as number

  if (version === VERSION_OLD) {
    // Version 2 put one byte at the end rather than two, and had no subversion.
    return readFields(unsqueeze(whole.subarray(0, -1)), 0)
  }

  if (version !== VERSION) {
    throw new FileIdError(
      `this file identifier is version ${version}, and this understands ${VERSION_OLD} and ` +
        `${VERSION}. A newer version is a format change rather than a value that can be guessed at.`,
    )
  }

  const subversion = whole[whole.length - 2] as number
  if (subversion > SUBVERSION) {
    throw new FileIdError(
      `this file identifier was written by a newer Telegram (subversion ${subversion}, this ` +
        `understands up to ${SUBVERSION})`,
    )
  }

  return readFields(unsqueeze(whole.subarray(0, -2)), subversion)
}

/** Read the fields, once the version has said how they are laid out. */
function readFields(bytes: Uint8Array, subversion: number): FileIdentity {
  const reading = new Reading(bytes)

  const flags = reading.int()
  const web = (flags & IS_WEB) !== 0
  const hasReference = (flags & HAS_REFERENCE) !== 0
  const kindNumber = flags & ~IS_WEB & ~HAS_REFERENCE

  if (kindNumber < 0 || kindNumber >= KIND_COUNT) {
    throw new FileIdError(`this file identifier names file kind ${kindNumber}, which is not one`)
  }
  const kind = FILE_KINDS[kindNumber] as FileKind

  const dc = reading.int()
  let reference: Uint8Array | undefined

  if (hasReference) {
    const found = reading.bytes()
    // A single '#' is how Telegram writes "there was no reference" in a field
    // it had already said was present. Reported as absent, which is what it is.
    reference = found.length === 1 && found[0] === 0x23 ? undefined : found
  }

  const where: FileWhere = web
    ? { at: 'web', url: reading.text(), accessHash: reading.long() }
    : PHOTO_KINDS.has(kind)
      ? readPhoto(reading, subversion, kind)
      : { at: 'document', id: reading.long(), accessHash: reading.long() }

  return { dc, kind, reference, where }
}

/** Read a photo's location, which differs between subversions. */
function readPhoto(reading: Reading, subversion: number, kind: FileKind): FileWhere {
  const id = reading.long()
  const accessHash = reading.long()

  const source = subversion >= 32 ? readSource(reading) : readLegacyPhoto(reading, subversion)

  agree(source, kind)

  return { at: 'photo', id, accessHash, source }
}

/**
 * Read a picture position written before subversion 32.
 *
 * The volume came first back then, and what followed depended on how old the
 * writer was again. Read rather than refused because identifiers this old are
 * still passed around, and the file behind one is often not re-obtainable.
 */
function readLegacyPhoto(reading: Reading, subversion: number): PhotoSource {
  const volumeId = reading.long()

  if (subversion < 22) {
    return { of: 'fullLegacy', volumeId, secret: reading.long(), localId: positive(reading.int()) }
  }

  const source = readSource(reading)
  const localId = positive(reading.int())

  switch (source.of) {
    case 'legacy':
      return { of: 'fullLegacy', volumeId, secret: source.secret, localId }

    case 'fullLegacy':
    case 'thumbnail':
      return source

    case 'profilePhoto':
      return {
        of: 'profilePhotoLegacy',
        big: source.big,
        peerId: source.peerId,
        accessHash: source.accessHash,
        volumeId,
        localId,
      }

    case 'stickerSet':
      return {
        of: 'stickerSetLegacy',
        setId: source.setId,
        accessHash: source.accessHash,
        volumeId,
        localId,
      }

    default:
      throw new FileIdError(
        `a file identifier this old cannot name a picture the '${source.of}' way`,
      )
  }
}

/** Read which picture of a photo this is. */
function readSource(reading: Reading): PhotoSource {
  const variant = reading.int()

  switch (variant) {
    case 0:
      return { of: 'legacy', secret: reading.long() }

    case 1: {
      const kindNumber = reading.int()
      if (kindNumber < 0 || kindNumber >= KIND_COUNT) {
        throw new FileIdError(`a thumbnail in this identifier is of kind ${kindNumber}`)
      }

      const size = reading.int()
      if (size < 0 || size > 255) {
        throw new FileIdError(`a thumbnail size is one letter, and this identifier says ${size}`)
      }

      return {
        of: 'thumbnail',
        kind: FILE_KINDS[kindNumber] as FileKind,
        size: String.fromCharCode(size),
      }
    }

    case 2:
    case 3:
      return {
        of: 'profilePhoto',
        big: variant === 3,
        peerId: Number(reading.long()),
        accessHash: reading.long(),
      }

    case 4:
      return { of: 'stickerSet', setId: reading.long(), accessHash: reading.long() }

    case 5:
      return {
        of: 'fullLegacy',
        volumeId: reading.long(),
        secret: reading.long(),
        localId: positive(reading.int()),
      }

    case 6:
    case 7:
      return {
        of: 'profilePhotoLegacy',
        big: variant === 7,
        peerId: Number(reading.long()),
        accessHash: reading.long(),
        volumeId: reading.long(),
        localId: positive(reading.int()),
      }

    case 8:
      return {
        of: 'stickerSetLegacy',
        setId: reading.long(),
        accessHash: reading.long(),
        volumeId: reading.long(),
        localId: positive(reading.int()),
      }

    case 9:
      return {
        of: 'stickerSetVersion',
        setId: reading.long(),
        accessHash: reading.long(),
        version: reading.int(),
      }

    default:
      throw new FileIdError(
        `this file identifier names a picture the ${variant} way, which is not one this knows`,
      )
  }
}

/** A picture's position within a volume is counted from zero. */
function positive(localId: number): number {
  if (localId < 0)
    throw new FileIdError('this file identifier names a picture at a position below zero')

  return localId
}

/**
 * Refuse a picture position that does not match the kind of file it is in.
 *
 * A thumbnail source inside something that is not a thumbnail, or a profile
 * photo source inside a sticker: both are identifiers that would build a
 * download request for a different file. Telegram's own readers check this, and
 * an identifier that fails it is corrupt rather than merely unusual.
 */
function agree(source: PhotoSource, kind: FileKind): void {
  if (source.of === 'thumbnail') {
    const inside = kind === 'photo' || kind === 'thumbnail' || kind === 'encryptedThumbnail'
    if (!inside || source.kind !== kind) {
      throw new FileIdError(
        `this file identifier is a '${kind}' carrying a '${source.kind}' thumbnail`,
      )
    }

    return
  }

  if (source.of === 'profilePhoto' || source.of === 'profilePhotoLegacy') {
    if (kind !== 'profilePhoto') {
      throw new FileIdError(`this file identifier is a '${kind}' carrying a profile photo`)
    }

    return
  }

  if (
    (source.of === 'stickerSet' ||
      source.of === 'stickerSetLegacy' ||
      source.of === 'stickerSetVersion') &&
    kind !== 'thumbnail'
  ) {
    throw new FileIdError(`this file identifier is a '${kind}' carrying a sticker set's picture`)
  }
}

/* -------------------------------------------------------------------------- */
/* The identifier that does not go stale                                       */
/* -------------------------------------------------------------------------- */

/** What kind of thing a unique identifier names. Telegram's own numbering. */
const UNIQUE_WEB = 0
const UNIQUE_PHOTO = 1
const UNIQUE_DOCUMENT = 2
const UNIQUE_SECURE = 3
const UNIQUE_ENCRYPTED = 4
const UNIQUE_TEMP = 5

/**
 * The identifier that names the file and nothing about reaching it.
 *
 * ```ts
 * const stable = uniqueFileId(identity)
 * ```
 *
 * Carries no access hash, no file reference and no datacenter — so it never
 * goes stale, and nothing can be downloaded from it. What it is for is saying
 * *the same file*: two identifiers for one photo, obtained at different times
 * or by different accounts, have the same unique identifier and different file
 * identifiers. Every Telegram client computes it the same way, so it is a key
 * that means something outside this program.
 */
export function uniqueFileId(identity: FileIdentity): string {
  const out = new Bytes()
  const where = identity.where

  if (where.at === 'web') {
    out.int(UNIQUE_WEB)
    out.text(where.url)

    return toUrlBase64(squeeze(out.done()))
  }

  if (where.at === 'document') {
    out.int(uniqueKind(identity.kind))
    out.long(where.id)

    return toUrlBase64(squeeze(out.done()))
  }

  writeUniquePhoto(out, where.id, where.source)

  return toUrlBase64(squeeze(out.done()))
}

/** Which family of unique identifier a kind belongs to. */
function uniqueKind(kind: FileKind): number {
  switch (kind) {
    case 'photo':
    case 'profilePhoto':
    case 'thumbnail':
    case 'encryptedThumbnail':
    case 'wallpaper':
      return UNIQUE_PHOTO
    case 'secureRaw':
    case 'secure':
      return UNIQUE_SECURE
    case 'encrypted':
      return UNIQUE_ENCRYPTED
    case 'temp':
      return UNIQUE_TEMP
    default:
      return UNIQUE_DOCUMENT
  }
}

/** Write the part of a photo's unique identifier that says which picture. */
function writeUniquePhoto(out: Bytes, id: bigint, source: PhotoSource): void {
  out.int(UNIQUE_PHOTO)

  switch (source.of) {
    case 'legacy':
      // The 100 and 150 below are markers rather than lengths: they separate
      // the two kinds of identifier that would otherwise be the same bytes.
      out.int(100)
      out.long(source.secret)
      break

    case 'stickerSet':
      out.int(150)
      out.long(source.setId)
      out.long(source.accessHash)
      break

    case 'profilePhoto':
      out.long(id)
      out.byte(source.big ? 1 : 0)
      break

    case 'thumbnail':
      out.long(id)
      out.byte(thumbnailMarker(source.size))
      break

    case 'fullLegacy':
    case 'profilePhotoLegacy':
    case 'stickerSetLegacy':
      out.long(source.volumeId)
      out.int(source.localId)
      break

    default:
      out.byte(2)
      out.long(source.setId)
      out.int(source.version)
  }
}

/**
 * The one byte a thumbnail size becomes in a unique identifier.
 *
 * `a` and `c` are given 0 and 1 because they were the first two sizes and the
 * numbering predates the letters; everything else is its letter plus five. It
 * is arbitrary, and it is the same arbitrary in every client.
 */
function thumbnailMarker(size: string): number {
  const letter = size.charCodeAt(0)
  if (letter === 0x61) return 0
  if (letter === 0x63) return 1

  return letter + 5
}

/* -------------------------------------------------------------------------- */
/* Turning one back into something that can be downloaded                      */
/* -------------------------------------------------------------------------- */

/**
 * The download location an identifier describes.
 *
 * ```ts
 * const location = locationOf(readFileId(text))
 * for await (const part of account.download(location)) { … }
 * ```
 *
 * This is the point of the whole format: a string written down last week
 * becomes a request this account can make. What it cannot do is make a stale
 * file reference fresh — if the identifier's reference has expired, the
 * download is refused and the file has to be found again, exactly as it would
 * be for a reference held any other way.
 *
 * Refused for the layouts that name a picture by volume and position: Telegram
 * removed the request that took those, so an identifier carrying one describes
 * a file that can no longer be fetched by these means, and saying so is better
 * than building a request the server will not answer.
 */
export function locationOf(identity: FileIdentity): TypeInputFileLocation {
  const where = identity.where

  if (where.at === 'web') {
    throw new FileIdError(
      'this identifier names a file on somebody else’s server; use `webLocationOf` for one of those',
    )
  }

  if (where.at === 'document') {
    return {
      _: 'inputDocumentFileLocation',
      id: where.id,
      access_hash: where.accessHash,
      file_reference: identity.reference ?? new Uint8Array(0),
      thumb_size: '',
    }
  }

  return photoLocation(identity, where.id, where.accessHash, where.source)
}

/** The location for a photo, which depends on which picture it names. */
function photoLocation(
  identity: FileIdentity,
  id: bigint,
  accessHash: bigint,
  source: PhotoSource,
): TypeInputFileLocation {
  const reference = identity.reference ?? new Uint8Array(0)

  switch (source.of) {
    case 'thumbnail':
      return source.kind === 'photo'
        ? {
            _: 'inputPhotoFileLocation',
            id,
            access_hash: accessHash,
            file_reference: reference,
            thumb_size: source.size,
          }
        : {
            _: 'inputDocumentFileLocation',
            id,
            access_hash: accessHash,
            file_reference: reference,
            thumb_size: source.size,
          }

    case 'profilePhoto':
      return {
        _: 'inputPeerPhotoFileLocation',
        peer: {
          _: 'inputPeerUser',
          user_id: BigInt(source.peerId),
          access_hash: source.accessHash,
        },
        photo_id: id,
        ...(source.big ? { big: true as const } : {}),
      }

    case 'stickerSet':
    case 'stickerSetVersion':
      return {
        _: 'inputStickerSetThumb',
        stickerset: {
          _: 'inputStickerSetID',
          id: source.setId,
          access_hash: source.accessHash,
        },
        thumb_version: source.of === 'stickerSetVersion' ? source.version : 0,
      }

    default:
      throw new FileIdError(
        `this identifier names a picture the '${source.of}' way, which Telegram no longer ` +
          'accepts a download request for. The file has to be found again to be fetched.',
      )
  }
}

/**
 * The web location an identifier describes, for a file Telegram only proxies.
 *
 * ```ts
 * const location = webLocationOf(readFileId(text))
 * ```
 *
 * Separate from {@link locationOf} because it is a different request with a
 * different answer, not a variant of the same one.
 */
export function webLocationOf(identity: FileIdentity): TypeInputWebFileLocation {
  if (identity.where.at !== 'web') {
    throw new FileIdError('this identifier names a file on Telegram, not on somebody else’s server')
  }

  return {
    _: 'inputWebFileLocation',
    url: identity.where.url,
    access_hash: identity.where.accessHash,
  }
}

/**
 * Refuse an identifier that is not one, before anything is built from it.
 *
 * ```ts
 * if (looksLikeFileId(text)) { … }
 * ```
 *
 * A cheap shape check rather than a full read: it says whether reading is worth
 * attempting, which is what a caller sorting user input wants.
 */
export function looksLikeFileId(text: string): boolean {
  if (text.length < 8 || !/^[A-Za-z0-9_-]+$/.test(text)) return false

  try {
    const bytes = fromUrlBase64(text)
    const version = bytes[bytes.length - 1]

    return version === VERSION || version === VERSION_OLD
  } catch {
    return false
  }
}

/**
 * A download built straight from an identifier string.
 *
 * ```ts
 * const bytes = await account.download(fileFor(text))
 * ```
 *
 * The whole contract in one call: a string written down last week becomes a
 * download this account can make. The size is absent, because an identifier
 * does not carry one — which only affects how the transfer sizes its reads.
 *
 * The reference inside the identifier is used as it was written. If it has
 * expired the download is refused, and the file has to be found again: an
 * identifier is a record of a reference, never a way of keeping one alive.
 */
export function fileFor(identifier: string): {
  readonly dcId: number
  readonly location: TypeInputFileLocation
} {
  const identity = readFileId(identifier)

  return { dcId: identity.dc, location: locationOf(identity) }
}

/**
 * The identifier for a photo this account has in hand.
 *
 * ```ts
 * const text = fileIdOfPhoto(media.photo)
 * ```
 *
 * Names the largest picture that has to be fetched, which is the one
 * `photoFile` would download — so the string and the direct download reach the
 * same bytes. A photo carrying only pictures that arrived with the message has
 * nothing to name and is refused.
 */
export function fileIdOfPhoto(photo: {
  readonly _: string
  readonly id?: bigint
  readonly access_hash?: bigint
  readonly file_reference?: Uint8Array
  readonly dc_id?: number
  readonly sizes?: readonly { readonly _: string; readonly type?: string }[]
}): string {
  if (photo._ !== 'photo' || photo.id === undefined) {
    throw new FileIdError('an empty photo names no file')
  }

  const size = fetchableSize(photo.sizes ?? [])
  if (size === undefined) {
    throw new FileIdError(
      `photo ${photo.id} carries no picture that has to be fetched, only ones that arrived with it`,
    )
  }

  return writeFileId({
    dc: photo.dc_id ?? 0,
    kind: 'photo',
    reference: photo.file_reference,
    where: {
      at: 'photo',
      id: photo.id,
      accessHash: photo.access_hash ?? 0n,
      source: { of: 'thumbnail', kind: 'photo', size },
    },
  })
}

/**
 * The largest picture of a photo that is fetched rather than delivered.
 *
 * `photoStrippedSize` and `photoCachedSize` arrive inside the message and have
 * no location of their own, so naming one in an identifier would produce a
 * download request for something that was never on a datacenter.
 */
function fetchableSize(
  sizes: readonly { readonly _: string; readonly type?: string }[],
): string | undefined {
  const fetchable = sizes.filter(
    (size) =>
      (size._ === 'photoSize' || size._ === 'photoSizeProgressive') && size.type !== undefined,
  )

  return fetchable.at(-1)?.type
}

/**
 * The identifier for a document this account has in hand.
 *
 * ```ts
 * const text = fileIdOfDocument(media.document)
 * ```
 *
 * Which kind of file it is written as follows from the document's attributes,
 * because that is what other clients read back: a sticker written as a plain
 * document is still downloadable, and is shown as the wrong thing.
 */
export function fileIdOfDocument(document: {
  readonly _: string
  readonly id?: bigint
  readonly access_hash?: bigint
  readonly file_reference?: Uint8Array
  readonly dc_id?: number
  readonly mime_type?: string
  readonly attributes?: readonly { readonly _: string; readonly round_message?: boolean }[]
}): string {
  if (document._ !== 'document' || document.id === undefined) {
    throw new FileIdError('an empty document names no file')
  }

  return writeFileId({
    dc: document.dc_id ?? 0,
    kind: documentKind(document.attributes ?? [], document.mime_type ?? ''),
    reference: document.file_reference,
    where: {
      at: 'document',
      id: document.id,
      accessHash: document.access_hash ?? 0n,
    },
  })
}

/** Which kind of file a document's attributes say it is. */
function documentKind(
  attributes: readonly { readonly _: string; readonly round_message?: boolean }[],
  mime: string,
): FileKind {
  const has = (name: string) => attributes.some((one) => one._ === name)

  if (has('documentAttributeSticker')) return 'sticker'
  if (has('documentAttributeAnimated')) return 'animation'

  const video = attributes.find((one) => one._ === 'documentAttributeVideo')
  if (video !== undefined) return video.round_message === true ? 'videoNote' : 'video'

  const audio = attributes.find((one) => one._ === 'documentAttributeAudio') as
    | { readonly voice?: boolean }
    | undefined
  if (audio !== undefined) return audio.voice === true ? 'voice' : 'audio'

  // A GIF arrives as a video-less document with this type, and other clients
  // expect an animation rather than a plain file.
  if (mime === 'video/mp4' || mime === 'image/gif') return 'animation'

  return 'document'
}

/** Refused rather than silently accepted, because an identity is public input. */
export function checkIdentity(identity: FileIdentity): void {
  if (!Number.isInteger(identity.dc) || identity.dc < 0) {
    throw new ValidationError('a file identifier names a datacenter by a whole number')
  }
}
