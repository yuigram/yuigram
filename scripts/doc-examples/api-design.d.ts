/**
 * docs/api-design.md shows the surface section by section, so its fragments use names an
 * earlier block defined or imported. Each is declared as what that block made it.
 */

declare const bot: import('yuigram').Bot
declare const bob: import('yuigram').Account
/** An account's event, in the sections about what an account context carries. */
declare const event: import('yuigram').MtprotoContext
declare const directory: string
declare const session: string
declare const storage: import('yuigram').KV

declare function handler(event: unknown): void
declare const hasPhoto: typeof import('yuigram').f.media.photo
declare function requireAdmin(event: unknown, next: () => Promise<void>): Promise<void>
declare function handleBan(message: import('yuigram').MessageContext): Promise<void>
declare function handleKick(message: import('yuigram').MessageContext): Promise<void>
declare function sleep(ms: number): Promise<void>
declare const products: readonly { readonly id: number; readonly name: string }[]
/** A `file_id` the bot received earlier, in the section on files. */
declare const existingFileId: string

/** A sent photo and its caption, in the section on bound methods. */
declare const photo: string
declare const caption: string

/** A file an account was told about, in the section on files. */
declare const location: Parameters<import('yuigram').Account['download']>[0]['location']
declare const dcId: number
declare const size: number
declare function sink(chunk: Uint8Array, offset: number): void
declare const source: import('yuigram').UploadSource
declare const peer: Parameters<
  import('yuigram').Account['api']['messages']['sendMessage']
>[0]['peer']
declare function rnd(): bigint
/** The document and photo a message carried, read off its media. */
declare const media: {
  readonly document: Parameters<typeof import('yuigram').documentMedia>[0]
  readonly photo: Parameters<typeof import('yuigram').photoMedia>[0]
}

interface Cart {
  count: number
}

/** What earlier blocks imported. */
declare const Bot: typeof import('yuigram').Bot
declare const Account: typeof import('yuigram').Account
declare const App: typeof import('yuigram').App
declare const Router: typeof import('yuigram').Router
declare const InlineKeyboard: typeof import('yuigram').InlineKeyboard
declare const FloodError: typeof import('yuigram').FloodError
declare const f: typeof import('yuigram').f
declare const when: typeof import('yuigram').when
declare const downloadToFile: typeof import('yuigram').downloadToFile
declare const nextDialogs: typeof import('yuigram').nextDialogs
type SessionFlavor<V> = import('yuigram').SessionFlavor<V>
type KV<V = unknown> = import('yuigram').KV<V>
type MessageContext = import('yuigram').MessageContext
type MtprotoContext = import('yuigram').MtprotoContext
