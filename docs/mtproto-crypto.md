# MTProto Cryptography

The cryptographic layer of the MTProto subsystem: the operations Telegram's protocol requires
that `node:crypto` does not provide, and how each one is verified.

Everything here is a pure function over bytes. No state, no I/O, no logging, no network. The
layer is fully testable without Telegram, and is verified that way.

**Scope.** This document covers primitives only. The handshake that uses them, the session
layer that uses the message keys, and the sign-in flow that uses SRP are separate subsystems
specified in [mtproto.md](mtproto.md) §§5–6 and built in later phases.

---

## 1. Position

```
                    ┌──────────────────────────────┐
   later phases     │  auth · session · transport  │
                    └──────────────┬───────────────┘
                                   │ uses
                    ┌──────────────┴───────────────┐
   this layer       │           crypto             │
                    └──────────────┬───────────────┘
                                   │ uses
                    ┌──────────────┴───────────────┐
   platform         │  node:crypto · BigInt        │
                    └──────────────────────────────┘
```

The layer is **internal**. It is not exported from `@yuigram/mtproto`'s entry point and does not
appear in the package's public declarations. A published cryptographic surface is a support
obligation and an invitation to misuse, and nothing outside this package needs it.

---

## 2. What is taken from the platform, and what is written

Nothing on this list is invented. Every item is an implementation of an algorithm published by
Telegram or by a standards body, and every item that the platform provides is taken from the
platform.

### From `node:crypto`

| Operation | Used by |
|---|---|
| SHA-1 | Handshake key derivation, auth key identifiers, legacy RSA padding |
| SHA-256 | Message key derivation, `rsa_pad`, SRP |
| PBKDF2-HMAC-SHA512, 100,000 iterations | SRP password KDF |
| AES-256-ECB, padding disabled | The block function underneath AES-IGE |
| `randomBytes` | Every nonce, DH secret, padding and temporary key |
| `timingSafeEqual` | Every comparison on secret-derived material |

### Written here

| Primitive | Why the platform cannot supply it |
|---|---|
| AES-256-IGE | Infinite Garble Extension is not in `node:crypto` and not in OpenSSL's public interface |
| RSA with `rsa_pad` | Telegram's own padding construction; not PKCS#1 and not OAEP |
| RSA with legacy padding | Telegram's older construction, selected by key fingerprint |
| Raw RSA (`m^e mod n`) | `node:crypto` exposes no unpadded RSA operation |
| Modular exponentiation | `BigInt` has no `modPow` |
| PQ factorization | Not a standard-library operation |
| Miller-Rabin primality | Not a standard-library operation |
| Safe-prime and generator validation | Telegram's specific DH parameter conditions |
| SRP 6a, Telegram variant | Telegram's own KDF chain and padding rules |
| Handshake and message key derivation | Telegram's own byte-slicing schedules |

---

## 3. Primitive contracts

### 3.1 Byte and integer helpers — `bytes.ts`, `bigint.ts`

| Function | Contract |
|---|---|
| `concatBytes(...parts)` | Concatenation. |
| `xorBytes(a, b)` | Byte-wise XOR. Both operands must be the same length. |
| `equalBytes(a, b)` | **Constant-time** for equal-length inputs; returns `false` immediately on a length mismatch, because lengths are not secret. Never throws. |
| `bytesToBigIntBE(bytes)` | Big-endian, unsigned. Every protocol integer that reaches a hash or an exponentiation is big-endian. |
| `bigIntToBytesBE(value, length?)` | Big-endian, unsigned, left-padded with zeros to `length`. Rejects a value that does not fit, rather than truncating. |
| `modPow(base, exponent, modulus)` | Square-and-multiply. Rejects a non-positive modulus and a negative exponent. See §6 for its timing property. |
| `bitLength(value)` | Position of the highest set bit. |

### 3.2 AES-256-IGE — `ige.ts`

```
encrypt block i:  c[i] = E(m[i] XOR c[i-1]) XOR m[i-1]
decrypt block i:  m[i] = D(c[i] XOR m[i-1]) XOR c[i-1]

c[-1] = iv[0..16]      m[-1] = iv[16..32]
```

The same IV halves carry the same roles in both directions, so `decrypt(encrypt(m)) === m`
under one IV.

**Preconditions.** Key is 32 bytes; IV is 32 bytes; data length is a non-zero multiple of 16.
Anything else is rejected.

**Two implementation constraints that a round-trip test would not catch.**

- `createCipheriv('aes-256-ecb', …)` applies PKCS#7 padding by default. It is switched off with
  `setAutoPadding(false)`, and a test asserts that a 16-byte input yields exactly 16 bytes. With
  padding left on, every IGE operation is silently wrong.
- IGE is inherently sequential: each block's cipher *input* depends on the previous block's
  output, so the block function cannot be applied to the buffer in one pass. What is avoidable
  is constructing a cipher object per block, which dominates the cost. One cipher instance is
  created per call and driven with repeated 16-byte `update()` calls.

### 3.3 RSA — `rsa.ts`

Raw RSA is `m^e mod n` with no padding scheme of its own — Telegram supplies the padding.

**`rsa_pad`**, used with current server keys:

```
data              ≤ 144 bytes
data_with_padding = data ‖ random, to 192 bytes
data_pad_reversed = reverse(data_with_padding)

repeat:
  temp_key         = random 32 bytes
  data_with_hash   = data_pad_reversed ‖ SHA256(temp_key ‖ data_with_padding)   → 224 bytes
  aes_encrypted    = AES-256-IGE(data_with_hash, temp_key, iv = 32 zero bytes)
  temp_key_xor     = temp_key XOR SHA256(aes_encrypted)
  key_aes_encrypted = temp_key_xor ‖ aes_encrypted                              → 256 bytes
until bytesToBigIntBE(key_aes_encrypted) < n

encrypted = bigIntToBytesBE(modPow(key_aes_encrypted, e, n), 256)
```

The loop exists because the 256-byte value must be a valid RSA input, and fresh randomness is
the documented way to obtain one. It is bounded: after a fixed number of attempts the operation
fails rather than spinning.

**Legacy padding**, used with older server keys:

```
data_with_hash = SHA1(data) ‖ data ‖ random, to 255 bytes
encrypted      = bigIntToBytesBE(modPow(data_with_hash, e, n), 256)
```

**Preconditions.** `rsa_pad` rejects data over 144 bytes; legacy rejects data over 235 bytes
(255 less the 20-byte hash). Both reject a non-positive modulus.

### 3.4 PQ factorization — `factorize.ts`

Pollard's rho with Floyd cycle detection, over `BigInt`, with trial division by small primes
first. `pq` is a semiprime below 2^63, which the search settles in tens of milliseconds.

**Output.** `{ p, q }` with `p < q` and `p * q === pq`. The ordering is part of the contract
because the handshake serializes them in that order.

**Preconditions.** Rejects a `pq` below 4, and rejects a prime `pq` — a prime `pq` is a
protocol-level red flag, not an input the caller should be allowed to ignore. The search is
bounded and fails rather than looping forever.

### 3.5 Primality and DH parameters — `primes.ts`

`isProbablePrime(n, rounds)` — Miller-Rabin with random bases, small-prime trial division
first. The default round count puts the false-positive probability below 4^-64.

`isSafePrime(p)` — `p` is prime and `(p - 1) / 2` is prime.

`validateDhParameters({ p, g })` — every condition from
[mtproto.md](mtproto.md) §5.2, all of them, none optional:

- `2^2047 < p < 2^2048`
- `p` is a safe prime
- `g` is one of 2, 3, 4, 5, 6, 7, and satisfies the congruence for that generator:

  | `g` | Condition |
  |---|---|
  | 2 | `p mod 8 = 7` |
  | 3 | `p mod 3 = 2` |
  | 4 | none |
  | 5 | `p mod 5 ∈ {1, 4}` |
  | 6 | `p mod 24 ∈ {19, 23}` |
  | 7 | `p mod 7 ∈ {3, 5, 6}` |

`validateDhPublicKey(value, p)` — `1 < value < p - 1` **and** `2^1984 < value < p - 2^1984`.

**No prime is hardcoded.** The validator checks whatever the server sends. Building the known
prime into the source would only mean the check could be replaced by a comparison, which is the
mistake the check exists to prevent.

**Validation cache.** Full validation of a 2048-bit safe prime is expensive and sits on the
connection path, so a validated prime is remembered by the SHA-256 digest of its big-endian
bytes. The cache stores only outcomes of a completed full validation; a digest that is absent
means the full check runs. There is no way to seed it, and no configuration that consults it in
place of a check for an unknown prime.

### 3.6 Key derivation — `kdf.ts`

**Handshake temporary keys**, from the DH exchange nonces:

```
tmp_aes_key = SHA1(new_nonce ‖ server_nonce) ‖ SHA1(server_nonce ‖ new_nonce)[0..12]
tmp_aes_iv  = SHA1(server_nonce ‖ new_nonce)[12..20] ‖ SHA1(new_nonce ‖ new_nonce)
              ‖ new_nonce[0..4]
```

Both are 32 bytes. `new_nonce` is 32 bytes, `server_nonce` is 16.

**Message keys**, MTProto 2.0:

```
x        = 0 for a message from the client, 8 for a message from the server
msg_key  = SHA256(auth_key[88+x .. 120+x] ‖ plaintext)[8..24]

sha256_a = SHA256(msg_key ‖ auth_key[x .. x+36])
sha256_b = SHA256(auth_key[40+x .. 76+x] ‖ msg_key)
aes_key  = sha256_a[0..8] ‖ sha256_b[8..24] ‖ sha256_a[24..32]
aes_iv   = sha256_b[0..8] ‖ sha256_a[8..24] ‖ sha256_b[24..32]
```

Both are 32 bytes. The auth key is 256 bytes; anything else is rejected.

**Identifiers:**

```
auth_key_id       = SHA1(auth_key)[12..20]
auth_key_aux_hash = SHA1(auth_key)[0..8]
new_nonce_hash(n) = SHA1(new_nonce ‖ n ‖ auth_key_aux_hash)[4..20]      n ∈ {1, 2, 3}
server_salt       = new_nonce[0..8] XOR server_nonce[0..8]
```

### 3.7 SRP 6a — `srp.ts`

Telegram's variant, `passwordKdfAlgoSHA256SHA256PBKDF2HMACSHA512iter100000SHA256ModPow`.

```
H(d)            = SHA256(d)
SH(d, salt)     = H(salt ‖ d ‖ salt)
PH1(pw, s1, s2) = SH(SH(pw, s1), s2)
PH2(pw, s1, s2) = SH(PBKDF2-SHA512(PH1(pw, s1, s2), s1, 100000), s2)

x   = PH2(password, salt1, salt2)
v   = g^x mod p
k   = H(p ‖ g)
a   = random 2048-bit
g_a = g^a mod p
u   = H(g_a ‖ g_b)
k_v = (k · v) mod p
t   = (g_b − k_v) mod p                  taken positive
s_a = t^(a + u·x) mod p
k_a = H(s_a)
M1  = H( H(p) XOR H(g) ‖ H(salt1) ‖ H(salt2) ‖ g_a ‖ g_b ‖ k_a )
```

**Every integer is padded to 256 bytes, big-endian, before it is hashed or concatenated.** That
includes `g`, which is a single-digit number occupying 255 leading zero bytes. Omitting the
padding produces an `M1` the server rejects, and the failure carries no clue about the cause.

**Preconditions.** `p` and `g` are validated by `validateDhParameters` before use — the same
checks as the handshake, because skipping them on the password path is a real vulnerability
rather than a shortcut. `g_b` is validated by `validateDhPublicKey`. `g_a` is regenerated if it
fails validation, up to a bounded number of attempts.

**Output.** `{ a: g_a bytes, m1 }`, both 256 and 32 bytes. The secret exponent does not leave
the function.

### 3.8 Randomness — `random.ts`

| Function | Contract |
|---|---|
| `randomBytes(n)` | `crypto.randomBytes`. The only source of randomness in the layer. |
| `randomBigInt(bits)` | Uniform over `[0, 2^bits)`. |
| `randomBigIntBelow(limit)` | Uniform over `[0, limit)` by rejection sampling — not by modular reduction, which is biased. |
| `messagePadding(length)` | 12–1024 random bytes chosen so that `length + padding` is divisible by 16, per MTProto 2.0. |

---

## 4. Verification

Each primitive maps to the tests that establish it. The layer needs no network and no Telegram
account.

| Primitive | How it is established |
|---|---|
| AES-256-ECB padding disabled | A 16-byte input yields exactly 16 bytes, asserted directly against `node:crypto` |
| AES-256-IGE | **Independent oracle:** expected ciphertext computed in the test from the IGE recurrence driven by raw AES-ECB, for 1, 2 and 4 blocks. This checks the implementation against the *definition*, not against itself. Plus: round-trip; IV-half sensitivity (swapping the halves must change the output); rejection of bad key, IV and length |
| Raw RSA | **Independent oracle:** a keypair generated by `node:crypto`; `m^e mod n` computed here, then decrypted by the platform's own private-key operation and compared to `m` |
| `rsa_pad` | Full round-trip through a real keypair: encrypt, decrypt with the platform, undo the padding construction in the test, recover the original data. Output is exactly 256 bytes and numerically below the modulus. The retry path is exercised with injected randomness that first produces an out-of-range value |
| Legacy padding | Same round-trip shape; the SHA-1 prefix is checked in the test |
| `modPow` | Cross-checked against `BigInt` exponentiation for small values where the naive computation is tractable; identities (`x^0 = 1`, `x^1 mod n`); rejection of a zero, negative or even-but-invalid modulus and of negative exponents |
| PQ factorization | Semiprimes constructed in the test from known primes: the assertion is that `p · q = pq`, both factors are prime and `p < q`, so the test verifies its own expectation. Includes a 63-bit case of the size Telegram sends. Rejects a prime input and a value below 4 |
| Miller-Rabin | Known primes and composites; the Carmichael numbers 561, 1105, 1729, 2465, 2821, 6601 and 8911, which fool a naive Fermat test; the Mersenne primes 2^521−1 and 2^607−1 for the large case |
| `isSafePrime` | Small safe primes (5, 7, 11, 23, 47, 59, 83, 107, 167, 179, 227, 263, 347, 359, 383, 467, 479, 503) accepted; primes that are not safe (13, 17, 19, 29, 31, 37, 41, 43) rejected |
| DH parameter validation | Each condition gets a test that supplies a value violating exactly that condition and asserts the specific rejection: out-of-range `p`, non-safe `p`, unsupported `g`, and each generator congruence |
| DH public key validation | Both bounds, at and just inside each boundary |
| Validation cache | A second validation of the same prime returns the same answer; a different prime is not treated as validated; the cache is not reachable from the public surface |
| Handshake key derivation | Expected values recomputed in the test by direct byte slicing over `node:crypto` hashes; exact lengths; changing either nonce changes both outputs |
| Message key derivation | Byte-level oracle as above; the `x = 0` and `x = 8` schedules produce different keys for the same auth key; keys derived twice for one direction agree, so an IGE encrypt/decrypt cycle round-trips |
| Auth key identifiers | Byte-level oracle; exact lengths; `new_nonce_hash` differs for n = 1, 2, 3 |
| SRP | **Independent oracle:** the test implements the *server* side from the protocol definition — `S = (A · v^u)^b mod p`, `K = H(S)`, `M1' = H(H(p) XOR H(g) ‖ H(s1) ‖ H(s2) ‖ A ‖ B ‖ K)` — and asserts the client's `M1` matches. A wrong password must produce a different `M1`. The 256-byte padding rule is asserted separately, including for `g` |
| Constant-time comparison | Equal, unequal and mismatched-length inputs; never throws |
| Randomness | Padding length within 12–1024 and total divisible by 16; `randomBigIntBelow` stays in range across many draws and covers the space; distinct calls differ |

**Malformed input.** Every exported function rejects: wrong-length keys, IVs, nonces and auth
keys; non-block-aligned ciphertext; empty input; oversized RSA payloads; non-positive moduli;
negative exponents; out-of-range DH values; unsupported generators. Each rejection is asserted
by the specific error, not by "something threw".

---

## 5. Errors and secret material

**No error carries a value.** Every rejection names the parameter and states the expected shape
— `"auth key must be 256 bytes, received 128"` — and never includes the material itself, a
prefix of it, or a hash of it. There is no debug mode that relaxes this.

**Nothing in the layer logs.** No function takes a logger, and none is reachable from one. The
redaction machinery in `@yuigram/core` exists for the layers above; this layer's guarantee is
that it produces nothing to redact.

Errors use `ValidationError` from `@yuigram/core`, so the subsystem shares the framework's
error taxonomy rather than starting a second one.

**Secrets do not leave their function.** SRP returns `g_a` and `M1` and never the exponent or
the derived key. Key derivation returns the derived key and IV and never the auth key slice
they came from.

---

## 6. Known limitations

**`modPow` is not constant-time.** `BigInt` arithmetic in V8 is variable-time, and the platform
exposes no constant-time modular exponentiation for arbitrary moduli. Exponentiations with a
secret exponent — the DH secret `b`, and SRP's `a` and `a + u·x` — therefore run in
data-dependent time.

This is stated rather than hidden. What limits its practical reach: every such exponent is
freshly generated per handshake or per password check and never reused, and an attacker would
need timing observations of an operation that happens once per connection or once per sign-in.

`node:crypto`'s `DiffieHellman` reaches OpenSSL's constant-time modular exponentiation and is
the obvious alternative for the two DH exponentiations. Adopting it changes the shape of the
handshake code, so it is recorded as an open question for the authorization phase rather than
settled here.

**The key-derivation oracles restate the schedule.** The handshake and message key tests
recompute the expected bytes from the same published formula the implementation follows. That
catches a coding error and would not catch a misreading of the specification. The compensating
check is at a different level: the derived keys are exercised end to end against Telegram's
test datacenters in the authorization phase, where a misread schedule fails immediately and
unmistakably.

**PQ factorization is bounded, not guaranteed.** Pollard's rho is probabilistic: a polynomial
constant can lead to a degenerate cycle, in which case the attempt yields nothing and another
constant is drawn. The implementation retries a bounded number of times and fails cleanly
rather than blocking. At the size Telegram sends a factor is found in tens of milliseconds, and
failure is not expected.
