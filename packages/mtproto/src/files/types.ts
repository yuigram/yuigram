/**
 * What a file is, from what it starts with, and what it is called.
 *
 * A document sent to Telegram has to say what it is, and a caller uploading
 * bytes often does not know. Most formats say so in their first few bytes — a
 * signature placed there so that nothing has to guess — and those are read
 * here, without decoding anything. A name is a weaker hint, used only where the
 * content says nothing, since a name is whatever somebody chose to call it.
 */

/** A signature: bytes that must appear at an offset. `undefined` matches anything. */
interface Signature {
  readonly at: number
  readonly bytes: readonly (number | undefined)[]
}

const ascii = (text: string): number[] => [...text].map((character) => character.charCodeAt(0))

/** Formats identified by their opening bytes, most specific first. */
const SIGNATURES: readonly (readonly [string, readonly Signature[]])[] = [
  ['image/jpeg', [{ at: 0, bytes: [0xff, 0xd8, 0xff] }]],
  ['image/png', [{ at: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }]],
  ['image/gif', [{ at: 0, bytes: ascii('GIF8') }]],
  [
    'image/webp',
    [
      { at: 0, bytes: ascii('RIFF') },
      { at: 8, bytes: ascii('WEBP') },
    ],
  ],
  [
    'audio/wav',
    [
      { at: 0, bytes: ascii('RIFF') },
      { at: 8, bytes: ascii('WAVE') },
    ],
  ],
  [
    'video/x-msvideo',
    [
      { at: 0, bytes: ascii('RIFF') },
      { at: 8, bytes: ascii('AVI ') },
    ],
  ],
  ['image/bmp', [{ at: 0, bytes: ascii('BM') }]],
  ['image/tiff', [{ at: 0, bytes: [0x49, 0x49, 0x2a, 0x00] }]],
  ['image/tiff', [{ at: 0, bytes: [0x4d, 0x4d, 0x00, 0x2a] }]],
  ['audio/ogg', [{ at: 0, bytes: ascii('OggS') }]],
  ['audio/flac', [{ at: 0, bytes: ascii('fLaC') }]],
  ['audio/mpeg', [{ at: 0, bytes: ascii('ID3') }]],
  ['application/pdf', [{ at: 0, bytes: ascii('%PDF-') }]],
  ['application/zip', [{ at: 0, bytes: [0x50, 0x4b, 0x03, 0x04] }]],
  ['application/gzip', [{ at: 0, bytes: [0x1f, 0x8b] }]],
  ['application/vnd.rar', [{ at: 0, bytes: ascii('Rar!\u001a\u0007') }]],
  ['application/x-7z-compressed', [{ at: 0, bytes: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c] }]],
  ['video/webm', [{ at: 0, bytes: [0x1a, 0x45, 0xdf, 0xa3] }]],
]

/** What an ISO base media file's brand says it is. */
const BRANDS: Readonly<Record<string, string>> = {
  avif: 'image/avif',
  avis: 'image/avif',
  heic: 'image/heic',
  heix: 'image/heic',
  mif1: 'image/heif',
  'qt  ': 'video/quicktime',
  'M4A ': 'audio/mp4',
  'M4B ': 'audio/mp4',
  '3gp4': 'video/3gpp',
  '3gp5': 'video/3gpp',
}

/** Whether a sequence of bytes appears anywhere in another. */
function contains(bytes: Uint8Array, wanted: readonly number[]): boolean {
  for (let at = 0; at + wanted.length <= bytes.length; at += 1) {
    if (wanted.every((byte, offset) => bytes[at + offset] === byte)) return true
  }

  return false
}

function matches(bytes: Uint8Array, signature: Signature): boolean {
  return signature.bytes.every(
    (expected, index) => expected === undefined || bytes[signature.at + index] === expected,
  )
}

/**
 * What a file is, from the bytes it starts with.
 *
 * `undefined` where they say nothing this recognises — most text formats
 * among them, which have no signature. A few dozen bytes are enough; a caller
 * holding the whole file passes it.
 */
export function detectMimeType(head: Uint8Array): string | undefined {
  for (const [type, signatures] of SIGNATURES) {
    if (signatures.every((signature) => matches(head, signature))) {
      // Matroska and WebM share a signature; only WebM names its doctype.
      if (type === 'video/webm' && !contains(head, ascii('webm'))) return 'video/x-matroska'

      return type
    }
  }

  // MPEG audio without a tag starts with a frame's sync bits.
  if (head[0] === 0xff && head[1] !== undefined && (head[1] & 0xe0) === 0xe0) return 'audio/mpeg'

  // The ISO base media format — MP4, QuickTime, HEIF — names its brand after `ftyp`.
  if (matches(head, { at: 4, bytes: ascii('ftyp') })) {
    const brand = String.fromCharCode(...head.subarray(8, 12))

    return BRANDS[brand] ?? 'video/mp4'
  }

  return undefined
}

/**
 * Whether bytes are probably text: valid UTF-8 with no control characters
 * but the ones text uses.
 *
 * Probably, because a sample can only say so much. A sample cut in the middle
 * of a character is still text; a sample containing a NUL is not.
 */
export function isProbablyText(sample: Uint8Array): boolean {
  if (sample.length === 0) return false

  let decoded: string
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(sample, { stream: true })
  } catch {
    return false
  }

  // Tab, line feed, form feed and carriage return are text; other controls are not.
  for (let at = 0; at < decoded.length; at += 1) {
    const code = decoded.charCodeAt(at)
    const control = code < 0x20 || code === 0x7f
    if (control && code !== 0x09 && code !== 0x0a && code !== 0x0c && code !== 0x0d) return false
  }

  return true
}

/** What each common extension names, where the content cannot say. */
const EXTENSIONS: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  avif: 'image/avif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  flac: 'audio/flac',
  wav: 'audio/wav',
  pdf: 'application/pdf',
  zip: 'application/zip',
  gz: 'application/gzip',
  rar: 'application/vnd.rar',
  '7z': 'application/x-7z-compressed',
  json: 'application/json',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  html: 'text/html',
  htm: 'text/html',
  xml: 'application/xml',
  // An animated sticker: compressed Lottie, which is gzip to anything reading
  // its bytes and a sticker only by its name.
  tgs: 'application/x-tgsticker',
}

/** What a file name's extension says it is, or `undefined` where it says nothing known. */
export function mimeTypeOfName(name: string): string | undefined {
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return undefined

  return EXTENSIONS[name.slice(dot + 1).toLowerCase()]
}

/**
 * The name at the end of a path or an address.
 *
 * ```ts
 * fileNameOf('/home/me/Report Q3.pdf')               // 'Report Q3.pdf'
 * fileNameOf('https://example.com/a/b%20c.png?x=1')  // 'b c.png'
 * ```
 *
 * A label for a recipient, never a path to open: nothing here touches a
 * filesystem, and a name from elsewhere is whatever somebody chose.
 * `undefined` where the last segment is empty.
 */
export function fileNameOf(pathOrUrl: string): string | undefined {
  let path = pathOrUrl
  const scheme = /^[a-z][a-z0-9+.-]*:\/\//i.exec(path)
  if (scheme !== null) {
    // The host is not a name, so an address with no path has none.
    const rest = path.slice(scheme[0].length).replace(/[?#].*$/, '')
    const slash = rest.indexOf('/')
    path = slash === -1 ? '' : rest.slice(slash)
  }

  const last = path.split(/[/\\]/).pop() ?? ''
  if (last === '') return undefined

  if (scheme === null) return last

  try {
    return decodeURIComponent(last)
  } catch {
    // A malformed escape is part of the name as written.
    return last
  }
}

/**
 * The type a document is sent as, from the most to the least certain.
 *
 * What the caller said; what the content says; what the name says, for an
 * animated sticker the content cannot tell from any gzip file; plain text, if
 * that is what the bytes are; and otherwise bytes of no stated kind.
 */
export function inferMimeType(options: {
  readonly stated?: string | undefined
  readonly head?: Uint8Array | undefined
  readonly name?: string | undefined
}): string {
  if (options.stated !== undefined && options.stated !== '') return options.stated

  const byName = options.name === undefined ? undefined : mimeTypeOfName(options.name)
  const byContent = options.head === undefined ? undefined : detectMimeType(options.head)

  if (byName === 'application/x-tgsticker' && byContent === 'application/gzip') return byName
  if (byContent !== undefined) return byContent
  if (byName !== undefined) return byName
  if (options.head !== undefined && isProbablyText(options.head)) return 'text/plain'

  return 'application/octet-stream'
}
