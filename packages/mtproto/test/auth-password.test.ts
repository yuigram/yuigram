/**
 * Proving a two-factor password.
 *
 * A wrong proof and a wrong password are indistinguishable from outside: the
 * server refuses both, says nothing about which, and counts the attempt. So the
 * cases here are checked by a peer that verifies the proof the way a server
 * does — from the verifier it stored and its own secret exponent — rather than
 * by recomputing the client's own route to the same number.
 */

import { ValidationError } from '@yuigram/core'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  answerPasswordChallenge,
  checkPassword,
  readPasswordChallenge,
} from '../src/auth/password.js'
import { validateDhParameters } from '../src/crypto/primes.js'
import { REGISTRY as API } from '../src/generated/api/registry.js'
import { REGISTRY as CORE } from '../src/generated/core/registry.js'
import { REGISTRY as MTPROTO } from '../src/generated/mtproto/registry.js'
import { readObject, TlScope, type TlValue } from '../src/tl/index.js'
import { PasswordServer, type Stretch } from './server/password.js'
import { DH_PRIME } from './server/server.js'

const SCOPE = new TlScope('password', [CORE, MTPROTO, API])

const PASSWORD = 'correct horse battery staple'
const SALT1 = Uint8Array.from({ length: 32 }, (_, index) => (index * 7 + 1) & 0xff)
const SALT2 = Uint8Array.from({ length: 16 }, (_, index) => (index * 11 + 5) & 0xff)

/**
 * A stretching step that costs nothing.
 *
 * Both ends are given the same one, so what the cases below exercise is the
 * exchange rather than the cost of the derivation. One case uses the real one.
 */
const cheap: Stretch = (input, salt) => {
  const out = new Uint8Array(64)
  for (let at = 0; at < 64; at += 1) {
    out[at] = ((input[at % input.length] ?? 0) ^ (salt[at % salt.length] ?? 0) ^ at) & 0xff
  }
  return out
}

const cheapPbkdf2 = (password: Uint8Array, salt: Uint8Array) => cheap(password, salt)

beforeAll(async () => {
  validateDhParameters({ p: DH_PRIME, g: 3n })
}, 60_000)

function server(overrides: Record<string, unknown> = {}): PasswordServer {
  return new PasswordServer({
    password: PASSWORD,
    p: DH_PRIME,
    g: 3n,
    salt1: SALT1,
    salt2: SALT2,
    stretch: cheap,
    ...overrides,
  })
}

/** The proof a client produces for a peer's published parameters. */
async function prove(peer: PasswordServer, password = PASSWORD): Promise<TlValue> {
  const challenge = readPasswordChallenge(peer.describe() as TlValue)

  return await answerPasswordChallenge(password, challenge, { pbkdf2: cheapPbkdf2 })
}

function asAnswer(value: TlValue): { srp_id: bigint; A: Uint8Array; M1: Uint8Array } {
  return {
    srp_id: value['srp_id'] as bigint,
    A: value['A'] as Uint8Array,
    M1: value['M1'] as Uint8Array,
  }
}

describe('a proof the server accepts', () => {
  it('is produced from the parameters the server published', async () => {
    const peer = server()

    expect(peer.accepts(asAnswer(await prove(peer)))).toBe(true)
  })

  it('is produced with the real stretching step', async () => {
    // One case pays the full cost, so the derivation itself is exercised and
    // not only the exchange built on top of it.
    const peer = new PasswordServer({
      password: PASSWORD,
      p: DH_PRIME,
      g: 3n,
      salt1: SALT1,
      salt2: SALT2,
    })
    const challenge = readPasswordChallenge(peer.describe() as TlValue)

    expect(peer.accepts(asAnswer(await answerPasswordChallenge(PASSWORD, challenge)))).toBe(true)
  }, 60_000)

  it('differs every time, because the secret exponent does', async () => {
    const peer = server()
    const first = asAnswer(await prove(peer))
    const second = asAnswer(await prove(peer))

    expect(first.A).not.toEqual(second.A)
    expect(first.M1).not.toEqual(second.M1)
    expect(peer.accepts(first) && peer.accepts(second)).toBe(true)
  })

  it('names the exchange it answers', async () => {
    const peer = server({ srpId: 0x7777_0000_0000_0001n })

    expect(asAnswer(await prove(peer)).srp_id).toBe(0x7777_0000_0000_0001n)
  })

  it('carries operands at the width every hash expects', async () => {
    const answer = asAnswer(await prove(server()))

    // Padded to 2048 bits. An operand hashed at its natural width produces a
    // proof the server rejects without saying why.
    expect(answer.A).toHaveLength(256)
    expect(answer.M1).toHaveLength(32)
  })

  it('travels as the query that carries it', async () => {
    const peer = server()
    const challenge = readPasswordChallenge(peer.describe() as TlValue)
    const body = await checkPassword(PASSWORD, challenge, SCOPE, { pbkdf2: cheapPbkdf2 })
    const query = readObject(body, SCOPE) as TlValue

    expect(query._).toBe('auth.checkPassword')
    expect(peer.accepts(asAnswer(query['password'] as TlValue))).toBe(true)
  })
})

describe('a proof the server refuses', () => {
  it('is refused for the wrong password', async () => {
    const peer = server()

    expect(peer.accepts(asAnswer(await prove(peer, 'wrong horse battery staple')))).toBe(false)
  })

  it('is refused for a password differing only in trailing space', async () => {
    // The protocol defines no normalization, so a password is the bytes the
    // user typed. Trimming here would let one password prove another.
    const peer = server()

    expect(peer.accepts(asAnswer(await prove(peer, `${PASSWORD} `)))).toBe(false)
  })

  it('is refused when answered against a different exchange', async () => {
    const first = server({ srpId: 1n, b: 0x1111n })
    const second = server({ srpId: 2n, b: 0x2222n })

    // The server keeps its secret exponent against the identifier, so a proof
    // computed for one exchange proves nothing about another.
    expect(second.accepts(asAnswer(await prove(first)))).toBe(false)
  })

  it('is refused when the proof is altered', async () => {
    const peer = server()
    const answer = asAnswer(await prove(peer))
    const tampered = Uint8Array.from(answer.M1)
    tampered[0] = (tampered[0] ?? 0) ^ 0xff

    expect(peer.accepts({ ...answer, M1: tampered })).toBe(false)
  })
})

describe('what the server sent', () => {
  it('is read into the parameters a proof needs', async () => {
    const challenge = readPasswordChallenge(server().describe() as TlValue)

    expect(challenge.p).toBe(DH_PRIME)
    expect(challenge.g).toBe(3n)
    expect(challenge.salt1).toEqual(SALT1)
    expect(challenge.salt2).toEqual(SALT2)
  })

  it('is refused when it is not a password answer', () => {
    expect(() => readPasswordChallenge({ _: 'boolTrue' })).toThrow(
      /does not carry password parameters/,
    )
  })

  it('reports that no password is set rather than failing obscurely', async () => {
    // The algorithm, the server value and the identifier share the flag that
    // says a password exists, so all three are absent together.
    const none: TlValue = {
      _: 'account.password',
      new_algo: { _: 'passwordKdfAlgoUnknown' },
      new_secure_algo: { _: 'securePasswordKdfAlgoUnknown' },
      secure_random: new Uint8Array(0),
    }

    expect(() => readPasswordChallenge(none)).toThrow(/no password is set/)
  })

  it('is refused when it names an algorithm this client cannot perform', async () => {
    const peer = server()
    const unknown = { ...peer.describe(), current_algo: { _: 'passwordKdfAlgoUnknown' } }

    // Guessing at an unnamed scheme produces a proof that fails for reasons
    // nothing reports, and spends an attempt doing it.
    expect(() => readPasswordChallenge(unknown as TlValue)).toThrow(
      /is not an algorithm this client can perform/,
    )
  })

  it('is refused when the algorithm is not a stated object', async () => {
    const peer = server()

    expect(() => readPasswordChallenge({ ...peer.describe(), current_algo: 7 } as TlValue)).toThrow(
      /not a stated algorithm/,
    )
  })

  it('is refused when the server value is empty', async () => {
    const peer = server()

    expect(() =>
      readPasswordChallenge({ ...peer.describe(), srp_B: new Uint8Array(0) } as TlValue),
    ).toThrow(/'account.password.srp_B' is empty/)
  })

  it('is refused when the group prime is empty', async () => {
    const peer = server()
    const algo = { ...(peer.describe()['current_algo'] as TlValue), p: new Uint8Array(0) }

    expect(() =>
      readPasswordChallenge({ ...peer.describe(), current_algo: algo } as TlValue),
    ).toThrow(/is empty/)
  })

  it('is refused when the identifier is missing', async () => {
    const peer = server()
    const { srp_id: _omitted, ...rest } = peer.describe()

    expect(() => readPasswordChallenge(rest as TlValue)).toThrow(/must be a 64-bit integer/)
  })
})

describe('a group the client will not accept', () => {
  it('is refused when the prime is not the safe prime it must be', async () => {
    // A password check over an attacker-chosen group proves nothing, so the
    // same checks the handshake applies are applied here.
    const peer = server()
    const algo = {
      ...(peer.describe()['current_algo'] as TlValue),
      p: Uint8Array.from({ length: 256 }, (_, index) => (index === 255 ? 0x0b : 0x00)),
    }
    const challenge = readPasswordChallenge({
      ...peer.describe(),
      current_algo: algo,
    } as TlValue)

    await expect(
      answerPasswordChallenge(PASSWORD, challenge, { pbkdf2: cheapPbkdf2 }),
    ).rejects.toThrow(ValidationError)
  })

  it('is refused when the generator is not one the group permits', async () => {
    const peer = server()
    const algo = { ...(peer.describe()['current_algo'] as TlValue), g: 9 }
    const challenge = readPasswordChallenge({
      ...peer.describe(),
      current_algo: algo,
    } as TlValue)

    await expect(
      answerPasswordChallenge(PASSWORD, challenge, { pbkdf2: cheapPbkdf2 }),
    ).rejects.toThrow(ValidationError)
  })

  it('is refused when the server value is outside the group', async () => {
    const peer = server()
    const challenge = readPasswordChallenge(peer.describe() as TlValue)

    await expect(
      answerPasswordChallenge(PASSWORD, { ...challenge, gB: 1n }, { pbkdf2: cheapPbkdf2 }),
    ).rejects.toThrow(ValidationError)
  })
})
