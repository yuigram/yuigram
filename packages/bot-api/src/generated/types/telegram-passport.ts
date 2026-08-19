// GENERATED FILE — do not edit.
// Bot API types: Telegram Passport
// Source: Telegram Bot API 10.2, schemas/bot-api/10.2.json

/**
 * Describes Telegram Passport data shared with the bot by the user.
 *
 * @see https://corefork.telegram.org/bots/api#passportdata
 */
export interface PassportData {
  /**
   * Array with information about documents and other Telegram Passport elements
   * that was shared with the bot
   */
  readonly data: EncryptedPassportElement[]

  /**
   * Encrypted credentials required to decrypt the data
   */
  readonly credentials: EncryptedCredentials
}

/**
 * This object represents a file uploaded to Telegram Passport. Currently all
 * Telegram Passport files are in JPEG format when decrypted and don't exceed
 * 10MB.
 *
 * @see https://corefork.telegram.org/bots/api#passportfile
 */
export interface PassportFile {
  /**
   * Identifier for this file, which can be used to download or reuse the file
   */
  readonly file_id: string

  /**
   * Unique identifier for this file, which is supposed to be the same over time
   * and for different bots. Can't be used to download or reuse the file.
   */
  readonly file_unique_id: string

  /**
   * File size in bytes
   */
  readonly file_size: number

  /**
   * Unix time when the file was uploaded
   */
  readonly file_date: number
}

/**
 * Describes documents or other Telegram Passport elements shared with the bot
 * by the user.
 *
 * @see https://corefork.telegram.org/bots/api#encryptedpassportelement
 */
export interface EncryptedPassportElement {
  /**
   * Element type. One of “personal_details”, “passport”, “driver_license”,
   * “identity_card”, “internal_passport”, “address”, “utility_bill”,
   * “bank_statement”, “rental_agreement”, “passport_registration”,
   * “temporary_registration”, “phone_number”, “email”.
   */
  readonly type: string

  /**
   * Base64-encoded encrypted Telegram Passport element data provided by the
   * user; available only for “personal_details”, “passport”, “driver_license”,
   * “identity_card”, “internal_passport” and “address” types. Can be decrypted
   * and verified using the accompanying EncryptedCredentials.
   */
  readonly data?: string | undefined

  /**
   * User's verified phone number; available only for “phone_number” type
   */
  readonly phone_number?: string | undefined

  /**
   * User's verified email address; available only for “email” type
   */
  readonly email?: string | undefined

  /**
   * Array of encrypted files with documents provided by the user; available only
   * for “utility_bill”, “bank_statement”, “rental_agreement”,
   * “passport_registration” and “temporary_registration” types. Files can be
   * decrypted and verified using the accompanying EncryptedCredentials.
   */
  readonly files?: PassportFile[] | undefined

  /**
   * Encrypted file with the front side of the document, provided by the user;
   * available only for “passport”, “driver_license”, “identity_card” and
   * “internal_passport”. The file can be decrypted and verified using the
   * accompanying EncryptedCredentials.
   */
  readonly front_side?: PassportFile | undefined

  /**
   * Encrypted file with the reverse side of the document, provided by the user;
   * available only for “driver_license” and “identity_card”. The file can be
   * decrypted and verified using the accompanying EncryptedCredentials.
   */
  readonly reverse_side?: PassportFile | undefined

  /**
   * Encrypted file with the selfie of the user holding a document, provided by
   * the user; available if requested for “passport”, “driver_license”,
   * “identity_card” and “internal_passport”. The file can be decrypted and
   * verified using the accompanying EncryptedCredentials.
   */
  readonly selfie?: PassportFile | undefined

  /**
   * Array of encrypted files with translated versions of documents provided by
   * the user; available if requested for “passport”, “driver_license”,
   * “identity_card”, “internal_passport”, “utility_bill”, “bank_statement”,
   * “rental_agreement”, “passport_registration” and “temporary_registration”
   * types. Files can be decrypted and verified using the accompanying
   * EncryptedCredentials.
   */
  readonly translation?: PassportFile[] | undefined

  /**
   * Base64-encoded element hash for using in PassportElementErrorUnspecified
   */
  readonly hash: string
}

/**
 * Describes data required for decrypting and authenticating
 * EncryptedPassportElement. See the Telegram Passport Documentation for a
 * complete description of the data decryption and authentication processes.
 *
 * @see https://corefork.telegram.org/bots/api#encryptedcredentials
 */
export interface EncryptedCredentials {
  /**
   * Base64-encoded encrypted JSON-serialized data with unique user's payload,
   * data hashes and secrets required for EncryptedPassportElement decryption and
   * authentication
   */
  readonly data: string

  /**
   * Base64-encoded data hash for data authentication
   */
  readonly hash: string

  /**
   * Base64-encoded secret, encrypted with the bot's public RSA key, required for
   * data decryption
   */
  readonly secret: string
}

/**
 * This object represents an error in the Telegram Passport element which was
 * submitted that should be resolved by the user. It should be one of:
 *
 * @see https://corefork.telegram.org/bots/api#passportelementerror
 */
export type PassportElementError =
  | PassportElementErrorDataField
  | PassportElementErrorFile
  | PassportElementErrorFiles
  | PassportElementErrorFrontSide
  | PassportElementErrorReverseSide
  | PassportElementErrorSelfie
  | PassportElementErrorTranslationFile
  | PassportElementErrorTranslationFiles
  | PassportElementErrorUnspecified

/**
 * Represents an issue in one of the data fields that was provided by the user.
 * The error is considered resolved when the field's value changes.
 *
 * @see https://corefork.telegram.org/bots/api#passportelementerrordatafield
 */
export interface PassportElementErrorDataField {
  /**
   * Error source, must be data
   */
  readonly source: string

  /**
   * The section of the user's Telegram Passport which has the error, one of
   * “personal_details”, “passport”, “driver_license”, “identity_card”,
   * “internal_passport”, “address”
   */
  readonly type: string

  /**
   * Name of the data field which has the error
   */
  readonly field_name: string

  /**
   * Base64-encoded data hash
   */
  readonly data_hash: string

  /**
   * Error message
   */
  readonly message: string
}

/**
 * Represents an issue with the front side of a document. The error is
 * considered resolved when the file with the front side of the document
 * changes.
 *
 * @see https://corefork.telegram.org/bots/api#passportelementerrorfrontside
 */
export interface PassportElementErrorFrontSide {
  /**
   * Error source, must be front_side
   */
  readonly source: string

  /**
   * The section of the user's Telegram Passport which has the issue, one of
   * “passport”, “driver_license”, “identity_card”, “internal_passport”
   */
  readonly type: string

  /**
   * Base64-encoded hash of the file with the front side of the document
   */
  readonly file_hash: string

  /**
   * Error message
   */
  readonly message: string
}

/**
 * Represents an issue with the reverse side of a document. The error is
 * considered resolved when the file with reverse side of the document changes.
 *
 * @see https://corefork.telegram.org/bots/api#passportelementerrorreverseside
 */
export interface PassportElementErrorReverseSide {
  /**
   * Error source, must be reverse_side
   */
  readonly source: string

  /**
   * The section of the user's Telegram Passport which has the issue, one of
   * “driver_license”, “identity_card”
   */
  readonly type: string

  /**
   * Base64-encoded hash of the file with the reverse side of the document
   */
  readonly file_hash: string

  /**
   * Error message
   */
  readonly message: string
}

/**
 * Represents an issue with the selfie with a document. The error is considered
 * resolved when the file with the selfie changes.
 *
 * @see https://corefork.telegram.org/bots/api#passportelementerrorselfie
 */
export interface PassportElementErrorSelfie {
  /**
   * Error source, must be selfie
   */
  readonly source: string

  /**
   * The section of the user's Telegram Passport which has the issue, one of
   * “passport”, “driver_license”, “identity_card”, “internal_passport”
   */
  readonly type: string

  /**
   * Base64-encoded hash of the file with the selfie
   */
  readonly file_hash: string

  /**
   * Error message
   */
  readonly message: string
}

/**
 * Represents an issue with a document scan. The error is considered resolved
 * when the file with the document scan changes.
 *
 * @see https://corefork.telegram.org/bots/api#passportelementerrorfile
 */
export interface PassportElementErrorFile {
  /**
   * Error source, must be file
   */
  readonly source: string

  /**
   * The section of the user's Telegram Passport which has the issue, one of
   * “utility_bill”, “bank_statement”, “rental_agreement”,
   * “passport_registration”, “temporary_registration”
   */
  readonly type: string

  /**
   * Base64-encoded file hash
   */
  readonly file_hash: string

  /**
   * Error message
   */
  readonly message: string
}

/**
 * Represents an issue with a list of scans. The error is considered resolved
 * when the list of files containing the scans changes.
 *
 * @see https://corefork.telegram.org/bots/api#passportelementerrorfiles
 */
export interface PassportElementErrorFiles {
  /**
   * Error source, must be files
   */
  readonly source: string

  /**
   * The section of the user's Telegram Passport which has the issue, one of
   * “utility_bill”, “bank_statement”, “rental_agreement”,
   * “passport_registration”, “temporary_registration”
   */
  readonly type: string

  /**
   * List of base64-encoded file hashes
   */
  readonly file_hashes: string[]

  /**
   * Error message
   */
  readonly message: string
}

/**
 * Represents an issue with one of the files that constitute the translation of
 * a document. The error is considered resolved when the file changes.
 *
 * @see https://corefork.telegram.org/bots/api#passportelementerrortranslationfile
 */
export interface PassportElementErrorTranslationFile {
  /**
   * Error source, must be translation_file
   */
  readonly source: string

  /**
   * Type of element of the user's Telegram Passport which has the issue, one of
   * “passport”, “driver_license”, “identity_card”, “internal_passport”,
   * “utility_bill”, “bank_statement”, “rental_agreement”,
   * “passport_registration”, “temporary_registration”
   */
  readonly type: string

  /**
   * Base64-encoded file hash
   */
  readonly file_hash: string

  /**
   * Error message
   */
  readonly message: string
}

/**
 * Represents an issue with the translated version of a document. The error is
 * considered resolved when a file with the document translation change.
 *
 * @see https://corefork.telegram.org/bots/api#passportelementerrortranslationfiles
 */
export interface PassportElementErrorTranslationFiles {
  /**
   * Error source, must be translation_files
   */
  readonly source: string

  /**
   * Type of element of the user's Telegram Passport which has the issue, one of
   * “passport”, “driver_license”, “identity_card”, “internal_passport”,
   * “utility_bill”, “bank_statement”, “rental_agreement”,
   * “passport_registration”, “temporary_registration”
   */
  readonly type: string

  /**
   * List of base64-encoded file hashes
   */
  readonly file_hashes: string[]

  /**
   * Error message
   */
  readonly message: string
}

/**
 * Represents an issue in an unspecified place. The error is considered
 * resolved when new data is added.
 *
 * @see https://corefork.telegram.org/bots/api#passportelementerrorunspecified
 */
export interface PassportElementErrorUnspecified {
  /**
   * Error source, must be unspecified
   */
  readonly source: string

  /**
   * Type of element of the user's Telegram Passport which has the issue
   */
  readonly type: string

  /**
   * Base64-encoded element hash
   */
  readonly element_hash: string

  /**
   * Error message
   */
  readonly message: string
}
