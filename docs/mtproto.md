# MTProto Subsystem

> **Using a user account through MTProto can get that account banned permanently.**
>
> Telegram monitors unofficial client usage, and
> [states](https://core.telegram.org/api/obtaining_api_id) that accounts used for flooding,
> spamming or faking counters will be banned. The ban applies to the Telegram account, not to
> the application: what is lost is somebody's messages, groups and contacts, and it is not
> appealable in any dependable way.
>
> This is not a disclaimer. It is the reason the subsystem is shaped the way it is — flood
> handling that backs off rather than retries, examples that rate-limit, and no convenience
> API for mass invites, mass forwards or contact harvesting. See
> [security.md](security.md) §7.
>
> **Develop against a secondary account.** Not the one that matters.

Yuigram implements MTProto itself. This document is the implementation specification for that
subsystem — derived from Telegram's own protocol documentation, not from any existing client.

Reference point: **TL layer 223** — 2,315 schema entries, 552 error types.

**Position:** MTProto is not a dependency to be wrapped. It is a protocol to be implemented.
The engineering is substantial and is budgeted for; see [feasibility.md](feasibility.md).

---

## 1. Sources and method

The implementation is built **specification-first**:

| Source | Role |
|---|---|
| `core.telegram.org/mtproto/*` | **Normative.** Protocol description, auth key generation, security guidelines, transports, TL |
| `core.telegram.org/api/*` | **Normative.** Updates, datacenters, files, file references, SRP, PFS |
| `core.telegram.org/schema` | **Normative.** TL schema, layer-tagged |
| Existing third-party clients | **Disambiguation only.** Consulted where the specification is silent or ambiguous, to learn *what Telegram actually does* |

This ordering is deliberate and matters for two reasons beyond preference.

**Correctness.** The specification states the invariants; a client implementation states one
author's reading of them. Where the two differ, the specification plus observed server
behaviour is the better authority.

**Independence.** Code written from a specification is independent work. Code written by
closely following another implementation is a derivative of it, whatever the licence permits.
Since independence is the objective, the specification is the input.

Where behaviour is genuinely undocumented — and there is a real amount of it, particularly
around error recovery and peer edge cases — the approach is: observe the server, write a test
that captures the behaviour, and record the finding in `docs/protocol-notes/`. Consulting
another client to understand *what* to test is legitimate; transcribing *how* it implements
the fix is not.

---

## 2. Subsystem structure

```
mtproto/
├── crypto/       AES-IGE, RSA+padding, factorization, primality, SRP, KDF
├── tl/           schema parser, code generator, binary codec runtime
├── transport/    framing (abridged/intermediate/padded/full), obfuscation
├── auth/         DH handshake, PFS temp keys, sign-in flows, 2FA
├── session/      msg_id, seq_no, acks, salts, containers, RPC lifecycle
├── network/      connection pool, DC map, migration, media/CDN routing
├── storage/      auth keys, salts, DC options, peers, update state
├── updates/      pts/qts/seq state machine, gap detection, difference recovery
├── peers/        access_hash lifecycle, min peers, resolution
├── files/        chunked upload/download, file references, CDN
└── normalize/    TL updates -> Yuigram events
```

Ordered bottom-up by dependency. Each layer is independently testable, which is the property
that makes the whole thing tractable.

---

## 3. Cryptography

Everything the protocol needs, and where it comes from.

| Primitive | Source | Notes |
|---|---|---|
| SHA-1, SHA-256, SHA-512 | `node:crypto` | Free |
| PBKDF2-HMAC-SHA512 | `node:crypto` | Used by SRP, 100,000 iterations |
| AES-256-CTR | `node:crypto` | Transport obfuscation |
| **AES-256-IGE** | **Own implementation** | Not in any standard library. ~100 lines over `aes-256-ecb`. |
| Modular exponentiation | Native `BigInt` | Removes the `long` dependency entirely |
| **RSA with Telegram padding** | **Own implementation** | Two schemes — see §3.2 |
| **PQ factorization** | **Own implementation** | Pollard's rho |
| **Miller-Rabin** | **Own implementation** | Safe-prime validation |
| **SRP 6a** | **Own implementation** | Telegram's variant — see §3.3 |
| CSPRNG | `crypto.randomBytes` | Mandatory for DH secrets |

### 3.1 AES-IGE

Infinite Garble Extension. Not in OpenSSL's public interface, not in `node:crypto`. Built
over ECB:

```
encrypt block i:  c[i] = E(m[i] XOR c[i-1]) XOR m[i-1]
decrypt block i:  m[i] = D(c[i] XOR m[i-1]) XOR c[i-1]
```

with `c[-1] = iv[0..16]` and `m[-1] = iv[16..32]`. Validated against known-answer vectors
before anything is built on top of it.

### 3.2 RSA padding

Telegram uses two schemes, selected by which server key fingerprint matched:

**`rsa_pad`** (current keys): pad the payload to 192 bytes with random data; reverse the byte
order; SHA-256 with a random temporary key; AES-256-IGE encrypt with a zero IV; XOR-adjust the
temp key; RSA-encrypt the 256-byte result. If the result is not less than the modulus, retry
with fresh randomness.

**Legacy** (old keys): SHA-1 of the payload, prepended, padded with random bytes to 255, then
raw RSA.

### 3.3 SRP for 2FA

Telegram's variant, `passwordKdfAlgoSHA256SHA256PBKDF2HMACSHA512iter100000SHA256ModPow`:

```
H(data)          = SHA256(data)
SH(data, salt)   = H(salt | data | salt)
PH1(pw, s1, s2)  = SH(SH(pw, s1), s2)
PH2(pw, s1, s2)  = SH(PBKDF2-SHA512(PH1(pw, s1, s2), s1, 100000), s2)
x                = PH2(password, salt1, salt2)

v    = g^x mod p
k    = H(p | g)
a    = random 2048-bit
g_a  = g^a mod p
u    = H(g_a | g_b)
k_v  = (k * v) mod p
t    = (g_b - k_v) mod p          -- positive modulo
s_a  = t^(a + u*x) mod p
k_a  = H(s_a)
M1   = H(H(p) XOR H(g) | H(salt1) | H(salt2) | g_a | g_b | k_a)
```

Sent as `InputCheckPasswordSRP { srp_id, A: g_a, M1 }`.

**Mandatory before use:** validate that `p` is a safe prime and `g` generates the correct
subgroup — the same checks as §5.2. Skipping them on the password path is a real
vulnerability, not a shortcut.

`p` and `g_b` arrive as TL byte strings, so §5.2's width bound applies to them before they
become integers, not after. The value checks above cannot run until the conversion has already
happened, which is the point at which an oversized field has already cost what it was sent to
cost. `p` is 256 bytes; `g_b` is at most 256.

### 3.4 Server RSA keys

Taken from Telegram's **published MTProto documentation**, matched by fingerprint at runtime.

Deliberately **not** extracted from Telegram Desktop or Android source, both of which are
GPL-licensed. The keys are public data and the documentation is a clean source; there is no
reason to acquire them from a copyleft codebase. See [licensing.md](licensing.md) §5.

---

## 4. TL: schema, codegen and codec

### 4.1 Grammar

```
name#id  arg:Type  arg2:flags.3?Type  = ResultType;
```

The parser must handle:

| Feature | Rule |
|---|---|
| Constructor id | `CRC32` of the canonical signature with `;` and parentheses removed — computed, then verified against any explicit `#id` |
| **Flags** | `flags:#` declares a bitfield; `field:flags.N?T` is present only when bit `N` is set |
| **Conditional `true`** | `field:flags.N?true` occupies **no bytes** — the flag bit *is* the value |
| Bare vs boxed | `%Type` or a lowercase constructor reference omits the leading constructor id |
| Vectors | `Vector<T>` is boxed with id `0x1cb5c415`; bare vectors omit it |
| Namespaces | `messages.sendMessage` — dotted, must map to nested TypeScript namespaces |
| Generic functions | `invokeWithLayer`, `invokeAfterMsg` — need special handling |

The two that break naive parsers are conditional `true` (a field that serializes to nothing)
and bare vectors inside otherwise-boxed structures. Both are covered by round-trip tests
against the full schema.

### 4.2 Binary format

| Type | Encoding |
|---|---|
| `int` | 4 bytes, little-endian |
| `long` | 8 bytes, LE — **native `BigInt`**, not a `Long` class |
| `int128` / `int256` | 16 / 32 raw bytes |
| `double` | 8 bytes, IEEE-754 LE |
| `string` / `bytes` | len ≤ 253: `[len][data][pad to 4]`; len ≥ 254: `[0xFE][len:3][data][pad to 4]` |
| `Vector<T>` | `[0x1cb5c415][count:4][items…]` |
| boxed | `[constructor_id:4][fields…]` |
| bare | `[fields…]` |

### 4.3 Generation pipeline

```
core.telegram.org/schema (layer N)
        │
   [ own TL parser ]
        │
   tl/schema.<layer>.json         committed, layer-tagged
        │
   [ emitters ]
        ├─> types.d.ts       split by TL namespace (see performance.md §5)
        ├─> reader.ts        constructor id -> deserializer
        ├─> writer.ts        constructor id -> serializer
        └─> errors.ts        552 typed error classes
```

Schema snapshots are committed, so builds are reproducible offline and a layer bump is a
reviewable diff.

**Verification:** every constructor round-trips (serialize → deserialize → deep-equal) as a
generated test. With 2,315 entries, this is the only realistic way to know the codec is
correct, and it catches flag-handling bugs immediately.

---

## 5. Authorization

### 5.1 DH handshake

Per `core.telegram.org/mtproto/auth_key`:

```
1.  client -> req_pq_multi{nonce:int128}
2.  server -> resPQ{nonce, server_nonce, pq, server_public_key_fingerprints}
3.  client    factorize pq = p*q  (p < q)
4.  client    build p_q_inner_data_dc{pq,p,q,nonce,server_nonce,new_nonce:int256,dc}
5.  client    encrypted_data = RSA_PAD(serialize(inner), server_key)
6.  client -> req_DH_params{nonce, server_nonce, p, q, fingerprint, encrypted_data}
7.  server -> server_DH_params_ok{nonce, server_nonce, encrypted_answer}
8.  client    tmp_aes_key/iv from new_nonce + server_nonce   (below)
              decrypt AES-IGE -> [sha1:20][server_DH_inner_data][padding]
9.  client    validate dh_prime, g, g_a                       (§5.2 — mandatory)
10. client    b = random 2048-bit;  g_b = g^b mod dh_prime
11. client -> set_client_DH_params{nonce, server_nonce, encrypted(client_DH_inner_data)}
12. server -> dh_gen_ok | dh_gen_retry | dh_gen_fail
13. both      auth_key = g_a^b mod dh_prime
```

Key derivation for step 8:

```
tmp_aes_key = SHA1(new_nonce | server_nonce) | SHA1(server_nonce | new_nonce)[0..12]
tmp_aes_iv  = SHA1(server_nonce | new_nonce)[12..20] | SHA1(new_nonce | new_nonce)
              | new_nonce[0..4]
```

Derived identifiers:

```
auth_key_id       = SHA1(auth_key)[12..20]      -- low 64 bits
auth_key_aux_hash = SHA1(auth_key)[0..8]        -- high 64 bits
new_nonce_hash{n} = SHA1(new_nonce | n | auth_key_aux_hash)[4..20]   -- n in {1,2,3}
server_salt       = new_nonce[0..8] XOR server_nonce[0..8]
```

The three verdicts differ in what they ask of the client, and all three carry a hash over
`new_nonce` and the key the server derived — so each is verified against the key the client
derived before it is acted on. An acknowledgement that fails its hash is not a verdict about
this exchange at all.

| Verdict | Verifies | Action |
|---|---|---|
| `dh_gen_ok` | `new_nonce_hash1` | The key is established |
| `dh_gen_retry` | `new_nonce_hash2` | Draw a **new `b`** and repeat from step 10. `retry_id` becomes the `auth_key_aux_hash` of the attempt that failed |
| `dh_gen_fail` | `new_nonce_hash3` | Fatal. The exchange cannot be completed with this server |

A retry asks for another exponent under the same exchange, not for the exchange to begin again:
the nonces, the modulus and `g_a` all stand, and only the public value changes. `retry_id` is
zero on the first attempt and names the previous failed key thereafter, which is how a server
tells a retry apart from a fresh exchange. **Retries are bounded** — a server that asks
indefinitely is one no exchange completes against, and an unbounded loop never reports the
failure it is in.

### 5.2 Mandatory security checks

From `core.telegram.org/mtproto/security_guidelines`. **None of these is optional and none is
configurable off** — a switch that disables a security check is a switch that ends up disabled
in production.

**DH parameters:**
- `dh_prime` is prime **and** `(dh_prime-1)/2` is prime (safe prime), via Miller-Rabin
- `2^2047 < dh_prime < 2^2048`
- `g` generates a subgroup of prime order `(p-1)/2`, checked by the `g`-specific congruence
  (`p mod 8 = 7` for `g=2`, `p mod 3 = 2` for `g=3`, and so on)
- `1 < g, g_a, g_b < dh_prime - 1`
- additionally `2^1984 < g_a, g_b < dh_prime - 2^1984`
- **cache the validation result** for a known-good prime; cache the outcome, never bypass the
  check

**Handshake integrity:**
- first 20 bytes of the decrypted answer equal `SHA1` of the remainder without padding
- `nonce`, `server_nonce`, `new_nonce` match the values from this protocol run
- `pq` is composite (reject a prime `pq`)
- **every server-supplied byte string that becomes an integer is bounded on its encoded width,
  before the conversion.** Converting a byte string to an integer costs time quadratic in its
  length, so a field carried at the transport's frame limit occupies the client for hours —
  long before any check on the resulting *value* could run. `pq` is at most 8 bytes,
  `dh_prime` and `g_a` at most 256. A wider field is not a value a server could legitimately
  be sending
- `pq` is also bounded as a value, so a caller reaching the factorization by another path
  cannot drive it: the cost of factoring grows with the size of the input
- the fingerprint named in `resPQ` is one the client actually holds; an unmatched fingerprint
  ends the exchange rather than selecting a key by position
- DH secrets `a`, `b` come from a CSPRNG

**Every encrypted message:**
- recompute and compare `msg_key`, **even when an earlier error occurred** — this is a timing
  and oracle concern, so the check runs unconditionally
- decrypted length ≤ plaintext size; padding within 12–1024; length divisible by 4 and
  non-negative
- `session_id` matches an active session
- `msg_id` parity correct for direction; not a duplicate; not lower than recently seen
- reject `msg_id` more than 30 s in the future or 300 s in the past

On any failure: **discard the message entirely** and reconnect.

All comparisons on secret-derived material use constant-time equality.

### 5.3 Perfect forward secrecy

The permanent key never encrypts traffic. A second, short-lived key does, and the permanent
key's only job is to vouch for it once — so compromising the key that protected a connection
buys an attacker that key's lifetime and nothing before it, because the earlier ones no longer
exist.

Temporary keys come from the ordinary exchange with `p_q_inner_data_temp_dc` and `expires_in`,
which the handshake already supports. The vouching is a separate construction: a
`bind_auth_key_inner` naming both keys, the session and the expiry, encrypted under the
**permanent** key and sent as a field of an `auth.bindTempAuthKey` request that travels under
the **temporary** one. Only a client holding both could have produced that pair.

Three things about the construction are unusual, and all three are the protocol's:

- **it uses the older MTProto 1.0 key schedule**, alone among everything this subsystem sends —
  four SHA-1 hashes interleaved differently from the current two, with the message key taken
  over the plaintext alone rather than over a slice of the auth key as well
- **the envelope's first sixteen bytes are filler.** The salt and session identifier a message
  normally carries describe nothing here, because this is never delivered as a message; it
  travels as a field. One random `int128` replaces both, keeping the header the receiver parses
  the same width
- **the binding names the identifier of the request carrying it.** The two must match, so the
  identifier has to exist before either is built — which is why it is supplied to the builder
  rather than drawn by it, and why this one message cannot go through the path that allocates
  identifiers as it composes

Yuigram additionally refuses to bind a key to itself. The server would accept it and the
connection would then be encrypting under the permanent key, which is the one thing this exists
to prevent — and nothing later would notice. That refusal is Yuigram's, not the protocol's.

Per DC, indexed, with expiry stored; the authorization store already holds temporary keys
against their expiry.

**Not yet implemented:** re-negotiation before expiry, the `initConnection` that must follow a
successful binding, the restriction limiting an unbound temporary key to
`auth.bindTempAuthKey`, `help.getConfig` and `help.getNearestDc`, and the
`ENCRYPTED_MESSAGE_INVALID` recovery path. Each needs the layer that sends API calls and owns
key rotation, which does not exist yet.

### 5.4 Sign-in flows

| Flow | Path |
|---|---|
| Phone | `auth.sendCode` → `auth.signIn` → `auth.checkPassword` (if 2FA) |
| Bot | `auth.importBotAuthorization` |
| QR | `auth.exportLoginToken` → poll / `updateLoginToken` → `auth.importLoginToken` |
| Session resume | Load auth key from storage; no handshake needed |

`PHONE_MIGRATE_X` and `NETWORK_MIGRATE_X` during sign-in redirect to another DC (§8).

#### Proving a password

The password never leaves the client. The server publishes a group, two salts and its own
public value; the client answers with a public value and a proof that it knows the password,
and the server checks the proof without being able to derive the password from it.

Only one algorithm is defined for this, and a server naming any other — including the explicit
unknown variant — is describing a scheme this client cannot perform. That is refused rather
than guessed at: a proof built on a guess fails for reasons nothing reports, and spends one of
the attempts the account allows.

Three rules decide whether the proof is worth anything:

- **the group is checked, with the same checks the handshake applies.** A password check over a
  group the far end chose proves nothing, so there is no path that skips them
- **the password is used as the bytes it was typed as.** No trimming, no normalization: the
  protocol defines none, and applying either would lock out every password ending in a space
  or carrying a combining mark, with nothing to tell the user why
- **the proof answers one exchange.** The server holds its secret exponent against the
  identifier it published, so a proof computed for one challenge proves nothing about another,
  and the identifier travels with the proof rather than being paired with it at the call site

**Not implemented here:** setting or changing a password, which needs the verifier a new
password is stored as — a different derivation from the proof that checks one.

#### The sequences

Three ways in, differing only in what is proved. A phone number is proved by a code sent to it
and then, when the account is protected, by a password. A bot proves itself with its token in one
call. A second device shows a token for another to approve, and a token that names a different
datacenter is presented there rather than reported back — a caller handed a token it cannot
display has been told nothing useful.

Every step may be told it is on the wrong datacenter, so every step follows that. Two of the
redirections arrive before an account is bound to anything and are answered by asking elsewhere;
the third says the account has moved, which leaves the datacenter being redirected to knowing
nothing about it, so the authorization is carried across first using the exchange in §8.
Redirections are bounded, because datacenters that redirect to each other describe a loop that no
number of attempts resolves.

An account that turns out not to exist is reported as needing one rather than raised as a
failure; registering is a separate sequence and is not implemented. Signing in stores nothing:
what it changes lives on Telegram's side, and the keys it was proved over are kept by the layer
that established them.

---

## 6. Session layer

The encrypted message layer, per `core.telegram.org/mtproto/description`.

### 6.1 Message format

Before an auth key exists there is nothing to encrypt with, so the messages that negotiate one
travel under a header that says so:

```
unencrypted: [auth_key_id = 0:8][msg_id:8][length:4][body:length]
```

A zero `auth_key_id` is the entire signal, and it is the same field the encrypted form uses to
name its key. The two envelopes are therefore distinguished by their first eight bytes, and a
zero arriving after the handshake is a message that does not belong to the session.

The declared length is authoritative: padded intermediate framing delivers its padding attached
(§7), and this header is what trims it.

```
encrypted:   [auth_key_id:8][msg_key:16][encrypted_data:…]

msg_key = SHA256( auth_key[88+x .. 120+x] | plaintext )[8..24]      -- middle 128 bits

sha256_a = SHA256(msg_key | auth_key[x .. x+36])
sha256_b = SHA256(auth_key[40+x .. 76+x] | msg_key)
aes_key  = sha256_a[0..8]  | sha256_b[8..24]  | sha256_a[24..32]
aes_iv   = sha256_b[0..8]  | sha256_a[8..24]  | sha256_b[24..32]
                                        x = 0 client->server, x = 8 server->client

plaintext: [salt:8][session_id:8][msg_id:8][seq_no:4][length:4][body][padding:12..1024]
```

Padding is random, 12–1024 bytes, total length divisible by 16.

Nothing outside the ciphertext records its length. The receiver therefore takes the boundary to
be the **last whole block**, which is what recovers the message from underneath the 0–15 bytes
padded intermediate framing may have appended (§7). Whole blocks appended past the end need no
separate rule: they decrypt as part of the message, which changes the plaintext and so changes
`msg_key`, and the comparison refuses them.

A failed exchange is terminal. Partially established state is discarded rather than kept for a
retry, because a second message acting on state an earlier one invalidated is indistinguishable
from a message acting on state it was never entitled to. `new_nonce` in particular does not
outlive the key it produced — it is the value an attacker holding a transcript would need, and
it has no use afterwards.

### 6.2 Message identifiers

`msg_id ≈ unixtime * 2^32`, monotonically increasing, with the low 32 bits carrying the
fractional second and never zero.

| Origin | `msg_id mod 4` |
|---|---|
| Client | 0 |
| Server response | 1 |
| Server-initiated | 3 |

`seq_no` is `2 × (content-related messages sent before this one)`, `+1` if this message is
itself content-related. Getting this wrong causes the server to silently drop messages, so it
is covered by explicit tests.

Time offset is learned from `server_DH_inner_data.server_time` and from
`bad_msg_notification`, and applied to every subsequent `msg_id`. **Never trust the local
clock** — a user with a skewed clock is a common, real condition.

### 6.3 Scope of the session layer

The session owns the sequences that cannot be duplicated without losing messages — the session
identifier, the message identifiers, the sequence numbers — together with the salt and the
clock correction in force. Inbound behaviour is split from it: what has already been seen is a
separate record, and what one encrypted message carries is a separate flattening step, so the
outbound path never touches replay state and the two can be reasoned about apart.

**Implemented:** inbound duplicate and replay rejection, the acceptance window, container
unpacking, transparent decompression, acknowledgement reporting, `bad_server_salt`,
`bad_msg_notification`, `new_session_created`, session replacement and the clock correction
those imply; outbound message tracking with acknowledgement state, resend eligibility and an
attempt limit; `rpc_result` reported against the request it answers; `msgs_state_info` status
decoding; composing outgoing messages, including container batching and the acknowledgements
that travel with them; the reservoir of future salts and the answer that fills it; the schedule
that decides when the connection's periodic work falls due, and liveness with it.

**Deferred:** the transport itself, and therefore reconnection. The schedule states what a
reconnect means for the work it holds, but nothing here opens a connection or writes to one.
The table below is the specification the complete layer implements.

#### Compression appears in two places

Around a whole message, and inside the field that carries a result. The first is undone while
flattening; the second is undone by the layer that knows the field is a result, because nothing
below it does. Both go through one decompressor and therefore one ceiling — a second would be a
second place for the bound to be forgotten.

#### A failure is an error

`rpc_error` becomes the error the rest of the framework raises, so a caller handling a Bot API
failure is handling this one. An error naming how many seconds to wait becomes the shared
rate-limit type, matched on that shape rather than on a single name: the Bot API decides by
whether a delay was supplied at all, and reports slow mode the same way it reports a flood, so
matching only `FLOOD_WAIT` would make the two transports disagree about one condition. Every
other failure keeps the name Telegram gave it — a caller matching on `CHANNEL_PRIVATE` needs to
see `CHANNEL_PRIVATE`.

#### What survives a restart

Very little, and the omissions are the design rather than an unfinished part of it.

| Kept | Why |
|---|---|
| Authorization key, per datacenter | Expensive to obtain and identifies the client; losing it means signing in again |
| Temporary keys, with the second they expire at | Judged when asked for, because a stored key outlives the process that wrote it and no timer survives with it |
| Server salt, per datacenter | Cheap, but learning a new one costs a refused message and a round trip |

| Not kept | Why |
|---|---|
| Session identifier and sequence numbers | A session belongs to one connection. Restoring an identifier with its counter back at zero recreates the disagreement the server answers by discarding messages, so a restarted client opens a new session |
| Clock correction | True only relative to the local clock it was measured against, which may have been corrected while the process was down. It is relearned from the first refused message either way |
| Requests, deadlines, ordering groups | Describe work whose outcome can no longer be observed, and whose caller is gone |
| Message attempts, acknowledgement state, retry counts | Belong to a connection that no longer exists |

Nothing executable is written: no promise, callback, timer or socket. A request in flight when a
process stops is not resurrected, and the message that carried it is abandoned rather than
retried — the server either processed it, in which case a retry would duplicate the effect, or
did not, in which case nothing was lost. Deciding otherwise needs the caller's intent, which is
exactly what did not survive.

**Unreadable is not the same as absent.** Absent means sign in again; answering that for state
that merely failed to decode discards a working authorization. Every stored value is validated
on the way out — encoded width before the decode allocates, decoded width after, and the salt
against the field that carries it — and a value that fails is refused rather than replaced with
a default.

Atomicity comes from the store, which writes to a temporary file and renames, so a process that
stops mid-write leaves the previous state rather than a partial one. Encryption at rest is
**not** part of this phase; it is a wrapper over any driver rather than a second protocol here.

The failure policy differs from the framework's deliberately. Framework session storage degrades
to memory and warns; authorization storage does not, because a client that silently continues
without its key signs in again on every start.

#### The request lifecycle

A request is what a caller asked for; a message is one attempt at delivering it. An identifier
is used once, so a resend is a new message, and anything that must outlive that succession is a
property of the request rather than of any identifier — the attempt count, the deadline, and the
ordering group all are.

| State | Meaning | Leads to |
|---|---|---|
| `pending` | Created; no message carries it | `sent`, `cancelled`, `timed-out` |
| `sent` | A message carries it; no answer | `acknowledged`, `blocked`, `completed`, `failed`, `cancelled`, `timed-out`, `sent` (resend) |
| `acknowledged` | Received, not answered. Resend no longer required | `completed`, `failed`, `cancelled`, `timed-out` |
| `blocked` | Refused because a predecessor is not ready | `sent` (resend), `completed`, `failed`, `cancelled`, `timed-out` |
| `completed` · `failed` · `timed-out` · `cancelled` | Terminal | — |

Acknowledgement and completion are separate because the server confirms receipt long before it
answers, and they imply different things. An acknowledgement arriving after a refusal does not
undo it: both come from the server and may arrive in either order, and letting the acknowledgement
win would make a request that still needs sending again look like one merely awaiting an answer.

**The deadline is absolute and fixed at creation.** It measures how long the caller is prepared
to wait, so neither a resend nor an acknowledgement restarts it — a server able to restart it by
refusing or merely receiving a message could hold a request open indefinitely. Expiry is
reported once, because a caller acting on the same expiry twice would fail a request it had
already failed.

**Withdrawal is idempotent and never reverses an outcome.** A message already sent cannot be
recalled, so withdrawing stops the request being sent again and stops the caller waiting; an
answer that still arrives is discarded. A request the server has already answered stays answered.

#### Ordering with `invokeAfterMsg`

**The ordering is enforced by the server, not by the client.** The point of the wrapper is that
a caller need not wait for one result before sending the next: both go out immediately, and the
server sequences them. A client that withheld the second until the first succeeded would be
correct on the wire and would discard the only reason the wrapper exists.

Two orderings must be kept apart. **Client-side dependency tracking** records which request
comes before which, and survives everything. **Server-enforced execution ordering** is what the
wrapper buys, and it is expressed in concrete message identifiers.

The wrapper names a **concrete message attempt**, not a logical request. A resend is a new
message with a new identifier, so a group is recorded as the *requests* in it, in the order they
joined, and the identifier to name is resolved at each send from the current attempt of the
nearest usable earlier member. Recording identifiers instead would let a retry take a place of
its own: the head resent after its dependent would be ordered behind it, while the dependent
went on naming an identifier the server never saw. Neither would ever resolve — not degraded
ordering but a deadlock.

Because the resolution happens at send time, a dependent already on the wire keeps naming the
attempt it was sent with; it picks up the predecessor's new identifier only when it is itself
sent again. That is what converges a group after a resend, and the mechanism is the server's
own refusal: a dependent naming a message the server does not know is refused, and the resend
that follows resolves against what is current then.

A member that failed, timed out, or was withdrawn is stepped over — the server has given up on
it and answers a request naming it by refusing that one too. A member that completed is named
as readily as one still running, because the server knows it finished and the dependent proceeds
at once. A request is never told to run after one of its own earlier attempts.

This is a line, not a graph: a request can only name one that joined ahead of it, so a cycle
cannot be constructed and none is detected. Groups are independent and bounded by the number of
requests that may be outstanding.

| Server error | Means | Predecessor permanently failed? | Response |
|---|---|---|---|
| `MSG_WAIT_TIMEOUT` | The predecessor had not finished within the server's window | No | Send again once it settles |
| `MSG_WAIT_FAILED` | The predecessor emitted an error | Yes | Send again, naming a usable predecessor or none |

Both leave the request able to be sent again rather than settled, and the same request may
receive each in turn. They differ in what they say about the *predecessor*, which the client
learns from that predecessor's own answer — and which is what decides whether the next send
steps over it.

**Withdrawing a member does not fail those after it, and is an architectural choice rather than
a protocol requirement.** Withdrawal is a client-side operation on a logical request: it does
not unsend a message, and `rpc_drop_answer` asks the server to discard an *answer*, not to
abandon the work — so a withdrawn request that reached the server may still execute. Two
readings are therefore defensible, and the protocol settles neither:

- *step over it* — later members proceed. If the withdrawn message does execute, a later member
  may run before it, which is an ordering the caller originally asked against
- *keep naming it* — ordering is preserved when the message executes, but a member naming one
  the server never received waits until its own deadline, because a withdrawn request is not
  sent again

The first is taken here. Its failure is bounded and immediate; the second's is a request that
appears to hang. A caller that needs the ordering to survive withdrawal should not withdraw the
predecessor.

**A group holds only what is still outstanding.** A member leaves it when the request is
forgotten, and the group disappears with its last member. A group in continuous use never
empties, so keeping finished members would grow it for as long as the connection lasts and
lengthen every predecessor search with it.

Nothing needs to be remembered about a member once it is gone. Every terminal state resolves to
the same thing: one that completed imposes no further ordering, and one that failed, timed out
or was withdrawn is stepped over. Naming a completed predecessor and naming nothing at all are
indistinguishable to the server, which is why the record can be discarded rather than kept for
the benefit of a later send.

**Waiting on a predecessor consumes the dependent's own deadline.** The deadline measures how
long the caller is prepared to wait, and time spent queued behind another request is time spent
waiting. A predecessor timing out propagates nothing directly; it becomes unusable, which the
next send steps over.

#### Outbound tracking

A message is delivered only once something says so, so what went out is recorded until it is
answered for: identifier, sequence number, the second it was sent, whether it has been
acknowledged, and how many times it has been tried.

The record holds **no request state**. An identifier is the whole of what the protocol knows
about an outgoing message; what that message *was* belongs to the layer that created it, and
joining the two would make the protocol record depend on the shape of the caller above it.

Three rules govern it:

- **an answer is an acknowledgement.** The server does not reply to a message it never
  processed, so a `rpc_result` acknowledges the request it names as surely as a `msgs_ack` does
- **a container is acknowledged as a unit.** The server acknowledges what it read, and it read
  the contents together, so acknowledging a container acknowledges everything inside it
- **attempts are bounded, and the bound follows the succession rather than the identifier.** An
  identifier is used once — the server ignores a repeat as a duplicate — so sending something
  again means sending a *new* message carrying the same payload. A count kept against one
  identifier would restart at every resend and never bind, so a replacement declares what it is
  sent in place of and inherits the count. Replacing something untracked, acknowledged, or
  already exhausted is refused: each would silently reset a count whose only purpose is to stop

An acknowledgement for an identifier the record does not hold is *reported*, never recorded:
acknowledgements arrive from the network, and creating an entry for one would let the far end
decide how much is remembered.

#### Message states

`msgs_state_info` answers a state query with one byte per identifier asked about — low three
bits for the state, the fourth for whether it had already been acknowledged:

| State | Meaning | Resend |
|---|---|---|
| 1 | Nothing known; the identifier is too old to be remembered | yes |
| 2 | Not received, within the range the server remembers | yes |
| 3 | Not received, newer than anything the server has seen | yes |
| 4 | Received | no |

The correspondence is positional, so a byte naming no defined state is refused rather than
skipped: one unreadable byte leaves every byte after it meaning something other than what it
says. Deciding *when* to ask is scheduling, and belongs with the timers that are not yet built.

#### Composing what goes out

A connection does not send one protocol message per encrypted message. Several queries and the
acknowledgements owed for what has arrived travel together in a container, which is what keeps a
busy connection from spending a round trip per call. Composing is where the two sequences the
session owns are actually spent, so it is the one place identifiers and sequence numbers are
drawn for outgoing traffic.

Four rules come from the specification and each fails silently when broken:

- **a container's identifier is above every identifier inside it.** Drawing the container's
  after its contents is what guarantees this, and it is checked rather than assumed. The
  comparison is unsigned: an identifier is carried as a signed 64-bit value and turns negative
  in 2038, and comparing the signed forms would make every container look malformed from that
  day onward
- **a container carries at most 1024 messages, and one acknowledgement names at most 8192
  identifiers.** An excess is refused rather than truncated — a truncated acknowledgement leaves
  the server resending what the client has already processed, and says nothing about which
- **the container is not content-related and neither is the acknowledgement.** Each is an
  envelope or a report rather than something the far end owes an answer for, so neither advances
  the counter and neither is numbered odd
- **a single message is sent as itself.** Wrapping one message in a container costs sixteen
  bytes and gives the server nothing to do with them

The acknowledgement is placed ahead of the work it accompanies: the server resends what it has
not heard about, so telling it first stops a resend that working through the queries would
otherwise race.

Two things composing deliberately does not do. It does not wrap a query in `invokeAfterMsg` —
that is a function of the API schema rather than the service one, so the ordering wrapper is
part of building the query, and which message it names is resolved by the record that owns the
ordering. And it does not compress: the protocol permits a compressed query but never requires
one, so compression outbound is a cost with no correctness attached to it.

A body arriving from a caller that is one of the constructors which are never content-related is
refused. Those are the wrappers this layer builds itself, and one supplied from above means the
caller is assembling an envelope that is not its to assemble — which this layer could not then
number correctly.

#### Salts held in reserve

A salt rotates every thirty minutes, and the server's way of announcing the change is to refuse
the message that used the old one. Handling that refusal is necessary and is implemented, but as
the only mechanism it costs a round trip and a delayed message every half hour, forever. So
salts are asked for ahead of time: the client may request between 1 and 64 of them, and the
server answers with the window each is valid in.

A salt belongs to the authorization key rather than to a session, so the reserve survives a
session being replaced. It does not survive the process — what is persisted is the salt in
force, and a restarted client refills the same way it filled the first time.

The rules the reserve follows:

- **an answer is matched to the query that asked for it.** The protocol requires the comparison.
  Salts decide which messages the server will accept, so an answer taken without it is one that
  did not have to be asked for
- **a window that has closed, or that never opens, is not supply.** Such a salt can never be
  selected, and storing it would let a server fill the reserve with values that look like supply
  and are not. A salt already held is likewise not counted twice
- **the salt in force is the newest whose window covers the moment.** Windows overlap while one
  salt replaces the next: the old one stays *acceptable* for a further 1800 seconds, but new
  messages carry the new one
- **expired salts are reclaimed.** Selection already steps over them, so this changes no answer
   — but without it a long-lived connection accumulates every salt it was ever given and stops
  accepting new ones once the reserve is full

How many salts must lie ahead before the supply counts as sufficient is a **policy**, not a
protocol rule: the protocol says when a salt expires, not when to ask for the next. The default
keeps two, the smallest number that tolerates one lost answer without falling back on being
corrected by the server. Deciding *when* to send the request is scheduling, and belongs with the
clock that is not yet built.

#### When the connection acts

A connection owes work that nothing in particular triggers: noticing that a request's deadline
has passed, refilling the salt reserve, reconciling delivery, proving it is still there, and
putting queued messages on the wire. Each is a question of *when*.

Giving each its own timer would put a runtime's clock inside the protocol layer, make the
behaviour untestable without waiting, and make the interleavings unenumerable. So there are no
timers here. The schedule holds the moment each duty next falls due and answers, for a moment
supplied to it, which have arrived; the layer that owns the socket keeps **one** real timer, set
to the earliest of them. Every timing rule is then one place, and the whole of it is decidable
from a number.

The schedule holds no requests, no messages and no salts. It decides that the moment to act has
come; *what* to expire, or which messages to ask about, stays with the records that own them.

- **deadlines are armed, not polled.** The registry reports its earliest outstanding deadline
  and the schedule wakes at exactly that moment. A poll would notice a deadline some interval
  after it passed, and a deadline noticed late is one its caller waited past. One wake covers
  every outstanding request, because the first to pass is the only one that can need attention
  next
- **periodic work counts from the slot, not from now.** A duty handled late does not push the
  ones after it later with it, so the schedule stays where it started instead of drifting by
  however long each pass took
- **a pause is not a backlog.** A connection asleep for an hour owes one ping, not sixty.
  Delivering the missed slots would answer a pause with a burst at the moment the connection is
  least able to absorb one. The count is arithmetic rather than a loop, so a pause of a decade
  costs what a pause of a second costs
- **duties that fall due together are ordered.** Expiry first, so a request already given up on
  is not then asked about or sent; the flush last, so what the others queued travels with it
- **a flush is owed until it happens.** The other duties are moments, and taking the moment is
  the whole of it. A flush is an obligation to put bytes on a wire, so it is reported for as
  long as it is outstanding. That is also what keeps work queued while handling one duty out of
  a second batch — the flush it would have armed is the one already owed

Liveness lives here too, because a round trip is a measurement about time. A ping's departure is
recorded against the schedule's clock and the pong that names it completes the measurement. A
pong for a ping this connection did not send, one that arrives twice, or one claiming to have
arrived before its ping left, all measure nothing — the last because that is a clock moving
backwards rather than a fast network, and recording it would make a connection look healthiest
at the moment its timekeeping broke.

**A pong acknowledges its ping.** Nothing else confirms one, so a ping left outstanding would be
resent until its attempts ran out.

#### What a reconnect means

The schedule does not reconnect — no transport exists to reconnect with — but what a reconnect
means for the work it holds is settled:

| State | Across a reconnect | Why |
|---|---|---|
| Periodic duties | Re-armed from the new connection | They describe the connection, which is new |
| Round trips, unanswered pings | Discarded | Measurements of a connection that has ended |
| A pending flush | Discarded | An intention to write to a socket that is gone; the messages are the outbound record's |
| Request deadlines | Kept exactly | They say how long a *caller* will wait, which reconnecting does not change |
| Resend eligibility | Untouched | The outbound record owns it and answers the same either side |

Duplicate periodic work after a reconnect is impossible by construction: duties are moments
rather than loops, so there is nothing a second start could duplicate, and starting while
already running changes nothing. Because there are no callbacks, no stale callback can fire into
a replaced connection — but a *decision* can outlive the connection it was made for, so every
answer carries the epoch it was decided in, and the caller checks that epoch before acting.

Two intervals here are **policy, not protocol**: how often the salt reserve is considered, and
how often delivery is reconciled. The protocol provides the queries and says nothing about their
frequency. The ping interval follows the protocol's own worked example of a client pinging once
a minute.

#### Inbound acceptance

Three rules decide whether a message is allowed to have an effect, and each needs memory a
single message cannot supply:

- **parity** — server identifiers are odd. The envelope checks its own; a container element
  carries its own identifier and bypasses that check, so it is checked again per element
- **the window** — an identifier carries the second it was created, so a message more than
  30 s ahead or 300 s behind the server's clock is refused. The bound is deliberately
  asymmetric: clocks drift backwards more readily than messages arrive from the future
- **duplication** — the server resends what it believes was not acknowledged, so a repeated
  identifier is ordinary; acting on it twice is not. The record is bounded, and an identifier
  older than everything retained is refused rather than admitted, because the record cannot
  prove it is new

A fourth applies to the envelope rather than to each message: **the session identifier must be
the active one**. A message naming another session is refused rather than raised — replacing the
session leaves whatever was in flight addressed to the old one, so a stale message is an
ordinary consequence of a reset, and a caller that had to catch an exception for each would be
catching the normal case. §5.2's "discard and reconnect" governs cryptographic failure, not a
session the client itself replaced.

A message failing any of these changes nothing about the session. The rules run before the
rules that would adopt a salt, correct a clock, or reset anything, and the whole message is
flattened before any of it is dispatched — so a structural failure anywhere in a container
prevents every element of it from having an effect.

#### Structure

One encrypted message may carry many. A container's elements are bare and each carries its own
identifier and sequence number, which replace the envelope's — an acknowledgement names an
element, never the container that delivered it. **A container cannot carry another container**;
that is refused for what it is rather than counted toward a depth, because no legitimate message
has that shape. Compression may wrap a container or an element, and a chain of wrappers is
bounded, as is what one may expand to.

#### `bad_msg_notification`

The notification's own identifier carries the server's clock. The payload names what was wrong,
never what would have been right, so the correction comes from the identifier.

| Code | Meaning | Response |
|---|---|---|
| 16 | `msg_id` too low | Correct the clock, resend the named message |
| 17 | `msg_id` too high | Correct the clock, **replace the session** — a clock ahead of the server keeps producing identifiers it has already refused |
| 20 | `msg_id` too old | Resend. **No clock correction** — the message waited, which says nothing about the clock |
| 18, 19, 32–35, 48, 64 | Low bits, sequence numbers, containers | Replace the session. These describe a disagreement about the connection that resending one message under repeats |

#### What is never acknowledged

`msgs_ack`, `http_wait`, `bad_msg_notification`, `bad_server_salt`, `msgs_all_info`,
`msgs_state_info`, `msg_detailed_info`, `msg_new_detailed_info`, `pong`, `future_salts`.

Two reasons, not one. Acknowledging an acknowledgement does not terminate, and the notifications
are the server's answer to something it already refused. A pong and a salt list are exempt on
different grounds: each *is* the acknowledgement of the query that asked for it, so the exchange
is complete when it arrives.

A result is not exempt. Answering a query acknowledges the query, but the answer is a message
like any other and is resent until it is acknowledged in turn.

#### `new_session_created`

Deduplicated by `unique_id`: the announcement reaches every connection sharing the session, and
acting on it twice reports a gap that did not happen. The client's own session identifier does
not change — the server is reporting that *it* has no state, not asking for a different
identifier. What is lost is everything sent before `first_msg_id`, and any update that arrived
while there was no session to deliver it to. The first announcement on a connection reports no
gap, because a connection that has just opened fetches state anyway.

### 6.4 What the session must handle

| Message | Response |
|---|---|
| `rpc_result` | Route to the pending request; unwrap `gzip_packed`; map `rpc_error` |
| `msg_container` | Unpack and process recursively |
| `msgs_ack` | Mark sent messages acknowledged |
| `bad_server_salt` | Adopt the new salt, resend — happens roughly hourly |
| `bad_msg_notification` | Correct time offset or seq_no by error code, resend |
| `new_session_created` | Reset session state, adopt salt, notify updates layer of a possible gap |
| `pong` | Liveness, RTT measurement |
| `msgs_state_req` / `msgs_state_info` | Delivery reconciliation |
| `future_salts` | Prefetch upcoming salts |
| `gzip_packed` | Transparent decompression, bounded |
| `updates*` | Forward to the updates manager |

Outgoing responsibilities: acknowledgement tracking with resend, batching into containers,
`invokeAfterMsg` chaining for ordered calls, per-request timeout and cancellation, and
resend-on-reconnect for unacknowledged messages.

Inbound replay and duplicate rejection, and the ±30 s / ±300 s acceptance window, belong with
this table rather than with the envelope: all three need a record of what has already been seen
on this connection, and a decoder that answered them from a single message would be guessing.

**This layer is where silent message loss originates.** Omitting acknowledgement tracking or
`bad_msg_notification` handling produces a client that works in testing and drops messages in
production. It is built with a mock server that can inject each of these conditions
deliberately.

---

### 6.5 The connection

Everything above is a piece. A session numbers messages, a record remembers what was sent, a
dispatcher interprets what arrives, a schedule says when to act — and none of them can answer a
caller, because answering means holding the promise somebody is waiting on and knowing which
arriving message belongs to it. That correlation is the connection, and it is the whole of what
the layer adds.

It owns no socket. Bytes leave through a callback, arrive through a method, and the moment is
read from an injected clock, so the entire layer is decidable offline. Which datacenter the
bytes go to, what carries them, and what to do when the link breaks are decisions for the layer
above, which is why none of them appear here.

Two things live here and nowhere else:

- **the pending calls.** A promise cannot be persisted, resumed, or held by a record that
  outlives the connection
- **whether the server has been told what this client is.** The server keeps that against the
  connection rather than against the key

#### Announcing the client

The protocol requires a connection to state which layer it speaks, and requires the layer to be
announced by wrapping the call that carries the client description rather than on its own. So
the query becomes `invokeWithLayer(layer, initConnection(…, query))`. The layer is the one the
codecs were generated from and is not configurable: announcing another would claim a wire
contract the generated types do not implement.

Every call is wrapped until one **succeeds**, not merely until one is sent. The server processes
a batch in whatever order it likes, so a bare call that overtook the wrapped one would reach a
connection that had not been told anything yet. Wrapping until something is known to have
arrived costs a few redundant bytes while a connection opens and removes that ordering hazard
entirely.

Binding a temporary key discards what the server was told, so the next call says it again. That
is the protocol's rule, and it is applied by watching what succeeded rather than by asking the
caller to remember.

#### Answers finding their callers

`rpc_result` names the message that asked. The request record already maps a message identifier
back to the request it carried — across resends, since a resend is a new message for the same
request — so correlation is a lookup rather than a second table.

An answer naming a message no request claims settles nothing and is passed on rather than
raised: a result for a call that was withdrawn, or that timed out while the server was still
working on it, arrives after nobody is waiting, and that is ordinary. A failure becomes the
error the rest of the framework raises, so a caller handling a Bot API failure is handling this
one.

A message that does not verify is the exception: it is raised, because material failing its
integrity check means the stream is not what this connection thinks it is, and reading on would
be guessing.

**Not implemented here:** ordering groups, reconnection, datacenter selection, and acting on a
delivery-state answer. The first three need a layer that owns the link; the last is resend
policy, which belongs with them.

---

## 7. Transport

Four framings, per `core.telegram.org/mtproto/mtproto-transports`:

| Transport | Init | Frame |
|---|---|---|
| Abridged | `0xef` | `len/4 < 127`: `[len:1][payload]`; else `[0x7f][len:3][payload]` |
| Intermediate | `0xeeeeeeee` | `[len:4][payload]` |
| Padded intermediate | `0xdddddddd` | `[len:4][payload][pad:0..15]` |
| Full | — | `[len:4][seq:4][payload][crc32:4]` |

**Default: intermediate** — 4 bytes of overhead, no CRC to maintain, and the best-supported
option. Padded intermediate is available where traffic-shape obfuscation matters.

Two properties of the envelopes decide correctness above them:

**A four-byte frame is a transport error, not a payload.** The server reports a transport-level
failure — a missing auth key, transport flood, a wrong datacenter — by sending the code as a
negative signed 32-bit integer, framed exactly like a payload. The smallest encrypted message is
40 bytes and the smallest plaintext one 20, so the length alone distinguishes them. A layer that
handed those four bytes onward would try to decrypt an error report. Documented codes: 404 (auth
key not found), 429 (transport flood), 444 (invalid datacenter).

Because the length is the only marker, an error frame is **never padded**. Padded intermediate
frames may otherwise carry up to fifteen extra bytes, and a padded error frame would be
indistinguishable from a short payload; a zero-padding frame is still a valid one.

**Padded intermediate delivers its padding.** The length covers payload and padding together and
nothing in the envelope says where the payload ends, so the transport cannot trim it. The message
layer does, using the length its own header carries. That is a property of the framing, not an
omission in it.

**Every framing takes its length from the peer, so every framing bounds it.** A decoder reads a
length before it holds the bytes that length describes, which makes the value the other end's to
choose. Four bytes of corruption would otherwise commit the receiver to buffering toward four
gigabytes while emitting nothing and reporting nothing. Frames are capped at **16 MB** — far
above the largest message the protocol sends, a one-megabyte file part plus its envelope, and far
below what it costs to hold. A length past the cap ends the connection rather than growing a
buffer.

**The opening of a connection is unambiguous, by construction.** A server reads the first bytes
without yet knowing whether they are a framing tag or an obfuscation init packet, and it has to
decide from them alone. This works because the init packet is *drawn* so that it can never begin
with a tag: a leading `0xef`, a first word of `0xeeeeeeee` or `0xdddddddd`, one of four HTTP
verbs, or a zero second word are all rejected and redrawn rather than corrected — correcting a
byte would make that position non-uniform, which is the one thing the prefix must not be. Full
framing is the exception and cannot be disambiguated: it announces nothing, so a peer expecting
it has to be told. The rejection rules are therefore not defensive tidying; they are what makes
the other end's detection sound rather than probabilistic.

### Obfuscation

A 64-byte init packet, AES-256-CTR:

- bytes 0–55: random, avoiding sequences that collide with protocol identifiers
- bytes 56–59: transport tag
- bytes 60–63: DC id, signed 16-bit LE (MTProxy)

Encryption key/IV from bytes 8–40 and 40–56 of the payload; decryption key/IV from the same
offsets of the byte-reversed copy; both hashed with the proxy secret when one is used. The
packet encrypts itself, and bytes 56–63 of the ciphertext replace the plaintext at those
positions.

Transports sit behind an interface, so TCP, MTProxy, WebSocket and test transports are
interchangeable.

### The link

Between a stream of bytes and everything above it sit three concerns that must happen in one
order: the packet that opens the connection, the envelope around each message, and the
obfuscation that hides both. A link owns that order and nothing else.

It owns no socket, on the same terms as the protocol machine above it: bytes leave through a
callback and arrive through a method, so the opening packet and every fragmentation case are
decidable without a network. It holds no protocol state either — it cannot tell a handshake
from a message, has no session, and moves whole payloads only.

Four rules it enforces:

- **the opening packet is written once and before anything else.** The far end reads the first
  bytes without yet knowing what they are and decides from them alone, so a connection opened
  twice, or opened after a message has gone out, is one it cannot read at all
- **the init packet is the one thing sent in the clear.** It carries the material both
  keystreams derive from; everything after it is obfuscated
- **decryption consumes the stream, not a frame.** A keystream must take every byte exactly once
  and in order, so bytes are deobfuscated as they arrive rather than per message
- **a transport failure is not a message.** A four-byte frame carrying a negative code is
  surfaced as what it is, because a layer that received it would try to decrypt it

A chunk is not a message: it may carry part of one, several, or the tail of one and the head of
the next. Every complete frame in a chunk is delivered, and an incomplete one leaves the buffer
as it was.

### The socket

One adapter opens an actual connection, and it is deliberately thin: it frames nothing,
obfuscates nothing, buffers nothing for reassembly, and holds no protocol state. A chunk leaves
exactly as it was given and arrives exactly as it came, because deciding where a message ends
belongs to the layer that knows what a message is.

It bounds the **handshake** and nothing else. How long a *request* may take is a different clock
measured against different work, and belongs with the record that tracks requests — a bound that
outlived the handshake would end healthy connections on a timer.

It reports failures without acting on them. A refused connection, a handshake that never
completed and a peer that hung up are all reported; recovering from any of them needs to know
which datacenter was being reached and what was in flight, and neither is knowable at this
level. A socket reports a failure and *then* closes, so the two are one ending and are delivered
once, carrying the failure when there was one — a peer that closed cleanly and a peer that
vanished are different events above.

Backpressure adds no policy here. The socket queues what it cannot send yet and never drops or
reorders it, so what is queued is reported and left alone; a second queue would be a buffer with
no consumer and a new way to reorder.

### The channel

Every layer below is deliberately unable to reach a network. A channel is where they are wired
to each other and to a socket, which makes it the only place holding a real timer and a real
file descriptor:

```
socket ──> link ──> key exchange ──┐
                                   ├──> connection ──> a call
socket <── link <──────────────────┘
```

**A channel is used once.** One socket, one exchange, one connection; once closed it stays
closed. Reconnecting opens another, a pool holds several, and reaching a different datacenter
opens one there — so none of those needs to unpick this wiring, and state belonging to a
connection that ended cannot be read by the one that replaced it. It is the same discipline the
schedule's epoch already enforces one layer down.

What it does not own is the **authorization key**. A key outlives every socket it is ever used
over, so it is supplied when one is known and reported when one is negotiated. Storing it is the
caller's, which keeps persistence out of the live machinery.

The exchange and the connection share the link: the exchange is a sequence of plaintext
messages, and what follows is encrypted, and the link knows the difference between neither. The
switch from one to the other is one-way.

Failures divide by when they happen. Anything before the channel is usable — a refused socket, a
key exchange that failed, a stream that ended mid-exchange — fails the attempt and leaves
nothing open, because there is no channel yet to report against. Anything after arrives as an
ending, once, carrying the failure when there was one; a peer that closed cleanly and a peer
that vanished are different events to whatever will later decide about reconnecting. An ending
the caller asked for is not reported back to it.

#### What may be sent again

A message that was sent and not answered for falls into one of three states, and only one of
them permits sending it again.

| The server said | Ran? | Action |
|---|---|---|
| `bad_server_salt`, `bad_msg_notification` 16 or 17 | no — it refused the message | send again under a new identifier |
| `bad_msg_notification` 20 | **unknowable** — the protocol says so in as many words | give up; report the outcome as unknown |
| nothing, because the connection died | unknowable | give up; report the outcome as unknown |

The distinction is the whole of retry safety. A refusal is the server stating it did not act;
silence is not. Within one session an identifier is used once and the server drops a repeat, so
resending under the *same* identifier would be safe — but a resend uses a new one, and a new
connection is a new session where the old identifier means nothing. Deduplication does not
survive either.

So **nothing is automatically sent again after an outcome that cannot be verified.** Whether a
particular call is worth making a second time depends on what the call was: a read costs
nothing, a send that carries its own deduplicating identifier is safe, and one that carries
neither may act twice. The schema does not say which is which, so the decision cannot be derived
from a method's definition — it is a policy, and it belongs to whoever knows what was being
asked.

A call that was waiting when a channel ends is told which kind of ending it was. One the caller
withdrew must not be made again; one the connection lost is worth making on the next channel.
Collapsing both into the same refusal would leave that decision to be guessed at from a message,
by a layer that has no business reading messages — so the channel names the reason and the
connection reports it unchanged.

**Not implemented here:** reconnection, pooling, migration and datacenter selection policy. Each
of those composes channels rather than changing them.

### Reaching a datacenter

Three things have to come together before a channel can be opened, and each is owned elsewhere:
which address serves the purpose, whether an authorization already exists for that datacenter,
and what to do with one that has just been negotiated. One layer brings them together.

**It is a factory, not a pool.** A channel it opens belongs to whoever asked for it. Holding
them would mean asking twice returns the same connection, which is pooling — and pooling has to
decide how many, for what, and what happens when one dies, none of which can be answered without
the layer that will own reconnection. Caller ownership is what lets that layer be added above
rather than unpicked out of this one.

- **a stored configuration beats a supplied one.** The stored list came from a server; the
  supplied addresses exist only to reach a server in the first place
- **a stored authorization is reused rather than replaced.** A connection that reused one writes
  nothing back, because there is nothing new to record
- **a key that has just been negotiated is written down, or the connection fails.** A client
  that cannot keep its key negotiates a new one on every start, which is what an intruder looks
  like — so this fails loudly rather than working quietly
- **a key without a salt is still usable.** The server refuses the first message and names the
  salt to use, which costs one round trip and corrects itself. The clock correction is
  deliberately not stored, so a resumed connection learns it the way a new one does

#### Adopting what the server publishes

`help.getConfig` is the one method that publishes the list, and its answer is read and checked
in full before anything changes. A configuration accepted in part would be indistinguishable
from one the server published that way, and the gap would surface as a datacenter that cannot be
reached rather than as the answer that was wrong.

Adoption is ordered so that nothing is in force that was not written down:

1. read and validate the whole answer — a failure here changes nothing;
2. compare it with what the store already holds — an unchanged configuration is not written
   again, since the server publishes the same list on every call that changed nothing;
3. write it;
4. only then replace the directory in memory.

Persisting before adopting is what makes the failure honest. A configuration held in memory that
was never stored reverts on the next start, and reporting the failure while having changed
anyway leaves a caller unable to say which list is in force. A store that refuses leaves the
previous configuration entirely in place.

Order is part of the comparison. The server publishes its addresses in its own order of
preference and selection takes the first candidate, so the same addresses rearranged are a
different configuration and are adopted as one.

Everything that can go wrong leaves the previous configuration untouched: a call that failed, an
answer that did not parse, a store that refused, and a channel that had already closed.

#### What an authorization is made of, and how long each part lives

| State | Lives as long as | Persisted | Why |
|---|---|---|---|
| authorization key | the account's authorization | **required** | expensive to obtain and identifies the client; losing it means authorizing again |
| server salt | half an hour, attached to the key | *optimization* | a stale one costs one refused message and a round trip, no more |
| session identifier | one connection | never | a session belongs to one connection |
| sequence numbers | one connection | never | they follow the session |
| message identifiers | one connection | never | time-derived, and the server tracks them per session |
| clock correction | one connection | never | only true relative to the clock it was measured against |

A datacenter has **one** authorization. Two connections opened at the same moment must not each
obtain a key, because only one can be kept — the other connection would be holding an
authorization that exists nowhere else, and an account authorized against it would appear
unauthorized on the next start. Obtaining is therefore shared per datacenter while it is under
way; each caller still gets a connection of its own, so nothing caches channels.

Because it is shared, the exchange runs on a **connection of its own**, opened for that alone and
closed once the key is stored. Carrying one caller's settings into shared work makes that caller's
decisions everyone's: a caller that abandons its attempt would cancel an exchange the others are
still waiting on, and a caller that stays would receive reports about a connection it never asked
for. Only what is the same for every connection to that datacenter — the address, the framing, the
socket settings — reaches it. Cancellation and reports belong to the channel each caller opens
afterwards, and a caller that walks away ends its own wait while the exchange carries on for the
rest.

A failed exchange is not remembered. The next caller starts a new one rather than inheriting a
failure it did not cause and cannot retry past.

A key the datacenter has refused is discarded by naming the identifier of the key that was
refused, and nothing happens unless that is still the key being kept. A datacenter serves more
than one connection, so a refusal can arrive after another connection has already obtained a
replacement, and removing the replacement would leave that connection authorized against a key
stored nowhere — the same damage the shared exchange exists to prevent.

The comparison only means something if it is still true when the removal happens, and reading,
comparing and removing are separate calls into a store that is free to take as long as it likes
over any of them. A store of keys and values cannot be asked to compare and remove in one step,
so the ordering is supplied above it: **every operation that reads or writes a datacenter's
authorization runs in a queue of that datacenter's own**, and none of them can observe another
halfway through. A discard whose read was slow therefore compares against what is actually
stored, finds a key it does not name, and leaves it alone. Datacenters have queues of their own,
so one waiting on a slow store does not hold up the rest, and nothing else is serialized — once a
key is in hand, opening a connection with it is not an authorization operation.

What is queued behind is whether the previous operation finished, not what it produced. An
operation that failed must not stop the next one, which is not the one that failed and reads the
store for itself.

A salt adopted from `bad_server_salt` lives in the session and does not outlive the connection.
Nothing writes it back, and nothing needs to: the server names the salt to use when it refuses a
message, so a connection that starts from a stale one corrects itself. Persisting it would save
a round trip per connection and is worth doing when something owns the moment a connection ends;
it is not required for correctness.

For the same reason, an authorization reported by a connection is the one it *started* with. A
salt learned later is not reflected there, so it is not a source to persist from.

The authorization key leaves its object exactly once, by an explicitly named method, and as a
copy. Everything else about that object exists to stop the key escaping by accident — it is not
a field, not enumerable, and absent from the string, JSON and inspected forms — but a key that
cannot be written down is a key that must be negotiated again on every start.

#### A connection that outlives its channels

A channel is single-use: one socket, one exchange, one session, and once it ends it stays ended.
That is what makes every layer below it decidable, and it is also what makes a channel unusable
on its own — a caller holding one holds something that will eventually die and take its calls
with it. One layer above turns that into an address a caller can keep.

It is identified by **datacenter and purpose**, and by nothing else:

- not the key, which belongs to the datacenter, is shared between purposes on it, and can be
  replaced without the connection becoming a different connection;
- not the address, which is chosen again from the directory on every attempt, so a configuration
  adopted mid-life takes effect at the next reconnection;
- not the address family, which is a preference the client holds — two connections differing only
  in family would be two sessions competing for one endpoint.

States are `idle`, `connecting`, `ready`, `waiting` and `closed`. There is deliberately no state
between losing a channel and waiting to open another: it would own no timer and no attempt, which
makes it indistinguishable from `idle` except by history, and anything able to observe it would
be something that forgot to arrange the retry.

```
   idle ──> connecting ──> ready ──> waiting ──> connecting ──> ready
              │  ▲                      ▲
              └──┴──── failure ─────────┘

   close() from any state ──> closed, and nothing after it
```

Only an idle connection starts an attempt, and that single test is what keeps every other state
honest. `connecting` already has one in flight, so two callers cannot become two sockets;
`ready` already has a channel; `waiting` has a timer armed, and cutting that wait short is
exactly what the wait exists to prevent; `closed` is final.

**Reconnection recovers the transport, not the requests.** A call that has been written has an
unknown outcome once the channel dies, and repeating it would turn one message into two, so it
fails and is never sent again. A call that has *not* been written is a different matter: it never
reached a socket, so it goes out on whichever channel arrives next, and that is not a repeat. The
write is the line, and it is the only line.

Waits lengthen while failures continue and stop at a ceiling. Half of every interval is fixed and
half is drawn, so connections that failed together do not all come back together. The ramp starts
over once a channel has lasted longer than the wait that preceded it, which is the evidence that
the trouble has passed — a datacenter that accepts a connection and drops it immediately is not
healthy, and treating it as healthy is how a client ends up hammering. A refusal the far end
chose to send, or an answer that was not the protocol, waits the longest interval from the start:
a middlebox or a wrong port is not something another attempt a second later will fix.

A refusal that names the authorization key is the exception, and the only refusal a client can
act on rather than wait out. The key is discarded — named by what was refused, so it cannot
remove one another connection obtained in the meantime — and the discard completes before the
next attempt runs, since an attempt that presented the same key would be refused again.

That works once. Two in a row is a datacenter refusing every key this client can obtain, and each
attempt in such a run opens a connection, completes a whole key exchange and is refused again.
Every one of those channels lives long enough to look like a recovery, so counting them as
recoveries is exactly what would hold the wait at its shortest while the run continued — one key
exchange per base interval, for as long as the datacenter kept saying no. Only the first refusal
after something that worked is treated as a recovery; from the second the wait lengthens like any
other failure, up to the same ceiling. Anything else going wrong ends the run, including an
attempt that failed before it had a key to be refused over.

The run belongs to a logical connection rather than to a datacenter. Two purposes share one
authorization, but one of them being refused is not evidence about the other, and making one
purpose's trouble lengthen the other's waits would punish a connection that is working. Obtaining
the replacement is left where it already happens: the datacenter shares one exchange between
everything that asks, and a second way to ask would defeat that. An RPC error about the account's
authorization is not this: it says the key exists but no account is signed in against it, which
is a sign-in concern and not a reason to discard anything.

Every callback a channel makes is checked against the channel that is current. A channel that has
been replaced must not arrange a reconnection for a connection that already has one, forward
events as though they were current, or revive one that was shut down. Closing is terminal: the
timer is cancelled, the attempt is abandoned, the channel is closed, everyone waiting is told,
and a channel that arrives afterwards is closed rather than adopted.

Timers stay where they were. A channel owns the one that paces the protocol; a connection owns
the one that paces reconnection; and because the second exists only while there is no channel,
**a logical connection owns at most one real timer at any moment.**

This is not a pool. There is one channel per identity, no capacity, no selection and no
distribution — deciding between several channels needs a notion of load and health that nothing
here has. What this owns is the lifetime of one channel, which is the part a pool would otherwise
have to absorb.


---

## 8. Network and datacenters

DC list from `help.getConfig` → `dcOption { id, ip_address, port, flags }`, with
`media_only`, `cdn`, `tcpo_only`, `static`.

### Addresses and selection

A datacenter is not one address. The server publishes several per identifier — an IPv4 and an
IPv6 form, a media-only variant, a cache variant — and which applies depends on what the
connection is for. Choosing wrongly does not fail cleanly: a media-only address answers
ordinary calls with errors that name nothing about addressing, and a cache address holds no
authorization at all.

Three rules decide what may serve a purpose:

- **a cache address serves cache traffic and nothing else.** It holds none of this client's
  authorization, so an ordinary call sent there cannot succeed
- **a media-only address is kept off ordinary calls**, and preferred for transfers. An ordinary
  address serves transfers too, so it stays a candidate behind the one set aside for them
- **the address family is a preference, not a requirement.** Whether a route to a family exists
  is not knowable at this layer, so a client that asks for IPv6 and finds none is given IPv4
  rather than nothing

Selection is **deterministic**: the first candidate in the order the server published, which is
its own order of preference. Spreading load across addresses needs to know what is already
open, which is connection state and belongs to the layer that holds it.

`test_mode` and `this_dc` are properties of the configuration rather than of any address — the
test and production networks publish the same identifiers at different addresses, so which
network a list belongs to cannot be read off a single entry.

The configuration is replaced wholesale rather than merged. An address absent from a later
configuration is one the server has stopped serving, and merging would keep it forever.

**Bootstrap.** Fetching the list requires an address and the address comes from the list, so the
last configuration is persisted and closes that loop on every start after the first. The very
first address is supplied by the application: published addresses change, and a value compiled
in here would be one more thing to be stale.

**Not implemented here:** `help.getConfig` itself, which needs a connection to issue; migration;
and connection pooling.

### Migration

| Error | Meaning | Action |
|---|---|---|
| `PHONE_MIGRATE_X` | Account belongs to DC X | Reconnect, restart sign-in there |
| `NETWORK_MIGRATE_X` | Network suggests DC X | Reconnect |
| `USER_MIGRATE_X` | Account moved | Reconnect, transfer authorization, retry |
| `FILE_MIGRATE_X` | File lives on DC X | Route this transfer to DC X |

Authorization transfer:

```
on current DC:  auth.exportAuthorization(dc_id) -> { id, bytes }
on target DC:   auth.importAuthorization(id, bytes)
```

Each DC keeps its own auth key, salts and temp keys. **No key moves.** The credential is about
the account rather than about the keys protecting the connections carrying it, so the target
datacenter's authorization key is obtained and stored the way every other one is; what the
exchange establishes is that the account on one datacenter is the account on the other.

A redirection reaches a caller as the datacenter it names rather than as text. Four errors say
the same thing in different words — an account that lives elsewhere, a network that suggests
elsewhere, an account that has moved, a file stored elsewhere — and the number in each is the
whole content of the answer, so it is carried as a number. Acting on one is deliberately left to
the layer that knows why the call was made: following a redirection means reaching another
datacenter, and for an account it means carrying the authorization across first.

The credential is issued and spent in one operation rather than stored. It is valid briefly and
only once, so keeping it would leave something worthless by the time anything read it back. A
transfer that failed at either end leaves nothing behind, and is repeated by asking for another
credential rather than by presenting the same one again.

### Connection pools

Per DC, sized by purpose — a single connection cannot serve interactive RPC and a multi-part
file transfer simultaneously without one starving the other:

| Pool | Count | Purpose |
|---|---|---|
| main | 1 | RPC and updates |
| upload | up to 8 | Parallel upload parts |
| download | up to 8 | Parallel download parts |
| download-small | 1–2 | Thumbnails, small media |

File-transfer connections use **separate `session_id` values over the same auth key**, as the
documentation recommends: they carry no updates and need no re-authorization, and they keep
bulk transfer from interfering with the update stream.

---

## 9. Updates

The hardest subsystem. Implemented directly from `core.telegram.org/api/updates`.

### 9.1 State

```
common box:   local_pts, local_qts, local_seq, local_date
per channel:  local_pts[channel_id]
```

Three independent sequence spaces: the common box (private chats and basic groups), one box
per channel/supergroup, and `qts` for secret chats and certain bot events.

### 9.2 Gap algorithm

For a `pts`-bearing update:

```
if      local_pts + pts_count == pts   -> apply;  local_pts = pts
else if local_pts + pts_count >  pts   -> ignore (already applied)
else                                   -> GAP: postpone, recover
```

For top-level `seq`:

```
if      seq_start == 0                 -> apply immediately (unordered)
else if local_seq + 1 == seq_start     -> apply;  local_seq = seq
else if local_seq + 1 >  seq_start     -> ignore
else                                   -> GAP: recover
```

`qts` behaves as `pts` with `qts_count` always 1.

### 9.3 Gap recovery

1. On a gap, **wait up to 0.5 s** — the documentation notes the server may simply have
   reordered, and the missing update often arrives. This avoids a difference call on every
   transient reorder.
2. If unresolved: `updates.getDifference` (common box) or
   `updates.getChannelDifference` (that channel).
3. Buffer incoming updates for the affected box while recovering.
4. Apply retrieved updates in order; drain the buffer; resume.
5. `getChannelDifference` paginates — repeat until the `final` flag is set.
6. `updatesTooLong` means the queue overflowed: run `getDifference` normally.
7. `differenceTooLong` means the box is too far behind: reset that box's state.
8. `CHANNEL_PRIVATE` means the channel is gone — stop trying, and invalidate only when an
   `updateChannel` arrives for it.

### 9.4 Deduplication

Updates already observed as RPC results must not be dispatched twice. A bounded
**no-dispatch index** of recently-applied message identities is consulted before emitting,
because `getDifference` legitimately returns messages already seen through the normal stream.

### 9.5 Testing

This subsystem cannot be validated against the live network — the interesting cases are
precisely the ones that occur rarely and unpredictably. It is therefore built against a
**deterministic mock server** able to produce, on demand: reordering, gaps, duplicates,
`updatesTooLong`, `differenceTooLong`, `CHANNEL_PRIVATE`, `new_session_created` mid-stream,
and channel `pts` divergence.

The mock server is written **before** the updates manager. That ordering is not optional; an
updates manager tested only against a well-behaved server is an updates manager that has not
been tested.

---

## 10. Peers and access hashes

MTProto identifies a peer by `(id, access_hash)`. The hash is **per-account and
non-derivable**: a client that has never encountered a peer cannot construct a reference to
it.

### Requirements

- Harvest peers from **every** update and RPC result that carries `users` / `chats` arrays.
- Persist to an indexed store — by id, by username, by phone.
- Handle **`min` constructors**: peers that arrive without a usable `access_hash`, valid only
  in the context they arrived in. They must never overwrite a full cached peer, and resolving
  them requires the context peer (`inputPeerUserFromMessage` and relatives).
- Resolve `@username` via `contacts.resolveUsername`, then cache.
- Surface an honest `PeerError` when a peer cannot be resolved — never fabricate a hash, and
  never silently fail.

The `min`-peer rule is the one most often got wrong: overwriting a good cached hash with a
`min` placeholder degrades the cache permanently and produces failures far from the cause.

### How it is arranged

Peers are written down as they arrive rather than fetched when they are wanted, because nothing
about them can be refilled on demand. A record keeps only what a reference is built from — kind,
identifier, hash, names, number — and not the entity itself: titles and photos belong to whatever
displays them, and unlike a hash they can always be asked for again.

Three ways in, since a caller names a peer by whichever it has. The identifier is the record's
own; the name and the number are indexes rewritten on every write, because a peer that gives up a
username should stop answering to it and that name may since belong to somebody else. Identifiers
and hashes are stored as text: a JSON number cannot carry sixty-four bits, and losing the low ones
means a reference that is refused for no visible reason.

A reduced peer is kept when nothing better is known and is replaced the moment the peer is known
in full, but never the other way round. It is also never named on its own — a reference to one is
built from the context it arrived in, and asking for an ordinary reference raises rather than
producing something Telegram will refuse as a problem with the call. Nothing fabricates a hash: a
name that resolves to a peer the answer did not describe is reported as unresolved.

A name is resolved through Telegram only when nothing usable was harvested for it, and the answer
is harvested whole before the peer asked for is picked out — a name usually resolves to a peer
whose answer names others, and discarding them means asking again for what has already arrived.

---

## 11. Files

### Upload

| Rule | Value |
|---|---|
| `part_size % 1024 == 0` and `524288 % part_size == 0` | 512 KB recommended |
| < 10 MB | `upload.saveFilePart` |
| ≥ 10 MB | `upload.saveBigFilePart` |
| Unknown length (streams) | Always big-file path; `file_total_parts = -1` until the last part |
| Max parts | `upload_max_fileparts_default` / `_premium` from config |

### Download

`upload.getFile(location, offset, limit)`, with alignment rules:

| Mode | Offset | Limit | Constraint |
|---|---|---|---|
| Normal | divisible by 4 KB | divisible by 4 KB, divides 1 MB | must not straddle a 1 MB boundary |
| `precise` | divisible by 1 KB | divisible by 1 KB, ≤ 1 MB | same |

Route to the media DC when `dcOption.media_only` is available for the target DC.

### CDN

`upload.getFile` may return `upload.fileCdnRedirect { dc_id, file_token, encryption_key,
encryption_iv, file_hashes }`. Fetch from the CDN DC, decrypt with AES-CTR, and **verify the
SHA-256 hashes** — CDN nodes are not operated by Telegram, so hash verification is a
correctness and integrity requirement, not an optimization.

### File references

Per `core.telegram.org/api/file-references`, two tables are maintained:

```
file_id -> file_reference bytes
file_id -> origin  (message | story | webpage | profile photo | …)
```

On `FILE_REFERENCE_EXPIRED` / `FILE_REFERENCE_INVALID`: look up the origin, refetch it
(the message, the story, the profile), extract the refreshed reference, retry once.

This must be **automatic and invisible**. A user who has to catch a reference error and
manually refetch a message has been handed a protocol detail that the framework exists to
absorb.

---

## 12. Build order

Strictly bottom-up. Each stage is fully tested before the next begins, because a defect in a
lower layer is diagnosed from symptoms several layers up.

| # | Stage | Gate |
|---|---|---|
| 1 | Crypto primitives | Known-answer vectors for AES-IGE, RSA padding, SRP, factorization |
| 2 | TL parser + generator | Full schema parses; every constructor round-trips |
| 3 | Transport + obfuscation | Frames round-trip; connects to a test DC |
| 4 | Auth handshake | Real auth key obtained from Telegram's test DCs; all §5.2 checks enforced |
| 5 | Session layer | RPC against test DCs; mock server injects every error condition |
| 6 | Storage | Auth keys, salts, peers persist and reload |
| 7 | DC pool + migration | Migration errors handled; authorization transfers |
| 8 | Sign-in flows | Phone, 2FA, bot, QR, resume |
| 9 | Peers | Cache, `min` resolution, username resolution |
| 10 | **Updates manager** | **Mock server first**, then the manager against it |
| 11 | Files | Chunked transfer, CDN, reference refresh |
| 12 | Normalizer | TL updates → Yuigram events |

Telegram provides **test datacenters** (`149.154.167.40:443`, DC 2, reached with a test-mode
flag), which allow stages 4–8 to be developed against real servers using test-only accounts.
This is a significant de-risking opportunity and is used from stage 4 onward.

---

## 13. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Updates manager correctness** | **Extreme** | Deterministic mock server built first; recorded-session replay; every branch of §9.2 tested explicitly |
| **Session-layer message loss** | **High** | Mock server injects `bad_server_salt`, `bad_msg_notification`, `new_session_created`; ack tracking verified |
| Crypto implementation error | **High** | Known-answer vectors; constant-time comparison; no invented crypto; §5.2 non-bypassable |
| Peer / file-reference long tail | **High** | Explicit peer model from day one; origin tracking built in, not retrofitted |
| TL codec edge cases | Medium | Round-trip test over all 2,315 constructors |
| Protocol change by Telegram | Medium | Layer-tagged committed schemas; a layer bump is a reviewable diff |
| Undocumented server behaviour | **High** | Test-DC experimentation; findings recorded in `docs/protocol-notes/` |
| Generated `.d.ts` size | Medium | Split by TL namespace; measured budget |
| Account bans for users | High (product) | Documentation duty of care — see [security.md](security.md) §7 |

---

## 14. Honest assessment

A correct, independent MTProto implementation is **12–24 months of sustained work** to reach
production quality, and the last 20% — peer edge cases, file references, update gaps under
real traffic — takes longer than the first 80%.

That is the cost of the stated objective, and it is accepted rather than worked around. What
makes it tractable rather than merely long:

- **The protocol is fully documented.** Every algorithm in this document came from Telegram's
  own specification. Nothing here is reverse-engineered.
- **Test datacenters exist.** Stages 4–8 develop against real servers without risking a real
  account.
- **The layering is testable.** Crypto and TL are pure functions over bytes, verifiable
  exhaustively offline. The session and updates layers are verifiable against a mock server
  that can inject conditions the live network produces only rarely.
- **Scope is controlled at the top, not the bottom.** The protocol layers must be complete and
  correct. The *high-level surface* above them is demand-driven, with `user.api` covering
  everything not yet wrapped.

The distinction in that last point is the one that matters. Depth of the protocol
implementation is non-negotiable. Breadth of convenience wrappers is a scheduling decision.
