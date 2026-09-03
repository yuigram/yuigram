/**
 * The cryptographic operations MTProto needs.
 *
 * Pure functions over bytes: no state, no I/O, no logging, no network. The
 * layer is verifiable offline in full, which is what lets the subsystems above
 * it be built against something already known to be correct.
 *
 * **Internal.** This barrel is not re-exported from the package entry point. A
 * published cryptographic surface is a support obligation and an invitation to
 * misuse, and nothing outside this package needs one.
 *
 * Nothing here is invented. Each primitive implements an algorithm published by
 * Telegram or by a standards body, and anything the platform already provides
 * is taken from the platform. See `docs/mtproto-crypto.md`.
 */

export { bitLength, mod, modPow } from './bigint.js'
export {
  assertLength,
  bigIntToBytesBE,
  bytesToBigIntBE,
  concatBytes,
  equalBytes,
  xorBytes,
} from './bytes.js'
export { AES_BLOCK, counterAt, ctrCrypt } from './ctr.js'
export { factorizePq, type PqFactors } from './factorize.js'
export { md5, sha1, sha256 } from './hash.js'
export { igeDecrypt, igeEncrypt } from './ige.js'
export {
  type AesParameters,
  assertNonceVariant,
  authKeyAuxHash,
  authKeyId,
  deriveHandshakeKeys,
  deriveMessageKeys,
  initialServerSalt,
  type MessageDirection,
  messageKey,
  newNonceHash,
} from './kdf.js'
export {
  type DhParameters,
  isProbablePrime,
  isSafePrime,
  isValidDhPublicKey,
  validateDhParameters,
  validateDhPublicKey,
} from './primes.js'
export { messagePadding, randomBigInt, randomBigIntBelow, randomBytes } from './random.js'
export {
  type RandomSource,
  type RsaPublicKey,
  rsaEncryptLegacy,
  rsaEncryptPadded,
  rsaRaw,
} from './rsa.js'
export {
  computeSrpProof,
  type Pbkdf2,
  passwordHash,
  type SrpOptions,
  type SrpParameters,
  type SrpProof,
} from './srp.js'
