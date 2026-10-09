// SPDX-License-Identifier: MPL-2.0

/**
 * A deterministic MTProto peer, driven by bytes.
 *
 * The scope is narrow on purpose. This is the other end of a *connection*, not
 * a stand-in for Telegram: it recognises how a client opened the stream, undoes
 * the obfuscation and framing, and performs the authorization key exchange. It
 * knows nothing about accounts, peers, updates, or any API method, and nothing
 * here should grow to.
 *
 * What it exists for is that the transport and the exchange have no offline
 * failure signal otherwise. A framing that agrees with its own decoder, or a
 * handshake whose two halves share a key derivation, will pass every test that
 * only ever talks to itself. This peer is written from the specification and
 * from the other direction, so a disagreement surfaces as a failed handshake
 * rather than as a silent connection to the real network months later.
 *
 * It never calls into the client's side of anything, and every value it would
 * otherwise draw at random is an option, so a run is reproducible byte for byte.
 */

import { createCipheriv, createHash, getDiffieHellman } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { TelegramError } from '@yuigram/core'
import { bytesToBigIntBE } from '../../src/crypto/bytes.js'
import { authKeyId } from '../../src/crypto/kdf.js'
import {
  createMessageIdGenerator,
  decodePlaintextMessage,
  encodePlaintextMessage,
} from '../../src/message/plaintext.js'
import {
  readObject,
  type TlScope,
  type TlValue,
  TlWriter,
  writeObject,
} from '../../src/tl/index.js'
import {
  AbridgedFraming,
  FrameBuffer,
  type Framing,
  type FullFraming,
  IntermediateFraming,
  PaddedIntermediateFraming,
} from '../../src/transport/framing.js'
import { writeServerValue } from './answers.js'
import { type Binding, openBinding } from './bind.js'
import { keyId, open as openMessage, seal } from './encrypted.js'
import {
  HANDSHAKE_SCOPE,
  Handshake,
  type HandshakeFault,
  type HandshakeResult,
} from './handshake.js'
import { createServerKey, type ServerKey } from './keys.js'

/** Length of the obfuscation init packet. */
const INIT_SIZE = 64
/** Where the framing tag sits inside it. */
const TAG_OFFSET = 56

/** The modulus Telegram's servers use, taken from the platform's own tables. */
/** `msg_container#73f1f8dc messages:vector<%Message> = MessageContainer` */
const CONTAINER_ID = 0x73f1_f8dc

export const DH_PRIME = bytesToBigIntBE(new Uint8Array(getDiffieHellman('modp14').getPrime()))

/**
 * A semiprime just under 2^63, the shape a real `resPQ` carries.
 *
 * Both factors are prime, which is what makes the value factorable by the
 * method the protocol expects a client to use.
 */
const DEFAULT_PQ = 2_147_483_647n * 2_147_483_629n

/**
 * The framings that can be obfuscated.
 *
 * Full framing announces nothing, so there is no tag to carry inside an init
 * packet and no way for a peer to recognise it there.
 */
export type ObfuscatableFraming = 'abridged' | 'intermediate' | 'padded-intermediate'

/** How the peer was opened, once the first bytes have said. */
export interface TransportChoice {
  /** The framing the client announced. */
  readonly framing: ObfuscatableFraming | 'full'
  /** Whether the stream is obfuscated. */
  readonly obfuscated: boolean
}

/**
 * A deliberate deviation from correct behaviour once a key exists.
 *
 * The handshake's own faults are named by {@link HandshakeFault}; these are the
 * ones only an authenticated connection can produce.
 */
export type SessionFault =
  /** Answer with a salt the client did not agree to. */
  | 'wrong-salt'
  /** Corrupt the sealed message so its integrity check fails. */
  | 'bad-message-integrity'
  /** Answer with an identifier carrying the client's parity. */
  | 'wrong-message-id-parity'
  /** Answer with a sequence number that does not follow. */
  | 'wrong-seq-no'
  /** Answer with bytes that are not an encrypted message at all. */
  | 'malformed-encrypted-message'
  /** Answer naming a session the client never opened. */
  | 'wrong-session'
  /** Decline a binding that is otherwise correct. */
  | 'refuse-binding'

/** Every way this peer can be asked to misbehave. */
export type Fault = HandshakeFault | SessionFault

/** Everything the peer would otherwise decide at random. */
export interface MockServerOptions {
  /** Deliberate misbehaviour, for exercising a client's rejection paths. */
  readonly faults?: ReadonlySet<Fault>
  /** The key pair the peer offers. Generated per peer when omitted. */
  readonly key?: ServerKey
  /** The semiprime the client is asked to factor. */
  readonly pq?: bigint
  /** The Diffie-Hellman modulus. */
  readonly dhPrime?: bigint
  /** The Diffie-Hellman generator. */
  readonly g?: number
  /** The peer's secret exponent. */
  readonly a?: bigint
  /** The nonce the peer contributes. */
  readonly serverNonce?: Uint8Array
  /** Seconds since the epoch, as reported during the exchange. */
  readonly serverTime?: number
  /**
   * The permanent key a client may vouch with.
   *
   * A binding arrives on the connection the temporary key established, and is
   * only meaningful against the long-lived key the same client established
   * earlier — on a different connection, which is why it is supplied rather
   * than remembered.
   */
  readonly permanentKey?: Uint8Array
  /**
   * Authorizations this client may already hold.
   *
   * A client that has a key opens a connection and starts using it, because
   * there is nothing left to agree — so such a connection carries no exchange
   * and its first frame is already encrypted. Which key it is using is named at
   * the front of every message it sends, so it is looked up rather than
   * assumed: a peer offered several picks the one the client actually named,
   * and one offered none, or the wrong ones, refuses the message exactly as it
   * would refuse any message under a key it does not hold.
   */
  readonly authorizations?: readonly HandshakeResult[]
  /** Milliseconds since the epoch, for the peer's message identifiers. */
  readonly now?: () => number
  /** Padding and other filler. */
  readonly random?: (length: number) => Uint8Array
  /**
   * The framing to assume when the client announces none.
   *
   * Full framing sends no tag, so a stream that opens with it is
   * indistinguishable from an obfuscated one — both begin with bytes that mean
   * nothing until something else says how to read them. Every other framing
   * announces itself, and an obfuscated stream is recognised by the absence of
   * any announcement, so this is only needed to open a full-framed connection.
   */
  readonly untagged?: FullFraming
  /**
   * The shared secret of an MTProxy connection.
   *
   * Mixed into both obfuscation keys. A peer configured with the wrong secret
   * decrypts the stream to noise, which is the point of the mechanism.
   */
  readonly secret?: Uint8Array
  /**
   * The tables this peer reads and writes with.
   *
   * The service schema is enough for a handshake and for the messages a
   * connection sends on its own behalf. A peer answering API calls needs the
   * API tables as well.
   */
  readonly scope?: TlScope
  /**
   * What this peer answers an API method with.
   *
   * A peer models no API, so a method it is told nothing about is answered with
   * `boolTrue` — which is enough for a case about a call reaching a datacenter
   * and not enough for one about what a client does with what came back.
   * Returning `undefined` leaves a method to that default.
   */
  readonly api?: (query: TlValue) => TlValue | undefined
}

/**
 * Queries a connection sends on its own behalf.
 *
 * Each has an answer of its own shape which names the query it answers.
 * Everything else is an API method, and an API method is answered as a result.
 */
const SERVICE_QUERIES: ReadonlySet<string> = new Set([
  'ping',
  'ping_delay_disconnect',
  'get_future_salts',
  'msgs_state_req',
])

/** A stream the peer could not read as MTProto. */
export class MockServerError extends Error {
  override readonly name = 'MockServerError'
}

export class MockServer {
  readonly #options: Required<
    Pick<MockServerOptions, 'pq' | 'dhPrime' | 'g' | 'a' | 'serverNonce' | 'serverTime' | 'random'>
  >
  readonly #key: ServerKey
  readonly #permanentKey: Uint8Array | undefined
  readonly #authorizations: readonly HandshakeResult[]
  /** The one this connection turned out to be using. */
  #adopted: HandshakeResult | undefined
  readonly #untagged: FullFraming | undefined
  readonly #secret: Uint8Array | undefined
  readonly #faults: ReadonlySet<Fault> | undefined
  readonly #api: ((query: TlValue) => TlValue | undefined) | undefined
  readonly #scope: TlScope
  readonly #nextMsgId: () => bigint

  /** Bytes held while the opening is still ambiguous. */
  #opening: Uint8Array = new Uint8Array(0)
  #transport: TransportChoice | undefined
  #framing: Framing | undefined
  #handshake: Handshake | undefined

  /** The session the client opened, and how many answers have been sent. */
  #session: bigint | undefined

  /** Every binding this peer has accepted, oldest first. */
  readonly #bindings: Binding[] = []
  #serverSeqNo = 0

  /**
   * The salt this peer currently accepts.
   *
   * The handshake's until the peer announces a replacement, which it does by
   * refusing a message and naming the new one — after which the old salt is the
   * one that is wrong.
   */
  #salt: bigint | undefined

  /** The envelope identifier of the last client message opened. */
  #lastEnvelope: bigint | undefined

  /**
   * Every message this peer has read from the client, in the order it read
   * them, with the identifier and sequence number each was sent under.
   *
   * A container's elements appear individually; the container itself does not,
   * because it is an envelope rather than something the client sent.
   */
  readonly seen: Array<{ msgId: bigint; seqNo: number; value: TlValue; body: Uint8Array }> = []

  readonly #frames = new FrameBuffer()
  #decryptor: ReturnType<typeof createCipheriv> | undefined
  #encryptor: ReturnType<typeof createCipheriv> | undefined

  constructor(options: MockServerOptions = {}) {
    this.#key = options.key ?? createServerKey()
    this.#permanentKey = options.permanentKey
    this.#authorizations = options.authorizations ?? []
    this.#untagged = options.untagged
    this.#secret = options.secret
    this.#faults = options.faults
    this.#api = options.api
    this.#scope = options.scope ?? HANDSHAKE_SCOPE

    this.#options = {
      pq: options.pq ?? DEFAULT_PQ,
      dhPrime: options.dhPrime ?? DH_PRIME,
      g: options.g ?? 3,
      a: options.a ?? DEFAULT_SECRET_EXPONENT,
      serverNonce: options.serverNonce ?? filled(16, 0x5a),
      serverTime: options.serverTime ?? 1_700_000_000,
      random: options.random ?? ((length) => filled(length, 0x2b)),
    }

    this.#nextMsgId = createMessageIdGenerator({
      origin: 'server-response',
      now: options.now ?? (() => 1_700_000_000_000),
    })
  }

  /**
   * The salt this peer currently accepts.
   *
   * A case that announces a new session has to name a salt the peer will go on
   * accepting; naming another makes the peer refuse the client's next message,
   * which is a different thing from the one being tested.
   */
  get salt(): bigint | undefined {
    const adopted = this.#adopted?.serverSalt

    return this.#salt ?? (adopted === undefined ? undefined : readInt64LE(adopted))
  }

  /** The public half of the key this peer offers. */
  get key(): ServerKey {
    return this.#key
  }

  /** How the connection was opened, once the client has said. */
  get transport(): TransportChoice | undefined {
    return this.#transport
  }

  /** What the exchange agreed on, once it has completed. */
  /** The bindings this peer accepted, in the order they arrived. */
  get bindings(): readonly Binding[] {
    return this.#bindings
  }

  get result(): HandshakeResult | undefined {
    return this.#handshake?.result
  }

  /** The authorization in force, however this connection came by it. */
  get authorization(): HandshakeResult | undefined {
    return this.#adopted ?? this.#handshake?.result
  }

  /** How far the connection has progressed. */
  get state(): 'opening' | 'exchanging' | 'established' {
    if (this.#transport === undefined) return 'opening'
    if (this.#adopted !== undefined) return 'established'

    return this.#handshake?.state === 'established' ? 'established' : 'exchanging'
  }

  /**
   * Recognise a message sealed under a key this client already holds.
   *
   * Every encrypted message names its key at the front, so which one is in use
   * is read rather than guessed. A message naming no key is the exchange, and a
   * message naming one this peer was not offered is left alone — the paths
   * below refuse it, as they refuse anything else they cannot open.
   */
  #recognise(bytes: Uint8Array): HandshakeResult | undefined {
    if (bytes.length < 8) return undefined

    const named = bytes.subarray(0, 8)
    if (named.every((byte) => byte === 0)) return undefined

    this.#adopted = this.#authorizations.find(
      (authorization) =>
        Buffer.compare(Buffer.from(named), Buffer.from(keyId(authorization.authKey))) === 0,
    )

    return this.#adopted
  }

  /**
   * Take bytes from the client and return the bytes to send back.
   *
   * A stream, not a message queue: a chunk may carry part of a frame, several
   * frames, or the tail of one and the head of the next. Nothing is assumed
   * about where a chunk boundary falls, because TCP guarantees nothing about it.
   */
  receive(chunk: Uint8Array): Uint8Array {
    const remainder = this.#openIfNeeded(chunk)
    if (remainder === undefined) return new Uint8Array(0)

    this.#frames.push(this.#decrypt(remainder))

    const replies: Uint8Array[] = []
    const framing = this.#framing
    const handshake = this.#handshake
    if (framing === undefined || handshake === undefined) {
      throw new MockServerError('the connection was opened without a framing')
    }

    for (;;) {
      const frame = framing.decode(this.#frames)
      if (frame === undefined) break
      if (frame.kind === 'error') {
        throw new MockServerError(`the client sent a transport error frame (${frame.code})`)
      }

      // Which envelope applies is decided by whether a key exists, exactly as
      // it is on a real connection: the handshake is the only traffic that can
      // travel unencrypted, and everything after it must not.
      const established = this.#adopted ?? handshake.result ?? this.#recognise(frame.bytes)
      if (established !== undefined) {
        const answer = this.#authenticated(frame.bytes, established)
        if (answer !== undefined) replies.push(this.#encrypt(framing.encode(answer)))
        continue
      }

      const { body } = decodePlaintextMessage(frame.bytes)
      const response = handshake.handle(readObject(body, HANDSHAKE_SCOPE))

      replies.push(
        this.#encrypt(
          framing.encode(
            encodePlaintextMessage(this.#nextMsgId(), writeObject(response, HANDSHAKE_SCOPE)),
          ),
        ),
      )
    }

    return concat(replies)
  }

  /**
   * Seal one server message under the established key.
   *
   * The peer answers `ping` on its own; this is for the cases that need a
   * specific service message the client would never have asked for.
   */
  seal(value: TlValue, options: { msgId?: bigint; seqNo?: number } = {}): Uint8Array {
    const { key, sessionId, salt } = this.#established()
    const body = writeServerValue(value, this.#scope)

    // Announcing a new salt is also adopting it: a client told to use one will,
    // and a peer that then refused it would be refusing its own instruction.
    if (value._ === 'bad_server_salt') {
      const replacement = value['new_server_salt']
      if (typeof replacement === 'bigint') this.#salt = replacement
    }

    return seal(
      key,
      {
        salt,
        sessionId,
        msgId: options.msgId ?? this.#nextMsgId(),
        seqNo: options.seqNo ?? this.#nextServerSeqNo(),
        body,
      },
      'server',
      this.#padding(body.length),
    )
  }

  /**
   * Send a message the client never asked for, ready for the wire.
   *
   * `seal` produces the envelope; this puts it through the framing and the
   * obfuscation the connection was opened with, which is what the client is
   * actually reading. Nothing else can push to a client: a peer only ever
   * answers, and an update is the one thing a datacenter says on its own.
   *
   * `undefined` when the connection has not opened or has no key yet, because
   * there is nothing to send it under rather than because sending failed.
   */
  push(value: TlValue, options: { msgId?: bigint; seqNo?: number } = {}): Uint8Array | undefined {
    const framing = this.#framing
    if (framing === undefined) return undefined

    try {
      return this.#encrypt(framing.encode(this.seal(value, options)))
    } catch {
      return undefined
    }
  }

  /**
   * Send a compressed message the client never asked for, ready for the wire.
   *
   * What a server does with a container large enough to be worth compressing.
   * The layer above the session should not be able to tell, which is only
   * checkable if something can produce one.
   */
  pushCompressed(value: TlValue, options: { msgId?: bigint } = {}): Uint8Array | undefined {
    const framing = this.#framing
    if (framing === undefined) return undefined

    try {
      return this.#encrypt(framing.encode(this.sealCompressed(value, options)))
    } catch {
      return undefined
    }
  }

  /**
   * Seal a message body that is already encoded.
   *
   * For a case that needs a shape the writer would not produce from a value —
   * a field carrying bytes that are themselves an encoded object.
   */
  sealRaw(body: Uint8Array, options: { msgId?: bigint } = {}): Uint8Array {
    const { key, sessionId, salt } = this.#established()

    return seal(
      key,
      {
        salt,
        sessionId,
        msgId: options.msgId ?? this.#nextMsgId(),
        seqNo: this.#nextServerSeqNo(),
        body,
      },
      'server',
      this.#padding(body.length),
    )
  }

  /**
   * Seal several messages as one container.
   *
   * The elements are bare and each carries its own identifier and sequence
   * number, which is what makes a container more than a concatenation: an
   * acknowledgement names an element, never the container that delivered it.
   */
  sealContainer(
    entries: ReadonlyArray<{ value: TlValue; msgId?: bigint; seqNo?: number }>,
  ): Uint8Array {
    const { key, sessionId, salt } = this.#established()

    const parts: Uint8Array[] = []
    for (const entry of entries) {
      const body = writeServerValue(entry.value, this.#scope)
      const header = new Uint8Array(16)
      const view = new DataView(header.buffer)

      view.setBigInt64(0, entry.msgId ?? this.#nextMsgId(), true)
      view.setInt32(8, entry.seqNo ?? this.#nextServerSeqNo(), true)
      view.setInt32(12, body.length, true)

      parts.push(header, body)
    }

    const head = new Uint8Array(8)
    const headView = new DataView(head.buffer)
    headView.setUint32(0, 0x73f1_f8dc, true)
    headView.setUint32(4, entries.length, true)

    const body = concat([head, ...parts])

    return seal(
      key,
      {
        salt,
        sessionId,
        msgId: this.#nextMsgId(),
        seqNo: this.#nextServerSeqNo(),
        body,
      },
      'server',
      this.#padding(body.length),
    )
  }

  /** Compress a value the way the server compresses a large result. */
  sealCompressed(value: TlValue, options: { msgId?: bigint } = {}): Uint8Array {
    const packed = gzipSync(writeServerValue(value, this.#scope))

    const writer = new TlWriter(this.#scope)
    writer.uint(0x3072_cfa1)
    writer.bytes(packed)

    const { key, sessionId, salt } = this.#established()
    const body = writer.finish()

    return seal(
      key,
      {
        salt,
        sessionId,
        msgId: options.msgId ?? this.#nextMsgId(),
        seqNo: this.#nextServerSeqNo(),
        body,
      },
      'server',
      this.#padding(body.length),
    )
  }

  /**
   * The state a sealed message needs, or a clear failure if none exists.
   *
   * Whichever key this connection is using: the one it negotiated, or the one
   * it was already holding when it opened. An answer has to travel under the
   * same key the message it answers arrived under.
   */
  #established(): { key: Uint8Array; sessionId: bigint; salt: bigint } {
    const result = this.#adopted ?? this.#handshake?.result
    if (result === undefined) {
      throw new MockServerError('no key has been established')
    }
    if (this.#session === undefined) {
      throw new MockServerError('the client has not opened a session')
    }

    return {
      key: result.authKey,
      sessionId: this.#session,
      salt: readInt64LE(result.serverSalt),
    }
  }

  /**
   * Padding that aligns the plaintext.
   *
   * Twelve bytes is the minimum, not the amount: the header, body and padding
   * together must be a whole number of blocks.
   */
  #padding(bodyLength: number): Uint8Array {
    const minimum = 12
    const size = minimum + ((16 - ((32 + bodyLength + minimum) % 16)) % 16)
    return this.#options.random(size)
  }

  /** The server numbers its own content-related messages the same way. */
  #nextServerSeqNo(): number {
    const value = this.#serverSeqNo * 2 + 1
    this.#serverSeqNo += 1
    return value
  }

  /**
   * Report a transport-level failure, as a server does when it refuses a
   * connection outright rather than answering the message that opened it.
   *
   * The code travels negated inside an otherwise ordinary frame, so it arrives
   * in whatever envelope the connection negotiated. The receiver recognises it
   * by the frame being exactly four bytes, which is why this one is never
   * padded: padded intermediate frames are otherwise free to carry up to
   * fifteen extra bytes, and a padded error frame is indistinguishable from a
   * short payload. A zero-padding frame is a valid padded intermediate frame,
   * and it is byte for byte an intermediate one.
   */
  transportError(code: number): Uint8Array {
    const framing = this.#framing
    if (framing === undefined) {
      throw new MockServerError('the connection has not been opened')
    }

    const body = new Uint8Array(4)
    new DataView(body.buffer).setInt32(0, -code, true)

    const envelope =
      this.#transport?.framing === 'padded-intermediate' ? new IntermediateFraming() : framing

    return this.#encrypt(envelope.encode(body))
  }

  /**
   * Decide how the stream was opened, returning whatever bytes follow.
   *
   * `undefined` means the opening is still ambiguous and more bytes are needed;
   * the ones supplied so far are held.
   */
  #openIfNeeded(chunk: Uint8Array): Uint8Array | undefined {
    if (this.#transport !== undefined) return chunk

    this.#opening = concat([this.#opening, chunk])
    const bytes = this.#opening

    if (this.#untagged !== undefined) {
      this.#begin({ framing: 'full', obfuscated: false }, this.#untagged)
      this.#opening = new Uint8Array(0)
      return bytes
    }

    // An announced framing is a literal tag at the head of the stream. The
    // obfuscation init packet is drawn so that it can never begin with one,
    // which is what makes this distinction sound rather than probabilistic.
    if (bytes.length >= 1 && bytes[0] === 0xef) {
      return this.#announced({ framing: 'abridged', obfuscated: false }, new AbridgedFraming(), 1)
    }
    if (bytes.length < 4) return undefined

    const tag = new DataView(bytes.buffer, bytes.byteOffset).getUint32(0, true)
    if (tag === 0xeeee_eeee) {
      return this.#announced(
        { framing: 'intermediate', obfuscated: false },
        new IntermediateFraming(),
        4,
      )
    }
    if (tag === 0xdddd_dddd) {
      return this.#announced(
        { framing: 'padded-intermediate', obfuscated: false },
        new PaddedIntermediateFraming(this.#options.random),
        4,
      )
    }

    if (bytes.length < INIT_SIZE) return undefined
    return this.#openObfuscated(bytes)
  }

  /** Adopt a framing the client named in the clear, and drop its tag. */
  #announced(choice: TransportChoice, framing: Framing, tagSize: number): Uint8Array {
    this.#begin(choice, framing)

    const rest = this.#opening.slice(tagSize)
    this.#opening = new Uint8Array(0)
    return rest
  }

  /**
   * Read the init packet and build both keystreams from it.
   *
   * The client derives its send keys from the packet's plaintext prefix and its
   * receive keys from the same bytes reversed. This end derives the mirror
   * image: what the client encrypts with is what this end decrypts with. The
   * schedule is written out here rather than shared, so the two directions are
   * genuinely independent computations that have to agree.
   */
  #openObfuscated(bytes: Uint8Array): Uint8Array {
    const init = bytes.subarray(0, INIT_SIZE)

    const forward = init.slice(8, TAG_OFFSET)
    const backward = init.slice(8, TAG_OFFSET).reverse()

    const decryptor = createCipheriv(
      'aes-256-ctr',
      this.#mix(forward.subarray(0, 32)),
      forward.subarray(32, 48),
    )

    // The client ran its own encryptor over all 64 bytes, so this end advances
    // its counter over the same span. The tag is recovered from the result.
    const revealed = new Uint8Array(decryptor.update(init))
    const tag = new DataView(revealed.buffer).getUint32(TAG_OFFSET, true)

    const choice = OBFUSCATED_TAGS.get(tag)
    if (choice === undefined) {
      // Nothing is retained: a connection this peer cannot read leaves it in
      // the state it was in before the packet arrived.
      throw new MockServerError(
        `the init packet names no known framing (0x${tag.toString(16).padStart(8, '0')})`,
      )
    }

    this.#decryptor = decryptor
    this.#encryptor = createCipheriv(
      'aes-256-ctr',
      this.#mix(backward.subarray(0, 32)),
      backward.subarray(32, 48),
    )

    this.#begin({ framing: choice, obfuscated: true }, this.#framingFor(choice))

    const rest = bytes.slice(INIT_SIZE)
    this.#opening = new Uint8Array(0)
    return rest
  }

  #framingFor(name: ObfuscatableFraming): Framing {
    switch (name) {
      case 'abridged':
        return new AbridgedFraming()
      case 'intermediate':
        return new IntermediateFraming()
      case 'padded-intermediate':
        return new PaddedIntermediateFraming(this.#options.random)
    }
  }

  /** Bind an obfuscation key to the proxy secret, when one is in use. */
  #mix(key: Uint8Array): Uint8Array {
    if (this.#secret === undefined) return key

    return new Uint8Array(createHash('sha256').update(key).update(this.#secret).digest())
  }

  #begin(choice: TransportChoice, framing: Framing): void {
    this.#transport = choice
    this.#framing = framing
    this.#handshake = new Handshake({
      key: this.#key,
      ...this.#options,
      ...(this.#faults === undefined
        ? {}
        : { faults: this.#faults as ReadonlySet<HandshakeFault> }),
    })
  }

  /** Whether the peer was configured to misbehave in this particular way. */
  #faulty(fault: Fault): boolean {
    return this.#faults?.has(fault) === true
  }

  /**
   * Answer one authenticated message.
   *
   * The peer opens the message with its own key schedule, so a client whose
   * derivation disagrees produces a message this end cannot read rather than
   * one it reads anyway.
   */
  #authenticated(frame: Uint8Array, result: HandshakeResult): Uint8Array | undefined {
    const message = openMessage(result.authKey, frame, 'client')

    if (this.#session === undefined) this.#session = message.sessionId
    else if (this.#session !== message.sessionId) {
      throw new MockServerError('the message names a session this peer has not seen')
    }

    const expectedSalt = readInt64LE(result.serverSalt)
    if (message.salt !== expectedSalt) {
      throw new MockServerError('the message carries a salt this peer did not agree to')
    }

    const answers: TlValue[] = []
    for (const element of this.#unpack(message)) {
      this.seen.push(element)

      // Acknowledgements are recorded and not replied to, which is the whole of
      // what a peer does with one.
      if (element.value._ === 'msgs_ack') continue

      answers.push(this.#answer(element))
    }

    const answer = answers[0]
    if (answer === undefined) return undefined
    if (answers.length > 1) {
      return this.sealContainer(answers.map((value) => ({ value })))
    }

    const body = writeServerValue(answer, this.#scope)

    if (this.#faulty('malformed-encrypted-message')) {
      // Long enough to look like a message, structured like nothing.
      return this.#options.random(96)
    }

    // Only containers, acknowledgements and the compression wrapper are exempt
    // from acknowledgement, so this answer counts and advances the counter.
    const seqNo = this.#nextServerSeqNo()

    const sealed = seal(
      result.authKey,
      {
        salt: this.#faulty('wrong-salt') ? expectedSalt ^ 0x0f0f_0f0f_0f0f_0f0fn : expectedSalt,
        sessionId: this.#faulty('wrong-session') ? message.sessionId ^ 1n : message.sessionId,
        msgId: this.#faulty('wrong-message-id-parity')
          ? this.#nextMsgId() & ~1n
          : this.#nextMsgId(),
        seqNo: this.#faulty('wrong-seq-no') ? 0x7fff_fffe : seqNo,
        body,
      },
      'server',
      this.#padding(body.length),
    )

    if (this.#faulty('bad-message-integrity')) {
      const corrupted = Uint8Array.from(sealed)
      const at = corrupted.length - 1
      corrupted[at] = (corrupted[at] ?? 0) ^ 0xff
      return corrupted
    }

    return sealed
  }

  /**
   * Read what one client message actually carries.
   *
   * Written against the specification rather than against the client's writer,
   * because a peer that read a container the way the sender wrote it would
   * accept a container no real server would. The two rules a real server
   * enforces are enforced here: a container's own identifier is above every
   * identifier inside it, and each element declares a length that fits.
   */
  #unpack(message: {
    msgId: bigint
    seqNo: number
    body: Uint8Array
  }): Array<{ msgId: bigint; seqNo: number; value: TlValue; body: Uint8Array }> {
    const view = new DataView(message.body.buffer, message.body.byteOffset, message.body.byteLength)
    if (view.getUint32(0, true) !== CONTAINER_ID) {
      return [
        {
          msgId: message.msgId,
          seqNo: message.seqNo,
          value: readObject(message.body, this.#scope),
          body: message.body,
        },
      ]
    }

    const count = view.getUint32(4, true)
    const out: Array<{ msgId: bigint; seqNo: number; value: TlValue; body: Uint8Array }> = []
    let at = 8

    for (let index = 0; index < count; index += 1) {
      if (at + 16 > message.body.length) {
        throw new MockServerError(`container element ${index} runs past the message`)
      }

      const msgId = view.getBigInt64(at, true)
      const seqNo = view.getInt32(at + 8, true)
      const length = view.getInt32(at + 12, true)
      at += 16

      if (length < 0 || at + length > message.body.length) {
        throw new MockServerError(`container element ${index} declares ${length} bytes`)
      }
      if (BigInt.asUintN(64, msgId) >= BigInt.asUintN(64, message.msgId)) {
        throw new MockServerError(`container element ${msgId} is not below the container's`)
      }

      const element = message.body.subarray(at, at + length)
      out.push({ msgId, seqNo, value: readObject(element, this.#scope), body: element })
      at += length
    }

    if (at !== message.body.length) {
      throw new MockServerError(
        `container declared ${count} messages and left ${message.body.length - at} bytes`,
      )
    }

    return out
  }

  /** The identifier of the last client envelope this peer opened. */
  lastEnvelope(): bigint {
    if (this.#lastEnvelope === undefined) {
      throw new MockServerError('this peer has not opened a client message')
    }

    return this.#lastEnvelope
  }

  /**
   * Adopt the session a client is about to use.
   *
   * A peer reading a stream learns the session from the first message it opens.
   * One driven directly may have to answer before the client has said anything,
   * so it is told instead.
   */
  expectSession(sessionId: bigint): void {
    this.#session = sessionId
  }

  /**
   * Open one sealed client message and report what it carried.
   *
   * For a client that is driven directly rather than over a framed stream. The
   * peer opens with its own key schedule and unpacks containers by the
   * specification, so what comes back is what a server would have read — and
   * nothing is answered, leaving a test to decide what the server says and in
   * what order it says it.
   */
  openClient(
    bytes: Uint8Array,
  ): ReadonlyArray<{ msgId: bigint; seqNo: number; value: TlValue; body: Uint8Array }> {
    const result = this.#adopted ?? this.#handshake?.result
    if (result === undefined) throw new MockServerError('no key has been established')

    const message = openMessage(result.authKey, bytes, 'client')
    this.#session ??= message.sessionId

    if (this.#session !== message.sessionId) {
      throw new MockServerError('the message names a session this peer has not seen')
    }
    if (message.salt !== (this.#salt ?? readInt64LE(result.serverSalt))) {
      throw new MockServerError('the message carries a salt this peer did not agree to')
    }

    this.#lastEnvelope = message.msgId
    const elements = this.#unpack(message)
    this.seen.push(...elements)

    return elements
  }

  /**
   * The answer to a call, sealed as the server would seal it.
   *
   * `rpc_result` carries the identifier of the message that asked, which is how
   * a client tells one answer from another.
   */
  rpcResult(reqMsgId: bigint, result: TlValue, options: { msgId?: bigint } = {}): Uint8Array {
    return this.seal({ _: 'rpc_result', req_msg_id: reqMsgId, result }, options)
  }

  /** A call the server refused. */
  rpcError(reqMsgId: bigint, code: number, message: string): Uint8Array {
    return this.rpcResult(reqMsgId, {
      _: 'rpc_error',
      error_code: code,
      error_message: message,
    })
  }

  /**
   * What this peer replies to one client message with.
   *
   * The service queries a connection sends on its own schedule. Each answer
   * names the query it answers, which is what the client checks it against.
   */
  #answer(element: { msgId: bigint; value: TlValue }): TlValue {
    // A client states its layer and describes itself by wrapping its first
    // call. A server unwraps both and answers the query inside, as a result.
    const query = unwrapQuery(element.value)
    if (query !== element.value) {
      return {
        _: 'rpc_result',
        req_msg_id: element.msgId,
        result: this.#answerQuery({ msgId: element.msgId, value: query }),
      }
    }

    // A service message carries its own answer shape; an API method is answered
    // as a result naming the call, whether or not it arrived wrapped. A method
    // that must travel unwrapped — one sent under a key nothing has vouched for
    // yet — is still a method.
    const answer = this.#answerQuery(element)
    if (SERVICE_QUERIES.has(element.value._)) return answer

    return { _: 'rpc_result', req_msg_id: element.msgId, result: answer }
  }

  /** What this peer replies with once the wrappers are off. */
  #answerQuery(element: { msgId: bigint; value: TlValue }): TlValue {
    switch (element.value._) {
      case 'ping':
      case 'ping_delay_disconnect':
        return { _: 'pong', msg_id: element.msgId, ping_id: element.value['ping_id'] }

      case 'get_future_salts': {
        const asked = element.value['num']
        const count = typeof asked === 'number' ? asked : 0
        const since = this.#options.serverTime

        return {
          _: 'future_salts',
          req_msg_id: element.msgId,
          now: since,
          salts: Array.from({ length: count }, (_, index) => ({
            _: 'future_salt',
            valid_since: since + index * 1800,
            valid_until: since + (index + 1) * 1800,
            salt: BigInt(index + 1) * 0x0101_0101_0101n,
          })),
        }
      }

      case 'auth.bindTempAuthKey':
        return this.#answerBinding(element)

      case 'msgs_state_req': {
        const asked = element.value['msg_ids']
        const ids = Array.isArray(asked) ? asked : []

        // Four means received. A peer that answers a state query at all has by
        // definition received what it is being asked about.
        return {
          _: 'msgs_state_info',
          req_msg_id: element.msgId,
          info: Uint8Array.from(ids, () => 4),
        }
      }

      default: {
        // A peer that models no API still has to answer one, or a call made
        // through it never settles. The one exception is where an account
        // stands in the update stream, which every account that receives an
        // update asks for: a datacenter answers that with a state, and a peer
        // models a fresh one unless the case says otherwise.
        const modelled = this.#modelled(element.value)
        if (modelled !== undefined) return modelled
        if (element.value._ === 'updates.getState') return this.#freshState()

        return { _: 'boolTrue' }
      }
    }
  }

  /**
   * Check a binding the way the server does, and answer it.
   *
   * Everything the request states in the clear is also stated inside the blob,
   * which only a holder of the permanent key could have produced. Checking that
   * the two agree is the whole of the proof, so a peer that answered without
   * checking would let a broken binding look like a working one.
   */
  #answerBinding(element: { msgId: bigint; value: TlValue }): TlValue {
    const permanent = this.#permanentKey
    if (permanent === undefined) {
      throw new MockServerError('no permanent key was supplied to check a binding against')
    }

    const encrypted = element.value['encrypted_message']
    if (!(encrypted instanceof Uint8Array)) {
      throw new MockServerError('the binding carries no encrypted message')
    }

    const binding = openBinding(encrypted, permanent)
    if (this.#faulty('refuse-binding')) return { _: 'boolFalse' }
    const result = this.#handshake?.result
    if (result === undefined) throw new MockServerError('no key has been established')

    // The identifier the blob names has to be the one the request travelled
    // under; the server has no other way to tell a replayed blob from a fresh
    // one.
    if (binding.msgId !== element.msgId) {
      return { _: 'rpc_error', error_code: 400, error_message: 'ENCRYPTED_MESSAGE_INVALID' }
    }
    if (binding.nonce !== element.value['nonce']) {
      return { _: 'rpc_error', error_code: 400, error_message: 'ENCRYPTED_MESSAGE_INVALID' }
    }
    if (binding.tempAuthKeyId !== readInt64LE(authKeyId(result.authKey))) {
      return { _: 'rpc_error', error_code: 400, error_message: 'ENCRYPTED_MESSAGE_INVALID' }
    }
    if (binding.permAuthKeyId !== element.value['perm_auth_key_id']) {
      return { _: 'rpc_error', error_code: 400, error_message: 'ENCRYPTED_MESSAGE_INVALID' }
    }
    if (this.#session !== undefined && binding.tempSessionId !== this.#session) {
      return { _: 'rpc_error', error_code: 400, error_message: 'ENCRYPTED_MESSAGE_INVALID' }
    }

    this.#bindings.push(binding)

    return { _: 'boolTrue' }
  }

  /**
   * Ask the case what this method answers with.
   *
   * A model that refuses does so by throwing, because that is how a refusal
   * reads where it is written. On the wire a refusal is an answer like any
   * other, so it is turned into one here: a peer that let the exception escape
   * would drop the connection instead, which is a different failure from the
   * one the case is about.
   */
  #modelled(query: TlValue): TlValue | undefined {
    try {
      return this.#api?.(query)
    } catch (error) {
      if (!(error instanceof TelegramError)) throw error

      const stated = /^(.*?)\s*\((\d+)\)$/.exec(error.message)

      return {
        _: 'rpc_error',
        error_code: stated?.[2] === undefined ? 400 : Number(stated[2]),
        error_message: stated?.[1] ?? error.message,
      }
    }
  }

  /** Where a fresh account stands: nothing has happened in any of its sequences yet. */
  #freshState(): TlValue {
    return {
      _: 'updates.state',
      pts: 1,
      qts: 1,
      date: this.#options.serverTime,
      seq: 0,
      unread_count: 0,
    }
  }

  #decrypt(data: Uint8Array): Uint8Array {
    return this.#decryptor === undefined ? data : new Uint8Array(this.#decryptor.update(data))
  }

  #encrypt(data: Uint8Array): Uint8Array {
    return this.#encryptor === undefined ? data : new Uint8Array(this.#encryptor.update(data))
  }
}

/**
 * The tag each framing writes into the init packet.
 *
 * Abridged announces itself with one byte, which the packet repeats to fill its
 * four-byte field. Full framing has no tag and cannot be obfuscated.
 */
const OBFUSCATED_TAGS: ReadonlyMap<number, ObfuscatableFraming> = new Map([
  [0xefef_efef, 'abridged'],
  [0xeeee_eeee, 'intermediate'],
  [0xdddd_dddd, 'padded-intermediate'],
])

/**
 * The peer's Diffie-Hellman exponent.
 *
 * Full width, as a real server's is. It is a fixed value because a test peer
 * that drew a fresh exponent would produce a different auth key on every run,
 * and the point of this peer is that a run can be reproduced exactly.
 */
const DEFAULT_SECRET_EXPONENT =
  (1n << 2047n) | 0x5f2c_a1d3_9e04_7b68_c35a_f912_86de_40b7_1e93_5cf6_2a08_d417_b6e2_930cn

/**
 * Strip the wrappers a client states its layer and identity with.
 *
 * `invokeWithLayer` may only be used together with `initConnection`, and the
 * query the client meant is inside both.
 */
function unwrapQuery(value: TlValue): TlValue {
  let query = value
  for (let depth = 0; depth < 2; depth += 1) {
    if (query._ !== 'invokeWithLayer' && query._ !== 'initConnection') return query

    const inner = query['query']
    if (typeof inner !== 'object' || inner === null) {
      throw new MockServerError(`'${query._}' carries no query`)
    }
    query = inner as TlValue
  }

  return query
}

/** Read eight bytes as a little-endian signed 64-bit value, as TL does. */
function readInt64LE(value: Uint8Array): bigint {
  return new DataView(value.buffer, value.byteOffset, value.byteLength).getBigInt64(0, true)
}

function filled(length: number, byte: number): Uint8Array {
  return new Uint8Array(length).fill(byte)
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  if (parts.length === 1) return parts[0] ?? new Uint8Array(0)

  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}
