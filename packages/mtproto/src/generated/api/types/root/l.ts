// GENERATED FILE — do not edit.
// TL types for the root namespace
// Source: Telegram TL layer 223, schemas/tl/api.223.tl

import type { TlObject } from '../../../../tl/object.js'

/** `labeledPrice#cb296bf8` */
export interface LabeledPrice {
  readonly _: 'labeledPrice'
  readonly label: string
  readonly amount: bigint
}

/** `langPackDifference#f385c1f6` */
export interface LangPackDifference {
  readonly _: 'langPackDifference'
  readonly lang_code: string
  readonly from_version: number
  readonly version: number
  readonly strings: readonly TypeLangPackString[]
}

/** `langPackLanguage#eeca5ce3` */
export interface LangPackLanguage {
  readonly _: 'langPackLanguage'
  readonly official?: true
  readonly rtl?: true
  readonly beta?: true
  readonly name: string
  readonly native_name: string
  readonly lang_code: string
  readonly base_lang_code?: string
  readonly plural_code: string
  readonly strings_count: number
  readonly translated_count: number
  readonly translations_url: string
}

/** `langPackString#cad181f6` */
export interface LangPackString {
  readonly _: 'langPackString'
  readonly key: string
  readonly value: string
}

/** `langPackStringDeleted#2979eeb2` */
export interface LangPackStringDeleted {
  readonly _: 'langPackStringDeleted'
  readonly key: string
}

/** `langPackStringPluralized#6c47ac9f` */
export interface LangPackStringPluralized {
  readonly _: 'langPackStringPluralized'
  readonly key: string
  readonly zero_value?: string
  readonly one_value?: string
  readonly two_value?: string
  readonly few_value?: string
  readonly many_value?: string
  readonly other_value: string
}

/** Any `LabeledPrice`. */
export type TypeLabeledPrice =
  | LabeledPrice

/** Any `LangPackDifference`. */
export type TypeLangPackDifference =
  | LangPackDifference

/** Any `LangPackLanguage`. */
export type TypeLangPackLanguage =
  | LangPackLanguage

/** Any `LangPackString`. */
export type TypeLangPackString =
  | LangPackString
  | LangPackStringDeleted
  | LangPackStringPluralized
